import { z } from "zod";

// --- openstatus webhook contract (pinned to payload version "1") ---
// Mirrors openstatus's generic webhook payload. If openstatus ships a breaking
// change it bumps the version and parsing fails loudly instead of mis-posting.
export const WEBHOOK_PAYLOAD_VERSION = "1" as const;

export const impactSchema = z.enum([
  "operational",
  "degraded_performance",
  "partial_outage",
  "major_outage"
]);
export type Impact = z.infer<typeof impactSchema>;

export const statusSchema = z.enum(["investigating", "identified", "monitoring", "resolved"]);
export type Status = z.infer<typeof statusSchema>;

const componentSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  impact: impactSchema.nullish(),
});

const pageSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  slug: z.string(),
  url: z.string().url(),
});

const subscriptionSchema = z.object({
  manage_url: z.string().nullish(),
  unsubscribe_url: z.string().nullish(),
});

export const webhookPayloadSchema = z.discriminatedUnion("type", [
  z.object({
    version: z.literal(WEBHOOK_PAYLOAD_VERSION),
    type: z.literal("status_report"),
    data: z.object({
      status_report: z.object({
        id: z.number().int(),
        title: z.string(),
        url: z.string().url(),
        update: z.object({
          id: z.number().int(),
          status: statusSchema,
          message: z.string(),
          occurred_at: z.string(),
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
        url: z.string().url(),
        message: z.string(),
        starts_at: z.string().optional(),
        ends_at: z.string().optional(),
        page: pageSchema,
        components: z.array(componentSchema),
      }),
    }),
    subscription: subscriptionSchema,
  }),
  // Connectivity check fired from openstatus's UI. Carries no subscription.
  z.object({
    version: z.literal(WEBHOOK_PAYLOAD_VERSION),
    type: z.literal("test"),
    data: z.object({
      test: z.object({
        message: z.string(),
        timestamp: z.string(),
      }),
    }),
  }),
]);

export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;
