import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { shiftDay, spanCovered } from "./searchConsoleDays";
import { googleHasSpan } from "./searchConsolePeriodReads";
import { titlesOf } from "./pageTitles";

/**
 * A span before Google has no figures for is never set against (search-console-pages-way-1-plan-2026-11-17.md): More
 * Handles' Last 6 months held 23 of its 183 days before, Google having none from 11 August 2025 to 22 April 2026, and
 * every page looked up sevenfold. And a title two pages share is kept by the busier: three of its rows read the same.
 */

const days = (from: string, to: string) => {
  const all: string[] = [];
  for (let day = from; day <= to; day = shiftDay(day, 1)) all.push(day);
  return all;
};

describe("Google's figures for a span", () => {
  test("a quiet day or week is a day of nothing; a stretch of 28 days or more without figures is no span", () => {
    const held = days("2026-04-23", "2026-11-15");
    expect(spanCovered(held, "2026-05-16", "2026-08-15")).toBe(true);
    expect(spanCovered(held, "2025-11-16", "2026-05-15")).toBe(false);
    // Two weeks with no row at all inside a month: quiet, still compared.
    const quiet = held.filter((day) => day < "2026-09-01" || day > "2026-09-14");
    expect(spanCovered(quiet, "2026-09-01", "2026-09-30")).toBe(true);
    // Four weeks without one: Google has nothing for them.
    const gone = held.filter((day) => day < "2026-09-01" || day > "2026-09-28");
    expect(spanCovered(gone, "2026-09-01", "2026-09-30")).toBe(false);
    // A short span with no rows at all is a short span of nothing.
    expect(spanCovered([], "2026-09-01", "2026-09-07")).toBe(true);
  });

  test("judged on the days a website is meant to hold, from where its history begins", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const holdOf = async (daysFrom: string | undefined, held: string[]) => await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
      const websiteId = await ctx.db.insert("websites", { host: "acme.test", displayHost: "acme.test", firstSeenAt: 1 });
      const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
      await ctx.db.insert("searchConsoleConnections", {
        companyId, companyWebsiteId: siteId, websiteId, status: "CONNECTED", property: "sc-domain:acme.test",
        newestDay: "2026-11-15", oldestDay: "2026-07-08", ...(daysFrom ? { daysFrom } : {}), createdAt: 1, updatedAt: 1,
      });
      for (const day of held) await ctx.db.insert("searchConsoleDays", { companyWebsiteId: siteId, searchType: "web", day, clicks: 1, impressions: 10, ctr: 0.1, position: 5, fetchedAt: 1 });
      return siteId;
    });
    const has = async (siteId: Id<"companyWebsites">, from: string, to: string) => await t.run(async (ctx) => await googleHasSpan(ctx, siteId, from, to));
    // More Handles: history said to begin on 11 June 2025, nothing held from 11 August 2025 to 22 April 2026.
    const gapped = await holdOf("2025-06-11", [...days("2025-06-11", "2025-08-10"), ...days("2026-04-23", "2026-11-15")]);
    expect(await has(gapped, "2025-11-16", "2026-05-15")).toBe(false);
    expect(await has(gapped, "2026-05-16", "2026-08-15")).toBe(true);
    // History never fetched: the days before collection began were asked of Google week by week, so they're left as they are.
    const unfetched = await holdOf(undefined, days("2026-07-08", "2026-11-15"));
    expect(await has(unfetched, "2026-04-07", "2026-07-07")).toBe(true);
  });
});

describe("a title two pages share", () => {
  test("is kept by the busier page; the others show their address", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const titles = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
      const websiteId = await ctx.db.insert("websites", { host: "acme.test", displayHost: "acme.test", firstSeenAt: 1 });
      const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
      const page = { companyWebsiteId: holdId, crawled: true, shown: true, ranks: true };
      await ctx.db.insert("holdPages", { ...page, page: "/", clicks: 396, title: "Acme | Handles" });
      await ctx.db.insert("holdPages", { ...page, page: "/home", clicks: 23, title: "Acme | Handles" });
      await ctx.db.insert("holdPages", { ...page, page: "/hinges", clicks: 40, title: "Hinges | Acme" });
      return [...await titlesOf(ctx, holdId, ["https://acme.test/", "https://acme.test/home", "https://acme.test/hinges", "https://acme.test/?utm_source=GMB"])];
    });
    // The home page's link from Google Business, its address with a query, shows its address too.
    expect(titles).toEqual([["https://acme.test/", "Acme | Handles"], ["https://acme.test/hinges", "Hinges | Acme"]]);
  });
});
