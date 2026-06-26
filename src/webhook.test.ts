import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SocialProvider } from "./providers.js";
import { maintenance, statusReport, test } from "./fixtures.js";

// Capture what each provider was asked to post, without touching the network.
const posted: Array<{ id: string; text: string }> = [];

function fakeProvider(id: string, maxLength: number): SocialProvider {
  return {
    id,
    maxLength,
    isConfigured: () => true,
    post: async (text) => {
      posted.push({ id, text });
    },
  };
}

let configured: SocialProvider[] = [];

vi.mock("./providers.js", () => ({
  configuredProviders: () => configured,
}));

// Import after the mock is registered.
const { app } = await import("./index.js");

const ENV_KEYS = ["OPENSTATUS_WEBHOOK_TOKEN", "POST_ON_STATUSES", "POST_MAINTENANCE"];

function post(body: unknown, headers: Record<string, string> = {}) {
  return app.request("/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  posted.length = 0;
  configured = [fakeProvider("bluesky", 300), fakeProvider("x", 280)];
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  vi.restoreAllMocks();
});

describe("GET /", () => {
  it("reports ok and the pinned payload version", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: "1" });
  });
});

describe("POST /webhook — auth", () => {
  it("rejects a missing/wrong bearer token when a token is configured", async () => {
    process.env.OPENSTATUS_WEBHOOK_TOKEN = "s3cret";
    const res = await post(statusReport());
    expect(res.status).toBe(401);
    expect(posted).toHaveLength(0);
  });

  it("accepts the correct bearer token", async () => {
    process.env.OPENSTATUS_WEBHOOK_TOKEN = "s3cret";
    const res = await post(statusReport(), { authorization: "Bearer s3cret" });
    expect(res.status).toBe(200);
    expect(posted).toHaveLength(2);
  });

  it("skips auth (but warns) when no token is configured", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await post(statusReport());
    expect(res.status).toBe(200);
    expect(warn).toHaveBeenCalled();
  });
});

describe("POST /webhook — parsing", () => {
  it("acks but skips an unparseable payload", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await post({ not: "valid" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, skipped: "unparseable" });
    expect(posted).toHaveLength(0);
  });

  it("acks but skips an unknown payload version", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const payload = { ...(statusReport() as Record<string, unknown>), version: "999" };
    const res = await post(payload);
    expect(await res.json()).toMatchObject({ skipped: "unparseable" });
    expect(posted).toHaveLength(0);
  });
});

describe("POST /webhook — filtering", () => {
  it("posts every status by default", async () => {
    const res = await post(statusReport({ status: "monitoring" }));
    expect(res.status).toBe(200);
    expect(posted).toHaveLength(2);
  });

  it("only posts statuses in POST_ON_STATUSES", async () => {
    process.env.POST_ON_STATUSES = "investigating, resolved";
    const filtered = await post(statusReport({ status: "monitoring" }));
    expect(await filtered.json()).toMatchObject({ skipped: "filtered" });
    expect(posted).toHaveLength(0);

    const allowed = await post(statusReport({ status: "resolved" }));
    expect(await allowed.json()).toMatchObject({ ok: true });
    expect(posted).toHaveLength(2);
  });

  it("skips maintenance when POST_MAINTENANCE is false", async () => {
    process.env.POST_MAINTENANCE = "false";
    const res = await post(maintenance());
    expect(await res.json()).toMatchObject({ skipped: "filtered" });
    expect(posted).toHaveLength(0);
  });

  it("acks a test webhook without broadcasting it", async () => {
    const res = await post(test());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ skipped: "filtered" });
    expect(posted).toHaveLength(0);
  });
});

describe("POST /webhook — providers", () => {
  it("acks with no-providers when nothing is configured", async () => {
    configured = [];
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await post(statusReport());
    expect(await res.json()).toMatchObject({ skipped: "no-providers" });
  });

  it("truncates the text to each provider's maxLength", async () => {
    // A long message forces truncation below the x limit (280).
    const payload = statusReport() as any;
    payload.data.status_report.update.message = "x".repeat(1000);
    const res = await post(payload);
    expect(res.status).toBe(200);

    const bsky = posted.find((p) => p.id === "bluesky")!;
    const xPost = posted.find((p) => p.id === "x")!;
    expect(Array.from(bsky.text).length).toBeLessThanOrEqual(300);
    expect(Array.from(xPost.text).length).toBeLessThanOrEqual(280);
    // The shorter limit yields the shorter post.
    expect(Array.from(xPost.text).length).toBeLessThan(Array.from(bsky.text).length);
  });

  it("reports per-provider results and stays 200 when one provider throws", async () => {
    configured = [
      fakeProvider("bluesky", 300),
      {
        id: "x",
        maxLength: 280,
        isConfigured: () => true,
        post: async () => {
          throw new Error("rate limited");
        },
      },
    ];
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post(statusReport());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: Array<{ provider: string; ok: boolean }> };
    expect(body.results).toEqual([
      { provider: "bluesky", ok: true },
      { provider: "x", ok: false, error: "rate limited" },
    ]);
  });
});
