import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { aiEngineValidator, answerPlace, fanOutPlace, type AiEngine } from "./seoAiEngines";
import { askedPlace, listHold, requireMySite } from "./siteAccess";
import { holdQuestion, holdQuestions } from "./holdLists";
import { heldTo, listOrder, listPageArgs, listPageResult, pageOfList, sortDirectionArg, type ListSorts } from "./siteListPages";
import { tenantQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { wordStartMatcher, wordsOf } from "./utils/wordStarts";

/**
 * Keeping what each AI engine said, word for word (D9).
 *
 * Until 2026-09-23 no answer text was kept, so that nothing another model
 * wrote could reach an agent's prompt. The owner reversed that on purpose —
 * "we need to show the answers — we need to make strategies from this" — so
 * the text is kept beside the answer (`aiAnswerTexts`), shown on the Sites
 * Full answers page, and handed to any agent that later reads it as quoted
 * material to analyse, never as instructions. See
 * docs/plans/active/user-sites-plan.md, "Stored answers".
 */

/** Characters kept of one answer: a guard against a payload that is not what the docs describe. */
const MAX_ANSWER_CHARS = 60_000;

/** Sources kept with one answer, as the citations keep them. */
const MAX_TEXT_SOURCES = 40;

/** Rows one pull may have written before, cleared on a re-parse. */
const SAME_PULL_LIMIT = 5;

/** File one answer's text, replacing whatever an earlier parse of the pull wrote. */
export async function fileAnswerText(
  ctx: MutationCtx,
  entry: {
    pullId: Id<"seoDataPulls">;
    prompt: string;
    engine: AiEngine;
    locationCode: number;
    day: string;
    text: string;
    /** The addresses it cited. Addresses only: a cited page's title is page text. */
    sources: ReadonlyArray<string>;
  },
): Promise<void> {
  const earlier = await ctx.db
    .query("aiAnswerTexts")
    .withIndex("by_pull", (q) => q.eq("pullId", entry.pullId))
    .take(SAME_PULL_LIMIT);
  for (const row of earlier) await deleteAnswerText(ctx, row._id);

  const text = entry.text.trim();
  if (!text) return;
  const textId = await ctx.db.insert("aiAnswerTexts", {
    pullId: entry.pullId,
    prompt: entry.prompt,
    engine: entry.engine,
    locationCode: entry.locationCode,
    day: entry.day,
    text: text.slice(0, MAX_ANSWER_CHARS),
    sources: entry.sources.slice(0, MAX_TEXT_SOURCES),
    createdAt: Date.now(),
  });
  await indexAnswerText(ctx, { _id: textId, pullId: entry.pullId, prompt: entry.prompt, engine: entry.engine, locationCode: entry.locationCode, day: entry.day });
}

/**
 * The light row the Full answers list counts and pages by (`aiAnswerIndex`),
 * for an answer's text: written beside it, so the list never reads a text it
 * does not show. Idempotent, for the backfill of answers filed before it,
 * and says whether it wrote the row.
 */
export async function indexAnswerText(
  ctx: MutationCtx,
  text: Pick<Doc<"aiAnswerTexts">, "_id" | "pullId" | "prompt" | "engine" | "locationCode" | "day">,
): Promise<boolean> {
  const held = await ctx.db.query("aiAnswerIndex").withIndex("by_text", (q) => q.eq("textId", text._id)).first();
  if (held) return false;
  await ctx.db.insert("aiAnswerIndex", {
    textId: text._id,
    pullId: text.pullId,
    prompt: text.prompt,
    engine: text.engine,
    locationCode: text.locationCode,
    day: text.day,
  });
  return true;
}

/** Remove an answer's text and the light row that lists it. */
export async function deleteAnswerText(ctx: MutationCtx, textId: Id<"aiAnswerTexts">): Promise<void> {
  const index = await ctx.db.query("aiAnswerIndex").withIndex("by_text", (q) => q.eq("textId", textId)).first();
  if (index) await ctx.db.delete(index._id);
  await ctx.db.delete(textId);
}

/** Questions offered on the Full answers page: the site's list, capped on its record. */
const QUESTIONS_READ = 200;

const stanceValidator = v.union(
  v.literal("RECOMMENDED"),
  v.literal("NAMED"),
  v.literal("WARNED_AGAINST"),
  v.literal("NOT_NAMED"),
);

/** The questions the site is measured on, with the engines asked, and the names it goes by. */
export const answerQuestions = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.object({
    questions: v.array(v.object({ prompt: v.string(), engines: v.array(aiEngineValidator), isActive: v.boolean() })),
    /** The site's names and misspellings, to pick out in the text. */
    names: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const questions = await holdQuestions(ctx, listHold(site), QUESTIONS_READ);
    return {
      questions: questions
        .map((question) => ({ prompt: question.prompt, engines: question.engines, isActive: question.isActive }))
        .sort((left, right) => Number(right.isActive) - Number(left.isActive) || left.prompt.localeCompare(right.prompt)),
      names: (site.website.brandNames ?? []).map((entry) => entry.name),
    };
  },
});

/** A question's answers listed from one engine and place: a daily answer for more than a decade. */
const ANSWERS_LISTED = 5_000;

/**
 * Answers read per engine for a search: the best matches for its longest word,
 * found by the search index, of which those every word typed starts a word in
 * are kept. Each can be tens of kilobytes, so the read is held here, and the
 * footer says so when a search may have found more (T11).
 */
const SEARCH_CANDIDATES = 50;

type AnswerEntry = { textId: Id<"aiAnswerTexts">; pullId: Id<"seoDataPulls">; engine: AiEngine; day: string };

/**
 * Full answers sort by the day asked, newest first or oldest (docs/plans/
 * active/sites-table-sorting-plan.md). Not by their sources: the count lives
 * with each answer's whole text, and reading every answer's text to order
 * them would pass what one request may read.
 */
const ANSWER_SORTS: ListSorts<AnswerEntry, "day"> = {
  day: { value: (entry) => entry.day, first: "desc" },
};

/**
 * What the engines said to one of the site's questions, newest first, between
 * two days — or those that say what was searched for (word starts, T8).
 *
 * Counted exactly and paged from the light index of answers
 * (`aiAnswerIndex`), so a question asked every day for years is a few reads
 * and only the answers on screen are read in full (docs/plans/active/
 * sites-table-pages-plan.md §5). Each answer carries how it treated the open
 * site: recommended, named, warned against or not named, from the answer row
 * its parse wrote.
 */
export const listAnswers = tenantQuery({
  args: {
    siteId: v.id("companyWebsites"),
    ...listPageArgs,
    prompt: v.string(),
    engine: v.optional(aiEngineValidator),
    from: v.string(),
    to: v.string(),
    search: v.optional(v.string()),
    sort: v.optional(v.literal("day")),
    direction: sortDirectionArg,
  },
  returns: listPageResult(v.object({
    _id: v.id("aiAnswerTexts"),
    engine: aiEngineValidator,
    day: v.string(),
    text: v.string(),
    sources: v.array(v.string()),
    stance: stanceValidator,
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    // Only a question on this company's own list: an address cannot be
    // turned into another company's question.
    const question = await holdQuestion(ctx, listHold(site), args.prompt);
    if (!question) throw appError("NOT_FOUND", "That question is not one this website is measured on.");

    // Each engine answers from its own place: where the site is read from,
    // or nowhere in particular for an engine that takes no location.
    const engines = args.engine ? question.engines.filter((engine) => engine === args.engine) : question.engines;
    const places = engines.map((engine) => ({ engine, place: answerPlace(engine, site.place) }));
    const matches = wordStartMatcher(args.search);
    const inDates = (day: string) => day >= args.from && day <= args.to;

    let entries: AnswerEntry[] = [];
    let cut: number | null = null;
    const texts = new Map<Id<"aiAnswerTexts">, Doc<"aiAnswerTexts">>();
    if (!matches) {
      // Every answer from each engine, from its own place, in the dates: exact.
      for (const { engine, place } of places) {
        const read = await ctx.db
          .query("aiAnswerIndex")
          .withIndex("by_question", (q) =>
            q.eq("prompt", args.prompt).eq("engine", engine).eq("locationCode", place).gte("day", args.from).lte("day", args.to))
          .order("desc")
          .take(ANSWERS_LISTED + 1);
        const held = heldTo(read, ANSWERS_LISTED);
        if (held.cut !== null) cut = held.cut;
        entries.push(...held.rows.map((row) => ({ textId: row.textId, pullId: row.pullId, engine: row.engine, day: row.day })));
      }
    } else {
      // The search index finds the answers with a word starting as the
      // longest word typed does; of those, the ones every word typed starts
      // a word in are kept.
      const longest = wordsOf(args.search ?? "").sort((left, right) => right.length - left.length)[0] ?? "";
      for (const { engine, place } of places) {
        const found = await ctx.db
          .query("aiAnswerTexts")
          .withSearchIndex("search_text", (q) => q.search("text", longest).eq("prompt", args.prompt).eq("engine", engine).eq("locationCode", place))
          .take(SEARCH_CANDIDATES);
        if (found.length === SEARCH_CANDIDATES) cut = SEARCH_CANDIDATES;
        for (const row of found) {
          if (!inDates(row.day) || !matches(row.text)) continue;
          texts.set(row._id, row);
          entries.push({ textId: row._id, pullId: row.pullId, engine: row.engine, day: row.day });
        }
      }
    }
    entries = entries.sort(listOrder(ANSWER_SORTS, args.sort ?? "day", args.direction, (entry) => entry.engine));

    const shown = pageOfList(entries, args.page, args.rows, cut);
    const id = site.website._id;
    const rows = await Promise.all(shown.rows.map(async (entry) => {
      const text = texts.get(entry.textId) ?? await ctx.db.get(entry.textId);
      if (!text) return null;
      const answer = await ctx.db
        .query("aiAnswers")
        .withIndex("by_pull", (q) => q.eq("pullId", entry.pullId))
        .first();
      const stance = answer?.recommended.includes(id) ? "RECOMMENDED" as const
        : answer?.warnedAgainst.includes(id) ? "WARNED_AGAINST" as const
          : answer?.named.includes(id) ? "NAMED" as const
            : "NOT_NAMED" as const;
      return { _id: text._id, engine: text.engine, day: text.day, text: text.text, sources: text.sources, stance };
    }));
    return { ...shown, rows: rows.flatMap((row) => (row ? [row] : [])) };
  },
});

/** The engine's own searches listed with one answer: its most persistent for the question. */
const SEARCHES_SHOWN = 25;

/**
 * One answer's own screen (AI answers › Full answers › an answer): what the
 * engine said, word for word, with the sources it cited — those on this site
 * marked, to open their page's screen — how it treated the site, and what the
 * engine searched the web for when answering this question.
 *
 * The engine's searches are kept per question and engine, not per answer
 * (`promptFanOutQueries`), so they are shown as that. Read only through a
 * question on the site's own list, answered from the site's place: an answer
 * id in an address cannot open another company's question.
 */
export const answerRecord = tenantQuery({
  args: { siteId: v.id("companyWebsites"), answerId: v.id("aiAnswerTexts") },
  returns: v.union(v.object({
    prompt: v.string(),
    engine: aiEngineValidator,
    day: v.string(),
    text: v.string(),
    sources: v.array(v.object({ url: v.string(), page: v.union(v.string(), v.null()) })),
    stance: stanceValidator,
    names: v.array(v.string()),
    searches: v.array(v.object({ query: v.string(), queryText: v.string(), timesSeen: v.number(), lastSeenDay: v.string() })),
  }), v.null()),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const row = await ctx.db.get(args.answerId);
    if (!row) return null;
    const question = await holdQuestion(ctx, listHold(site), row.prompt);
    if (!question || !question.engines.includes(row.engine) || row.locationCode !== answerPlace(row.engine, site.place)) return null;

    const [answer, searches] = await Promise.all([
      ctx.db.query("aiAnswers").withIndex("by_pull", (q) => q.eq("pullId", row.pullId)).first(),
      ctx.db
        .query("promptFanOutQueries")
        .withIndex("by_prompt_engine_place_seen", (q) =>
          q.eq("prompt", row.prompt).eq("engine", row.engine).eq("place", fanOutPlace(row.engine, askedPlace(site))))
        .order("desc")
        .take(SEARCHES_SHOWN),
    ]);
    const id = site.website._id;
    const stance = answer?.recommended.includes(id) ? "RECOMMENDED" as const
      : answer?.warnedAgainst.includes(id) ? "WARNED_AGAINST" as const
        : answer?.named.includes(id) ? "NAMED" as const
          : "NOT_NAMED" as const;
    const host = site.website.host;
    // A source on this site opens its page's screen: the path, when the address is the site's own.
    const pageOf = (url: string): string | null => {
      try {
        const parsed = new URL(url);
        const name = parsed.hostname.toLowerCase().replace(/^www\./, "");
        return name === host || name.endsWith(`.${host}`) ? parsed.pathname || "/" : null;
      } catch {
        return null;
      }
    };
    return {
      prompt: row.prompt,
      engine: row.engine,
      day: row.day,
      text: row.text,
      sources: row.sources.map((url) => ({ url, page: pageOf(url) })),
      stance,
      names: (site.website.brandNames ?? []).map((entry) => entry.name),
      searches: searches.map((entry) => ({
        query: entry.query,
        queryText: entry.queryText,
        timesSeen: entry.timesSeen,
        lastSeenDay: entry.lastSeenDay,
      })),
    };
  },
});

type MigrationBatchResult = { cursor: string | null; isDone: boolean; processed: number; updated: number };

/** Answers read per migration batch: each can be tens of kilobytes. */
const INDEX_BACKFILL_PAGE = 100;

/**
 * Write the light index row (`aiAnswerIndex`) for every answer filed before
 * it existed, so the Full answers list counts them too
 * (`2026-09-25-answer-index` in `dataMigrations.ts`). A second run changes
 * nothing: an answer already indexed is left alone.
 */
export async function backfillAnswerIndex(ctx: MutationCtx, cursor: string | null, _batchSize: number): Promise<MigrationBatchResult> {
  const page = await ctx.db.query("aiAnswerTexts").paginate({ numItems: INDEX_BACKFILL_PAGE, cursor });
  let updated = 0;
  for (const text of page.page) {
    if (await indexAnswerText(ctx, text)) updated += 1;
  }
  return { cursor: page.isDone ? null : page.continueCursor, isDone: page.isDone, processed: page.page.length, updated };
}
