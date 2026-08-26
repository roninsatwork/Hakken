import { v } from "convex/values";

import { paginationOptsValidator } from "convex/server";
import { getActiveCompanyId } from "./authz";
import { tenantMutation, tenantQuery } from "./tenantFunctions";

export const getPaginatedLeaderboard = tenantQuery({
  args: { 
    game: v.string(),
    paginationOpts: paginationOptsValidator
  },
  handler: async (ctx, args) => {
    // Fetch paginated scores for the given game
    const scoresPage = await ctx.db
      .query("arcadeScores")
      .withIndex("by_game_score", (q) => q.eq("game", args.game))
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
      })
    );

    return { ...scoresPage, page: stitched };
  },
});

export const getScoresCount = tenantQuery({
  args: { game: v.string() },
  handler: async (ctx, args) => {
    const scores = await ctx.db
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
