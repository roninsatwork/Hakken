"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { buildSignatureHeaders } from "./webhookSignatureService";
import { getErrorMessage } from "./utils/lang";

const WEBHOOK_DELIVERY_RESPONSE_READ_LIMIT = 2000;
const WEBHOOK_DELIVERY_RETRY_BASE_MS = 60_000;
const WEBHOOK_DELIVERY_RETRY_MAX_MS = 15 * 60_000;

const webhookDeliveryHeaderValidator = v.array(v.object({
  name: v.string(),
  value: v.string(),
}));

type DispatchResult = {
  status: Doc<"webhookDeliveries">["status"] | "MISSING" | "SKIPPED";
  attemptCount?: number;
  lastStatusCode?: number;
  responseBodyPreview?: string;
  retryScheduled?: boolean;
  nextAttemptAt?: number;
};


function getRetryDelayMs(attemptNumber: number) {
  const exponential = WEBHOOK_DELIVERY_RETRY_BASE_MS * 2 ** Math.max(attemptNumber - 1, 0);
  return Math.min(exponential, WEBHOOK_DELIVERY_RETRY_MAX_MS);
}

function buildHeaders(headers: Array<{ name: string; value: string }> | undefined) {
  const outboundHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Sonae-Webhook-Dispatcher/1.0",
  };
  for (const header of headers ?? []) {
    const name = header.name.trim();
    const value = header.value.trim();
    if (!name || !value) continue;
    if (name.toLowerCase() === "host" || name.toLowerCase() === "content-length") continue;
    outboundHeaders[name] = value;
  }
  return outboundHeaders;
}

function buildDispatchResult(delivery: Doc<"webhookDeliveries">): DispatchResult {
  return {
    status: delivery.status,
    attemptCount: delivery.attemptCount,
    lastStatusCode: delivery.lastStatusCode,
    responseBodyPreview: delivery.responseBodyPreview,
  };
}

async function readResponsePreview(response: Response) {
  const text = await response.text();
  return text.length > WEBHOOK_DELIVERY_RESPONSE_READ_LIMIT
    ? `${text.slice(0, WEBHOOK_DELIVERY_RESPONSE_READ_LIMIT)}...`
    : text;
}

export const dispatchInternal = internalAction({
  args: {
    deliveryId: v.id("webhookDeliveries"),
    payloadJson: v.string(),
    headers: v.optional(webhookDeliveryHeaderValidator),
    /**
     * Signs the delivery when present.
     *
     * Absent means unsigned, quietly: a destination configured before signing
     * existed keeps working exactly as it did. Turning every existing
     * integration off in the name of security would be its own outage.
     */
    signingSecret: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<DispatchResult> => {
    const delivery = await ctx.runQuery(internal.webhookDeliveries.getInternal, { deliveryId: args.deliveryId });
    if (!delivery) return { status: "MISSING" };
    if (delivery.status === "SUCCESS" || delivery.status === "ABANDONED") return { ...buildDispatchResult(delivery), status: "SKIPPED" };

    await ctx.runMutation(internal.webhookDeliveries.recordAttemptInternal, {
      deliveryId: args.deliveryId,
      status: "DELIVERING",
    });

    const attemptNumber = delivery.attemptCount + 1;
    try {
      // The receiver had no way to tell a delivery from Hakken apart from
      // anyone else posting the same shape at the same URL.
      const signatureHeaders = await buildSignatureHeaders({
        secret: args.signingSecret,
        body: args.payloadJson,
        nowMs: Date.now(),
      });

      const response = await fetch(delivery.destinationUrl, {
        method: "POST",
        headers: { ...buildHeaders(args.headers), ...signatureHeaders },
        body: args.payloadJson,
      });
      const responseBodyPreview = await readResponsePreview(response);

      if (response.ok) {
        const updated = await ctx.runMutation(internal.webhookDeliveries.recordAttemptInternal, {
          deliveryId: args.deliveryId,
          status: "SUCCESS",
          statusCode: response.status,
          responseBodyPreview,
        });
        return buildDispatchResult(updated);
      }

      if (attemptNumber < delivery.maxAttempts) {
        const delayMs = getRetryDelayMs(attemptNumber);
        const nextAttemptAt = Date.now() + delayMs;
        await ctx.runMutation(internal.webhookDeliveries.recordAttemptInternal, {
          deliveryId: args.deliveryId,
          status: "RETRY_SCHEDULED",
          statusCode: response.status,
          error: `Webhook destination returned HTTP ${response.status}.`,
          responseBodyPreview,
          nextAttemptAt,
        });
        await ctx.scheduler.runAfter(delayMs, internal.webhookDeliveryActions.dispatchInternal, args);
        return { status: "RETRY_SCHEDULED", retryScheduled: true, nextAttemptAt };
      }

      const updated = await ctx.runMutation(internal.webhookDeliveries.recordAttemptInternal, {
        deliveryId: args.deliveryId,
        status: "ABANDONED",
        statusCode: response.status,
        error: `Webhook destination returned HTTP ${response.status}.`,
        responseBodyPreview,
      });
      return buildDispatchResult(updated);
    } catch (error) {
      if (attemptNumber < delivery.maxAttempts) {
        const delayMs = getRetryDelayMs(attemptNumber);
        const nextAttemptAt = Date.now() + delayMs;
        await ctx.runMutation(internal.webhookDeliveries.recordAttemptInternal, {
          deliveryId: args.deliveryId,
          status: "RETRY_SCHEDULED",
          error: getErrorMessage(error),
          nextAttemptAt,
        });
        await ctx.scheduler.runAfter(delayMs, internal.webhookDeliveryActions.dispatchInternal, args);
        return { status: "RETRY_SCHEDULED", retryScheduled: true, nextAttemptAt };
      }

      const updated = await ctx.runMutation(internal.webhookDeliveries.recordAttemptInternal, {
        deliveryId: args.deliveryId,
        status: "ABANDONED",
        error: getErrorMessage(error),
      });
      return buildDispatchResult(updated);
    }
  },
});
