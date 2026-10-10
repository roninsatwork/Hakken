import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { decodePages, isPageRef, PAGE_RECORD } from "./holdPageRefs";

/**
 * Each page address kept once per website, the kept lists pointing to it
 * (docs/plans/active/finish-off-plan.md, item 2A) — and the addresses kept
 * before, turned into references without changing what any screen reads.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

describe("page addresses kept once", () => {
  test("addresses kept before become references, read back the same, and a second turning changes nothing", async () => {
    const t = harness();
    const holdId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: Date.now() });
      const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: Date.now() });
      return await ctx.db.insert("companyWebsites", { companyId, websiteId, createdAt: Date.now() } as never) as Id<"companyWebsites">;
    });
    const pages = ["https://acme-shop.test/a", "https://acme-shop.test/b", "https://acme-shop.test/a"];
    await t.run(async (ctx) => {
      const base = { companyWebsiteId: holdId, searchType: "web" as const, grain: "DAY" as const, start: "2026-10-01", part: 0, fetchedAt: 1 };
      await ctx.db.insert("searchConsoleLists", { ...base, list: "pair", keys: ["door handles", "brass knobs", "lever"], pages, clicks: [1, 2, 3], impressions: [4, 5, 6], positionSums: [7, 8, 9] });
      await ctx.db.insert("searchConsoleLists", { ...base, list: "page", keys: ["https://acme-shop.test/a"], clicks: [6], impressions: [15], positionSums: [24] });
      await ctx.db.insert("searchConsoleLists", { ...base, list: "device", keys: ["MOBILE"], clicks: [6], impressions: [15], positionSums: [24] });
    });
    const turn = () => t.action(internal.searchConsolePageRefs.encodeKeptPages, { holds: [holdId] });
    const stored = () => t.run(async (ctx) => await ctx.db.query("searchConsoleLists").collect());

    await turn();
    const records = await stored();
    // Turned again, nothing changes.
    await turn();
    expect(await stored()).toEqual(records);

    const pair = records.find((record) => record.list === "pair")!;
    const page = records.find((record) => record.list === "page")!;
    const device = records.find((record) => record.list === "device")!;
    expect(pair.pages!.every(isPageRef)).toBe(true);
    expect(pair.pages![0]).toBe(pair.pages![2]);
    expect(page.keys).toEqual([pair.pages![0]]);
    expect(device.keys).toEqual(["MOBILE"]);
    expect(await t.run(async (ctx) => await decodePages(ctx, holdId, pair.pages!))).toEqual(pages);

    // Read as kept, references and all; the action reading them turns them back with the page list read once.
    const kept = await t.query(internal.searchConsoleRollups.keptBetween, {
      companyWebsiteId: holdId, searchType: "web", list: "pair", grain: "DAY", from: "2026-10-01", to: "2026-10-01", cursor: null,
    });
    expect(kept.records[0].pages).toEqual(pair.pages);
    expect(kept.records[0].keys).toEqual(["door handles", "brass knobs", "lever"]);
    const book = await t.query(internal.holdPageRefs.pageListPart, { holdId, cursor: null });
    expect(book.records.flatMap((record) => record.addresses)).toEqual(["https://acme-shop.test/a", "https://acme-shop.test/b"]);
  });

  test("a day of more addresses than one step may look up is turned a few hundred at a time", async () => {
    const t = harness();
    const holdId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: Date.now() });
      const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: Date.now() });
      return await ctx.db.insert("companyWebsites", { companyId, websiteId, createdAt: Date.now() } as never) as Id<"companyWebsites">;
    });
    const pages = Array.from({ length: 1_200 }, (_, index) => `https://acme-shop.test/p/${index}`);
    await t.run(async (ctx) => {
      await ctx.db.insert("searchConsoleLists", {
        companyWebsiteId: holdId, searchType: "web", list: "page", grain: "DAY", start: "2026-10-01", part: 0, fetchedAt: 1,
        keys: pages, clicks: pages.map(() => 1), impressions: pages.map(() => 2), positionSums: pages.map(() => 3),
      });
    });

    await t.action(internal.searchConsolePageRefs.encodeKeptPages, { holds: [holdId] });
    const [record] = await t.run(async (ctx) => await ctx.db.query("searchConsoleLists").collect());
    // A page list's keys are addresses as references, never a keyword book's places.
    const keys = typeof record.keys === "string" ? [] : record.keys;
    expect(new Set(keys).size).toBe(1_200);
    expect(keys.every(isPageRef)).toBe(true);
    expect(await t.run(async (ctx) => await decodePages(ctx, holdId, keys))).toEqual(pages);
  });
});

describe("a website's page list, 250 addresses a record", () => {
  const holdOf = (t: ReturnType<typeof harness>) => t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
    return await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
  });
  const records = (t: ReturnType<typeof harness>) => t.run(async (ctx) => (await ctx.db.query("holdPageAddresses").collect())
    .sort((left, right) => left.record - right.record).map((one) => [one.record, one.addresses.length]));

  test("new pages go on the end, filling the last record first; a number once given never moves", async () => {
    const t = harness();
    const holdId = await holdOf(t);
    const first = Array.from({ length: PAGE_RECORD + 100 }, (_, index) => `https://acme-shop.test/a/${index}`);
    const more = Array.from({ length: 200 }, (_, index) => `https://acme-shop.test/b/${index}`);

    expect(await t.mutation(internal.holdPageRefs.addPages, { holdId, from: 0, pages: first })).toBe(0);
    expect(await records(t)).toEqual([[0, PAGE_RECORD], [1, 100]]);
    expect(await t.mutation(internal.holdPageRefs.addPages, { holdId, from: first.length, pages: more })).toBe(first.length);
    expect(await records(t)).toEqual([[0, PAGE_RECORD], [1, PAGE_RECORD], [2, 50]]);

    const refs = [0, PAGE_RECORD + 99, first.length, first.length + 199].map((number) => `~${number.toString(36)}`);
    expect(await t.run(async (ctx) => await decodePages(ctx, holdId, [...refs, "https://acme-shop.test/kept-before"]))).toEqual([
      first[0], first[PAGE_RECORD + 99], more[0], more[199], "https://acme-shop.test/kept-before",
    ]);
  });

  test("a list another run has added to since it was read is not added to", async () => {
    const t = harness();
    const holdId = await holdOf(t);
    await t.mutation(internal.holdPageRefs.addPages, { holdId, from: 0, pages: ["https://acme-shop.test/a"] });
    // Read when it was empty: the page it would add may be there already.
    expect(await t.mutation(internal.holdPageRefs.addPages, { holdId, from: 0, pages: ["https://acme-shop.test/a"] })).toBeNull();
    expect(await records(t)).toEqual([[0, 1]]);
  });
});
