import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { chartPeriodsToFill, periodFigures } from "./searchConsoleHistoryDays";

/**
 * The days before collection began (searchConsoleHistoryDays.ts,
 * insights-intelligence-plan.md phase 9): written where none is held, never
 * over a day the collection holds, and the days' start said once all are in.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

describe("the days before collection began", () => {
  test("written where none is held, never over a collected day, and where the days begin said", async () => {
    const t = harness();
    const connectionId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
      const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
      const companyWebsiteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
      await ctx.db.insert("searchConsoleDays", { companyWebsiteId, searchType: "web", day: "2026-07-08", clicks: 12, impressions: 400, ctr: 0.03, position: 3, namedClicks: 9, fetchedAt: 1 });
      return await ctx.db.insert("searchConsoleConnections", {
        companyId, companyWebsiteId, websiteId, status: "CONNECTED", property: "sc-domain:acme-shop.test", permission: "siteOwner", dataProperty: "sc-domain:acme-shop.test",
        oldestDay: "2026-07-08", newestDay: "2026-09-26", createdAt: 1, updatedAt: 1,
      });
    });
    const day = (date: string, clicks: number) => ({ day: date, clicks, impressions: 100, ctr: clicks / 100, position: 9 });
    const written = await t.mutation(internal.searchConsoleHistoryDays.writeHistoryDays, {
      connectionId, property: "sc-domain:acme-shop.test", searchType: "web", rows: [day("2025-06-01", 2), day("2026-07-08", 99)], fetchedAt: 2,
    });
    expect(written).toBe(1);
    const days = await t.run(async (ctx) => await ctx.db.query("searchConsoleDays").take(10));
    expect(days.map((row) => [row.day, row.clicks, row.namedClicks ?? null]).sort()).toEqual([["2025-06-01", 2, null], ["2026-07-08", 12, 9]]);
    await t.mutation(internal.searchConsoleHistoryDays.markDaysFrom, { connectionId, property: "sc-domain:acme-shop.test", daysFrom: "2025-05-26" });
    const connection = await t.run(async (ctx) => await ctx.db.get(connectionId));
    // Where the days begin moves back; where collection began does not.
    expect(connection).toMatchObject({ daysFrom: "2025-05-26", oldestDay: "2026-07-08" });
    // Asked again, nothing is fetched: the days already reach Google's line.
    expect(await t.query(internal.searchConsoleHistoryDays.historyTarget, { connectionId })).toBeNull();
  });

  test("the charts' weeks and months: whole ones after Google's line, inside their reach, before collection began", () => {
    const months = (googleFrom: string, reach: string, oldest: string) =>
      chartPeriodsToFill(googleFrom, reach, oldest, "2026-10-10").filter((one) => one.grain === "MONTH").map((one) => one.start);
    const weeks = (googleFrom: string, reach: string, oldest: string) =>
      chartPeriodsToFill(googleFrom, reach, oldest, "2026-10-10").filter((one) => one.grain === "WEEK").map((one) => one.start);
    // Google's line falls mid-month, so its month is not whole: the next one starts.
    expect(months("2025-06-12", "2025-10-13", "2026-07-08")).toEqual(["2025-10-01", "2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01"]);
    expect(months("2025-06-12", "2025-01-06", "2026-07-08")[0]).toBe("2025-07-01");
    // Collection began on the 1st: that month is collected, not filled.
    expect(months("2026-05-01", "2025-01-06", "2026-07-01")).toEqual(["2026-05-01", "2026-06-01"]);
    // Ronins' sixteen weeks from 22 June, collection from Wednesday 8 July: two weeks, the week of the 6th collected.
    expect(weeks("2025-06-12", "2026-06-22", "2026-07-08")).toEqual(["2026-06-22", "2026-06-29"]);
    // Weeks only inside the six months kept as weeks (from 10 April here); months before that.
    expect(weeks("2025-06-12", "2025-10-13", "2026-04-29")).toEqual(["2026-04-13", "2026-04-20"]);
  });

  test("a month's bands and brand clicks read like the collected months: past the top 20 only when clicked", () => {
    const row = (key: string, position: number, clicks: number) => ({ key, position, clicks, impressions: 50 });
    expect(periodFigures([row("acme shoes", 1.5, 30), row("red shoes", 7, 4), row("blue shoes", 15, 0), row("green shoes", 42, 0), row("odd shoes", 60, 1)], ["acme"]))
      .toEqual({ top3: 1, top10: 1, top20: 1, rest: 1, brandClicks: 30, otherClicks: 5 });
  });

  test("a week's or month's chart row is written where none is held, never over a collected one", async () => {
    const t = harness();
    const { connectionId, companyWebsiteId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
      const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
      const companyWebsiteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
      await ctx.db.insert("searchConsoleWeeks", { companyWebsiteId, searchType: "web", grain: "MONTH", week: "2026-07-01", days: 24, top3: 9, top10: 9, top20: 9, rest: 9, brandClicks: 9, otherClicks: 9, builtAt: 1 });
      const connectionId = await ctx.db.insert("searchConsoleConnections", {
        companyId, companyWebsiteId, websiteId, status: "CONNECTED", property: "sc-domain:acme-shop.test", permission: "siteOwner", dataProperty: "sc-domain:acme-shop.test",
        oldestDay: "2026-07-08", newestDay: "2026-09-26", daysFrom: "2025-05-26", createdAt: 1, updatedAt: 1,
      });
      return { connectionId, companyWebsiteId };
    });
    const figures = { top3: 1, top10: 2, top20: 3, rest: 4, brandClicks: 5, otherClicks: 6 };
    const write = (grain: "WEEK" | "MONTH", start: string) =>
      t.mutation(internal.searchConsoleHistoryDays.writeChartPeriod, { connectionId, property: "sc-domain:acme-shop.test", searchType: "web", grain, start, days: 30, figures });
    expect(await write("MONTH", "2026-06-01")).toBe(true);
    expect(await write("MONTH", "2026-07-01")).toBe(false);
    expect(await write("MONTH", "2026-06-01")).toBe(false);
    // A week starting on the 1st is its own row beside the month.
    expect(await write("WEEK", "2026-06-01")).toBe(true);
    const rows = await t.run(async (ctx) => await ctx.db.query("searchConsoleWeeks").withIndex("by_hold_country_type_week", (q) => q.eq("companyWebsiteId", companyWebsiteId)).take(10));
    expect(rows.map((one) => [one.grain, one.week, one.top3]).sort()).toEqual([["MONTH", "2026-06-01", 1], ["MONTH", "2026-07-01", 9], ["WEEK", "2026-06-01", 1]]);
    // The charts' months alone can be asked again once the days are in.
    expect(await t.query(internal.searchConsoleHistoryDays.historyTarget, { connectionId })).toBeNull();
    expect(await t.query(internal.searchConsoleHistoryDays.historyTarget, { connectionId, again: true })).toMatchObject({ oldestDay: "2026-07-08" });
  });
});
