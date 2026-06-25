import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { z } from "zod";

import { configuredProviders } from "./providers.js";

// --- openstatus webhook contract (pinned to payload version "1") ---
// Mirrors openstatus's generic webhook payload. If openstatus ships a breaking
// change it bumps the version and parsing fails loudly instead of mis-posting.
const WEBHOOK_PAYLOAD_VERSION = "1" as const;

const impactSchema = z.enum([
  "operational",
  "degraded_performance",
  "partial_outage",
  "major_outage",
]);
type Impact = z.infer<typeof impactSchema>;

const componentSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  impact: impactSchema,
  changed: z.boolean(),
});

const pageSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  slug: z.string(),
  url: z.string().url(),
});

const subscriptionSchema = z.object({
  manage_url: z.string().nullable(),
  unsubscribe_url: z.string().nullable(),
});

const webhookPayloadSchema = z.discriminatedUnion("type", [
  z.object({
    version: z.literal(WEBHOOK_PAYLOAD_VERSION),
    type: z.literal("status_report"),
    data: z.object({
      status_report: z.object({
        id: z.number().int(),
        title: z.string(),
        impact: impactSchema,
        update: z.object({
          id: z.number().int(),
          status: z.enum(["investigating", "identified", "monitoring", "resolved"]),
          message: z.string(),
          created_at: z.string(),
        }),
        page: pageSchema,
        components: z.array(componentSchema),
      }),
    }),
    subscription: subscriptionSchema,
  }),
  z.object({
    version: z.literal(WEBHOOK_PAYLOAD_VERSION),
    type: z.literal("maintenance"),
    data: z.object({
      maintenance: z.object({
        id: z.number().int(),
        title: z.string(),
        impact: impactSchema,
        message: z.string(),
        starts_at: z.string().optional(),
        ends_at: z.string().optional(),
        page: pageSchema,
        components: z.array(componentSchema),
      }),
    }),
    subscription: subscriptionSchema,
  }),
]);

type WebhookPayload = z.infer<typeof webhookPayloadSchema>;

// --- post text ---
const STATUS_LABEL: Record<string, string> = {
  investigating: "🔴 Investigating",
  identified: "🟠 Identified",
  monitoring: "🟡 Monitoring",
  resolved: "🟢 Resolved",
};

const IMPACT_LABEL: Record<Impact, string> = {
  operational: "Operational",
  degraded_performance: "Degraded performance",
  partial_outage: "Partial outage",
  major_outage: "Major outage",
};

function affectedLine(components: { name: string; impact: Impact }[]): string {
  const affected = components.filter((c) => c.impact !== "operational");
  if (affected.length === 0) return "";
  return `Affected: ${affected
    .map((c) => `${c.name} (${IMPACT_LABEL[c.impact]})`)
    .join(", ")}`;
}

/** Platform-agnostic post text. Providers truncate to their own limit. */
function renderPost(payload: WebhookPayload): string {
  if (payload.type === "maintenance") {
    const m = payload.data.maintenance;
    const window =
      m.starts_at && m.ends_at
        ? `🗓 ${new Date(m.starts_at).toUTCString()} → ${new Date(m.ends_at).toUTCString()}`
        : "";
    return [`🛠 Scheduled maintenance: ${m.title}`, m.message, affectedLine(m.components), window, m.page.url]
      .filter(Boolean)
      .join("\n");
  }

  const r = payload.data.status_report;
  return [
    `${STATUS_LABEL[r.update.status] ?? r.update.status}: ${r.title}`,
    r.page.url,
    r.update.message
  ]
    .filter(Boolean)
    .join("\n");
}

/** Truncate to a character budget, keeping a trailing URL intact. */
function truncate(text: string, max: number): string {
  const chars = Array.from(text); // never splits a surrogate pair
  if (chars.length <= max) return text;

  const lines = text.split("\n");
  const last = lines[lines.length - 1];
  const keepUrl = last?.startsWith("http") ? `\n${last}` : "";
  const body = keepUrl ? lines.slice(0, -1).join("\n") : text;

  const budget = max - Array.from(keepUrl).length - 1; // 1 for the ellipsis
  const kept = Array.from(body).slice(0, Math.max(0, budget)).join("");
  return `${kept.trimEnd()}…${keepUrl}`;
}

function shouldPost(payload: WebhookPayload): boolean {
  if (payload.type === "maintenance") return process.env.POST_MAINTENANCE !== "false";
  const only = process.env.POST_ON_STATUSES?.split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!only || only.length === 0) return true;
  return only.includes(payload.data.status_report.update.status);
}

/** Constant-time string compare so the token can't leak via timing. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// --- app ---
export const app = new Hono();

app.get("/", (c) => c.json({ ok: true, version: WEBHOOK_PAYLOAD_VERSION }));

app.post("/webhook", async (c) => {
  // Inbound auth: shared bearer token set via openstatus custom headers.
  const token = process.env.OPENSTATUS_WEBHOOK_TOKEN;
  if (token) {
    const auth = c.req.header("authorization") ?? "";
    if (!timingSafeEqual(auth, `Bearer ${token}`)) {
      return c.json({ error: "unauthorized" }, 401);
    }
  } else {
    console.warn("OPENSTATUS_WEBHOOK_TOKEN is not set — this endpoint is UNAUTHENTICATED.");
  }

  const raw = await c.req.json().catch(() => null);
  const parsed = webhookPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    // Ack so openstatus doesn't log a failure, but do nothing.
    console.warn("Ignoring unparseable/unknown-version payload");
    return c.json({ ok: true, skipped: "unparseable" }, 200);
  }
  const payload = parsed.data;

  if (!shouldPost(payload)) return c.json({ ok: true, skipped: "filtered" }, 200);

  const providers = configuredProviders(process.env);
  if (providers.length === 0) {
    console.warn("No social providers are configured — nothing to post.");
    return c.json({ ok: true, skipped: "no-providers" }, 200);
  }

  const text = renderPost(payload);
  const results = await Promise.all(
    providers.map(async (p) => {
      try {
        await p.post(truncate(text, p.maxLength), process.env);
        return { provider: p.id, ok: true };
      } catch (error) {
        console.error(`[${p.id}] post failed:`, error);
        return { provider: p.id, ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    }),
  );

  // Always 200: posting is best-effort and openstatus does not retry.
  return c.json({ ok: true, results }, 200);
});

// Long-running Node server (Fly.io, Railway, Docker, local). On Vercel the app
// is served as a serverless function via api/index.ts, so skip the listener.
if (!process.env.VERCEL) {
  const port = Number(process.env.PORT ?? 3000);
  serve({ fetch: app.fetch, port }, () =>
    console.log(`statuspage-socials-notifier listening on :${port}`),
  );
}
