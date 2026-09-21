"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";
import {
  getActor,
  getBuildInputSchema,
  getRun,
  listDatasetItems,
  searchStore,
  startActorRun,
} from "./apifyRest";
import { validateSafeUrl } from "./utils/security";
import type { ActionCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { tenantAction } from "./tenantFunctions";
import { collectUrls } from "./apifyActors";
import { appError } from "./utils/appError";

type ApifyRun = Doc<"apifyRuns">;

async function requireApifyRunAccess(ctx: ActionCtx, runId: string) {
  const user = await ctx.runQuery(api.users.getMe);
  if (!user) throw appError("UNAUTHENTICATED", "Unauthenticated");

  const run: ApifyRun | null = await ctx.runQuery(internal.webhooks.getRunByRunIdInternal, { runId });
  if (!run) throw appError("NOT_FOUND", "Run not found");

  if (user.role !== "SUPER_ADMIN") {
    const activeCompanyId = user.impersonatingCompanyId || user.companyId;
    if (!activeCompanyId || run.companyId !== activeCompanyId) {
      throw appError("UNAUTHORIZED", "Unauthorized");
    }
  }

  return { user, run };
}

async function syncApifyRunStatus(runId: string) {
  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apifyToken) throw appError("NOT_CONFIGURED", "Apify token not configured");

  const run = await getRun(apifyToken, runId);
  if (!run) throw appError("NOT_FOUND", "Run not found on Apify");

  return { token: apifyToken, run };
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
      throw appError("INVALID_INPUT", "The settings for this Apify job were not valid JSON.");
    }
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      throw appError("INVALID_INPUT", "The settings for this Apify job must be a set of named values.");
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

/**
 * Find an Apify job, and read what it needs.
 *
 * Without this, an agent can only run a job whose id and settings somebody has
 * typed into its instructions by hand — specialist detail sitting in a text box
 * where a single wrong character fails silently. Apify already publishes both,
 * so the agent reads them itself and nothing job-specific has to live here.
 *
 * Search and describe are one tool on purpose. An agent asked to "collect from
 * Rightmove" has a name, not an id, and splitting them would make it guess an
 * id in order to look one up.
 */
export const describeApifyActorInternal = internalAction({
  args: {
    /** A name to look for in the Apify store, when the job is not known yet. */
    search: v.optional(v.string()),
    /** A known job, to read the settings of. */
    actorId: v.optional(v.string()),
  },
  handler: async (_ctx, args): Promise<unknown> => {
    const apifyToken = process.env.APIFY_API_TOKEN;
    if (!apifyToken) throw appError("NOT_CONFIGURED", "Apify API Token not configured.");
    if (!args.actorId) {
      const term = (args.search ?? "").trim();
      if (!term) throw appError("INVALID_INPUT", "Give either something to search for, or a job id.");

      const items = await searchStore(apifyToken, term, APIFY_SEARCH_LIMIT);
      return {
        matches: items.map((item) => ({
          job: item.username && item.name ? `${item.username}/${item.name}` : item.id,
          title: item.title ?? item.name,
          what: truncate(item.description ?? ""),
        })),
        next: "Choose one, then look it up again by its job id to see what settings it needs.",
      };
    }

    const actor = await getActor(apifyToken, args.actorId);
    if (!actor) throw appError("NOT_FOUND", `No Apify job found with the id "${args.actorId}".`);

    // The settings live on the build, not the job record. Older builds expose
    // them on a deprecated field, so both are read rather than assuming which
    // one a given job publishes.
    const buildId = actor.taggedBuilds?.latest?.buildId;
    let settings: unknown;
    if (buildId) {
      const raw = await getBuildInputSchema(apifyToken, buildId);
      settings = typeof raw === "string" ? safeParse(raw) : raw;
    }

    return {
      job: args.actorId,
      title: actor.title ?? actor.name,
      what: truncate(actor.description ?? ""),
      settings: settings ?? "This job does not publish its settings. Ask the person who wants it run.",
    };
  },
});

/** Enough to choose from without burying the answer. */
const APIFY_SEARCH_LIMIT = 8;
/** Store descriptions run long; the agent needs the gist, not the brochure. */
const APIFY_DESCRIPTION_MAX = 400;

function truncate(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > APIFY_DESCRIPTION_MAX
    ? `${clean.slice(0, APIFY_DESCRIPTION_MAX - 1)}…`
    : clean;
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

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
    if (!apifyToken) throw appError("NOT_CONFIGURED", "Apify API Token not configured.");

    const siteUrl = process.env.CONVEX_SITE_URL;
    if (!siteUrl) throw appError("NOT_CONFIGURED", "Convex Site URL not configured.");

    const webhookSecret = process.env.APIFY_WEBHOOK_SECRET;
    if (!webhookSecret) throw appError("NOT_CONFIGURED", "APIFY_WEBHOOK_SECRET environment variable is missing.");

    const webhookUrl = `${siteUrl}/apify-webhook`;

    // Started and left to run: Apify calls the webhook when it finishes, which
    // is why nothing here waits for results.
    const run = await startActorRun({
      token: apifyToken,
      actorId: args.actorId,
      input: args.input,
      webhooks: [
        {
          eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.ABORTED"],
          requestUrl: webhookUrl,
          headersTemplate: JSON.stringify({ "X-Apify-Secret": webhookSecret }),
          payloadTemplate: `{"runId": "{{resource.id}}", "status": "{{resource.status}}", "actorId": "{{resource.actId}}", "datasetId": "{{resource.defaultDatasetId}}"}`,
        },
      ],
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


export const pollRunStatus = internalAction({
  args: { runId: v.string() },
  handler: async (ctx, args) => {
    const apifyToken = process.env.APIFY_API_TOKEN;
    if (!apifyToken) return;
    
    const run = await getRun(apifyToken, args.runId);
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
    if (!apifyToken) throw appError("NOT_CONFIGURED", "Apify API Token not configured.");

    const items = await listDatasetItems(apifyToken, args.datasetId);

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
  returns: v.string(),
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
  const { token, run } = await syncApifyRunStatus(runId);

  // If it's still running, just update the status to PENDING
  if (run.status !== "SUCCEEDED") {
    await ctx.runMutation(internal.webhooks.updateRunStatus, {
      runId,
      status: run.status,
    });
    return run.status;
  }

  if (!run.defaultDatasetId) throw appError("NOT_FOUND", "Apify run has no results to read.");
  const items = await listDatasetItems(token, run.defaultDatasetId);

  await ctx.runMutation(internal.webhooks.storeRightmoveData, {
    runId,
    status: "SUCCEEDED",
    items: items.map((item) => JSON.stringify(item)),
  });

  return "SUCCEEDED";
}

export const debugDatasetItem = tenantAction({
  args: { runId: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { user } = await requireApifyRunAccess(ctx, args.runId);
    if (user.role !== "SUPER_ADMIN") throw appError("UNAUTHORIZED", "Unauthorized");

    const apifyToken = process.env.APIFY_API_TOKEN;
    if (!apifyToken) throw appError("NOT_CONFIGURED", "Apify token not configured");

    const run = await getRun(apifyToken, args.runId);
    
    if (!run) throw appError("NOT_FOUND", "Run not found");
    if (!run.defaultDatasetId) throw appError("NOT_FOUND", "Run has no results to read.");
    const items = await listDatasetItems(apifyToken, run.defaultDatasetId, 1);
    return items[0];
  }
});
