import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

import { paginationOptsValidator } from "convex/server";

export const getPaginatedLeaderboard = query({
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

export const getScoresCount = query({
  args: { game: v.string() },
  handler: async (ctx, args) => {
    const scores = await ctx.db
      .query("arcadeScores")
      .withIndex("by_game_score", (q) => q.eq("game", args.game))
      .collect();
    return scores.length;
  },
});

export const submitScore = mutation({
  args: { game: v.string(), score: v.number() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const user = await ctx.db.get(userId);

    // Insert the score
    await ctx.db.insert("arcadeScores", {
      userId,
      companyId: user?.companyId,
      game: args.game,
      score: args.score,
      playedAt: Date.now(),
    });

    return true;
  },
});
