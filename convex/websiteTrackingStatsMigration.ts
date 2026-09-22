import { engineForOperationId } from "./seoAiEngines";
import { DEFAULT_LOCATION_CODE, SEO_LOCATIONS } from "./utils/seoLocations";
import { recomputeSearchStats, recordAnswer, recordOperationCost } from "./websiteTrackingStats";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

/**
 * Building the tracking summaries from what was collected before they existed.
 *
 * `websiteSearchStats`, `websiteQuestionStats` and `aiAnswers` arrived on
 * 2026-09-22 and are filled as results are parsed. Everything parsed before
 * then is still on file — positions per search, and every AI answer as a pull
 * plus its citation rows — so these rebuild the summaries from it, through the
 * same functions the parse uses. Both are idempotent: every summary is rebuilt
 * from its rows rather than added to, so running one twice changes nothing.
 */

type MigrationBatchResult = {
  cursor: string | null;
  isDone: boolean;
  processed: number;
  updated: number;
};

const LOCATION_BY_CITY = new Map(
  SEO_LOCATIONS.filter((location) => location.city).map((location) => [location.city!, location.code]),
);

/** Citation rows read back per answer: one answer names a handful of brands. */
const CITATIONS_PER_ANSWER = 300;

/** Every stored AI answer, filed again as an answer. */
export async function rebuildAnswerSummaries(
  ctx: MutationCtx,
  cursor: string | null,
  batchSize: number,
): Promise<MigrationBatchResult> {
  const page = await ctx.db.query("seoDataPulls").paginate({ numItems: batchSize, cursor });

  let updated = 0;
  for (const pull of page.page) {
    const engine = engineForOperationId(pull.operationId);
    if (!engine || pull.status !== "READY" || !pull.taskArgsJson) continue;

    let sent: Record<string, unknown>;
    try {
      sent = JSON.parse(pull.taskArgsJson) as Record<string, unknown>;
    } catch {
      continue;
    }
    const prompt = typeof sent.user_prompt === "string" ? sent.user_prompt : "";
    if (!prompt) continue;
    const city = typeof sent.web_search_city === "string" ? sent.web_search_city : undefined;

    const citations = await ctx.db
      .query("aiCitations")
      .withIndex("by_pull", (q) => q.eq("pullId", pull._id))
      .take(CITATIONS_PER_ANSWER);
    const brands = citations
      .filter((row) => row.kind === "BRAND" && row.mentionedWebsiteId)
      .sort((left, right) => left.position - right.position)
      .map((row) => ({
        websiteId: row.mentionedWebsiteId as Id<"websites">,
        ...(row.stance ? { stance: row.stance } : {}),
      }));

    await recordAnswer(ctx, {
      pullId: pull._id,
      prompt,
      engine,
      locationCode: (city ? LOCATION_BY_CITY.get(city) : undefined) ?? DEFAULT_LOCATION_CODE,
      day: new Date(pull.completedAt ?? pull.submittedAt).toISOString().slice(0, 10),
      brands,
    });
    updated += 1;
  }

  return {
    cursor: page.isDone ? null : page.continueCursor,
    isDone: page.isDone,
    processed: page.page.length,
    updated,
  };
}

/** Places one search is summarised from. More than this is not one watcher's list. */
const PLACES_PER_SEARCH = 25;

/** Every tracked search, summarised from the positions already on file. */
export async function rebuildSearchSummaries(
  ctx: MutationCtx,
  cursor: string | null,
  batchSize: number,
): Promise<MigrationBatchResult> {
  const page = await ctx.db.query("websiteKeywords").paginate({ numItems: batchSize, cursor });

  let updated = 0;
  for (const search of page.page) {
    const rows = await ctx.db
      .query("seoKeywordPositions")
      .withIndex("by_website_keyword_day", (q) =>
        q.eq("websiteId", search.websiteId).eq("keyword", search.keyword))
      .order("desc")
      .take(PLACES_PER_SEARCH * 4);
    const places = new Set(rows.map((row) => row.locationCode ?? DEFAULT_LOCATION_CODE));
    for (const locationCode of [...places].slice(0, PLACES_PER_SEARCH)) {
      await recomputeSearchStats(ctx, { websiteId: search.websiteId, keyword: search.keyword, locationCode });
      updated += 1;
    }
  }

  return {
    cursor: page.isDone ? null : page.continueCursor,
    isDone: page.isDone,
    processed: page.page.length,
    updated,
  };
}

/**
 * What each operation has cost, rebuilt from every charge on file.
 *
 * The running mean arrived with the Tracking screen's prices and is kept at
 * send time from then on; the charges before it are still on the pull rows.
 * The first batch clears the table, so a run from the start — forced or not —
 * rebuilds rather than adds, and a resumed run carries on adding where it
 * stopped. The sandbox charges nothing and says nothing about a price.
 */
export async function rebuildOperationCosts(
  ctx: MutationCtx,
  cursor: string | null,
  batchSize: number,
): Promise<MigrationBatchResult> {
  if (cursor === null) {
    for (const row of await ctx.db.query("seoOperationCosts").take(OPERATIONS_CLEARED)) {
      await ctx.db.delete(row._id);
    }
  }

  const page = await ctx.db.query("seoDataPulls").paginate({ numItems: batchSize, cursor });
  let updated = 0;
  for (const pull of page.page) {
    if (pull.sandbox || !(pull.costUsd > 0)) continue;
    await recordOperationCost(ctx, pull.operationId, pull.costUsd);
    updated += 1;
  }

  return {
    cursor: page.isDone ? null : page.continueCursor,
    isDone: page.isDone,
    processed: page.page.length,
    updated,
  };
}

/** Operations in the registry, with room: the whole cost table is this small. */
const OPERATIONS_CLEARED = 200;
