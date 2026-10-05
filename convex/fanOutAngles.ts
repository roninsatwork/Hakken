import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { holdQuestions } from "./holdLists";
import { fanOutPlace, GOOGLE_AI_OVERVIEW, type FanOutSource } from "./seoAiEngines";
import { aiOverviewPlace, googleTopicOf } from "./dataForSeoAiOverviewOperations";
import { topicFanOuts } from "./aiOverviewFanOuts";
import { angleOf } from "./utils/fanOutAngle";
import { isTrackedHold } from "./utils/websitePairing";
import { MAX_LIST } from "./websiteSiteRows";
import { readFanOutLimits } from "./fanOutLimits";
import { bestPosition, positionLookups, type Position } from "./fanOutPositions";
import { queueFirstChecks, removedQueries } from "./promptFanOut";
import { stableStringify } from "./utils/lang";

/**
 * A company's fan-out searches, grouped into angles, with where its website
 * stands for each (docs/plans/active/fan-out-angles-plan.md, FA2 and FA5).
 *
 * Rebuilt after each collection, one owned website at a time, in passes: each
 * pass takes the next questions until it has looked up enough wordings, so a
 * long list never becomes one oversized transaction. Each question's angles
 * are put right as it is read — a row changed is written with the rebuild's
 * stamp, one the same left alone, one no longer found (a search the engines
 * stopped running) removed — and the angles of questions no longer on the
 * list are cleared at the end (dataforseo-cost-plan.md, A3).
 *
 * Where the site stands is worked out from what is already held, nothing
 * bought (`fanOutPositions.ts`, shared with a question's fan-out queries
 * screen).
 */

/**
 * Wordings a pass looks up, near enough: a pass ends after the question that
 * crosses it. How many searches are read per question and assistant, how many
 * wordings an angle keeps and how many days of Search Console make a position
 * are the company's choices (`fanOutLimits.ts`), read when a rebuild starts.
 */
const ANGLE_WORDINGS_PER_PASS = 400;

/** Rows of questions no longer listed cleared per step. */
const ANGLE_ROWS_CLEARED = 500;

/** A question's angles read as they stand, to write only what changed: a few dozen at most. */
const ANGLES_PER_QUESTION_READ = 1_000;

type Wording = Doc<"fanOutAngles">["wordings"][number];

/** Start a rebuild of one owned website's angles, unless one is under way. */
export const rebuildHoldAngles = internalMutation({
  args: { holdId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    if (!hold || isTrackedHold(hold)) return null;
    const list = await ctx.db.query("fanOutAngleLists").withIndex("by_hold", (q) => q.eq("holdId", args.holdId)).unique();
    // A rebuild left half-done an hour ago has stopped; one younger is still running.
    if (list?.building !== undefined && Date.now() - list.building < 60 * 60 * 1000) return null;
    const stamp = Date.now();
    if (list) await ctx.db.patch(list._id, { building: stamp });
    else await ctx.db.insert("fanOutAngleLists", { holdId: args.holdId, rebuiltAt: 0, building: stamp, angles: 0, wordings: 0, cut: false });
    const limits = await readFanOutLimits(ctx, hold.companyId, hold._id);
    await ctx.scheduler.runAfter(0, internal.fanOutAngles.rebuildPass, {
      holdId: args.holdId,
      stamp,
      from: 0,
      angles: 0,
      wordings: 0,
      cut: false,
      searchesPerEngine: limits.searchesPerEngine,
      wordingsKept: limits.wordingsPerAngle,
      consoleDays: limits.consoleDays,
      googleRows: limits.googleSearchesRead,
    });
    return null;
  },
});

/** One pass: the next questions' searches, grouped and looked up, written with this rebuild's stamp. */
export const rebuildPass = internalMutation({
  args: {
    holdId: v.id("companyWebsites"),
    stamp: v.number(),
    from: v.number(),
    angles: v.number(),
    wordings: v.number(),
    cut: v.boolean(),
    searchesPerEngine: v.number(),
    wordingsKept: v.number(),
    consoleDays: v.number(),
    /** Google's AI Overviews bought per question (FA8); nought or absent reads none of Google's. */
    googleRows: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    if (!hold || isTrackedHold(hold)) return null;
    const lookups = await positionLookups(ctx, hold, args.consoleDays);
    const questions = await holdQuestions(ctx, hold._id, MAX_LIST);

    let index = args.from;
    let angles = args.angles;
    let wordings = args.wordings;
    let cut = args.cut;
    let looked = 0;
    while (index < questions.length && looked < ANGLE_WORDINGS_PER_PASS) {
      const question = questions[index];
      index += 1;
      const found = await questionWordings(ctx, question, hold.locationCode, args.searchesPerEngine, (args.googleRows ?? 0) > 0);
      cut = cut || found.cut;
      // A fan-out query the company deleted never comes back, whatever the
      // AI runs; every other one is on the list, and has its one first check
      // on Google — after that only the ticked ones are checked
      // (docs/plans/active/fan-out-opt-in-plan.md).
      const removed = await removedQueries(ctx, hold._id, question.prompt);
      const kept = found.wordings.filter((wording) => !removed.has(wording.query));
      await queueFirstChecks(ctx, hold, kept.map((wording) => wording.query));
      const groups = new Map<string, Wording[]>();
      for (const wording of kept) {
        const angle = angleOf(wording.query);
        groups.set(angle, [...(groups.get(angle) ?? []), wording]);
      }
      // The question's angles as they stand: one the same is left alone, one
      // no longer found goes (dataforseo-cost-plan.md, A3).
      const standing = new Map<string, Doc<"fanOutAngles">>();
      for (const row of await ctx.db
        .query("fanOutAngles")
        .withIndex("by_hold_prompt_angle", (q) => q.eq("holdId", hold._id).eq("prompt", question.prompt))
        .take(ANGLES_PER_QUESTION_READ)) {
        // Two rows for one angle — a rebuild that died half-way — keep one.
        const twin = standing.get(row.angle);
        if (twin) await ctx.db.delete(twin._id);
        standing.set(row.angle, row);
      }
      for (const [angle, members] of groups) {
        const sorted = members
          .sort((left, right) => right.timesSeen - left.timesSeen || right.lastSeenDay.localeCompare(left.lastSeenDay))
          .slice(0, args.wordingsKept);
        await writeAngle(ctx, {
          holdId: hold._id,
          prompt: question.prompt,
          angle,
          wordings: sorted,
          position: await bestPosition(ctx, lookups, sorted),
          stamp: args.stamp,
        }, standing.get(angle) ?? null);
        standing.delete(angle);
        angles += 1;
        wordings += sorted.length;
        looked += sorted.length;
      }
      for (const gone of standing.values()) await ctx.db.delete(gone._id);
    }

    if (index < questions.length) {
      await ctx.scheduler.runAfter(0, internal.fanOutAngles.rebuildPass, { ...args, from: index, angles, wordings, cut });
    } else {
      await ctx.scheduler.runAfter(0, internal.fanOutAngles.clearOlderAngles, {
        holdId: hold._id, stamp: args.stamp, angles, wordings, cut,
      });
    }
    return null;
  },
});

/**
 * Clear the angles of questions no longer on the list — each question still
 * on it had its own angles put right by its pass — then record the list and
 * ask for its pages to be judged. A question at a time, in the index's
 * order, so a step reads one row per question kept; `after` is where the
 * next step goes on from.
 */
export const clearOlderAngles = internalMutation({
  args: {
    holdId: v.id("companyWebsites"),
    stamp: v.number(),
    angles: v.number(),
    wordings: v.number(),
    cut: v.boolean(),
    after: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const listed = new Set((await holdQuestions(ctx, args.holdId, MAX_LIST)).map((question) => question.prompt));
    let after = args.after;
    let left = ANGLE_ROWS_CLEARED;
    for (;;) {
      const next = await ctx.db
        .query("fanOutAngles")
        .withIndex("by_hold_prompt_angle", (q) => (after === undefined ? q.eq("holdId", args.holdId) : q.eq("holdId", args.holdId).gt("prompt", after)))
        .first();
      if (!next) break;
      if (listed.has(next.prompt)) {
        after = next.prompt;
        continue;
      }
      const rows = await ctx.db
        .query("fanOutAngles")
        .withIndex("by_hold_prompt_angle", (q) => q.eq("holdId", args.holdId).eq("prompt", next.prompt))
        .take(left);
      for (const row of rows) await ctx.db.delete(row._id);
      left -= rows.length;
      if (left <= 0) {
        // More to clear than one step takes: the next goes on from here.
        await ctx.scheduler.runAfter(0, internal.fanOutAngles.clearOlderAngles, { ...args, ...(after === undefined ? {} : { after }) });
        return null;
      }
    }
    const list = await ctx.db.query("fanOutAngleLists").withIndex("by_hold", (q) => q.eq("holdId", args.holdId)).unique();
    const summary = { rebuiltAt: args.stamp, building: undefined, angles: args.angles, wordings: args.wordings, cut: args.cut };
    if (list) await ctx.db.patch(list._id, summary);
    else await ctx.db.insert("fanOutAngleLists", { holdId: args.holdId, ...summary });
    await ctx.scheduler.runAfter(0, internal.fanOutPageJudge.judgeHoldPages, { holdId: args.holdId });
    return null;
  },
});

/** Rows cleared per pass when a hold goes. */
const ANGLE_ROWS_PURGED = 1_000;

/**
 * Every angle, judgment and summary of a hold, for when the hold itself goes
 * — a pass at a time, so a long list is cleared over several rather than in
 * one oversized transaction.
 */
export const purgeHoldAngles = internalMutation({
  args: { holdId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    let left = ANGLE_ROWS_PURGED;
    const angles = await ctx.db.query("fanOutAngles").withIndex("by_hold_seen", (q) => q.eq("holdId", args.holdId)).take(left);
    for (const row of angles) await ctx.db.delete(row._id);
    left -= angles.length;
    const judgments = left > 0
      ? await ctx.db.query("fanOutPageJudgments").withIndex("by_hold_angle", (q) => q.eq("holdId", args.holdId)).take(left)
      : [];
    for (const row of judgments) await ctx.db.delete(row._id);
    left -= judgments.length;
    // What the company chose for each question's fan-out queries goes with it,
    // and its record of their first checks.
    for (const table of ["fanOutQueryChoices", "fanOutQuestionSettings"] as const) {
      const chosen = left > 0
        ? await ctx.db.query(table).withIndex("by_hold_prompt", (q) => q.eq("holdId", args.holdId)).take(left)
        : [];
      for (const row of chosen) await ctx.db.delete(row._id);
      left -= chosen.length;
    }
    const firsts = left > 0
      ? await ctx.db.query("fanOutFirstChecks").withIndex("by_hold_query", (q) => q.eq("holdId", args.holdId)).take(left)
      : [];
    for (const row of firsts) await ctx.db.delete(row._id);
    left -= firsts.length;
    if (left <= 0) {
      await ctx.scheduler.runAfter(0, internal.fanOutAngles.purgeHoldAngles, args);
      return null;
    }
    const list = await ctx.db.query("fanOutAngleLists").withIndex("by_hold", (q) => q.eq("holdId", args.holdId)).unique();
    if (list) await ctx.db.delete(list._id);
    return null;
  },
});

// ---------------------------------------------------------------------------
// Reading the searches
// ---------------------------------------------------------------------------

/**
 * One question's searches, each wording once with the engines that ran it.
 * Only the engines the question is asked of: another engine's searches for the
 * same words came from another company's asking. Google's AI Overviews' for
 * the question's topic (FA8) likewise only when this website buys them.
 */
async function questionWordings(
  ctx: MutationCtx,
  question: Doc<"websiteQuestions">,
  locationCode: number | undefined,
  perEngine: number,
  withGoogle: boolean,
): Promise<{ wordings: Wording[]; cut: boolean }> {
  const merged = new Map<string, Wording>();
  let cut = false;
  const add = (source: FanOutSource, row: { query: string; queryText: string; timesSeen: number; lastSeenDay: string }) => {
    const held = merged.get(row.query);
    if (!held) {
      merged.set(row.query, { query: row.query, queryText: row.queryText, engines: [source], timesSeen: row.timesSeen, lastSeenDay: row.lastSeenDay });
      return;
    }
    held.engines = [...held.engines, source];
    held.timesSeen += row.timesSeen;
    if (row.lastSeenDay > held.lastSeenDay) held.lastSeenDay = row.lastSeenDay;
  };
  for (const engine of question.engines) {
    const rows = await ctx.db
      .query("promptFanOutQueries")
      .withIndex("by_prompt_engine_place_seen", (q) =>
        q.eq("prompt", question.prompt).eq("engine", engine).eq("place", fanOutPlace(engine, locationCode)))
      .order("desc")
      .take(perEngine + 1);
    if (rows.length > perEngine) cut = true;
    for (const row of rows.slice(0, perEngine)) add(engine, row);
  }
  if (withGoogle) {
    const rows = await topicFanOuts(ctx, googleTopicOf(question.prompt), aiOverviewPlace(locationCode), perEngine);
    if (rows.length > perEngine) cut = true;
    for (const row of rows.slice(0, perEngine)) add(GOOGLE_AI_OVERVIEW, row);
  }
  return { wordings: [...merged.values()], cut };
}

/**
 * Write one angle, unless the row already says the same: a row written only
 * to carry this rebuild's stamp woke everything reading it for nothing
 * (dataforseo-cost-plan.md, A3). `rebuiltAt` is the rebuild that last changed it.
 */
async function writeAngle(
  ctx: MutationCtx,
  row: { holdId: Id<"companyWebsites">; prompt: string; angle: string; wordings: Wording[]; position: Position | null; stamp: number },
  held: Doc<"fanOutAngles"> | null,
) {
  const engines = [...new Set(row.wordings.flatMap((wording) => wording.engines))].sort();
  const figures = {
    wordings: row.wordings,
    engines,
    timesSeen: row.wordings.reduce((sum, wording) => sum + wording.timesSeen, 0),
    lastSeenDay: row.wordings.reduce((newest, wording) => (wording.lastSeenDay > newest ? wording.lastSeenDay : newest), ""),
    position: row.position ?? undefined,
  };
  if (held && stableStringify(figures) === stableStringify({
    wordings: held.wordings, engines: held.engines, timesSeen: held.timesSeen, lastSeenDay: held.lastSeenDay, position: held.position,
  })) return;
  const fields = { ...figures, rebuiltAt: row.stamp };
  if (held) await ctx.db.patch(held._id, fields);
  else await ctx.db.insert("fanOutAngles", { holdId: row.holdId, prompt: row.prompt, angle: row.angle, ...fields });
}
