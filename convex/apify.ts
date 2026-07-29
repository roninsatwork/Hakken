"use node";

import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";
import { ApifyClient } from "apify-client";
import { validateSafeUrl } from "./utils/security";
import type { ActionCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { tenantAction } from "./tenantFunctions";
import { RIGHTMOVE_ACTOR_ID, collectUrls } from "./apifyActors";

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

/**
 * Start any Apify actor, on behalf of a known company and person.
 *
 * Apify is a catalogue of thousands of scrapers, so the platform exposes it as
 * one generic tool rather than as a menu of hard-coded jobs. Which actor runs
 * is configuration, set by an admin when the tool is added; what it is fed is
 * the agent's decision. That split is the safety story — the same one the
 * "Call an API" tool uses — and it is what keeps a single Rightmove use case
 * out of a platform meant to be the baseline for other products.
 */
export const startApifyActorInternal = internalAction({
  args: {
    actorId: v.string(),
    /** The actor's own input, as JSON. Its shape belongs to the actor. */
    inputJson: v.string(),
    companyId: v.optional(v.id("companies")),
    startedBy: v.id("users"),
  },
  handler: async (ctx, args): Promise<string> => {
    let input: unknown;
    try {
      input = JSON.parse(args.inputJson);
    } catch {
      throw new Error("The settings for this Apify job were not valid JSON.");
    }
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("The settings for this Apify job must be a set of named values.");
    }

    // Every address the actor is pointed at is checked, wherever it appears in
    // the input. Apify actors take their targets as URLs, and an agent that can
    // choose those targets can otherwise be talked into reaching inside our own
    // network.
    for (const url of collectUrls(input)) {
      validateSafeUrl(url, "Apify");
    }

    return await startApifyActor(ctx, {
      actorId: args.actorId,
      input: input as Record<string, unknown>,
      companyId: args.companyId,
      startedBy: args.startedBy,
    });
  },
});

async function startApifyActor(
  ctx: ActionCtx,
  args: {
    actorId: string;
    input: Record<string, unknown>;
    companyId?: Id<"companies">;
    startedBy: Id<"users">;
  }
): Promise<string> {
    const apifyToken = process.env.APIFY_API_TOKEN;
    if (!apifyToken) throw new Error("Apify API Token not configured.");

    const siteUrl = process.env.CONVEX_SITE_URL;
    if (!siteUrl) throw new Error("Convex Site URL not configured.");

    const webhookSecret = process.env.APIFY_WEBHOOK_SECRET;
    if (!webhookSecret) throw new Error("APIFY_WEBHOOK_SECRET environment variable is missing.");

    const client = new ApifyClient({ token: apifyToken });
    const webhookUrl = `${siteUrl}/apify-webhook`;
    const input = args.input;

    // We start the actor asynchronously (fire-and-forget) with a webhook
    const run = await client.actor(args.actorId).start(input, {
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
      startedBy: args.startedBy,
      companyId: args.companyId,
    });

    // Start the background watchdog to ensure status updates even if webhooks fail
    await ctx.scheduler.runAfter(60000, internal.apify.pollRunStatus, {
      runId: run.id,
    });

    return run.id;
}

export const startRightmoveScrape = tenantAction({
  args: {
    listUrls: v.array(v.string()),
    maxProperties: v.number(),
  },
  handler: async (ctx, args): Promise<string> => {
    const user = await ctx.runQuery(api.users.getMe);
    if (!user) throw new Error("Unauthenticated");

    for (const url of args.listUrls) {
      validateSafeUrl(url, "Rightmove Scraper");
    }

    // The Properties screen knows it wants Rightmove listings, so it keeps its
    // own settings for that actor rather than making the person filling in a
    // search box understand Apify.
    return await startApifyActor(ctx, {
      actorId: RIGHTMOVE_ACTOR_ID,
      input: {
        listUrls: args.listUrls.map((url) => ({ url })),
        propertyUrls: [],
        monitoringMode: false,
        deduplicateAtTaskLevel: false,
        fullPropertyDetails: true,
        includePriceHistory: true,
        includeNearestSchools: false,
        enableDelistingTracker: false,
        addEmptyTrackerRecord: false,
        email: "",
        maxProperties: args.maxProperties,
        proxy: { useApifyProxy: true },
      },
      companyId: user.companyId,
      startedBy: user._id,
    });
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
