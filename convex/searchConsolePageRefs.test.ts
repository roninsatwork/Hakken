import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { decodePages, isPageRef } from "./searchConsolePageRefs";

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

    // Read back for the periods exactly as before.
    const kept = await t.query(internal.searchConsoleRollups.keptBetween, {
      companyWebsiteId: holdId, searchType: "web", list: "pair", grain: "DAY", from: "2026-10-01", to: "2026-10-01", cursor: null,
    });
    expect(kept.records[0].pages).toEqual(pages);
    expect(kept.records[0].keys).toEqual(["door handles", "brass knobs", "lever"]);
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
    expect(new Set(record.keys).size).toBe(1_200);
    expect(record.keys.every(isPageRef)).toBe(true);
    expect(await t.run(async (ctx) => await decodePages(ctx, holdId, record.keys))).toEqual(pages);
  });
});
