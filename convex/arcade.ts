import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

import { paginationOptsValidator } from "convex/server";
import { getActiveCompanyId, requireCurrentUser } from "./authz";

export const getPaginatedLeaderboard = query({
  args: { 
    game: v.string(),
    paginationOpts: paginationOptsValidator
  },
  handler: async (ctx, args) => {
    await requireCurrentUser(ctx, "Unauthenticated request");

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
    await requireCurrentUser(ctx, "Unauthenticated request");

    const scores = await ctx.db
      .query("arcadeScores")
      .withIndex("by_game_score", (q) => q.eq("game", args.game))
      .take(10000);
    return scores.length;
  },
});

export const submitScore = mutation({
  args: { game: v.string(), score: v.number() },
  handler: async (ctx, args) => {
    const { userId, user } = await requireCurrentUser(ctx, "Unauthorized");

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
