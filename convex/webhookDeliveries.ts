/**
 * The webhook delivery engine.
 *
 * Queueing, dispatch, retry backoff and per-attempt recording are all here and
 * all work. Nothing calls them: no code path queues a delivery, and there is
 * nowhere in the product to register a destination URL. The screen that listed
 * these deliveries has been removed rather than left showing a log of an event
 * that cannot happen — the engine is kept because it is the finished half.
 *
 * To make webhooks real: give a company somewhere to store a destination, and
 * call `recordQueuedInternal` when a run finishes. The listing screen belongs
 * back the day something can appear in it.
 */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { appError } from "./utils/appError";

const WEBHOOK_DELIVERY_PREVIEW_MAX_LENGTH = 2000;
const WEBHOOK_DELIVERY_EVENT_TYPE_MAX_LENGTH = 120;
const WEBHOOK_DELIVERY_MAX_ATTEMPTS_DEFAULT = 5;
const WEBHOOK_DELIVERY_MAX_ATTEMPTS_LIMIT = 20;
const WEBHOOK_DELIVERY_PAYLOAD_MAX_LENGTH = 50_000;

const webhookDeliveryStatusValidator = v.union(
  v.literal("PENDING"),
  v.literal("DELIVERING"),
  v.literal("SUCCESS"),
  v.literal("FAILED"),
  v.literal("RETRY_SCHEDULED"),
  v.literal("ABANDONED")
);

const webhookDeliverySourceTypeValidator = v.union(
  v.literal("agentRun"),
  v.literal("workflowRun"),
  v.literal("publicApi"),
  v.literal("manual")
);

const webhookDeliveryHeaderValidator = v.array(v.object({
  name: v.string(),
  value: v.string(),
}));


function normalizeEventType(eventType: string) {
  const normalized = eventType.trim().replace(/\s+/g, ".");
  if (!normalized) throw appError("INVALID_INPUT", "Webhook event type is required.");
  if (normalized.length > WEBHOOK_DELIVERY_EVENT_TYPE_MAX_LENGTH) {
    throw appError("INVALID_INPUT", `Webhook event type cannot exceed ${WEBHOOK_DELIVERY_EVENT_TYPE_MAX_LENGTH} characters.`);
  }
  return normalized;
}

function normalizeDestinationUrl(destinationUrl: string) {
  const normalized = destinationUrl.trim();
  if (!normalized) throw appError("INVALID_INPUT", "Webhook destination URL is required.");
  try {
    const url = new URL(normalized);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw appError("INVALID_INPUT", "Webhook destination URL must use http or https.");
    }
  } catch {
    throw appError("INVALID_INPUT", "Webhook destination URL must be valid.");
  }
  return normalized;
}

function normalizePreview(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  return normalized.length > WEBHOOK_DELIVERY_PREVIEW_MAX_LENGTH
    ? `${normalized.slice(0, WEBHOOK_DELIVERY_PREVIEW_MAX_LENGTH)}...`
    : normalized;
}

function normalizeMaxAttempts(value: number | undefined) {
  if (value === undefined) return WEBHOOK_DELIVERY_MAX_ATTEMPTS_DEFAULT;
  const normalized = Math.floor(value);
  if (normalized < 1 || normalized > WEBHOOK_DELIVERY_MAX_ATTEMPTS_LIMIT) {
    throw appError("INVALID_INPUT", `Webhook max attempts must be between 1 and ${WEBHOOK_DELIVERY_MAX_ATTEMPTS_LIMIT}.`);
  }
  return normalized;
}

function normalizePayloadJson(value: string) {
  const normalized = value.trim();
  if (!normalized) throw appError("INVALID_INPUT", "Webhook payload is required.");
  if (normalized.length > WEBHOOK_DELIVERY_PAYLOAD_MAX_LENGTH) {
    throw appError("INVALID_INPUT", `Webhook payload cannot exceed ${WEBHOOK_DELIVERY_PAYLOAD_MAX_LENGTH} characters.`);
  }
  return normalized;
}


export const getInternal = internalQuery({
  args: {
    deliveryId: v.id("webhookDeliveries"),
  },
  handler: async (ctx, args): Promise<Doc<"webhookDeliveries"> | null> => {
    return await ctx.db.get(args.deliveryId);
  },
});

export const recordQueuedInternal = internalMutation({
  args: {
    companyId: v.id("companies"),
    eventType: v.string(),
    destinationUrl: v.string(),
    sourceType: v.optional(webhookDeliverySourceTypeValidator),
    sourceId: v.optional(v.string()),
    requestBodyPreview: v.optional(v.string()),
    maxAttempts: v.optional(v.number()),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Id<"webhookDeliveries">> => {
    const now = args.now ?? Date.now();
    return await ctx.db.insert("webhookDeliveries", {
      companyId: args.companyId,
      eventType: normalizeEventType(args.eventType),
      destinationUrl: normalizeDestinationUrl(args.destinationUrl),
      status: "PENDING",
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      requestBodyPreview: normalizePreview(args.requestBodyPreview),
      attemptCount: 0,
      maxAttempts: normalizeMaxAttempts(args.maxAttempts),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const queueDispatchInternal = internalMutation({
  args: {
    companyId: v.id("companies"),
    eventType: v.string(),
    destinationUrl: v.string(),
    payloadJson: v.string(),
    headers: v.optional(webhookDeliveryHeaderValidator),
    sourceType: v.optional(webhookDeliverySourceTypeValidator),
    sourceId: v.optional(v.string()),
    maxAttempts: v.optional(v.number()),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Id<"webhookDeliveries">> => {
    const payloadJson = normalizePayloadJson(args.payloadJson);
    const now = args.now ?? Date.now();
    const deliveryId = await ctx.db.insert("webhookDeliveries", {
      companyId: args.companyId,
      eventType: normalizeEventType(args.eventType),
      destinationUrl: normalizeDestinationUrl(args.destinationUrl),
      status: "PENDING",
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      requestBodyPreview: normalizePreview(payloadJson),
      attemptCount: 0,
      maxAttempts: normalizeMaxAttempts(args.maxAttempts),
      createdAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.webhookDeliveryActions.dispatchInternal, {
      deliveryId,
      payloadJson,
      headers: args.headers,
    });

    return deliveryId;
  },
});

export const recordAttemptInternal = internalMutation({
  args: {
    deliveryId: v.id("webhookDeliveries"),
    status: webhookDeliveryStatusValidator,
    statusCode: v.optional(v.number()),
    error: v.optional(v.string()),
    responseBodyPreview: v.optional(v.string()),
    nextAttemptAt: v.optional(v.number()),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Doc<"webhookDeliveries">> => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) throw appError("NOT_FOUND", "Webhook delivery not found.");
    if (args.status === "PENDING") throw appError("CONFLICT", "Attempt status cannot move a delivery back to pending.");
    if (args.status === "RETRY_SCHEDULED" && args.nextAttemptAt === undefined) {
      throw appError("INVALID_INPUT", "Retry deliveries require nextAttemptAt.");
    }

    const now = args.now ?? Date.now();
    const attemptCount = delivery.attemptCount + (args.status === "DELIVERING" ? 0 : 1);
    await ctx.db.patch(args.deliveryId, {
      status: args.status,
      attemptCount,
      lastStatusCode: args.statusCode,
      lastError: normalizePreview(args.error),
      responseBodyPreview: normalizePreview(args.responseBodyPreview),
      nextAttemptAt: args.status === "RETRY_SCHEDULED" ? args.nextAttemptAt : undefined,
      lastAttemptAt: args.status === "DELIVERING" ? delivery.lastAttemptAt : now,
      deliveredAt: args.status === "SUCCESS" ? now : delivery.deliveredAt,
      updatedAt: now,
    });

    const updated = await ctx.db.get(args.deliveryId);
    if (!updated) throw appError("NOT_FOUND", "Webhook delivery not found.");
    return updated;
  },
});
