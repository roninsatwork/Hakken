import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { PlannedCheck } from "./fanOutFirstCheckSteps";
import { holdQuestions } from "./holdLists";
import { readFanOutLimits } from "./fanOutLimits";
import { normaliseKeyword } from "./seoJudgments";
import { findSeoOperation } from "./dataForSeoRegistry";
import { buildSeoIdempotencyKey } from "./seoIdempotency";
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
 * Figures for a website's own searches, asked off the collection's schedule
 * (insights-intelligence-plan.md phase 3: a keyword cannibalisation group's
 * searches, weighed by how often people search them): those Google Ads will
 * take, less those with figures younger than a month, queued from the
 * website's place up to `SEARCHES_PER_VOLUME_REQUEST` a request and sent now.
 * The same search asked twice in a day is the one request. Returns how many
 * searches were asked for.
 */
export async function askVolumesFor(ctx: MutationCtx, hold: Doc<"companyWebsites">, searches: readonly string[], at: number): Promise<number> {
  if (isTrackedHold(hold)) return 0;
  const website = await ctx.db.get(hold.websiteId);
  if (!website) return 0;
  const locationCode = hold.locationCode ?? DEFAULT_LOCATION_CODE;
  const stale = at - SEARCH_VOLUME_MAX_AGE_DAYS * DAY_MS;
  const due: string[] = [];
  for (const keyword of new Set(searches.map(normaliseKeyword))) {
    if (!askable(keyword)) continue;
    const held = await searchVolumeOf(ctx, keyword, locationCode);
    if (held && held.updatedAt >= stale) continue;
    due.push(keyword);
  }
  const operation = findSeoOperation(SEARCH_VOLUME_OPERATION)!;
  for (let start = 0; start < due.length; start += SEARCHES_PER_VOLUME_REQUEST) {
    const params = { keywords: due.slice(start, start + SEARCHES_PER_VOLUME_REQUEST).sort(), location_code: locationCode, language_code: "en" };
    const idempotencyKey = buildSeoIdempotencyKey({ operationId: operation.id, websiteId: hold.websiteId, params, cycleStartedAt: at });
    const asked = await ctx.db.query("seoDataPulls").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey)).first();
    if (asked) continue;
    await ctx.db.insert("seoDataPulls", {
      operationId: operation.id, family: operation.family, mode: operation.mode, target: website.host, websiteId: hold.websiteId, companyId: hold.companyId,
      taskArgsJson: JSON.stringify(params), status: "PENDING", tag: idempotencyKey, idempotencyKey, dueAt: at, attempts: 0, costUsd: 0, sandbox: false, submittedAt: at,
    });
  }
  // Queued, and sent now: a Collector sending takes it in; with none going, one starts.
  if (due.length > 0) await ctx.scheduler.runAfter(0, internal.seoAgentRuns.sendIfWaiting, {});
  return due.length;
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

/** File a purchase of figures about searches, its volumes or its difficulty (`seoCollectionParse.ts` hands it here). */
export async function fileSearchFiguresPull(
  ctx: ActionCtx,
  pullId: Id<"seoDataPulls">,
  pull: Pick<PullForParse, "operationId" | "resultJson" | "taskArgsJson">,
): Promise<null> {
  return pull.operationId === DIFFICULTY_OPERATION ? await fileDifficultyPull(ctx, pullId, pull) : await fileSearchVolumePull(ctx, pullId, pull);
}

/** File a search-volume purchase. Failures are recorded on the pull. */
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

// ── How hard a search is ──────────────────────────────────────────────────

/** The purchase: DataForSEO Labs' keyword difficulty, live, up to `SEARCHES_PER_VOLUME_REQUEST` searches a request. */
export const DIFFICULTY_OPERATION = "keyword_difficulty";
/** A difficulty is asked for again after this long: it moves slowly. */
export const DIFFICULTY_MAX_AGE_DAYS = 30;

/** A search's bought difficulty from one place, or null when none was ever bought. */
export async function searchDifficultyOf(ctx: Reader, keyword: string, locationCode: number): Promise<Doc<"searchDifficulties"> | null> {
  return await ctx.db.query("searchDifficulties").withIndex("by_keyword_place", (q) => q.eq("keyword", keyword).eq("locationCode", locationCode)).unique();
}

/**
 * How hard each search is, for a website's own (insights-one-voice-plan.md,
 * Anthony's fourth answer: "use what we have and the handful of keywords we
 * need to get"): the monthly ranking collection's where it holds one, else the
 * one bought — null where neither is held.
 */
export async function difficultiesOf(ctx: Reader, websiteId: Id<"websites">, locationCode: number, searches: readonly string[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  for (const search of searches) {
    const keyword = normaliseKeyword(search);
    const ranked = await ctx.db.query("siteKeywordRanks").withIndex("by_site_keyword", (q) => q.eq("websiteId", websiteId).eq("locationCode", locationCode).eq("keyword", keyword)).first();
    if (typeof ranked?.difficulty === "number") {
      out.set(search, ranked.difficulty);
      continue;
    }
    const bought = await searchDifficultyOf(ctx, keyword, locationCode);
    out.set(search, bought?.difficulty ?? null);
  }
  return out;
}

/**
 * The difficulties a website's searches still lack, bought in one request a
 * week: those the monthly collection doesn't hold and none bought in the last
 * `DIFFICULTY_MAX_AGE_DAYS`, queued from the website's place and sent now.
 * The same searches asked twice in a day are the one request. Returns how
 * many were asked for.
 */
export async function askDifficultyFor(ctx: MutationCtx, hold: Doc<"companyWebsites">, searches: readonly string[], at: number): Promise<number> {
  if (isTrackedHold(hold)) return 0;
  const website = await ctx.db.get(hold.websiteId);
  if (!website) return 0;
  const locationCode = hold.locationCode ?? DEFAULT_LOCATION_CODE;
  const stale = at - DIFFICULTY_MAX_AGE_DAYS * DAY_MS;
  const held = await difficultiesOf(ctx, hold.websiteId, locationCode, searches);
  const due: string[] = [];
  for (const keyword of new Set(searches.map(normaliseKeyword))) {
    if (!askable(keyword) || typeof held.get(keyword) === "number") continue;
    const bought = await searchDifficultyOf(ctx, keyword, locationCode);
    if (bought && bought.updatedAt >= stale) continue;
    due.push(keyword);
  }
  const operation = findSeoOperation(DIFFICULTY_OPERATION)!;
  for (let start = 0; start < due.length; start += SEARCHES_PER_VOLUME_REQUEST) {
    const params = { keywords: due.slice(start, start + SEARCHES_PER_VOLUME_REQUEST).sort(), location_code: locationCode, language_code: "en" };
    const idempotencyKey = buildSeoIdempotencyKey({ operationId: operation.id, websiteId: hold.websiteId, params, cycleStartedAt: at });
    if (await ctx.db.query("seoDataPulls").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey)).first()) continue;
    await ctx.db.insert("seoDataPulls", {
      operationId: operation.id, family: operation.family, mode: operation.mode, target: website.host, websiteId: hold.websiteId, companyId: hold.companyId,
      taskArgsJson: JSON.stringify(params), status: "PENDING", tag: idempotencyKey, idempotencyKey, dueAt: at, attempts: 0, costUsd: 0, sandbox: false, submittedAt: at,
    });
  }
  if (due.length > 0) await ctx.scheduler.runAfter(0, internal.seoAgentRuns.sendIfWaiting, {});
  return due.length;
}

const difficultyRow = v.object({ keyword: v.string(), difficulty: v.union(v.number(), v.null()) });

/** DataForSEO Labs' answer, one row per search: its difficulty, 0–100, or none where it has none. */
export function parseKeywordDifficulty(result: unknown): Array<typeof difficultyRow.type> {
  const records = (Array.isArray(result) ? result : []).flatMap((entry) => {
    const record = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null;
    // A live answer lists its searches under `items`; an answer already flattened is the rows themselves.
    return Array.isArray(record?.items) ? record.items : record ? [record] : [];
  });
  return records.flatMap((item) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : null;
    const keyword = typeof row?.keyword === "string" ? normaliseKeyword(row.keyword) : "";
    return keyword ? [{ keyword, difficulty: numberOrNull(row?.keyword_difficulty) }] : [];
  });
}

/** Keep each search's difficulty from one purchase, replacing what was held. */
export const writeDifficulties = internalMutation({
  args: { pullId: v.id("seoDataPulls"), locationCode: v.number(), rows: v.array(difficultyRow) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const row of args.rows) {
      const held = await searchDifficultyOf(ctx, row.keyword, args.locationCode);
      const figures = { ...row, locationCode: args.locationCode, checkedDay: dayOf(now), pullId: args.pullId, updatedAt: now };
      if (held) await ctx.db.patch(held._id, figures);
      else await ctx.db.insert("searchDifficulties", figures);
    }
    return null;
  },
});

/** File a difficulty purchase. Failures are recorded on the pull. */
async function fileDifficultyPull(ctx: ActionCtx, pullId: Id<"seoDataPulls">, pull: Pick<PullForParse, "resultJson" | "taskArgsJson">): Promise<null> {
  try {
    const sent = JSON.parse(pull.taskArgsJson ?? "{}") as Record<string, unknown>;
    const locationCode = typeof sent.location_code === "number" ? sent.location_code : DEFAULT_LOCATION_CODE;
    await ctx.runMutation(internal.searchVolumes.writeDifficulties, { pullId, locationCode, rows: parseKeywordDifficulty(JSON.parse(pull.resultJson ?? "[]")) });
  } catch (error) {
    await ctx.runMutation(internal.seoCollectionParse.recordParseFailure, { pullId, error: getErrorMessage(error) });
  }
  return null;
}

