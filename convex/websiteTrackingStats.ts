import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import type { AiEngine } from "./seoAiEngines";
import { requestRebuildEverywhere } from "./siteRankings";

/**
 * Keeping each host's search and question summaries current as results land.
 *
 * The Tracking screen judges every row — slipping, never ranked, never landed —
 * and each judgment needs weeks of history. Reading that history per row per
 * view is a cost that grows with every search added and every week that
 * passes, so it is derived here, once, when a result is filed, and the screen
 * reads one summary row per search or question instead.
 *
 * **Recomputed, never incremented.** Every summary is rebuilt from the rows it
 * summarises — positions for a search, answers for a question — so re-parsing
 * a month of stored results after a parser fix converges on the same numbers
 * instead of counting everything twice. The window is bounded; anything older
 * than it survives only in the sticky fields (first seen, ever ranked), which
 * is all a verdict needs from that far back.
 */

/** Position rows read per recompute. Months of weekly checks, a few weeks of daily ones. */
const SEARCH_WINDOW = 30;

/** Answers read per recompute: years of weekly asking. */
const ANSWER_WINDOW = 200;

/** Others kept per question: enough to find a rival nobody tracks, not a leaderboard. */
const OTHERS_NAMED_KEPT = 20;

/** Hosts one answer is filed for. More than this asking one question is a different problem. */
const HOSTS_PER_QUESTION = 200;

/** Where one host stands on one search from one place, rebuilt from its positions. */
export async function recomputeSearchStats(
  ctx: MutationCtx,
  key: { websiteId: Id<"websites">; keyword: string; locationCode: number },
): Promise<void> {
  const rows = await ctx.db
    .query("seoKeywordPositions")
    .withIndex("by_website_keyword_place_day", (q) =>
      q.eq("websiteId", key.websiteId).eq("keyword", key.keyword).eq("locationCode", key.locationCode))
    .order("desc")
    .take(SEARCH_WINDOW);

  const existing = await ctx.db
    .query("websiteSearchStats")
    .withIndex("by_key", (q) =>
      q.eq("websiteId", key.websiteId).eq("keyword", key.keyword).eq("locationCode", key.locationCode))
    .unique();

  if (rows.length === 0) {
    // A re-parse removed the only rows there were. No history is no summary.
    if (existing) await ctx.db.delete(existing._id);
    return;
  }

  const [last, previous] = rows;
  const oldest = rows[rows.length - 1];
  const positions = rows.flatMap((row) => (row.position !== undefined ? [row.position] : []));
  const windowBest = positions.length > 0 ? Math.min(...positions) : undefined;

  // A full window may not reach the first check, so what lies before it is
  // kept from the last summary. A short one is the whole history, and wins.
  const reachesStart = rows.length < SEARCH_WINDOW;
  const carried = !reachesStart && existing ? existing : null;
  const firstCheckedDay = carried && carried.firstCheckedDay < oldest.day ? carried.firstCheckedDay : oldest.day;
  const bestCandidates = [windowBest, carried?.bestPosition].filter((value): value is number => value !== undefined);

  const summary = {
    websiteId: key.websiteId,
    keyword: key.keyword,
    locationCode: key.locationCode,
    firstCheckedDay,
    lastCheckedDay: last.day,
    ...(last.position !== undefined ? { lastPosition: last.position } : {}),
    ...(previous ? { previousCheckedDay: previous.day } : {}),
    ...(previous?.position !== undefined ? { previousPosition: previous.position } : {}),
    ...(bestCandidates.length > 0 ? { bestPosition: Math.min(...bestCandidates) } : {}),
    everRanked: windowBest !== undefined || Boolean(carried?.everRanked),
    updatedAt: Date.now(),
  };

  if (existing) await ctx.db.replace(existing._id, summary);
  else await ctx.db.insert("websiteSearchStats", summary);
}

/**
 * File one answer, then bring every host asking that question up to date.
 *
 * The answer row is replaced by pull, like every parse. Then each host whose
 * list asks this question of this engine gets its summary rebuilt from the
 * answers — one read shared between them, since they are asking the same
 * thing from the same place.
 */
export async function recordAnswer(
  ctx: MutationCtx,
  answer: {
    pullId: Id<"seoDataPulls">;
    prompt: string;
    engine: AiEngine;
    locationCode: number;
    day: string;
    brands: ReadonlyArray<{ websiteId: Id<"websites">; stance?: "RECOMMENDED" | "MENTIONED" | "WARNED_AGAINST" }>;
  },
): Promise<void> {
  const prior = await ctx.db
    .query("aiAnswers")
    .withIndex("by_pull", (q) => q.eq("pullId", answer.pullId))
    .take(5);
  for (const row of prior) await ctx.db.delete(row._id);

  const named: Id<"websites">[] = [];
  const recommended: Id<"websites">[] = [];
  const warnedAgainst: Id<"websites">[] = [];
  for (const brand of answer.brands) {
    if (!named.includes(brand.websiteId)) named.push(brand.websiteId);
    if (brand.stance === "RECOMMENDED" && !recommended.includes(brand.websiteId)) recommended.push(brand.websiteId);
    if (brand.stance === "WARNED_AGAINST" && !warnedAgainst.includes(brand.websiteId)) warnedAgainst.push(brand.websiteId);
  }

  await ctx.db.insert("aiAnswers", {
    prompt: answer.prompt,
    engine: answer.engine,
    locationCode: answer.locationCode,
    day: answer.day,
    pullId: answer.pullId,
    named,
    recommended,
    warnedAgainst,
    createdAt: Date.now(),
  });

  const askers = (await ctx.db
    .query("websiteQuestions")
    .withIndex("by_prompt", (q) => q.eq("prompt", answer.prompt))
    .take(HOSTS_PER_QUESTION))
    .filter((question) => question.engines.includes(answer.engine));
  if (askers.length === 0) return;

  const answers = await ctx.db
    .query("aiAnswers")
    .withIndex("by_question", (q) =>
      q.eq("prompt", answer.prompt).eq("engine", answer.engine).eq("locationCode", answer.locationCode))
    .order("desc")
    .take(ANSWER_WINDOW);

  for (const asker of askers) {
    await rebuildQuestionStats(ctx, asker.websiteId, answer, answers);
    // The asker's Sites summaries count its answers per day and engine.
    await requestRebuildEverywhere(ctx, asker.websiteId);
  }
}

async function rebuildQuestionStats(
  ctx: MutationCtx,
  websiteId: Id<"websites">,
  key: { prompt: string; engine: AiEngine; locationCode: number },
  answers: ReadonlyArray<{ day: string; named: Id<"websites">[]; recommended: Id<"websites">[]; warnedAgainst: Id<"websites">[] }>,
): Promise<void> {
  const existing = await ctx.db
    .query("websiteQuestionStats")
    .withIndex("by_key", (q) =>
      q.eq("websiteId", websiteId).eq("prompt", key.prompt).eq("engine", key.engine).eq("locationCode", key.locationCode))
    .unique();
  if (answers.length === 0) {
    if (existing) await ctx.db.delete(existing._id);
    return;
  }

  let named = 0;
  let recommended = 0;
  let warnedAgainst = 0;
  let lastNamedDay: string | undefined;
  const others = new Map<Id<"websites">, { times: number; lastDay: string }>();
  for (const answer of answers) {
    if (answer.named.includes(websiteId)) {
      named += 1;
      if (!lastNamedDay) lastNamedDay = answer.day;
    }
    if (answer.recommended.includes(websiteId)) recommended += 1;
    if (answer.warnedAgainst.includes(websiteId)) warnedAgainst += 1;
    for (const other of answer.named) {
      if (other === websiteId) continue;
      // Answers arrive newest first, so the first sighting is the latest.
      const held = others.get(other);
      others.set(other, { times: (held?.times ?? 0) + 1, lastDay: held?.lastDay ?? answer.day });
    }
  }

  const oldest = answers[answers.length - 1].day;
  const reachesStart = answers.length < ANSWER_WINDOW;
  const firstAskedDay = !reachesStart && existing && existing.firstAskedDay < oldest
    ? existing.firstAskedDay
    : oldest;

  const summary = {
    websiteId,
    prompt: key.prompt,
    engine: key.engine,
    locationCode: key.locationCode,
    asked: answers.length,
    named,
    recommended,
    warnedAgainst,
    firstAskedDay,
    lastAskedDay: answers[0].day,
    lastNamed: answers[0].named.includes(websiteId),
    ...(lastNamedDay ? { lastNamedDay } : {}),
    othersNamed: [...others.entries()]
      .sort((left, right) => right[1].times - left[1].times)
      .slice(0, OTHERS_NAMED_KEPT)
      .map(([otherId, seen]) => ({ websiteId: otherId, times: seen.times, lastDay: seen.lastDay })),
    updatedAt: Date.now(),
  };

  if (existing) await ctx.db.replace(existing._id, summary);
  else await ctx.db.insert("websiteQuestionStats", summary);
}

/**
 * Add one paid send to what its operation has cost on average.
 *
 * Called where the charge is written, so the running mean is the invoice's
 * own figure. A free send — the sandbox, or a reuse — says nothing about the
 * price and is not counted.
 */
export async function recordOperationCost(
  ctx: MutationCtx,
  operationId: string,
  costUsd: number,
): Promise<void> {
  if (!(costUsd > 0)) return;
  const existing = await ctx.db
    .query("seoOperationCosts")
    .withIndex("by_operation", (q) => q.eq("operationId", operationId))
    .unique();
  const now = Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, {
      charged: existing.charged + 1,
      totalUsd: existing.totalUsd + costUsd,
      lastUsd: costUsd,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("seoOperationCosts", {
      operationId,
      charged: 1,
      totalUsd: costUsd,
      lastUsd: costUsd,
      updatedAt: now,
    });
  }
}
