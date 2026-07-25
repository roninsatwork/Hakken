import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const paginationOpts = { numItems: 10, cursor: null };

describe("arcade scores", () => {
  test("authenticated users can submit scores and read stitched leaderboards", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { userAId, userBId, companyId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Company", createdAt: Date.now() });
      const userAId = await ctx.db.insert("users", {
        email: "a@example.com",
        name: "Ada",
        image: "https://example.com/a.png",
        role: "USER",
        companyId,
      });
      const userBId = await ctx.db.insert("users", {
        email: "b@example.com",
        role: "USER",
        companyId,
      });
      await ctx.db.insert("arcadeScores", {
        userId: userBId,
        companyId,
        game: "ronins-run",
        score: 200,
        playedAt: Date.now(),
      });
      return { userAId, userBId, companyId };
    });

    const userAClient = t.withIdentity({ subject: userAId });
    await expect(userAClient.mutation(api.arcade.submitScore, { game: "ronins-run", score: 300 })).resolves.toBe(
      true
    );

    const leaderboard = await userAClient.query(api.arcade.getPaginatedLeaderboard, {
      game: "ronins-run",
      paginationOpts,
    });
    expect(leaderboard.page.map((score) => score.score)).toEqual([300, 200]);
    expect(leaderboard.page[0]).toMatchObject({
      userId: userAId,
      companyId,
      userName: "Ada",
      userAvatar: "https://example.com/a.png",
    });
    expect(leaderboard.page[1]).toMatchObject({
      userId: userBId,
      userName: "Unknown Player",
      userAvatar: null,
    });
    expect(await userAClient.query(api.arcade.getScoresCount, { game: "ronins-run" })).toBe(2);
    await expect(t.query(api.arcade.getScoresCount, { game: "ronins-run" })).rejects.toThrow(
      "Unauthenticated"
    );
  });
});
