import { describe, expect, it } from "vitest";

import { WEBHOOK_PAYLOAD_VERSION, webhookPayloadSchema } from "./schema.js";
import { maintenance, statusReport, test } from "./fixtures.js";

describe("webhookPayloadSchema", () => {
  it("pins the payload version to '1'", () => {
    expect(WEBHOOK_PAYLOAD_VERSION).toBe("1");
  });

  it("accepts a valid status_report payload", () => {
    const parsed = webhookPayloadSchema.safeParse(statusReport());
    expect(parsed.success).toBe(true);
  });

  it("accepts a valid maintenance payload", () => {
    const parsed = webhookPayloadSchema.safeParse(maintenance());
    expect(parsed.success).toBe(true);
  });

  it("accepts a valid test payload (no subscription)", () => {
    const parsed = webhookPayloadSchema.safeParse(test());
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown payload version (breaking-change guard)", () => {
    const payload = { ...(statusReport() as Record<string, unknown>), version: "2" };
    expect(webhookPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects an unknown discriminator type", () => {
    const payload = { ...(statusReport() as Record<string, unknown>), type: "incident" };
    expect(webhookPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects an invalid status enum value", () => {
    expect(webhookPayloadSchema.safeParse(statusReport({ status: "exploded" })).success).toBe(
      false,
    );
  });

  it("rejects a non-url page url", () => {
    const payload = statusReport() as any;
    payload.data.status_report.page.url = "not-a-url";
    expect(webhookPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects a null/garbage body", () => {
    expect(webhookPayloadSchema.safeParse(null).success).toBe(false);
    expect(webhookPayloadSchema.safeParse({}).success).toBe(false);
  });
});
