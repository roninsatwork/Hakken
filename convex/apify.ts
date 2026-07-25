"use node";

import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";
import { ApifyClient } from "apify-client";
import { validateSafeUrl } from "./utils/security";
import type { ActionCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { tenantAction } from "./tenantFunctions";

type ApifyRun = Doc<"apifyRuns">;

async function requireApifyRunAccess(ctx: ActionCtx, runId: string) {
  const user = await ctx.runQuery(api.users.getMe);
  if (!user) throw new Error("Unauthenticated");

  const run: ApifyRun | null = await ctx.runQuery(internal.webhooks.getRunByRunIdInternal, { runId });
  if (!run) throw new Error("Run not found");

  if (user.role !== "SUPER_ADMIN") {
    const activeCompanyId = user.impersonatingCompanyId || user.companyId;
    if (!activeCompanyId || run.companyId !== activeCompanyId) {
      throw new Error("Unauthorized");
    }
  }

  return { user, run };
}

async function syncApifyRunStatus(runId: string) {
  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apifyToken) throw new Error("Apify token not configured");

  const client = new ApifyClient({ token: apifyToken });
  const run = await client.run(runId).get();

  if (!run) throw new Error("Run not found on Apify");

  return { client, run };
}

export const startRightmoveScrape = tenantAction({
  args: {
    listUrls: v.array(v.string()),
    maxProperties: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(api.users.getMe);
    if (!user) throw new Error("Unauthenticated");

    // SSRF Safety Check - validate all user-supplied scrape targets
    for (const url of args.listUrls) {
      validateSafeUrl(url, "Rightmove Scraper");
    }

    const apifyToken = process.env.APIFY_API_TOKEN;
    if (!apifyToken) throw new Error("Apify API Token not configured.");

    const siteUrl = process.env.CONVEX_SITE_URL;
    if (!siteUrl) throw new Error("Convex Site URL not configured.");

    const webhookSecret = process.env.APIFY_WEBHOOK_SECRET;
    if (!webhookSecret) throw new Error("APIFY_WEBHOOK_SECRET environment variable is missing.");

    const client = new ApifyClient({ token: apifyToken });
    const webhookUrl = `${siteUrl}/apify-webhook`;

    const input = {
        "listUrls": args.listUrls.map(url => ({ url })),
        "propertyUrls": [],
        "monitoringMode": false,
        "deduplicateAtTaskLevel": false,
        "fullPropertyDetails": true,
        "includePriceHistory": true,
        "includeNearestSchools": false,
        "enableDelistingTracker": false,
        "addEmptyTrackerRecord": false,
        "email": "",
        "maxProperties": args.maxProperties,
        "proxy": {
            "useApifyProxy": true
        }
    };

    // We start the actor asynchronously (fire-and-forget) with a webhook
    const run = await client.actor("jKpgGfgRfzrGgEMa8").start(input, {
        webhooks: [
            {
                eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.ABORTED"],
                requestUrl: webhookUrl,
                headersTemplate: JSON.stringify({
                    "X-Apify-Secret": webhookSecret
                }),
                payloadTemplate: `{"runId": "{{resource.id}}", "status": "{{resource.status}}", "actorId": "{{resource.actId}}", "datasetId": "{{resource.defaultDatasetId}}"}`,
            }
        ]
    });

    // Record the run in the database
    await ctx.runMutation(internal.webhooks.recordRunStart, {
      runId: run.id,
      actorId: run.actId,
      startedBy: user._id,
      companyId: user.companyId,
    });

    // Start the background watchdog to ensure status updates even if webhooks fail
    await ctx.scheduler.runAfter(60000, internal.apify.pollRunStatus, {
      runId: run.id,
    });

    return run.id;
  },
});

export const pollRunStatus = internalAction({
  args: { runId: v.string() },
  handler: async (ctx, args) => {
    const apifyToken = process.env.APIFY_API_TOKEN;
    if (!apifyToken) return;
    
    const client = new ApifyClient({ token: apifyToken });
    const run = await client.run(args.runId).get();
    
    if (!run) return;

    // If finished, sync the data
    if (run.status === "SUCCEEDED" || run.status === "FAILED" || run.status === "ABORTED" || run.status === "TIMED-OUT") {
      await ctx.runAction(internal.apify.syncRunStatusInternal, { runId: args.runId });
      return;
    }

    // Otherwise, check again in 60 seconds
    await ctx.scheduler.runAfter(60000, internal.apify.pollRunStatus, {
      runId: args.runId,
    });
  },
});

export const fetchDatasetAndStore = internalAction({
  args: {
    runId: v.string(),
    datasetId: v.string(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const apifyToken = process.env.APIFY_API_TOKEN;
    if (!apifyToken) throw new Error("Apify API Token not configured.");

    const client = new ApifyClient({ token: apifyToken });
    const dataset = await client.dataset(args.datasetId).listItems();
    const items = dataset.items;

    // Call internal mutation to store items
    await ctx.runMutation(internal.webhooks.storeRightmoveData, {
      runId: args.runId,
      status: args.status,
      items: items.map(item => JSON.stringify(item)),
    });
  },
});

export const syncRunStatus = tenantAction({
  args: { runId: v.string() },
  handler: async (ctx, args) => {
    await requireApifyRunAccess(ctx, args.runId);
    return await syncRunStatusForKnownRun(ctx, args.runId);
  }
});

export const syncRunStatusInternal = internalAction({
  args: { runId: v.string() },
  handler: async (ctx, args) => {
    return await syncRunStatusForKnownRun(ctx, args.runId);
  },
});

async function syncRunStatusForKnownRun(ctx: ActionCtx, runId: string) {
  const { client, run } = await syncApifyRunStatus(runId);

  // If it's still running, just update the status to PENDING
  if (run.status !== "SUCCEEDED") {
    await ctx.runMutation(internal.webhooks.updateRunStatus, {
      runId,
      status: run.status,
    });
    return run.status;
  }

  const dataset = await client.dataset(run.defaultDatasetId).listItems();

  await ctx.runMutation(internal.webhooks.storeRightmoveData, {
    runId,
    status: "SUCCEEDED",
    items: dataset.items.map((item) => JSON.stringify(item)),
  });

  return "SUCCEEDED";
}

export const debugDatasetItem = tenantAction({
  args: { runId: v.string() },
  handler: async (ctx, args) => {
    const { user } = await requireApifyRunAccess(ctx, args.runId);
    if (user.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

    const apifyToken = process.env.APIFY_API_TOKEN;
    if (!apifyToken) throw new Error("Apify token not configured");

    const client = new ApifyClient({ token: apifyToken });
    const run = await client.run(args.runId).get();
    
    if (!run) throw new Error("Run not found");
    const dataset = await client.dataset(run.defaultDatasetId).listItems({ limit: 1 });
    return dataset.items[0];
  }
});
