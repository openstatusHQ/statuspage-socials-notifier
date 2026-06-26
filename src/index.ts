import { serve } from "@hono/node-server";
import { Hono } from "hono";

import { configuredProviders } from "./providers.js";
import {
  WEBHOOK_PAYLOAD_VERSION,
  webhookPayloadSchema,
  type Impact,
  type Status,
  type WebhookPayload,
} from "./schema.js";

// --- post text ---
const STATUS_LABEL: Record<Status, string> = {
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

/** Platform-agnostic post text. Providers truncate to their own limit. */
export function renderPost(payload: WebhookPayload): string {
  if (payload.type === "test") {
    return `✅ openstatus test webhook received at ${payload.data.test.timestamp}`;
  }

  if (payload.type === "maintenance") {
    const m = payload.data.maintenance;
    const window =
      m.starts_at && m.ends_at
        ? `🗓 ${new Date(m.starts_at).toUTCString()} → ${new Date(m.ends_at).toUTCString()}`
        : "";
    return [`🛠 Scheduled maintenance: ${m.title}`, m.message, window, m.url]
      .filter(Boolean)
      .join("\n");
  }

  const r = payload.data.status_report;
  return [
    `${STATUS_LABEL[r.update.status] ?? r.update.status}: ${r.title}`,
    r.url,
    r.update.message
  ]
    .filter(Boolean)
    .join("\n");
}

/** Truncate to a character budget, keeping a trailing URL intact. */
export function truncate(text: string, max: number): string {
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

export function shouldPost(payload: WebhookPayload): boolean {
  // A test webhook only verifies reachability/auth — never broadcast it.
  if (payload.type === "test") return false;
  if (payload.type === "maintenance") return process.env.POST_MAINTENANCE !== "false";
  const only = process.env.POST_ON_STATUSES?.split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!only || only.length === 0) return true;
  return only.includes(payload.data.status_report.update.status);
}

// --- app ---
export const app = new Hono();

app.get("/", (c) => c.json({ ok: true, version: WEBHOOK_PAYLOAD_VERSION }));

app.post("/webhook", async (c) => {
  // Inbound auth: shared bearer token set via openstatus custom headers.
  const token = process.env.OPENSTATUS_WEBHOOK_TOKEN;
  if (token) {
    const auth = c.req.header("authorization") ?? "";
    if (auth !== `Bearer ${token}`) {
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
