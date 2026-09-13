import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { calculateNightHeistScore, NIGHT_HEIST_GAME } from "./utils/nightHeistRules";

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
    await expect(
      userAClient.mutation(api.arcade.submitScore, { game: "ronins-run", score: 300 }),
    ).resolves.toBe(true);

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
      "Unauthenticated",
    );
  });
});

async function nightHeistFixture() {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Courtyard", createdAt: Date.now() });
    const otherCompanyId = await ctx.db.insert("companies", { name: "Other", createdAt: Date.now() });
    const userId = await ctx.db.insert("users", { name: "Player", role: "USER", companyId });
    const teammateId = await ctx.db.insert("users", { name: "Teammate", role: "USER", companyId });
    const outsiderId = await ctx.db.insert("users", {
      name: "Outsider",
      role: "USER",
      companyId: otherCompanyId,
    });
    return { companyId, otherCompanyId, userId, teammateId, outsiderId };
  });
  const client = t.withIdentity({ subject: ids.userId });
  const runId = await client.mutation(api.arcade.startNightHeistRun, {});
  await t.run((ctx) => ctx.db.patch(runId, { startedAt: Date.now() - 120_000 }));
  return { t, client, runId, ...ids };
}

describe("Night Heist escapes", () => {
  test("calculates the score on the server and a retry writes exactly one result", async () => {
    const { t, client, runId } = await nightHeistFixture();
    const args = { runId, elapsedSeconds: 110, treasure: true, alarms: 2 };
    const expected = calculateNightHeistScore(110, true, 2);
    expect(await client.mutation(api.arcade.finishNightHeistRun, args)).toBe(expected);
    expect(await client.mutation(api.arcade.finishNightHeistRun, { ...args, treasure: false })).toBe(
      expected,
    );
    const page = await client.query(api.arcade.getPaginatedLeaderboard, {
      game: NIGHT_HEIST_GAME,
      paginationOpts,
    });
    expect(page.page).toHaveLength(1);
    expect(page.page[0]).toMatchObject({ score: expected, runId, userName: "Player" });
    expect(await t.run((ctx) => ctx.db.get(runId))).toMatchObject({ score: expected });
  });

  test("isolates the new leaderboard and receipts by workspace and player", async () => {
    const { t, client, runId, teammateId, outsiderId, otherCompanyId, userId } =
      await nightHeistFixture();
    const args = { runId, elapsedSeconds: 110, treasure: false, alarms: 0 };
    await expect(
      t.withIdentity({ subject: teammateId }).mutation(api.arcade.finishNightHeistRun, args),
    ).rejects.toThrow("does not belong");
    await expect(
      t.withIdentity({ subject: outsiderId }).mutation(api.arcade.finishNightHeistRun, args),
    ).rejects.toThrow("does not belong");
    await client.mutation(api.arcade.finishNightHeistRun, args);
    await t.run((ctx) =>
      ctx.db.insert("arcadeScores", { game: "ronin", userId, score: 99999, playedAt: Date.now() }),
    );
    const outsider = t.withIdentity({ subject: outsiderId });
    expect(await outsider.query(api.arcade.getScoresCount, { game: NIGHT_HEIST_GAME })).toBe(0);
    expect(
      (
        await outsider.query(api.arcade.getPaginatedLeaderboard, {
          game: NIGHT_HEIST_GAME,
          paginationOpts,
        })
      ).page,
    ).toEqual([]);
    expect(await client.query(api.arcade.getScoresCount, { game: NIGHT_HEIST_GAME })).toBe(1);
    await t.run((ctx) => ctx.db.patch(userId, { companyId: otherCompanyId }));
    await expect(client.mutation(api.arcade.finishNightHeistRun, args)).rejects.toThrow(
      "does not belong",
    );
  });

  test("rejects bypasses, impossible times, invalid counts, and expired runs", async () => {
    const { t, client, runId } = await nightHeistFixture();
    await expect(
      client.mutation(api.arcade.submitScore, { game: NIGHT_HEIST_GAME, score: 999999 }),
    ).rejects.toThrow("completed run");
    for (const invalid of [
      { elapsedSeconds: 500 },
      { elapsedSeconds: -1 },
      { elapsedSeconds: 20.5 },
      { alarms: -1 },
      { alarms: 1.5 },
      { alarms: 201 },
    ]) {
      await expect(
        client.mutation(api.arcade.finishNightHeistRun, {
          runId,
          elapsedSeconds: 110,
          alarms: 0,
          treasure: false,
          ...invalid,
        }),
      ).rejects.toThrow("invalid or expired");
    }
    await t.run((ctx) => ctx.db.patch(runId, { startedAt: Date.now() - 86_401_000 }));
    await expect(
      client.mutation(api.arcade.finishNightHeistRun, {
        runId,
        elapsedSeconds: 110,
        alarms: 0,
        treasure: false,
      }),
    ).rejects.toThrow("invalid or expired");
    expect(await client.query(api.arcade.getScoresCount, { game: NIGHT_HEIST_GAME })).toBe(0);
    await expect(t.mutation(api.arcade.startNightHeistRun, {})).rejects.toThrow("Unauthenticated");
  });

  test("bounds accidental start loops", async () => {
    const { client } = await nightHeistFixture();
    for (let i = 0; i < 20; i++) await client.mutation(api.arcade.startNightHeistRun, {});
    await expect(client.mutation(api.arcade.startNightHeistRun, {})).rejects.toThrow("wait a moment");
  });
});

describe("Night Heist campaign", () => {
  test("unlocks four maps in order, keeps separate bests and supports replay and retry", async () => {
    const { t, client } = await nightHeistFixture();
    const levels = ["courtyard", "market", "docks", "gardens"] as const;
    expect(await client.query(api.arcade.getNightHeistProgress, {})).toMatchObject({
      unlocked: 1,
      bests: [null, null, null, null],
    });
    for (let i = 0; i < levels.length; i++) {
      if (i < 3)
        await expect(
          client.mutation(api.arcade.startNightHeistRun, { level: levels[i + 1] }),
        ).rejects.toThrow("unlock");
      const runId = await client.mutation(api.arcade.startNightHeistRun, { level: levels[i] });
      await t.run((ctx) => ctx.db.patch(runId, { startedAt: Date.now() - 60_000 }));
      const args = { runId, elapsedSeconds: 50, treasure: true, alarms: 1 };
      const score = await client.mutation(api.arcade.finishNightHeistRun, args);
      await client.mutation(api.arcade.finishNightHeistRun, args);
      const progress = await client.query(api.arcade.getNightHeistProgress, {});
      expect(progress.unlocked).toBe(Math.min(4, i + 2));
      expect(progress.bests).toEqual(levels.map((_, j) => (j <= i ? score : null)));
      const game = i === 0 ? NIGHT_HEIST_GAME : `${NIGHT_HEIST_GAME}:${levels[i]}`;
      expect(await client.query(api.arcade.getScoresCount, { game })).toBe(1);
      expect(
        (await client.query(api.arcade.getPaginatedLeaderboard, { game, paginationOpts })).page[0],
      ).toMatchObject({ runId, score });
      await expect(client.mutation(api.arcade.submitScore, { game, score: 100000 })).rejects.toThrow(
        "completed run",
      );
    }
    await expect(
      client.mutation(api.arcade.startNightHeistRun, { level: "courtyard" }),
    ).resolves.toBeTruthy();
  });
  test("preserves old courtyard escapes and isolates unlocks by both player and workspace", async () => {
    const { t, client, userId, companyId, otherCompanyId, teammateId } = await nightHeistFixture();
    await t.run((ctx) =>
      ctx.db.insert("arcadeScores", {
        userId,
        companyId,
        game: NIGHT_HEIST_GAME,
        score: 6260,
        playedAt: Date.now(),
      }),
    );
    expect(await client.query(api.arcade.getNightHeistProgress, {})).toMatchObject({
      unlocked: 2,
      bests: [6260, null, null, null],
    });
    const marketRun = await client.mutation(api.arcade.startNightHeistRun, { level: "market" });
    const teammate = t.withIdentity({ subject: teammateId });
    expect((await teammate.query(api.arcade.getNightHeistProgress, {})).unlocked).toBe(1);
    await expect(teammate.mutation(api.arcade.startNightHeistRun, { level: "market" })).rejects.toThrow(
      "unlock",
    );
    await t.run((ctx) => ctx.db.patch(userId, { companyId: otherCompanyId }));
    expect((await client.query(api.arcade.getNightHeistProgress, {})).unlocked).toBe(1);
    await expect(client.mutation(api.arcade.startNightHeistRun, { level: "market" })).rejects.toThrow(
      "unlock",
    );
    await expect(
      client.mutation(api.arcade.finishNightHeistRun, {
        runId: marketRun,
        elapsedSeconds: 20,
        treasure: false,
        alarms: 0,
      }),
    ).rejects.toThrow("does not belong");
    for (const game of [`${NIGHT_HEIST_GAME}:market`, `${NIGHT_HEIST_GAME}:invented`]) {
      await t.run((ctx) =>
        ctx.db.insert("arcadeScores", { userId, companyId, game, score: 10, playedAt: Date.now() }),
      );
      expect(await client.query(api.arcade.getScoresCount, { game })).toBe(0);
      expect(
        (await client.query(api.arcade.getPaginatedLeaderboard, { game, paginationOpts })).page,
      ).toEqual([]);
      await expect(client.mutation(api.arcade.submitScore, { game, score: 50 })).rejects.toThrow(
        "completed run",
      );
    }
  });
});
