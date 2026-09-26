import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { tenantQuery } from "./tenantFunctions";
import { askedPlace, listHold, listWebsiteId, myRivals, requireMySite } from "./siteAccess";
import { holdQuestions, holdSearch } from "./holdLists";
import { AI_ENGINES, aiEngineValidator, answerPlace, fanOutPlace, type AiEngine } from "./seoAiEngines";
import { citedPagesOf, QUESTIONS_FOR_CITED_PAGES } from "./siteFigures";
import { MAX_LIST } from "./websiteSiteRows";
import { listWithCut } from "./siteListPages";

/**
 * What the AI engines say about a site, for the client's Sites screens.
 *
 * About this site only (D2, Anthony 2026-09-23: "this is about the website
 * only, not anyone else"). Rivals appear in share of voice as the comparison,
 * and nowhere as a list of who else an answer named.
 *
 * The questions are the list the company measures the site on — its own for
 * an owned site, the owned site's for a competitor (D17) — and the company's
 * alone, read through its hold (docs/plans/active/private-tracking-lists-plan.md).
 * They are a bounded list, capped at `MAX_LIST` on the record, so reading them
 * whole by index is a read of the company's own list, not a scan of anyone
 * else's.
 */

/** A competitor's answers read per question and engine: about a month of daily asking. */
const ANSWERS_READ = 30;

/** Fan-out rows read for one site, across all its questions and engines. */
const MAX_FAN_OUT_ROWS = 4_000;

/** The fewest searches read for one question and engine: its most persistent, however many questions there are. */
const MIN_FAN_OUT_SHARE = 1;

/** Searches shown, most persistent first. */
const MAX_SHOWN = 1_000;

type Stance = "RECOMMENDED" | "NAMED" | "WARNED_AGAINST" | "NOT_NAMED";

/** How each engine treats the site on each of its questions, as of the newest answer. */
export const listMentions = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.array(v.object({
    prompt: v.string(),
    engine: aiEngineValidator,
    asked: v.number(),
    named: v.number(),
    recommended: v.number(),
    warnedAgainst: v.number(),
    lastAskedDay: v.union(v.string(), v.null()),
    lastStance: v.union(
      v.literal("RECOMMENDED"), v.literal("NAMED"), v.literal("WARNED_AGAINST"), v.literal("NOT_NAMED"), v.null(),
    ),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const websiteId = site.website._id;
    const askerId = listWebsiteId(site);
    const questions = await holdQuestions(ctx, listHold(site), MAX_LIST);

    const rows = await Promise.all(questions.flatMap((question) => question.engines.map(async (engine) => {
      const place = answerPlace(engine, site.place);
      // The asker's own counts are kept per question as its answers land. A
      // competitor asks nothing, so its counts come from the recent answers
      // to the questions it is measured on.
      const [stats, answers] = await Promise.all([
        askerId === websiteId
          ? ctx.db
            .query("websiteQuestionStats")
            .withIndex("by_key", (q) =>
              q.eq("websiteId", websiteId).eq("prompt", question.prompt).eq("engine", engine).eq("locationCode", place))
            .unique()
          : Promise.resolve(null),
        ctx.db
          .query("aiAnswers")
          .withIndex("by_question", (q) => q.eq("prompt", question.prompt).eq("engine", engine).eq("locationCode", place))
          .order("desc")
          .take(askerId === websiteId ? 1 : ANSWERS_READ),
      ]);
      const newest = answers[0];
      let lastStance: Stance | null = null;
      if (newest) {
        lastStance = newest.warnedAgainst.includes(websiteId) ? "WARNED_AGAINST"
          : newest.recommended.includes(websiteId) ? "RECOMMENDED"
            : newest.named.includes(websiteId) ? "NAMED"
              : "NOT_NAMED";
      }
      const counted = stats ?? {
        asked: answers.length,
        named: answers.filter((answer) => answer.named.includes(websiteId)).length,
        recommended: answers.filter((answer) => answer.recommended.includes(websiteId)).length,
        warnedAgainst: answers.filter((answer) => answer.warnedAgainst.includes(websiteId)).length,
      };
      return {
        prompt: question.prompt,
        engine,
        asked: counted.asked,
        named: counted.named,
        recommended: counted.recommended,
        warnedAgainst: counted.warnedAgainst,
        lastAskedDay: newest?.day ?? null,
        lastStance,
      };
    })));
    return rows.sort((left, right) =>
      left.prompt.localeCompare(right.prompt) || AI_ENGINES.indexOf(left.engine) - AI_ENGINES.indexOf(right.engine));
  },
});

/**
 * How often the engines name this site against its tracked rivals, per engine.
 *
 * Against tracked rivals only (D7): an answer names many firms, and the ones
 * we can count are the ones we hold names for. The screen says so.
 */
export const shareOfVoice = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.array(v.object({
    engine: aiEngineValidator,
    asked: v.number(),
    /** The newest day this engine was asked the site's questions: the "last checked" column. */
    lastDay: v.union(v.string(), v.null()),
    sites: v.array(v.object({ websiteId: v.id("websites"), host: v.string(), isYou: v.boolean(), named: v.number() })),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const websiteId = site.website._id;
    // The asker's counts hold everyone its answers named, so one list of
    // questions gives the whole group's share — whichever member is open.
    const askerId = listWebsiteId(site);
    const rivals = await myRivals(ctx, site);
    const questions = await holdQuestions(ctx, listHold(site), MAX_LIST);

    const perEngine = new Map<AiEngine, { asked: number; lastDay: string | null; named: Map<Id<"websites">, number> }>();
    for (const question of questions) {
      for (const engine of question.engines) {
        const stats = await ctx.db
          .query("websiteQuestionStats")
          .withIndex("by_key", (q) =>
            q.eq("websiteId", askerId).eq("prompt", question.prompt).eq("engine", engine)
              .eq("locationCode", answerPlace(engine, site.place)))
          .unique();
        if (!stats) continue;
        const held = perEngine.get(engine) ?? { asked: 0, lastDay: null, named: new Map() };
        held.asked += stats.asked;
        if (!held.lastDay || stats.lastAskedDay > held.lastDay) held.lastDay = stats.lastAskedDay;
        held.named.set(askerId, (held.named.get(askerId) ?? 0) + stats.named);
        for (const other of stats.othersNamed) {
          held.named.set(other.websiteId, (held.named.get(other.websiteId) ?? 0) + other.times);
        }
        perEngine.set(engine, held);
      }
    }

    const everyone = [
      { websiteId, host: site.website.displayHost, isYou: true },
      ...rivals.map((rival) => ({ websiteId: rival.website._id, host: rival.website.displayHost, isYou: false })),
    ];
    return AI_ENGINES.flatMap((engine) => {
      const held = perEngine.get(engine);
      if (!held) return [];
      return [{
        engine,
        asked: held.asked,
        lastDay: held.lastDay,
        sites: everyone.map((entry) => ({ ...entry, named: held.named.get(entry.websiteId) ?? 0 })),
      }];
    });
  },
});

/**
 * The site's pages the engines link to in their answers, most cited first —
 * from the answers to the questions it is measured on only (D17). A bounded
 * list, read whole: the pages cited for a site's questions, not every page any
 * answer ever linked to. The screen searches and pages it in place.
 */
export const listCitedPages = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: listWithCut(v.object({
    url: v.string(),
    page: v.string(),
    engines: v.array(aiEngineValidator),
    times: v.number(),
    firstDay: v.string(),
    lastDay: v.string(),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const coverage = { cut: false };
    const rows = await citedPagesOf(ctx, site.website._id, listHold(site), site.place, QUESTIONS_FOR_CITED_PAGES, coverage);
    return { rows, cut: coverage.cut ? rows.length : null };
  },
});

/**
 * What the engines searched for when asked the site's questions, most
 * persistent first, with what each search is for and whether the site already
 * tracks it. Read-only: tracking one is done in admin (D1).
 */
export const listSearched = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: listWithCut(v.object({
    query: v.string(),
    queryText: v.string(),
    prompt: v.string(),
    engines: v.array(v.string()),
    timesSeen: v.number(),
    lastSeenDay: v.string(),
    intent: v.union(v.string(), v.null()),
    tracked: v.boolean(),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const holdId = listHold(site);
    const questions = await holdQuestions(ctx, holdId, MAX_LIST);

    const merged = new Map<string, {
      query: string; queryText: string; prompt: string; engines: Set<string>; timesSeen: number; lastSeenDay: string;
    }>();
    // Each question and engine gets an even share of the read, most
    // persistent searches first: a budget spent in the order the questions
    // were added would leave the later ones out once the searches pile up.
    const share = Math.max(MIN_FAN_OUT_SHARE, Math.floor(MAX_FAN_OUT_ROWS / Math.max(1, questions.length * AI_ENGINES.length)));
    // Whether any read stopped short: a question and engine with more
    // searches than its share, or more searches in all than are shown (T11).
    let cut = false;
    for (const question of questions) for (const engine of AI_ENGINES) {
      const read = await ctx.db
        .query("promptFanOutQueries")
        .withIndex("by_prompt_engine_place_seen", (q) =>
          q.eq("prompt", question.prompt).eq("engine", engine).eq("place", fanOutPlace(engine, askedPlace(site))))
        .order("desc")
        .take(share + 1);
      if (read.length > share) cut = true;
      const rows = read.slice(0, share);
      for (const row of rows) {
        const key = `${question.prompt}::${row.query}`;
        const held = merged.get(key);
        if (!held) {
          merged.set(key, {
            query: row.query,
            queryText: row.queryText,
            prompt: question.prompt,
            engines: new Set([row.engine]),
            timesSeen: row.timesSeen,
            lastSeenDay: row.lastSeenDay,
          });
          continue;
        }
        held.engines.add(row.engine);
        held.timesSeen += row.timesSeen;
        if (row.lastSeenDay > held.lastSeenDay) held.lastSeenDay = row.lastSeenDay;
      }
    }

    // The most persistent searches are the ones judged and shown; the rest
    // of a long tail is not worth a lookup each.
    const sorted = [...merged.values()]
      .sort((left, right) => right.timesSeen - left.timesSeen || right.lastSeenDay.localeCompare(left.lastSeenDay));
    if (sorted.length > MAX_SHOWN) cut = true;
    const kept = sorted.slice(0, MAX_SHOWN);
    const rows = await Promise.all(kept.map(async (row) => {
      const [intent, tracked] = await Promise.all([
        ctx.db.query("seoKeywordIntents").withIndex("by_keyword", (q) => q.eq("keyword", row.query)).unique(),
        // Tracked on this company's own list — never another company's.
        holdSearch(ctx, holdId, row.query),
      ]);
      return {
        query: row.query,
        queryText: row.queryText,
        prompt: row.prompt,
        engines: [...row.engines].sort(),
        timesSeen: row.timesSeen,
        lastSeenDay: row.lastSeenDay,
        intent: intent?.intent ?? null,
        tracked: Boolean(tracked),
      };
    }));
    return {
      rows: rows.sort((left, right) => right.timesSeen - left.timesSeen || right.lastSeenDay.localeCompare(left.lastSeenDay)),
      cut: cut ? rows.length : null,
    };
  },
});
