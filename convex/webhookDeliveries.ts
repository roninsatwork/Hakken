import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { getActiveCompanyId, requireAdmin } from "./authz";

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

type WebhookDeliveryStatus = Doc<"webhookDeliveries">["status"];

function normalizeEventType(eventType: string) {
  const normalized = eventType.trim().replace(/\s+/g, ".");
  if (!normalized) throw new Error("Webhook event type is required.");
  if (normalized.length > WEBHOOK_DELIVERY_EVENT_TYPE_MAX_LENGTH) {
    throw new Error(`Webhook event type cannot exceed ${WEBHOOK_DELIVERY_EVENT_TYPE_MAX_LENGTH} characters.`);
  }
  return normalized;
}

function normalizeDestinationUrl(destinationUrl: string) {
  const normalized = destinationUrl.trim();
  if (!normalized) throw new Error("Webhook destination URL is required.");
  try {
    const url = new URL(normalized);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("Webhook destination URL must use http or https.");
    }
  } catch {
    throw new Error("Webhook destination URL must be valid.");
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
    throw new Error(`Webhook max attempts must be between 1 and ${WEBHOOK_DELIVERY_MAX_ATTEMPTS_LIMIT}.`);
  }
  return normalized;
}

function normalizePayloadJson(value: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error("Webhook payload is required.");
  if (normalized.length > WEBHOOK_DELIVERY_PAYLOAD_MAX_LENGTH) {
    throw new Error(`Webhook payload cannot exceed ${WEBHOOK_DELIVERY_PAYLOAD_MAX_LENGTH} characters.`);
  }
  return normalized;
}

function getManagedCompanyId(user: Doc<"users">, companyId: Id<"companies"> | undefined) {
  if (user.role === "SUPER_ADMIN") return companyId;
  const activeCompanyId = getActiveCompanyId(user);
  if (!activeCompanyId) throw new Error("Unauthorized");
  if (companyId && companyId !== activeCompanyId) throw new Error("Unauthorized");
  return activeCompanyId;
}

export const list = query({
  args: {
    companyId: v.optional(v.id("companies")),
    status: v.optional(webhookDeliveryStatusValidator),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, "Unauthorized", "Unauthenticated request");
    const companyId = getManagedCompanyId(user, args.companyId);

    const page = companyId
      ? args.status
        ? await ctx.db
            .query("webhookDeliveries")
            .withIndex("by_company_status_created", (q) => q.eq("companyId", companyId).eq("status", args.status as WebhookDeliveryStatus))
            .order("desc")
            .paginate(args.paginationOpts)
        : await ctx.db
            .query("webhookDeliveries")
            .withIndex("by_company_created", (q) => q.eq("companyId", companyId))
            .order("desc")
            .paginate(args.paginationOpts)
      : args.status
        ? await ctx.db
            .query("webhookDeliveries")
            .withIndex("by_status_created", (q) => q.eq("status", args.status as WebhookDeliveryStatus))
            .order("desc")
            .paginate(args.paginationOpts)
        : await ctx.db.query("webhookDeliveries").withIndex("by_created").order("desc").paginate(args.paginationOpts);

    const companyIds = Array.from(new Set(page.page.map((delivery) => delivery.companyId)));
    const companies = await Promise.all(companyIds.map(async (id) => await ctx.db.get(id)));
    const companyNames = new Map(companyIds.map((id, index) => [id, companies[index]?.name ?? "Unknown company"]));

    return {
      ...page,
      page: page.page.map((delivery) => ({
        ...delivery,
        companyName: companyNames.get(delivery.companyId) ?? "Unknown company",
      })),
    };
  },
});

export const getSummary = query({
  args: {
    companyId: v.optional(v.id("companies")),
    lookbackDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, "Unauthorized", "Unauthenticated request");
    const companyId = getManagedCompanyId(user, args.companyId);
    const lookbackDays = Math.min(Math.max(args.lookbackDays ?? 7, 1), 90);
    const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;

    const deliveries = companyId
      ? await ctx.db
          .query("webhookDeliveries")
          .withIndex("by_company_created", (q) => q.eq("companyId", companyId))
          .order("desc")
          .take(250)
      : await ctx.db.query("webhookDeliveries").withIndex("by_created").order("desc").take(250);
    const recent = deliveries.filter((delivery) => delivery.createdAt >= cutoff);

    const statusCounts = {
      PENDING: 0,
      DELIVERING: 0,
      SUCCESS: 0,
      FAILED: 0,
      RETRY_SCHEDULED: 0,
      ABANDONED: 0,
    };
    for (const delivery of recent) {
      statusCounts[delivery.status] += 1;
    }

    const terminalCount = statusCounts.SUCCESS + statusCounts.FAILED + statusCounts.ABANDONED;
    return {
      scope: companyId ? "company" : "platform",
      lookbackDays,
      total: recent.length,
      statusCounts,
      retrying: statusCounts.RETRY_SCHEDULED,
      failedOrAbandoned: statusCounts.FAILED + statusCounts.ABANDONED,
      successRate: terminalCount > 0 ? statusCounts.SUCCESS / terminalCount : 0,
      nextActions: [
        statusCounts.FAILED + statusCounts.ABANDONED > 0
          ? "Inspect failed or abandoned deliveries before enabling more callback destinations."
          : "No terminal delivery failures in the current sample.",
        statusCounts.RETRY_SCHEDULED > 0
          ? "Check retry windows and destination health for scheduled retries."
          : "No retries are currently scheduled in the current sample.",
      ],
    };
  },
});

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
    if (!delivery) throw new Error("Webhook delivery not found.");
    if (args.status === "PENDING") throw new Error("Attempt status cannot move a delivery back to pending.");
    if (args.status === "RETRY_SCHEDULED" && args.nextAttemptAt === undefined) {
      throw new Error("Retry deliveries require nextAttemptAt.");
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
    if (!updated) throw new Error("Webhook delivery not found.");
    return updated;
  },
});
