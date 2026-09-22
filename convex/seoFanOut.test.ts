import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
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

async function superAdmin(t: Harness) {
  const userId = await t.run(async (ctx) =>
    await ctx.db.insert("users", {
      name: "Super", email: `su-${Math.random()}@test.com`, role: "SUPER_ADMIN", createdAt: Date.now(),
    } as never));
  return t.withIdentity({ subject: userId });
}

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

  test("the screen reads a site's fan-out through its own questions", async () => {
    const t = harness();
    const pull = await pullId(t);
    const prompt = "who is the best plumber in leeds";

    const { companyWebsiteId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: Date.now() } as never);
      const websiteId = await ctx.db.insert("websites", {
        host: "acme.example", displayHost: "acme.example", firstSeenAt: Date.now(),
      } as never);
      const companyWebsiteId = await ctx.db.insert("companyWebsites", {
        companyId, websiteId, createdAt: Date.now(),
      } as never);
      await ctx.db.insert("trackedPrompts", {
        companyWebsiteId, companyId, websiteId, prompt, engines: ["chatgpt"], isActive: true, createdAt: Date.now(),
      } as never);
      await ctx.db.insert("seoKeywordIntents", {
        keyword: "best emergency plumber leeds", intent: "BUYING", judgedAt: Date.now(),
      } as never);
      return { companyWebsiteId: companyWebsiteId as Id<"companyWebsites"> };
    });

    // Two engines reaching the same search is one row that names both.
    for (const engine of ["chatgpt", "perplexity"] as const) {
      await t.mutation(internal.seoCollectionParse.writeFanOutQueries, {
        pullId: pull, prompt, engine, day: "2026-09-22",
        queries: ["best emergency plumber leeds", "plumber call out cost leeds"],
      });
    }

    const asAdmin = await superAdmin(t);
    const result = await asAdmin.query(api.seoFanOutReports.listWebsiteFanOutQueries, {
      companyWebsiteId, page: 1, pageSize: 25,
    });

    expect(result.totalCount).toBe(2);
    const top = result.data[0]!;
    expect(top.queryText).toBe("best emergency plumber leeds");
    expect(top.engines).toEqual(["chatgpt", "perplexity"]);
    expect(top.timesSeen).toBe(2);
    // The same judgment and the same store the rankings screen reads, so a
    // phrase met on both screens is judged once and paid for once.
    expect(top.intent).toBe("BUYING");
    expect(result.data[1]!.intent).toBeNull();
  });
});
