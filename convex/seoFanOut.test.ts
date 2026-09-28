import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { parseLlmResponse } from "./dataForSeoParsers";

/**
 * The searches an AI engine ran before it answered.
 *
 * These arrive in every answer the citations pipeline already buys and were
 * being discarded with the rest of the payload. They are the questions the
 * engine actually went looking for answers to, which is the surface a site has
 * to be visible on rather than the one question we asked it.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

const payload = (queries: string[]) => ([{
  items: [{
    type: "message",
    sections: [{ text: "Try Acme Plumbing.", annotations: [{ url: "https://acme.example/x", title: "Acme" }] }],
  }],
  fan_out_queries: queries,
}]);

async function pullId(t: Harness): Promise<Id<"seoDataPulls">> {
  return await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
    operationId: "ai_chatgpt", family: "AI Optimization", mode: "LIVE",
    taskArgsJson: "{}", status: "READY", tag: `t-${Math.random()}`, attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now(),
  } as never));
}

describe("fan-out searches", () => {
  test("reads the engine's own expansion of the question", () => {
    const parsed = parseLlmResponse(payload([
      "best emergency plumber leeds",
      "  Best Emergency Plumber Leeds  ",
      "plumber call out cost leeds",
    ]));

    // Duplicates differing only in case or spacing are one search, and the
    // text is kept as the engine wrote it rather than lowercased.
    expect(parsed.fanOutQueries).toEqual([
      "best emergency plumber leeds",
      "plumber call out cost leeds",
    ]);
  });

  test("an engine that runs no fan-out is not an error", () => {
    expect(parseLlmResponse([{ items: [] }]).fanOutQueries).toEqual([]);
    expect(parseLlmResponse([{ items: [], fan_out_queries: "nonsense" }]).fanOutQueries).toEqual([]);
  });

  test("counts a search once per answer, however often the answer is re-read", async () => {
    const t = harness();
    const pull = await pullId(t);

    for (const _run of [1, 2, 3]) {
      await t.mutation(internal.seoCollectionParse.writeFanOutQueries, {
        pullId: pull,
        prompt: "who is the best plumber in leeds",
        engine: "chatgpt",
        place: "GB/Leeds",
        day: "2026-09-22",
        queries: ["best emergency plumber leeds"],
      });
    }

    const rows = await t.run(async (ctx) => await ctx.db.query("promptFanOutQueries").collect());
    // Re-parsing a month of stored answers must not multiply the counts by the
    // number of times the parser was run.
    expect(rows).toHaveLength(1);
    expect(rows[0]!.timesSeen).toBe(1);
  });

  test("counts a search again when a later answer brings it back", async () => {
    const t = harness();
    const first = await pullId(t);
    const second = await pullId(t);
    const common = { prompt: "who is the best plumber in leeds", engine: "chatgpt" as const, place: "GB/Leeds" };

    await t.mutation(internal.seoCollectionParse.writeFanOutQueries, {
      ...common, pullId: first, day: "2026-09-22", queries: ["best emergency plumber leeds"],
    });
    await t.mutation(internal.seoCollectionParse.writeFanOutQueries, {
      ...common, pullId: second, day: "2026-09-29", queries: ["best emergency plumber leeds"],
    });

    const rows = await t.run(async (ctx) => await ctx.db.query("promptFanOutQueries").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]!.timesSeen).toBe(2);
    expect(rows[0]!.lastSeenDay).toBe("2026-09-29");
    // And each appearance kept, dated, for reporting over time — reading the
    // second answer again does not add a third.
    await t.mutation(internal.seoCollectionParse.writeFanOutQueries, {
      ...common, pullId: second, day: "2026-09-29", queries: ["best emergency plumber leeds"],
    });
    const dated = await t.run(async (ctx) => await ctx.db.query("promptFanOutDays").collect());
    expect(dated.map((row) => row.day).sort()).toEqual(["2026-09-22", "2026-09-29"]);
  });

  test("an older answer filed again is not counted again, and never moves 'last seen' back", async () => {
    // Only a re-read of the newest answer was known; filing an older one again
    // — the hourly re-file, or a parser fix run over stored answers — counted
    // it a second time (reliability plan 3.6).
    const t = harness();
    const first = await pullId(t);
    const second = await pullId(t);
    const common = { prompt: "who is the best plumber in leeds", engine: "chatgpt" as const, place: "GB/Leeds", queries: ["best emergency plumber leeds"] };

    await t.mutation(internal.seoCollectionParse.writeFanOutQueries, { ...common, pullId: first, day: "2026-09-22" });
    await t.mutation(internal.seoCollectionParse.writeFanOutQueries, { ...common, pullId: second, day: "2026-09-29" });
    await t.mutation(internal.seoCollectionParse.writeFanOutQueries, { ...common, pullId: first, day: "2026-09-22" });

    const rows = await t.run(async (ctx) => await ctx.db.query("promptFanOutQueries").collect());
    expect(rows[0]).toMatchObject({ timesSeen: 2, lastSeenDay: "2026-09-29", lastPullId: second });
  });

  test("an older answer filed late adds its appearance without moving 'last seen' back", async () => {
    const t = harness();
    const newer = await pullId(t);
    const older = await pullId(t);
    const common = { prompt: "who is the best plumber in leeds", engine: "chatgpt" as const, place: "GB/Leeds", queries: ["best emergency plumber leeds"] };

    await t.mutation(internal.seoCollectionParse.writeFanOutQueries, { ...common, pullId: newer, day: "2026-09-29" });
    await t.mutation(internal.seoCollectionParse.writeFanOutQueries, { ...common, pullId: older, day: "2026-09-22" });

    const rows = await t.run(async (ctx) => await ctx.db.query("promptFanOutQueries").collect());
    expect(rows[0]).toMatchObject({ timesSeen: 2, lastSeenDay: "2026-09-29", lastPullId: newer });
  });

  test("keeps two places apart, because a fan-out is not the same in both", async () => {
    const t = harness();
    const pull = await pullId(t);
    const common = { pullId: pull, prompt: "best plumber", engine: "chatgpt" as const, day: "2026-09-22" };

    await t.mutation(internal.seoCollectionParse.writeFanOutQueries, {
      ...common, place: "GB/Leeds", queries: ["emergency plumber near me"],
    });
    await t.mutation(internal.seoCollectionParse.writeFanOutQueries, {
      ...common, place: "GB/London", queries: ["emergency plumber near me"],
    });

    const rows = await t.run(async (ctx) => await ctx.db.query("promptFanOutQueries").collect());
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.place).sort()).toEqual(["GB/Leeds", "GB/London"]);
  });
});
