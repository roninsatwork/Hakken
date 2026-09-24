import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { aiEngineValidator, answerPlace, fanOutPlace, type AiEngine } from "./seoAiEngines";
import { listWebsiteId, requireMySite, sitePage } from "./siteAccess";
import { tenantQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";

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
  for (const row of earlier) await ctx.db.delete(row._id);

  const text = entry.text.trim();
  if (!text) return;
  await ctx.db.insert("aiAnswerTexts", {
    pullId: entry.pullId,
    prompt: entry.prompt,
    engine: entry.engine,
    locationCode: entry.locationCode,
    day: entry.day,
    text: text.slice(0, MAX_ANSWER_CHARS),
    sources: entry.sources.slice(0, MAX_TEXT_SOURCES),
    createdAt: Date.now(),
  });
}

/** Questions offered on the Full answers page: the site's list, capped on its record. */
const QUESTIONS_READ = 200;

/** How far a narrowed read may look for one page of answers. */
const MAX_ROWS_READ = 1_000;

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
    const questions = await ctx.db
      .query("websiteQuestions")
      .withIndex("by_website", (q) => q.eq("websiteId", listWebsiteId(site)))
      .take(QUESTIONS_READ);
    return {
      questions: questions
        .map((question) => ({ prompt: question.prompt, engines: question.engines, isActive: question.isActive }))
        .sort((left, right) => Number(right.isActive) - Number(left.isActive) || left.prompt.localeCompare(right.prompt)),
      names: (site.website.brandNames ?? []).map((entry) => entry.name),
    };
  },
});

/**
 * What the engines said to one of the site's questions, newest first, between
 * two days — or, with a search, the answers that say it, most relevant first.
 *
 * Each answer carries how it treated the open site: recommended, named,
 * warned against or not named, from the answer row its parse wrote.
 */
export const listAnswers = tenantQuery({
  args: {
    siteId: v.id("companyWebsites"),
    paginationOpts: paginationOptsValidator,
    prompt: v.string(),
    engine: v.optional(aiEngineValidator),
    from: v.string(),
    to: v.string(),
    search: v.optional(v.string()),
  },
  returns: paginationResultValidator(v.object({
    _id: v.id("aiAnswerTexts"),
    engine: aiEngineValidator,
    day: v.string(),
    text: v.string(),
    sources: v.array(v.string()),
    stance: stanceValidator,
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    // Only a question on the site's own list: an address cannot be turned
    // into another company's question.
    const question = (await ctx.db
      .query("websiteQuestions")
      .withIndex("by_website", (q) => q.eq("websiteId", listWebsiteId(site)))
      .take(QUESTIONS_READ))
      .find((row) => row.prompt === args.prompt);
    if (!question) throw appError("NOT_FOUND", "That question is not one this website is measured on.");

    // Each engine answers from its own place: where the site is read from,
    // or nowhere in particular for an engine that takes no location.
    const engines = args.engine ? question.engines.filter((engine) => engine === args.engine) : question.engines;
    const places = engines.map((engine) => ({ engine, place: answerPlace(engine, site.place) }));
    const ours = (row: Doc<"aiAnswerTexts">) =>
      places.some((entry) => entry.engine === row.engine && entry.place === row.locationCode);
    const narrowed = { ...sitePage(args.paginationOpts), maximumRowsRead: MAX_ROWS_READ };
    const term = args.search?.trim();

    let result;
    if (term) {
      result = await ctx.db
        .query("aiAnswerTexts")
        .withSearchIndex("search_text", (q) => {
          const base = q.search("text", term).eq("prompt", args.prompt);
          return args.engine ? base.eq("engine", args.engine).eq("locationCode", answerPlace(args.engine, site.place)) : base;
        })
        .filter((q) => q.and(
          q.gte(q.field("day"), args.from),
          q.lte(q.field("day"), args.to),
          q.or(...places.map((entry) => q.and(q.eq(q.field("engine"), entry.engine), q.eq(q.field("locationCode"), entry.place)))),
        ))
        .paginate(narrowed);
    } else if (args.engine) {
      const engine = args.engine;
      result = await ctx.db
        .query("aiAnswerTexts")
        .withIndex("by_question", (q) =>
          q.eq("prompt", args.prompt).eq("engine", engine).eq("locationCode", answerPlace(engine, site.place))
            .gte("day", args.from).lte("day", args.to))
        .order("desc")
        .paginate(sitePage(args.paginationOpts));
    } else {
      result = await ctx.db
        .query("aiAnswerTexts")
        .withIndex("by_prompt_day", (q) => q.eq("prompt", args.prompt).gte("day", args.from).lte("day", args.to))
        .order("desc")
        .filter((q) => q.or(...places.map((entry) =>
          q.and(q.eq(q.field("engine"), entry.engine), q.eq(q.field("locationCode"), entry.place)))))
        .paginate(narrowed);
    }

    const page = await Promise.all(result.page.filter(ours).map(async (row) => {
      const answer = await ctx.db
        .query("aiAnswers")
        .withIndex("by_pull", (q) => q.eq("pullId", row.pullId))
        .first();
      const id = site.website._id;
      const stance = answer?.recommended.includes(id) ? "RECOMMENDED" as const
        : answer?.warnedAgainst.includes(id) ? "WARNED_AGAINST" as const
          : answer?.named.includes(id) ? "NAMED" as const
            : "NOT_NAMED" as const;
      return { _id: row._id, engine: row.engine, day: row.day, text: row.text, sources: row.sources, stance };
    }));
    return { ...result, page };
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
    const question = (await ctx.db
      .query("websiteQuestions")
      .withIndex("by_website", (q) => q.eq("websiteId", listWebsiteId(site)))
      .take(QUESTIONS_READ))
      .find((entry) => entry.prompt === row.prompt);
    if (!question || !question.engines.includes(row.engine) || row.locationCode !== answerPlace(row.engine, site.place)) return null;

    const [answer, searches] = await Promise.all([
      ctx.db.query("aiAnswers").withIndex("by_pull", (q) => q.eq("pullId", row.pullId)).first(),
      ctx.db
        .query("promptFanOutQueries")
        .withIndex("by_prompt_engine_place_seen", (q) =>
          q.eq("prompt", row.prompt).eq("engine", row.engine).eq("place", fanOutPlace(row.engine, site.place)))
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
