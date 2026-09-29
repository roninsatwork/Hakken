import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { PlannedCheck } from "./fanOutFirstCheckSteps";
import { holdQuestions } from "./holdLists";
import { readFanOutLimits } from "./fanOutLimits";
import { normaliseKeyword } from "./seoJudgments";
import type { PullForParse } from "./seoCollectionParse";
import { isTrackedHold } from "./utils/websitePairing";
import { DEFAULT_LOCATION_CODE } from "./utils/seoLocations";
import { getErrorMessage } from "./utils/lang";
import { MAX_LIST } from "./websiteSiteRows";

/**
 * How many people search for the AI's fan-out queries each month, what
 * advertisers pay for them and how hard they compete (Anthony, 2026-09-29:
 * "won't Data for SEO give us this", then "build it"). A website's keyword
 * list carries these for every search it ranks for; a fan-out query is a
 * search the AI ran, often one no keyword list holds, so its figures were
 * "Not known". Google Ads' own figures, bought from DataForSEO
 * (`keyword_search_volume`), shared by everyone who meets the search
 * (`searchVolumes` in `siteSchema.ts`).
 */

/** DataForSEO's ceiling for one request: it charges per request, whatever the number of searches in it. */
export const SEARCHES_PER_VOLUME_REQUEST = 1_000;

/** A figure is asked for again after this long: it is a monthly figure. */
export const SEARCH_VOLUME_MAX_AGE_DAYS = 30;

/** Google Ads refuses a search longer than this, or of more words (DataForSEO's documentation, 2026-09-29). */
const MAX_SEARCH_LENGTH = 80;
const MAX_SEARCH_WORDS = 10;

/** The purchase: Google Ads search volume, queued. */
export const SEARCH_VOLUME_OPERATION = "keyword_search_volume";

type Reader = { db: QueryCtx["db"] };

/** Whether Google Ads will take the search: short enough, few enough words, plain characters. */
function askable(keyword: string): boolean {
  return keyword.length > 0
    && keyword.length <= MAX_SEARCH_LENGTH
    && keyword.split(" ").length <= MAX_SEARCH_WORDS
    && /^[\p{L}\p{N} '&.-]+$/u.test(keyword);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const dayOf = (at: number) => new Date(at).toISOString().slice(0, 10);

/** A search's figures from one place, or null when none were ever bought. */
export async function searchVolumeOf(ctx: Reader, keyword: string, locationCode: number): Promise<Doc<"searchVolumes"> | null> {
  return await ctx.db
    .query("searchVolumes")
    .withIndex("by_keyword_place", (q) => q.eq("keyword", keyword).eq("locationCode", locationCode))
    .unique();
}

/**
 * The website's fan-out queries that need figures: every wording of every
 * topic on its list (`fanOutAngles`, as far as its limit shows), less those
 * its own keyword list already measures and those with figures younger than
 * a month — each request up to `SEARCHES_PER_VOLUME_REQUEST`, sent from the
 * website's place. A competitor has no list of its own, so none.
 */
export async function volumeSteps(
  ctx: MutationCtx,
  cycle: Doc<"seoCollectionCycles">,
  hold: Doc<"companyWebsites">,
  plan: (params: Record<string, unknown>, sendIndex: number) => Promise<PlannedCheck>,
) {
  if (isTrackedHold(hold)) return [];
  const locationCode = hold.locationCode ?? DEFAULT_LOCATION_CODE;
  const { anglesShown } = await readFanOutLimits(ctx, hold.companyId, hold._id);
  const [questions, angles] = await Promise.all([
    holdQuestions(ctx, hold._id, MAX_LIST),
    ctx.db.query("fanOutAngles").withIndex("by_hold_seen", (q) => q.eq("holdId", hold._id)).order("desc").take(anglesShown),
  ]);
  const asked = new Set(questions.map((question) => question.prompt));
  const wordings = [...new Set(angles
    .filter((angle) => asked.has(angle.prompt))
    .flatMap((angle) => angle.wordings.map((wording) => normaliseKeyword(wording.query))))];

  const stale = cycle.startedAt - SEARCH_VOLUME_MAX_AGE_DAYS * DAY_MS;
  const due: string[] = [];
  for (const keyword of wordings) {
    if (!askable(keyword)) continue;
    const measured = await ctx.db
      .query("siteKeywordRanks")
      .withIndex("by_site_keyword", (q) => q.eq("websiteId", hold.websiteId).eq("locationCode", locationCode).eq("keyword", keyword))
      .first();
    if (measured?.volumeKnown) continue;
    const held = await searchVolumeOf(ctx, keyword, locationCode);
    if (held && held.updatedAt >= stale) continue;
    due.push(keyword);
  }

  const batches: string[][] = [];
  for (let at = 0; at < due.length; at += SEARCHES_PER_VOLUME_REQUEST) batches.push(due.slice(at, at + SEARCHES_PER_VOLUME_REQUEST).sort());
  return batches.map((keywords) => async (sendIndex: number, room: number) => {
    if (room < 1) return { planned: 0, reused: 0, capped: true };
    const outcome = await plan({ keywords, location_code: locationCode, language_code: "en" }, sendIndex);
    return outcome.reused ? { planned: 0, reused: 1 } : { planned: 1, reused: 0 };
  });
}

const volumeRow = v.object({
  keyword: v.string(),
  volume: v.union(v.number(), v.null()),
  cpc: v.union(v.number(), v.null()),
  competition: v.union(v.string(), v.null()),
  trend: v.array(v.number()),
});

type VolumeRow = typeof volumeRow.type;

const numberOrNull = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** DataForSEO's answer, one row per search: its volume, cost per click, competition and last twelve months. */
export function parseSearchVolumes(result: unknown): VolumeRow[] {
  const rows = Array.isArray(result) ? result : [];
  return rows.flatMap((row): VolumeRow[] => {
    const record = row && typeof row === "object" ? (row as Record<string, unknown>) : null;
    const keyword = typeof record?.keyword === "string" ? normaliseKeyword(record.keyword) : "";
    if (!record || !keyword) return [];
    const months = (Array.isArray(record.monthly_searches) ? record.monthly_searches : [])
      .flatMap((month) => {
        const entry = month && typeof month === "object" ? (month as Record<string, unknown>) : null;
        const year = numberOrNull(entry?.year);
        const number = numberOrNull(entry?.month);
        return year !== null && number !== null ? [{ order: year * 12 + number, volume: numberOrNull(entry?.search_volume) ?? 0 }] : [];
      })
      .sort((left, right) => left.order - right.order)
      .slice(-12);
    return [{
      keyword,
      volume: numberOrNull(record.search_volume),
      cpc: numberOrNull(record.cpc),
      competition: typeof record.competition === "string" ? record.competition : null,
      trend: months.map((month) => month.volume),
    }];
  });
}

/** Keep each search's figures from one purchase, replacing what was held. */
export const writeSearchVolumes = internalMutation({
  args: { pullId: v.id("seoDataPulls"), locationCode: v.number(), rows: v.array(volumeRow) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const row of args.rows) {
      const held = await searchVolumeOf(ctx, row.keyword, args.locationCode);
      const figures = { ...row, locationCode: args.locationCode, checkedDay: dayOf(now), pullId: args.pullId, updatedAt: now };
      if (held) await ctx.db.patch(held._id, figures);
      else await ctx.db.insert("searchVolumes", figures);
    }
    return null;
  },
});

/** File a search-volume purchase (`seoCollectionParse.ts` hands it here). Failures are recorded on the pull. */
export async function fileSearchVolumePull(
  ctx: ActionCtx,
  pullId: Id<"seoDataPulls">,
  pull: Pick<PullForParse, "resultJson" | "taskArgsJson">,
): Promise<null> {
  try {
    const sent = JSON.parse(pull.taskArgsJson ?? "{}") as Record<string, unknown>;
    const locationCode = typeof sent.location_code === "number" ? sent.location_code : DEFAULT_LOCATION_CODE;
    const rows = parseSearchVolumes(JSON.parse(pull.resultJson ?? "[]"));
    await ctx.runMutation(internal.searchVolumes.writeSearchVolumes, { pullId, locationCode, rows });
  } catch (error) {
    await ctx.runMutation(internal.seoCollectionParse.recordParseFailure, { pullId, error: getErrorMessage(error) });
  }
  return null;
}

