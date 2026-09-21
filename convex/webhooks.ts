import { httpAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { readBoundedJson } from "./utils/boundedRequestBody";
import { constantTimeEqual } from "./utils/security";
import { appError } from "./utils/appError";



export const processApifyWebhook = httpAction(async (ctx, request) => {
  // Validate dynamic shared webhook secret to prevent spoofing
  // 🛡️ SECURITY: Enforce webhook secret strictly via headers to prevent credential leak in proxy/server logs.
  const secretHeader = request.headers.get("X-Apify-Secret") || request.headers.get("x-apify-secret");
  const webhookSecret = process.env.APIFY_WEBHOOK_SECRET;

  let isSecretValid = false;
  if (webhookSecret) {
    const checkSecret = (providedStr: string | null) => {
      if (!providedStr) return false;
      return constantTimeEqual(providedStr, webhookSecret);
    };

    isSecretValid = checkSecret(secretHeader);
  }

  if (!isSecretValid) {
    return new Response("Unauthorized request origin", { status: 401 });
  }

  /*
   * Only after the secret has been proven, and never more than the cap: the
   * public API and the workflow webhook both read this way, and this handler
   * was the one that did not — it took `request.text()` on whatever arrived and
   * had already buffered it before it could object.
   */
  const body = await readBoundedJson(request);
  if (!body.ok) {
    return body.reason === "too_large"
      ? new Response("Payload too large", { status: 413 })
      : new Response("Invalid JSON payload", { status: 400 });
  }

  const payload = body.payload as { runId?: string; status?: string; datasetId?: string };
  const { runId, status, datasetId } = payload;
  if (!runId || !status) {
    return new Response("Missing runId or status", { status: 400 });
  }

  if (status === "SUCCEEDED" && datasetId) {
    // Delegate to Node action to use apify-client
    await ctx.runAction(internal.apify.fetchDatasetAndStore, {
      runId,
      datasetId,
      status,
    });
  } else {
    await ctx.runMutation(internal.webhooks.updateRunStatus, {
      runId,
      status,
    });
  }

  return new Response("Webhook processed", { status: 200 });
});

export const updateRunStatus = internalMutation({
  args: {
    runId: v.string(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.query("apifyRuns")
      .withIndex("by_runId", q => q.eq("runId", args.runId))
      .unique();

    if (run) {
      let newStatus: "PENDING" | "COMPLETED" | "FAILED" = "PENDING";
      let completedAt = run.completedAt;

      if (args.status === "FAILED" || args.status === "ABORTED" || args.status === "TIMED-OUT") {
        newStatus = "FAILED";
        completedAt = Date.now();
      } else if (args.status === "SUCCEEDED") {
        newStatus = "COMPLETED";
        completedAt = Date.now();
      } else {
        newStatus = "PENDING";
        completedAt = undefined;
      }

      await ctx.db.patch(run._id, {
        status: newStatus,
        completedAt,
      });
    }
  },
});

export const getRunByRunIdInternal = internalQuery({
  args: {
    runId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.query("apifyRuns")
      .withIndex("by_runId", q => q.eq("runId", args.runId))
      .unique();
  },
});

export const recordRunStart = internalMutation({
  args: {
    runId: v.string(),
    actorId: v.string(),
    startedBy: v.id("users"),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("apifyRuns", {
      runId: args.runId,
      actorId: args.actorId,
      startedBy: args.startedBy,
      companyId: args.companyId,
      status: "PENDING",
      startedAt: Date.now(),
    });
  },
});

export const completeApifyRun = internalMutation({
  args: {
    runId: v.string(),
    status: v.string(),
    items: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.query("apifyRuns")
      .withIndex("by_runId", q => q.eq("runId", args.runId))
      .unique();

    if (!run) throw appError("NOT_FOUND", "Run not found");

    // The platform records that the job finished; it never interprets results.
    await ctx.db.patch(run._id, { status: "COMPLETED", completedAt: Date.now() });
  },
});
