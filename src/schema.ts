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
  impact: impactSchema.nullable(),
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

export const webhookPayloadSchema = z.discriminatedUnion("type", [
  z.object({
    version: z.literal(WEBHOOK_PAYLOAD_VERSION),
    type: z.literal("status_report"),
    data: z.object({
      status_report: z.object({
        id: z.number().int(),
        title: z.string(),
        update: z.object({
          id: z.number().int(),
          status: statusSchema,
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

export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;
