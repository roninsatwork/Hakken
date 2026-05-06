"use node";

import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";
import { ApifyClient } from "apify-client";

export const startRightmoveScrape = action({
  args: {
    listUrls: v.array(v.string()),
    maxProperties: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(api.users.getMe);
    if (!user) throw new Error("Unauthenticated");

    const apifyToken = process.env.APIFY_API_TOKEN;
    if (!apifyToken) throw new Error("Apify API Token not configured.");

    const siteUrl = process.env.CONVEX_SITE_URL;
    if (!siteUrl) throw new Error("Convex Site URL not configured.");

    const client = new ApifyClient({ token: apifyToken });
    const webhookUrl = `${siteUrl}/apify-webhook`;

    const input = {
        "listUrls": args.listUrls.map(url => ({ url })),
        "propertyUrls": [],
        "monitoringMode": false,
        "deduplicateAtTaskLevel": false,
        "fullPropertyDetails": false,
        "includePriceHistory": false,
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

    return run.id;
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
