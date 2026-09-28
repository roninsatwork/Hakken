import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { aiEngineValidator, answerPlace, type AiEngine } from "./seoAiEngines";
import { MAX_HOLDS } from "./siteAccess";
import { listGroupNames, listPlace } from "./siteListAi";
import { answersSeenBy } from "./holdProfiles";
import type { BrandName } from "./utils/websiteBrands";
import { engineDayValidator, type EngineDay } from "./utils/siteShapes";
import { isTrackedHold } from "./utils/websitePairing";

/**
 * Each company's AI lines about a website for a window of days
 * (docs/plans/active/private-tracking-lists-plan.md, §4.4): per list, per day,
 * per engine, how many answers to its questions came back and how often they
 * named the site, and a line for every other website they named.
 *
 * Counted one list at a time, from every question on it, a few questions per
 * read, and written into that list's own rows only
 * (docs/plans/active/sites-audit-fixes-plan.md, 3.1). It used to read the
 * first 200 questions anyone asked about the website: past that, a list's
 * later questions went uncounted, and a list with none among the 200 had its
 * rows in the window removed as though nothing supported them.
 *
 * Only the lists asked from this place: the same question asked from another
 * place is another answer, and that place's own sync counts it.
 */

/** Questions whose answers in a window one read counts: up to four engines each, a few hundred answers per engine. */
const QUESTIONS_PER_READ = 10;

/** Answers read per question and engine for one window of days. */
const ANSWERS_PER_WINDOW = 400;

/** A list's lines in one window: a month of days, each naming a few dozen websites at most. */
const LINES_PER_WINDOW = 4_000;

const lineValidator = v.object({ websiteId: v.id("websites"), day: v.string(), ai: v.array(engineDayValidator) });
type Line = { websiteId: Id<"websites">; day: string; engines: Map<AiEngine, EngineDay> };

/** The company lists about a website asked from this place: its owned holds there. */
export const listsAbout = internalQuery({
  args: { websiteId: v.id("websites"), locationCode: v.number() },
  returns: v.array(v.id("companyWebsites")),
  handler: async (ctx, args) => {
    const holds = await ctx.db
      .query("companyWebsites")
      .withIndex("by_website", (q) => q.eq("websiteId", args.websiteId))
      .take(MAX_HOLDS);
    return holds.filter((hold) => !isTrackedHold(hold) && listPlace(hold) === args.locationCode).map((hold) => hold._id);
  },
});

/** A few of a list's questions' answers in a window, counted into lines: the asker's own, and every other website named. */
export const countLines = internalQuery({
  args: {
    askerId: v.id("websites"),
    /** The list counted: its company's own names decide what counts as named (`holdProfiles.ts`). */
    holdId: v.optional(v.id("companyWebsites")),
    locationCode: v.number(),
    fromDay: v.string(),
    toDay: v.string(),
    questions: v.array(v.object({ prompt: v.string(), engines: v.array(aiEngineValidator) })),
  },
  returns: v.array(lineValidator),
  handler: async (ctx, args) => {
    const hold = args.holdId ? await ctx.db.get(args.holdId) : null;
    const names = hold ? await listGroupNames(ctx, hold) : new Map<Id<"websites">, BrandName[]>();
    const lines = new Map<string, Line>();
    const lineOf = (websiteId: Id<"websites">, day: string) => {
      const key = `${day}|${websiteId}`;
      const line = lines.get(key) ?? { websiteId, day, engines: new Map<AiEngine, EngineDay>() };
      lines.set(key, line);
      return line;
    };
    for (const question of args.questions) {
      for (const engine of question.engines) {
        const answers = await ctx.db
          .query("aiAnswers")
          .withIndex("by_question", (q) =>
            q.eq("prompt", question.prompt).eq("engine", engine)
              .eq("locationCode", answerPlace(engine, args.locationCode))
              .gte("day", args.fromDay).lte("day", args.toDay))
          .take(ANSWERS_PER_WINDOW);
        for (const answer of answersSeenBy(answers, names)) {
          const own = lineOf(args.askerId, answer.day);
          const counts = own.engines.get(engine) ?? { engine, asked: 0, named: 0, recommended: 0 };
          counts.asked += 1;
          if (answer.named.includes(args.askerId)) counts.named += 1;
          if (answer.recommended.includes(args.askerId)) counts.recommended += 1;
          own.engines.set(engine, counts);
          for (const named of new Set(answer.named)) {
            if (named === args.askerId) continue;
            const rival = lineOf(named, answer.day);
            // "Asked" stays at nought: the questions were this site's, not the rival's.
            const rivalCounts = rival.engines.get(engine) ?? { engine, asked: 0, named: 0, recommended: 0 };
            rivalCounts.named += 1;
            if (answer.recommended.includes(named)) rivalCounts.recommended += 1;
            rival.engines.set(engine, rivalCounts);
          }
        }
      }
    }
    return [...lines.values()].map((line) => ({ websiteId: line.websiteId, day: line.day, ai: [...line.engines.values()] }));
  },
});

/** Lines from separate reads added up: the same day and website counted from other questions. */
function mergeLines(into: Map<string, Line>, lines: ReadonlyArray<{ websiteId: Id<"websites">; day: string; ai: EngineDay[] }>): void {
  for (const line of lines) {
    const key = `${line.day}|${line.websiteId}`;
    const held = into.get(key) ?? { websiteId: line.websiteId, day: line.day, engines: new Map<AiEngine, EngineDay>() };
    for (const entry of line.ai) {
      const counts = held.engines.get(entry.engine) ?? { engine: entry.engine, asked: 0, named: 0, recommended: 0 };
      counts.asked += entry.asked;
      counts.named += entry.named;
      counts.recommended += entry.recommended;
      held.engines.set(entry.engine, counts);
    }
    into.set(key, held);
  }
}

/**
 * One list's lines in a window made to match what its answers say now: a
 * changed line rewritten, a new one written, and a row of this list's that no
 * line supports any more — a question removed — taken away. Never another
 * list's rows.
 */
export const writeLines = internalMutation({
  args: {
    holdId: v.id("companyWebsites"),
    askerId: v.id("websites"),
    locationCode: v.number(),
    fromDay: v.string(),
    toDay: v.string(),
    lines: v.array(lineValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const standing = await ctx.db
      .query("siteListAiDays")
      .withIndex("by_hold_day", (q) =>
        q.eq("companyWebsiteId", args.holdId).eq("locationCode", args.locationCode).gte("day", args.fromDay).lte("day", args.toDay))
      .take(LINES_PER_WINDOW);
    const unclaimed = new Map<string, Doc<"siteListAiDays">>(standing.map((row) => [`${row.day}|${row.websiteId}`, row]));
    for (const line of args.lines) {
      const key = `${line.day}|${line.websiteId}`;
      const row = unclaimed.get(key);
      unclaimed.delete(key);
      if (row && JSON.stringify(row.ai) === JSON.stringify(line.ai)) continue;
      const fields = {
        companyWebsiteId: args.holdId,
        askerWebsiteId: args.askerId,
        locationCode: args.locationCode,
        websiteId: line.websiteId,
        day: line.day,
        ai: line.ai,
        updatedAt: now,
      };
      if (row) await ctx.db.replace(row._id, fields);
      else await ctx.db.insert("siteListAiDays", fields);
    }
    for (const row of unclaimed.values()) await ctx.db.delete(row._id);
    return null;
  },
});

/** Every company list's AI lines about a website in one window of days, a list at a time. */
export async function syncListAiLines(
  ctx: ActionCtx,
  args: { websiteId: Id<"websites">; locationCode: number; fromDay: string; toDay: string },
): Promise<void> {
  const holdIds: Array<Id<"companyWebsites">> = await ctx.runQuery(internal.siteListAiDays.listsAbout, {
    websiteId: args.websiteId, locationCode: args.locationCode,
  });
  for (const holdId of holdIds) {
    const list: { questions: Array<{ prompt: string; engines: AiEngine[] }> } | null = await ctx.runQuery(internal.siteListAi.listFacts, { holdId });
    if (!list) continue;
    const lines = new Map<string, Line>();
    for (let start = 0; start < list.questions.length; start += QUESTIONS_PER_READ) {
      mergeLines(lines, await ctx.runQuery(internal.siteListAiDays.countLines, {
        askerId: args.websiteId,
        holdId,
        locationCode: args.locationCode,
        fromDay: args.fromDay,
        toDay: args.toDay,
        questions: list.questions.slice(start, start + QUESTIONS_PER_READ),
      }));
    }
    await ctx.runMutation(internal.siteListAiDays.writeLines, {
      holdId,
      askerId: args.websiteId,
      locationCode: args.locationCode,
      fromDay: args.fromDay,
      toDay: args.toDay,
      lines: [...lines.values()].map((line) => ({ websiteId: line.websiteId, day: line.day, ai: [...line.engines.values()] })),
    });
  }
}

/** The same for one window, on its own: what a filing's rebuild does, for a test or a backfill. */
export const syncWindow = internalAction({
  args: { websiteId: v.id("websites"), locationCode: v.number(), fromDay: v.string(), toDay: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await syncListAiLines(ctx, args);
    return null;
  },
});
