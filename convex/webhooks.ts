import { httpAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

export const processApifyWebhook = httpAction(async (ctx, request) => {
  const payloadStr = await request.text();
  let payload;
  try {
    payload = JSON.parse(payloadStr);
  } catch (err) {
    return new Response("Invalid JSON payload", { status: 400 });
  }

  const { runId, status, actorId, datasetId } = payload;
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
      await ctx.db.patch(run._id, {
        status: args.status === "FAILED" || args.status === "ABORTED" ? "FAILED" : "COMPLETED",
        completedAt: Date.now(),
      });
    }
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

export const storeRightmoveData = internalMutation({
  args: {
    runId: v.string(),
    status: v.string(),
    items: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.query("apifyRuns")
      .withIndex("by_runId", q => q.eq("runId", args.runId))
      .unique();

    if (!run) throw new Error("Run not found");

    for (const itemStr of args.items) {
      const item = JSON.parse(itemStr);
      await ctx.db.insert("properties", {
        runId: args.runId,
        rightmoveId: String(item.id || item.url || Date.now()),
        address: item.address || item.displayAddress || "Unknown",
        price: typeof item.price === 'number' ? item.price : parseInt(String(item.price).replace(/[^0-9]/g, '')) || 0,
        currency: "GBP",
        bedrooms: item.bedrooms || 0,
        bathrooms: item.bathrooms || 0,
        propertyType: item.propertyType || "Unknown",
        url: item.url || "",
        imageUrl: item.images?.[0]?.url || item.mainImage || "",
        description: item.description || item.summary || "",
        agentName: item.branch?.name || item.agent?.name || "",
        agentPhone: item.branch?.phone || item.agent?.phone || "",
        companyId: run.companyId,
        scrapedAt: Date.now(),
      });
    }

    await ctx.db.patch(run._id, {
      status: "COMPLETED",
      completedAt: Date.now(),
      propertiesScraped: args.items.length,
    });
  },
});
