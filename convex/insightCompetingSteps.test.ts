import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { competingForRun, competingNow } from "./insightCompeting";
import { packNumbers } from "./utils/searchConsolePacks";
import { useFixedDay } from "@/src/test/realTime";

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("./aiProviderRegistry", async (original) => ({ ...(await original<typeof import("./aiProviderRegistry")>()), generateTextWithResolvedModel: generate }));

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;
const searches = ["brand agency", "brand design agency", "brand identity agency", "branding agency", "branding company"];
const pages = ["https://acme.test/brand-design-agency/", "https://acme.test/brand-identity-agency/"];

beforeEach(() => { useFixedDay("2026-10-26"); generate.mockReset(); });
afterEach(() => vi.useRealTimers());

async function seed(t: Harness) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme.test", displayHost: "acme.test", firstSeenAt: 1 });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    for (const [kind, terms] of [["query", searches], ["page", pages]] as const) {
      await ctx.db.insert("searchConsolePeriodBooks", { companyWebsiteId: holdId, searchType: "web", builtAt: 10, kind, record: 0, terms: [...terms] });
    }
    for (const list of ["competing", "query", "page"] as const) {
      const entries = list === "competing"
        ? searches.flatMap((_, search) => [0, 1].map((page) => ({ key: search, page, shown: page === 1 ? 1_200 : 800 })))
        : (list === "query" ? searches : pages).map((_, key) => ({ key, page: 0, shown: 2_000 }));
      const chunk = list === "competing" ? 2 : entries.length;
      for (let start = 0; start < entries.length; start += chunk) {
        const rows = entries.slice(start, start + chunk);
        await ctx.db.insert("searchConsolePeriods", {
          companyWebsiteId: holdId, searchType: "web", list, period: "lastQuarter", which: "NOW", part: start / chunk,
          from: "2026-07-01", to: "2026-09-30", builtAt: 10,
          keys: packNumbers(rows.map((row) => row.key)),
          clicks: packNumbers(rows.map((row) => row.shown / 20)),
          impressions: packNumbers(rows.map((row) => row.shown)),
          positionSums: packNumbers(rows.map((row) => row.shown * 12)),
          ...(list === "competing" ? { pages: packNumbers(rows.map((row) => row.page)) } : {}),
          ...(list === "query" ? { volumes: rows.map((_, i) => 1_000 - i * 100) } : {}),
        });
      }
    }
    return { holdId };
  });
}

describe("competing-page analysis through bounded reads", () => {
  test("preserves the existing calculation across stored parts and decodes both books", async () => {
    const t = harness();
    const { holdId } = await seed(t);
    const expected = await t.run(async (ctx) => await competingNow(ctx, (await ctx.db.get(holdId))!, "acme.test"));
    const actual = await t.action(internal.insightCompeting.groupsForRun, { holdId });
    expect(actual).not.toBeNull();
    expect(actual!.groups.length).toBeGreaterThan(0);
    const { titles, ...reading } = actual!;
    expect(reading).toEqual(expected);
    expect(titles).toEqual([]);
    expect(new Set(actual!.groups.flatMap((group) => group.searches.map((search) => search.search))))
      .toEqual(new Set(searches));
  });

  test("rejects a replaced build before reading another part", async () => {
    const t = harness();
    const { holdId } = await seed(t);
    await expect(t.query(internal.insightCompeting.groupListPart, { holdId, list: "competing", part: 1, builtAt: 9 }))
      .rejects.toThrow("Search Console changed");
  });

  test("enforces the small lookup batches", async () => {
    const t = harness();
    const { holdId } = await seed(t);
    await expect(t.query(internal.insightCompeting.groupPageData, { holdId, paths: Array.from({ length: 26 }, (_, i) => `/p-${i}/`) }))
      .rejects.toThrow("at most 25");
    await expect(t.query(internal.insightCompeting.groupSearchData, { holdId, searches: Array.from({ length: 26 }, (_, i) => `query ${i}`), kind: "difficulty" }))
      .rejects.toThrow("at most 25");
  });
  test("prepares separate specialist batches and replays their completed answers without paying again", async () => {
    const t = harness(), { holdId } = await seed(t);
    const run = await t.run(async (ctx) => {
      const hold = (await ctx.db.get(holdId))!;
      const allSearches = [...searches, ...searches.map((search) => `kitchen ${search}`)];
      const allPages = [...pages, "https://acme.test/kitchen-design/", "https://acme.test/kitchen-company/"];
      for (const list of ["competing", "query", "page"] as const) {
        const entries = list === "competing" ? allSearches.flatMap((search, at) => [0, 1].map((page) => ({ key: search, page: allPages[(at >= searches.length ? 2 : 0) + page] }))) : (list === "query" ? allSearches : allPages).map((key) => ({ key, page: "" }));
        await ctx.db.insert("searchConsolePeriods", { companyWebsiteId: holdId, searchType: "web", list, period: "lastQuarter", which: "NOW", part: 0, from: "2026-07-01", to: "2026-09-30", builtAt: 20,
          keys: entries.map((entry) => entry.key), clicks: entries.map(() => 50), impressions: entries.map(() => 1_000), positionSums: entries.map(() => 12_000), ...(list === "competing" ? { pages: entries.map((entry) => entry.page) } : {}) });
      }
      const agentId = await ctx.db.insert("agents", { name: "Insights", modelId: "test", thinkingMode: false, isActive: true, createdAt: 1, updatedAt: 1 });
      const runId = await ctx.db.insert("agentRuns", { agentId, companyId: hold.companyId, triggerType: "EVENT", objective: "Inspect", status: "RUNNING", startedAt: 1, updatedAt: 1 });
      return { runId, companyId: hold.companyId, holdId, host: "acme.test" };
    });
    generate.mockResolvedValue({ text: JSON.stringify({ owners: [], pages: [], headline: "Pages overlap", story: "Give each page a clear role." }), inputTokens: 100, outputTokens: 20 });
    const first = await t.action(async (ctx) => await competingForRun(ctx, run, "2026-10-26", "rules", undefined, { most: 1 }));
    expect(first.batch.complete).toBe(false);
    expect(first.problems).toEqual([]);
    expect(generate).toHaveBeenCalledTimes(1);
    const next = await t.action(async (ctx) => await competingForRun(ctx, run, "2026-10-26", "rules", undefined, { at: first.batch.next, most: 1, signature: first.batch.signature }));
    expect(next.batch.complete).toBe(true);
    expect(generate).toHaveBeenCalledTimes(2);
    const replay = await t.action(async (ctx) => await competingForRun(ctx, run, "2026-10-26", "rules", undefined, { cachedOnly: true }));
    expect(replay.problems).toEqual([]);
    expect(replay.competing?.groups.every((group) => group.decidedBy === "AGENT")).toBe(true);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(await t.run(async (ctx) => await ctx.db.query("agentTransactions").collect())).toHaveLength(2);
  });

});
