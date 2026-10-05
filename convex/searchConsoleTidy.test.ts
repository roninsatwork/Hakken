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
    // Image search: two days of the week before the newest, and one of the newest's week.
    for (const start of ["2026-09-15", "2026-09-16", "2026-09-21"]) await list({ searchType: "image", start });
    await ctx.db.insert("searchConsoleSeen", { companyWebsiteId: holdId, country: "gbr", kind: "query", key: "plumber leeds", firstDay: NEWEST, lastDay: NEWEST });
    await ctx.db.insert("searchConsoleSeen", { companyWebsiteId: holdId, kind: "query", key: "plumber leeds", firstDay: NEWEST, lastDay: NEWEST });
    return { holdId };
  });
  return { t, ...ids };
}

describe("tidying the figures kept before 2026-10-05", () => {
  test("counts first and changes nothing, then removes the country's copy, turns the addresses and rolls image days into weeks", async () => {
    const { t } = await setup();
    const before = await t.run(async (ctx) => (await ctx.db.query("searchConsoleLists").collect()).length);

    const counted = await t.action(internal.searchConsoleTidy.tidyKeptFigures, { go: false });
    expect(counted?.tally).toEqual({ websites: 1, countries: 1, copies: 2, seen: 1, addresses: 4, imageDays: 2 });
    expect(counted?.lines[0]).toBe("acme-shop.test: gbr read as all countries; 2 country records and 1 register rows to remove; 4 records to turn to page references; 2 image days to roll into weeks.");
    expect(await t.run(async (ctx) => (await ctx.db.query("searchConsoleLists").collect()).length)).toBe(before);

    const done = await t.action(internal.searchConsoleTidy.tidyKeptFigures, { go: true });
    expect(done?.tally).toMatchObject({ websites: 1, countries: 1, copies: 2, seen: 1, addresses: 2 });

    const kept = await t.run(async (ctx) => await ctx.db.query("searchConsoleLists").collect());
    expect(kept.filter((record) => record.country === "gbr").map((record) => record.list)).toEqual(["device"]);
    const pair = kept.find((record) => record.list === "pair")!;
    expect(pair.pages!.every(isPageRef)).toBe(true);
    expect(kept.find((record) => record.list === "page")!.keys.every(isPageRef)).toBe(true);
    expect(kept.filter((record) => record.searchType === "image").map((record) => `${record.grain} ${record.start}`).sort())
      .toEqual(["DAY 2026-09-21", "WEEK 2026-09-14"]);
    const seen = await t.run(async (ctx) => await ctx.db.query("searchConsoleSeen").collect());
    expect(seen.map((row) => row.country)).toEqual([undefined]);
    // The website's periods are asked to be built again from what is left.
    const asked = await t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).map((job) => job.name));
    expect(asked.some((name) => name.includes("rebuildSitePeriods"))).toBe(true);

    // A second run finds nothing left to do.
    const again = await t.action(internal.searchConsoleTidy.tidyKeptFigures, { go: false });
    expect(again?.tally).toEqual({ websites: 1, countries: 1, copies: 0, seen: 0, addresses: 0, imageDays: 0 });
  });
});
