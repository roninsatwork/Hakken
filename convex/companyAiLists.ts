import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { superAdminQuery } from "./tenantFunctions";
import { companyHolds } from "./siteAccess";
import { holdQuestions, holdSearches } from "./holdLists";
import { aiEngineValidator, fanOutSourceValidator } from "./seoAiEngines";
import { includesSearchTerm, normalizeSearchTerm, paginateItems } from "./adminQueryService";
import { readCompanyDataLimits, resolveSiteDataLimits } from "./companyDataLimits";
import { angleOf } from "./utils/fanOutAngle";
import { appError } from "./utils/appError";
import { MAX_LIST } from "./websiteSiteRows";
import { readFanOutLimits } from "./fanOutLimits";
import { ownCheck } from "./fanOutPositions";
import { questionQueries } from "./promptFanOut";

/**
 * A company's prompts, tracked keywords and the searches the AI ran, across
 * all its own websites at once (docs/plans/active/fan-out-angles-plan.md, FA9;
 * websites-section-menu-plan.md). Every search the AI runs for a prompt is on
 * that prompt's list and checked on Google once; the ones ticked there are
 * checked every run (prompt-fan-out-queries-plan.md, fan-out-opt-in-plan.md).
 * The searches the AI ran are read here, and changed on the prompt's own
 * screen.
 *
 * Every list is the company's own, read through each owned hold
 * (docs/plans/active/private-tracking-lists-plan.md). Adding, pausing and
 * removing go through the same mutations each website's own screens use, so a
 * prompt or keyword added here meets the same rules and leaves the same
 * audit entry.
 */

/*
 * How many rows each list reads across a company's websites is the company's
 * choice (`fanOutLimits.ts`): a company with more rows than that sees the
 * first of them and is told so, and choosing one website shows all of that website's.
 * The searches the AI ran are read per website as far as its Sites page
 * shows them.
 */

type OwnedHold = { hold: Doc<"companyWebsites">; host: string };

/** The company's own websites — one, when a screen asks for one — oldest first, as the company added them. */
async function ownedHolds(ctx: { db: QueryCtx["db"] }, companyId: Id<"companies">, only?: Id<"companyWebsites">): Promise<OwnedHold[]> {
  const holds = (await companyHolds(ctx, companyId))
    .filter((entry) => entry.summary.relationship === "OWNED" && (!only || entry.hold._id === only))
    .sort((left, right) => left.hold._creationTime - right.hold._creationTime);
  if (only && holds.length === 0) throw appError("NOT_FOUND", "That website is not one of this company's own.");
  return holds.map((entry) => ({ hold: entry.hold, host: entry.website.displayHost }));
}

const listArgs = {
  companyId: v.id("companies"),
  companyWebsiteId: v.optional(v.id("companyWebsites")),
  searchTerm: v.optional(v.string()),
  page: v.number(),
  pageSize: v.number(),
};

/**
 * How many of each the company has, for the screen's three views; for each
 * website, for the add boxes, its everyday check limit and its prompts against
 * their limit — asking and paused alike count towards it (Anthony, 2026-09-28:
 * "this screen needs to show the limit and our number").
 */
export const companyAiListCounts = superAdminQuery({
  args: { companyId: v.id("companies") },
  returns: v.object({
    questions: v.number(),
    searches: v.number(),
    fanOut: v.number(),
    websites: v.array(v.object({
      companyWebsiteId: v.id("companyWebsites"),
      host: v.string(),
      everydayKeywords: v.number(),
      prompts: v.number(),
      promptsPaused: v.number(),
      /** The website's Prompts per website (`fanOutLimits.ts`). */
      promptsLimit: v.number(),
    })),
  }),
  handler: async (ctx, args) => {
    const holds = await ownedHolds(ctx, args.companyId);
    const limits = await readCompanyDataLimits(ctx, args.companyId);
    let questions = 0;
    let searches = 0;
    let fanOut = 0;
    const websites = [];
    for (const { hold, host } of holds) {
      const asked = await holdQuestions(ctx, hold._id, MAX_LIST);
      questions += asked.length;
      searches += (await holdSearches(ctx, hold._id, MAX_LIST)).length;
      const list = await ctx.db.query("fanOutAngleLists").withIndex("by_hold", (q) => q.eq("holdId", hold._id)).unique();
      fanOut += list?.wordings ?? 0;
      websites.push({
        companyWebsiteId: hold._id,
        host,
        everydayKeywords: (await resolveSiteDataLimits(ctx, limits, hold._id)).everydayKeywords,
        prompts: asked.length,
        promptsPaused: asked.filter((question) => !question.isActive).length,
        promptsLimit: (await readFanOutLimits(ctx, args.companyId, hold._id)).promptsPerSite,
      });
    }
    return { questions, searches, fanOut, websites };
  },
});

/** Every question the company asks, across its websites, with how many searches the AI ran for each. */
export const listCompanyQuestions = superAdminQuery({
  args: listArgs,
  returns: v.object({
    data: v.array(v.object({
      _id: v.id("websiteQuestions"),
      prompt: v.string(),
      companyWebsiteId: v.id("companyWebsites"),
      host: v.string(),
      engines: v.array(aiEngineValidator),
      isActive: v.boolean(),
      createdAt: v.number(),
      /** Its fan-out queries as its own screen lists them: the AI's bar the deleted, and the company's own. */
      fanOutSearches: v.number(),
      /** How many of them are ticked: checked on Google every run. */
      fanOutTicked: v.number(),
    })),
    totalCount: v.number(),
    totalPages: v.number(),
    /** What one collection buys: one answer per assistant for each question asked. */
    engineCalls: v.number(),
    cut: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const holds = await ownedHolds(ctx, args.companyId, args.companyWebsiteId);
    const { companyRowsRead } = await readFanOutLimits(ctx, args.companyId);
    const rows: Array<{ question: Doc<"websiteQuestions">; host: string }> = [];
    let cut = false;
    for (const { hold, host } of holds) {
      const left = companyRowsRead - rows.length;
      if (left <= 0) {
        cut = true;
        break;
      }
      const questions = await holdQuestions(ctx, hold._id, Math.min(MAX_LIST, left) + 1);
      if (questions.length > left) cut = true;
      rows.push(...questions.slice(0, left).map((question) => ({ question, host })));
    }
    const term = normalizeSearchTerm(args.searchTerm);
    const matching = term ? rows.filter((row) => includesSearchTerm(row.question.prompt, term)) : rows;
    const paged = paginateItems(matching, args.page, args.pageSize);
    // Each website's running searches, read once however many of its prompts are on the page.
    const running = new Map<Id<"companyWebsites">, Promise<Set<string>>>();
    const runningOn = (holdId: Id<"companyWebsites">) => {
      let read = running.get(holdId);
      if (!read) {
        read = holdSearches(ctx, holdId, MAX_LIST, { activeOnly: true }).then((searches) => new Set(searches.map((search) => search.keyword)));
        running.set(holdId, read);
      }
      return read;
    };
    const data = await Promise.all(paged.data.map(async ({ question, host }) => {
      const { anglesShown } = await readFanOutLimits(ctx, args.companyId, question.companyWebsiteId);
      const found = await questionQueries(ctx, question.companyWebsiteId, question.prompt, anglesShown);
      const ticked = await runningOn(question.companyWebsiteId);
      const queries = [...found.listed.map((wording) => wording.query), ...found.own.map((choice) => choice.query)];
      return {
        _id: question._id,
        prompt: question.prompt,
        companyWebsiteId: question.companyWebsiteId,
        host,
        engines: question.engines,
        isActive: question.isActive,
        createdAt: question.createdAt,
        fanOutSearches: queries.length,
        fanOutTicked: queries.filter((query) => ticked.has(query)).length,
      };
    }));
    return {
      data,
      totalCount: paged.totalCount,
      totalPages: paged.totalPages,
      engineCalls: rows.reduce((sum, row) => sum + (row.question.isActive ? row.question.engines.length : 0), 0),
      cut,
    };
  },
});

/**
 * Where a search came from: as it was recorded when added, or — for a search
 * added before that was recorded — whether the AI ran it for the company's
 * questions.
 */
async function addedFromOf(ctx: { db: QueryCtx["db"] }, search: Doc<"websiteKeywords">): Promise<"HAND" | "AI_SEARCH"> {
  if (search.addedFrom) return search.addedFrom;
  const angles = await ctx.db
    .query("fanOutAngles")
    .withIndex("by_hold_angle", (q) => q.eq("holdId", search.companyWebsiteId).eq("angle", angleOf(search.keyword)))
    .take(10);
  return angles.some((angle) => angle.wordings.some((wording) => wording.query === search.keyword)) ? "AI_SEARCH" : "HAND";
}

/** Every search the company checks on Google, across its websites, with where it came from. */
export const listCompanySearches = superAdminQuery({
  args: listArgs,
  returns: v.object({
    data: v.array(v.object({
      _id: v.id("websiteKeywords"),
      keyword: v.string(),
      companyWebsiteId: v.id("companyWebsites"),
      host: v.string(),
      addedFrom: v.union(v.literal("HAND"), v.literal("AI_SEARCH")),
      isActive: v.boolean(),
      createdAt: v.number(),
    })),
    totalCount: v.number(),
    totalPages: v.number(),
    cut: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const holds = await ownedHolds(ctx, args.companyId, args.companyWebsiteId);
    const { companyRowsRead } = await readFanOutLimits(ctx, args.companyId);
    const rows: Array<{ search: Doc<"websiteKeywords">; host: string }> = [];
    let cut = false;
    for (const { hold, host } of holds) {
      const left = companyRowsRead - rows.length;
      if (left <= 0) {
        cut = true;
        break;
      }
      const searches = await holdSearches(ctx, hold._id, Math.min(MAX_LIST, left) + 1);
      if (searches.length > left) cut = true;
      rows.push(...searches.slice(0, left).map((search) => ({ search, host })));
    }
    const term = normalizeSearchTerm(args.searchTerm);
    const matching = term ? rows.filter((row) => includesSearchTerm(row.search.keyword, term)) : rows;
    const paged = paginateItems(matching, args.page, args.pageSize);
    const data = await Promise.all(paged.data.map(async ({ search, host }) => ({
      _id: search._id,
      keyword: search.keyword,
      companyWebsiteId: search.companyWebsiteId,
      host,
      addedFrom: await addedFromOf(ctx, search),
      isActive: search.isActive,
      createdAt: search.createdAt,
    })));
    return { data, totalCount: paged.totalCount, totalPages: paged.totalPages, cut };
  },
});

/** What the searcher wants, as the filter offers it: the judged kinds, and not judged yet. */
const intentChoiceValidator = v.union(
  v.literal("BUYING"),
  v.literal("RESEARCHING"),
  v.literal("BRANDED"),
  v.literal("IRRELEVANT"),
  v.literal("OTHER"),
  v.literal("UNJUDGED"),
);

/**
 * Every search the AI ran for the company's prompts, most seen first, with
 * the prompt it came from, whether it is ticked — checked on Google every run
 * — and where the website came in its newest check: the first check each one
 * is given, or a ticked one's latest (fan-out-opt-in-plan.md). Filtered by
 * website, prompt and what the searcher wants. One the company deleted from
 * its prompt's list is not here.
 */
export const listCompanyFanOut = superAdminQuery({
  args: {
    ...listArgs,
    prompt: v.optional(v.string()),
    intent: v.optional(intentChoiceValidator),
  },
  returns: v.object({
    data: v.array(v.object({
      key: v.string(),
      query: v.string(),
      queryText: v.string(),
      prompt: v.string(),
      companyWebsiteId: v.id("companyWebsites"),
      host: v.string(),
      intent: v.union(v.string(), v.null()),
      engines: v.array(fanOutSourceValidator),
      timesSeen: v.number(),
      lastSeenDay: v.string(),
      /** Ticked: on the company's tracked keywords and not paused there, so checked on Google every run. */
      everyRun: v.boolean(),
      /**
       * Where the website came in the newest Google check of it — a position,
       * or null when that check did not find it in the top 100 — and the day;
       * null before any check.
       */
      google: v.union(v.null(), v.object({ position: v.union(v.number(), v.null()), day: v.string() })),
    })),
    totalCount: v.number(),
    totalPages: v.number(),
    /** The questions the searches came from, for the question filter. */
    questions: v.array(v.object({ prompt: v.string(), companyWebsiteId: v.id("companyWebsites"), host: v.string() })),
    cut: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const holds = await ownedHolds(ctx, args.companyId, args.companyWebsiteId);
    const { companyRowsRead } = await readFanOutLimits(ctx, args.companyId);
    type Row = {
      key: string; query: string; queryText: string; prompt: string; companyWebsiteId: Id<"companyWebsites">; host: string;
      intent: string | null; engines: Doc<"fanOutAngles">["engines"]; timesSeen: number; lastSeenDay: string; everyRun: boolean;
    };
    const rows: Row[] = [];
    const questions = new Map<string, { prompt: string; companyWebsiteId: Id<"companyWebsites">; host: string }>();
    let cut = false;
    for (const { hold, host } of holds) {
      if (rows.length >= companyRowsRead) {
        cut = true;
        break;
      }
      const { anglesShown } = await readFanOutLimits(ctx, args.companyId, hold._id);
      const [angles, searches, list] = await Promise.all([
        ctx.db.query("fanOutAngles").withIndex("by_hold_seen", (q) => q.eq("holdId", hold._id)).order("desc").take(anglesShown + 1),
        holdSearches(ctx, hold._id, MAX_LIST),
        ctx.db.query("fanOutAngleLists").withIndex("by_hold", (q) => q.eq("holdId", hold._id)).unique(),
      ]);
      if (angles.length > anglesShown || list?.cut) cut = true;
      const checked = new Set(searches.filter((search) => search.isActive).map((search) => search.keyword));
      // Deleted from a question's fan-out queries: gone here too, before the next rebuild leaves them out.
      const removed = new Set((await ctx.db
        .query("fanOutQueryChoices")
        .withIndex("by_hold_prompt", (q) => q.eq("holdId", hold._id))
        .take(MAX_LIST))
        .filter((choice) => choice.removed)
        .map((choice) => `${choice.prompt}::${choice.query}`));
      for (const angle of angles.slice(0, anglesShown)) {
        questions.set(`${hold._id}::${angle.prompt}`, { prompt: angle.prompt, companyWebsiteId: hold._id, host });
        for (const wording of angle.wordings) {
          if (removed.has(`${angle.prompt}::${wording.query}`)) continue;
          if (rows.length >= companyRowsRead) {
            cut = true;
            break;
          }
          rows.push({
            key: `${hold._id}::${angle.prompt}::${wording.query}`,
            query: wording.query,
            queryText: wording.queryText,
            prompt: angle.prompt,
            companyWebsiteId: hold._id,
            host,
            intent: null,
            engines: wording.engines,
            timesSeen: wording.timesSeen,
            lastSeenDay: wording.lastSeenDay,
            everyRun: checked.has(wording.query),
          });
        }
      }
    }
    // What the searcher wants, one judgment per phrase shared by every company.
    const intents = new Map<string, string | null>();
    for (const query of new Set(rows.map((row) => row.query))) {
      const judged = await ctx.db.query("seoKeywordIntents").withIndex("by_keyword", (q) => q.eq("keyword", query)).unique();
      intents.set(query, judged?.intent ?? null);
    }
    for (const row of rows) row.intent = intents.get(row.query) ?? null;

    const term = normalizeSearchTerm(args.searchTerm);
    const matching = rows
      .filter((row) =>
        (!term || includesSearchTerm(row.queryText, term) || includesSearchTerm(row.prompt, term))
        && (!args.prompt || row.prompt === args.prompt)
        && (!args.intent || (row.intent ?? "UNJUDGED") === args.intent))
      .sort((left, right) => right.timesSeen - left.timesSeen || right.lastSeenDay.localeCompare(left.lastSeenDay) || left.query.localeCompare(right.query));
    const paged = paginateItems(matching, args.page, args.pageSize);
    // Only for the rows on screen: each is a read or two, and a company can have thousands.
    const holdOf = new Map(holds.map(({ hold }) => [hold._id, hold]));
    const data = await Promise.all(paged.data.map(async (row) => {
      const hold = holdOf.get(row.companyWebsiteId);
      const checked = hold ? await ownCheck(ctx, hold, row.query) : null;
      return { ...row, google: checked ? { position: checked.value, day: checked.day } : null };
    }));
    return {
      data,
      totalCount: paged.totalCount,
      totalPages: paged.totalPages,
      questions: [...questions.values()],
      cut,
    };
  },
});
