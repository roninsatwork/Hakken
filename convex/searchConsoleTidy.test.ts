import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { isPageRef } from "./searchConsolePageRefs";

/**
 * Search Console's figures kept before 2026-10-05 brought to what is kept
 * from then, on every website (docs/plans/active/finish-off-plan.md, items 2
 * and 12): counted first without a change, then changed.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
const NEWEST = "2026-09-26";

async function setup() {
  const t = harness();
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", searchConsoleCountries: ["gbr"], createdAt: 1 });
    await ctx.db.insert("searchConsoleConnections", {
      companyId, companyWebsiteId: holdId, websiteId, status: "NEEDS_RECONNECT", googleAccount: "owner@acme-shop.test",
      property: "sc-domain:acme-shop.test", permission: "siteOwner", newestDay: NEWEST, oldestDay: "2026-06-29",
      countriesHeld: [{ country: "gbr", newestDay: NEWEST, oldestDay: "2026-06-29" }],
      // Judged so on an earlier run; with too few days held to judge again, it stays so.
      countriesAsAll: ["gbr"],
      createdAt: 1, updatedAt: 1,
    });
    const list = (fields: Record<string, unknown>) => ctx.db.insert("searchConsoleLists", {
      companyWebsiteId: holdId, searchType: "web", list: "device", grain: "DAY", start: NEWEST, part: 0,
      keys: ["MOBILE"], clicks: [1], impressions: [10], positionSums: [20], fetchedAt: 1, ...fields,
    } as never);
    // All countries: a pair list and a page list holding addresses, kept before references.
    await list({ list: "pair", keys: ["plumber leeds"], pages: ["https://acme-shop.test/"] });
    await list({ list: "page", keys: ["https://acme-shop.test/"] });
    // The United Kingdom's copy of the same lines, and its devices, which stay.
    await list({ country: "gbr", list: "pair", keys: ["plumber leeds"], pages: ["https://acme-shop.test/"] });
    await list({ country: "gbr", list: "page", keys: ["https://acme-shop.test/"] });
    await list({ country: "gbr" });
    // Google Images' searches, no longer kept (store less round two, A).
    await list({ searchType: "image", list: "pair", keys: ["brass knob"], pages: ["https://acme-shop.test/"] });
    await ctx.db.insert("searchConsoleSeen", { companyWebsiteId: holdId, searchType: "image", kind: "query", key: "brass knob", firstDay: NEWEST, lastDay: NEWEST });
    // Image search: two days of the week before the newest, and one of the newest's week.
    for (const start of ["2026-09-15", "2026-09-16", "2026-09-21"]) await list({ searchType: "image", start });
    await ctx.db.insert("searchConsoleSeen", { companyWebsiteId: holdId, country: "gbr", kind: "query", key: "plumber leeds", firstDay: NEWEST, lastDay: NEWEST });
    await ctx.db.insert("searchConsoleSeen", { companyWebsiteId: holdId, kind: "query", key: "plumber leeds", firstDay: NEWEST, lastDay: NEWEST });
    return { holdId };
  });
  return { t, ...ids };
}

describe("tidying the figures kept before 2026-10-05", () => {
  test("counts first and changes nothing, then turns the addresses; a kept country's searches and New and lost stay, and image days are left to the switch (2026-10-06)", async () => {
    const { t } = await setup();
    const before = await t.run(async (ctx) => (await ctx.db.query("searchConsoleLists").collect()).length);

    const counted = await t.action(internal.searchConsoleTidy.tidyKeptFigures, { go: false });
    // Counting changes nothing, so a record two steps would each remove is counted by both.
    // No country is read as all countries since all countries stopped being kept (search-console-home-countries-plan.md).
    expect(counted?.tally).toEqual({ websites: 1, countries: 0, copies: 0, seen: 0, addresses: 5, imageDays: 0, imageSearches: 2, register: 1, unkept: 0 });
    expect(await t.run(async (ctx) => (await ctx.db.query("searchConsoleLists").collect()).length)).toBe(before);

    const done = await t.action(internal.searchConsoleTidy.tidyKeptFigures, { go: true });
    expect(done?.tally).toMatchObject({ websites: 1, countries: 0, copies: 0, seen: 0, imageSearches: 2 });

    const kept = await t.run(async (ctx) => await ctx.db.query("searchConsoleLists").collect());
    expect(kept.filter((record) => record.country === "gbr").map((record) => record.list).sort()).toEqual(["device", "page", "pair"]);
    const pair = kept.find((record) => record.list === "pair")!;
    expect(pair.pages!.every(isPageRef)).toBe(true);
    expect(kept.find((record) => record.list === "page")!.keys.every(isPageRef)).toBe(true);
    expect(kept.filter((record) => record.searchType === "image" && record.list === "pair")).toEqual([]);
    expect(kept.filter((record) => record.searchType === "image").map((record) => `${record.grain} ${record.start}`).sort())
      .toEqual(["DAY 2026-09-15", "DAY 2026-09-16", "DAY 2026-09-21"]);
    const seen = await t.run(async (ctx) => await ctx.db.query("searchConsoleSeen").collect());
    expect(seen.map((row) => row.country).sort()).toEqual(["gbr", undefined]);
    // The website's periods are asked to be built again from what is left.
    const asked = await t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).map((job) => job.name));
    expect(asked.some((name) => name.includes("rebuildSitePeriods"))).toBe(true);

    // What is kept, measured: the country's searches and pages kept, the page references counted.
    const [size] = await t.action(internal.searchConsoleTidy.keptSize, { host: "acme-shop.test" });
    expect(size.complete).toBe(true);
    expect(size.buckets.map((bucket) => bucket.name)).toContain("searchConsoleLists: a country's searches and pages");
    expect(size.buckets.find((bucket) => bucket.name === "searchConsolePageRefs")?.records).toBe(1);
    expect(await t.action(internal.searchConsoleTidy.keptSize, { host: "elsewhere.test" })).toEqual([]);

    // A second run finds nothing left to do.
    const again = await t.action(internal.searchConsoleTidy.tidyKeptFigures, { go: false });
    expect(again?.tally).toEqual({ websites: 1, countries: 0, copies: 0, seen: 0, addresses: 0, imageDays: 0, imageSearches: 0, register: 0, unkept: 0 });
  });

  test("searches not kept go from the lines kept and the register, judged on the 90 days; a website without them is left alone (round two, D)", async () => {
    const { t, holdId } = await setup();
    const line = (keys: string[]) => ({
      companyWebsiteId: holdId, searchType: "web" as const, list: "pair" as const, grain: "DAY" as const, start: "2026-09-20", part: 0, fetchedAt: 1,
      keys, pages: keys.map(() => "https://acme-shop.test/"), clicks: keys.map(() => 0), impressions: keys.map(() => 10), positionSums: keys.map(() => 350),
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("searchConsoleLists", line(["almost there", "deep and lonely"]));
      for (const key of ["almost there", "deep and lonely"]) {
        await ctx.db.insert("searchConsoleSeen", { companyWebsiteId: holdId, kind: "query", key, firstDay: "2026-09-20", lastDay: "2026-09-20" });
      }
    });
    const linesOf = () => t.run(async (ctx) => (await ctx.db.query("searchConsoleLists").collect())
      .filter((record) => record.start === "2026-09-20" && record.list === "pair").flatMap((record) => record.keys));
    // No 90 days built yet: nothing judged, nothing removed.
    expect((await t.action(internal.searchConsoleTidy.tidyKeptFigures, { go: true }))?.tally.unkept).toBe(0);
    expect(await linesOf()).toEqual(["almost there", "deep and lonely"]);

    // The 90 days: "almost there" at position 12, "deep and lonely" at 35 on one page, neither clicked.
    await t.run(async (ctx) => await ctx.db.insert("searchConsolePeriods", {
      companyWebsiteId: holdId, searchType: "web", list: "query", period: "90", which: "NOW", part: 0, from: "2026-06-29", to: NEWEST,
      keys: ["almost there", "deep and lonely"], clicks: [0, 0], impressions: [10, 10], positionSums: [120, 350], counts: [1, 1], builtAt: 1,
    }));
    // "deep and lonely", and the setup's "plumber leeds", missing from the 90 days: each a line and a register row.
    expect((await t.action(internal.searchConsoleTidy.tidyKeptFigures, { go: true }))?.tally.unkept).toBe(4);
    expect(await linesOf()).toEqual(["almost there"]);
    const register = await t.run(async (ctx) => (await ctx.db.query("searchConsoleSeen").collect()).filter((row) => row.country === undefined && row.searchType === undefined).map((row) => row.key));
    expect(register).toEqual(["almost there"]);
  });
});
