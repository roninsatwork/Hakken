import { v } from "convex/values";

import { paginationOptsValidator } from "convex/server";
import { getActiveCompanyId } from "./authz";
import { tenantMutation, tenantQuery } from "./tenantFunctions";
import * as tailShapes from "./utils/tailShapes";
import { appError } from "./utils/appError";
import {
  calculateNightHeistScore,
  NIGHT_HEIST_LEVELS,
  nightHeistGame,
  isNightHeistGame,
} from "./utils/nightHeistRules";

export const getPaginatedLeaderboard = tenantQuery({
  args: {
    game: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: tailShapes.leaderboardPageShape,
  handler: async (ctx, args) => {
    // Fetch paginated scores for the given game
    const scores = isNightHeistGame(args.game)
      ? ctx.db
          .query("arcadeScores")
          .withIndex("by_company_game_score", (q) =>
            q.eq("companyId", ctx.companyId).eq("game", args.game),
          )
      : ctx.db.query("arcadeScores").withIndex("by_game_score", (q) => q.eq("game", args.game));
    const scoresPage = await scores
      .order("desc") // highest score first
      .paginate(args.paginationOpts);

    // Join with user data to get names and avatars
    const stitched = await Promise.all(
      scoresPage.page.map(async (s) => {
        const user = await ctx.db.get(s.userId);
        return {
          ...s,
          userName: user?.name || "Unknown Player",
          userAvatar: user?.image || null,
        };
      }),
    );

    return { ...scoresPage, page: stitched };
  },
});

export const getScoresCount = tenantQuery({
  args: { game: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const scores = isNightHeistGame(args.game)
      ? await ctx.db
          .query("arcadeScores")
          .withIndex("by_company_game_score", (q) =>
            q.eq("companyId", ctx.companyId).eq("game", args.game),
          )
          .take(10000)
      : await ctx.db
          .query("arcadeScores")
          .withIndex("by_game_score", (q) => q.eq("game", args.game))
          .take(10000);
    return scores.length;
  },
});

export const submitScore = tenantMutation({
  args: { game: v.string(), score: v.number() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const { userId, user } = ctx;

    if (isNightHeistGame(args.game))
      throw appError("INVALID_INPUT", "Night Heist scores require a completed run.");

    // Insert the score
    await ctx.db.insert("arcadeScores", {
      userId,
      companyId: getActiveCompanyId(user),
      game: args.game,
      score: args.score,
      playedAt: Date.now(),
    });

    return true;
  },
});

const levelValidator = v.union(
  v.literal("courtyard"),
  v.literal("market"),
  v.literal("docks"),
  v.literal("gardens"),
);

/** Four indexed best-score reads also preserve escapes saved before campaigns existed.
 * No second progress document can drift from the score transaction. */
export const getNightHeistProgress = tenantQuery({
  args: {},
  returns: v.object({
    workspace: v.string(),
    unlocked: v.number(),
    bests: v.array(v.union(v.number(), v.null())),
  }),
  handler: async (ctx) => {
    const bests = await Promise.all(
      NIGHT_HEIST_LEVELS.map(async (level) => {
        const best = await ctx.db
          .query("arcadeScores")
          .withIndex("by_user_company_game_score", (q) =>
            q.eq("userId", ctx.userId).eq("companyId", ctx.companyId).eq("game", nightHeistGame(level)),
          )
          .order("desc")
          .first();
        return best?.score ?? null;
      }),
    );
    let unlocked = 1;
    while (unlocked < NIGHT_HEIST_LEVELS.length && bests[unlocked - 1] !== null) unlocked++;
    return { workspace: `${ctx.userId}:${ctx.companyId ?? "personal"}`, unlocked, bests };
  },
});

export const startNightHeistRun = tenantMutation({
  args: { level: v.optional(levelValidator) },
  returns: v.id("arcadeRuns"),
  handler: async (ctx, args) => {
    const level = args.level ?? "courtyard";
    const index = NIGHT_HEIST_LEVELS.indexOf(level);
    // Check every prerequisite, so a malformed/gapped history cannot skip a map.
    for (const prior of NIGHT_HEIST_LEVELS.slice(0, index)) {
      const escape = await ctx.db
        .query("arcadeScores")
        .withIndex("by_user_company_game_score", (q) =>
          q.eq("userId", ctx.userId).eq("companyId", ctx.companyId).eq("game", nightHeistGame(prior)),
        )
        .first();
      if (!escape) throw appError("INVALID_INPUT", "Escape the previous maps to unlock this heist.");
    }
    // A bounded start limit prevents accidental retry loops from filling storage.
    const recent = await ctx.db
      .query("arcadeRuns")
      .withIndex("by_user_started", (q) =>
        q.eq("userId", ctx.userId).gte("startedAt", Date.now() - 60_000),
      )
      .take(20);
    if (recent.length >= 20)
      throw appError("CONFLICT", "Please wait a moment before starting another run.");
    return await ctx.db.insert("arcadeRuns", {
      level,
      userId: ctx.userId,
      companyId: ctx.companyId,
      startedAt: Date.now(),
    });
  },
});

export const finishNightHeistRun = tenantMutation({
  args: {
    runId: v.id("arcadeRuns"),
    elapsedSeconds: v.number(),
    treasure: v.boolean(),
    alarms: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.userId !== ctx.userId || run.companyId !== ctx.companyId)
      throw appError("UNAUTHORIZED", "This run does not belong to your current workspace.");
    // Mutation transactions make retries idempotent, even after a lost response.
    if (run.score !== undefined) return run.score;
    const wallSeconds = (Date.now() - run.startedAt) / 1000;
    if (
      !Number.isInteger(args.elapsedSeconds) ||
      args.elapsedSeconds < 5 ||
      args.elapsedSeconds > 1800 ||
      args.elapsedSeconds > wallSeconds + 2 ||
      wallSeconds > 86_400 ||
      !Number.isInteger(args.alarms) ||
      args.alarms < 0 ||
      args.alarms > 200
    ) {
      throw appError("INVALID_INPUT", "This run's result is invalid or expired.");
    }
    // These are sanity checks, not authoritative replay or competitive anti-cheat.
    const score = calculateNightHeistScore(args.elapsedSeconds, args.treasure, args.alarms);
    await ctx.db.insert("arcadeScores", {
      userId: ctx.userId,
      companyId: ctx.companyId,
      game: nightHeistGame(run.level ?? "courtyard"),
      score,
      runId: args.runId,
      playedAt: Date.now(),
    });
    await ctx.db.patch(args.runId, { score, finishedAt: Date.now() });
    return score;
  },
});
