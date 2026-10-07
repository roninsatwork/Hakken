import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { finishScheduled } from "@/src/test/finishScheduled";

/**
 * A keyword a website stops ranking for is marked lost and kept 90 days — New
 * and lost and Wins and losses read the ones lost lately — then removed at the
 * website's next rebuild (keep-less-history-plan.md, 5.7; Anthony, Decision 6,
 * 2026-10-07: "agree"), so its rankings stop growing past what its list keeps.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
const UK = 2826;
const TODAY = "2026-10-07";
const daysAgo = (days: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse(`${TODAY}T12:00:00Z`));
});
afterEach(() => vi.useRealTimers());

describe("keywords lost 90 days ago", () => {
  test("are removed at the next rebuild; one lost lately, and one ranking, stay", async () => {
    const t = harness();
    const websiteId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Korda", createdAt: 1 });
      const websiteId = await ctx.db.insert("websites", { host: "kordatackle.com", displayHost: "kordatackle.com", firstSeenAt: 1 });
      await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", locationCode: UK, createdAt: 1 });
      const rank = (keyword: string, day: string, position?: number) => ctx.db.insert("siteKeywordRanks", {
        websiteId, locationCode: UK, keyword, band: position === undefined ? "zz_none" : "p01_03", page: "/rods",
        volume: 100, volumeKnown: true, intent: "BUYING", status: position === undefined ? "LOST" : "SAME", change: 0,
        day, firstSeenDay: daysAgo(400), ...(position === undefined ? {} : { position }),
      } as never);
      await rank("carp rods", daysAgo(2), 3);
      await rank("lost lately", daysAgo(30));
      await rank("lost long ago", daysAgo(120));
      return websiteId;
    });

    await t.action(internal.siteSummaries.rebuildSite, { websiteId, locationCode: UK });
    await finishScheduled(t);

    const kept = await t.run(async (ctx) => (await ctx.db.query("siteKeywordRanks").collect()).map((row) => row.keyword).sort());
    expect(kept).toEqual(["carp rods", "lost lately"]);
  });

  test("the measure counts what the next rebuild removes", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      const websiteId = await ctx.db.insert("websites", { host: "kordatackle.com", displayHost: "kordatackle.com", firstSeenAt: 1 });
      const rows: Array<[string, string, number | undefined]> = [["carp rods", daysAgo(2), 3], ["lost lately", daysAgo(30), undefined], ["lost long ago", daysAgo(120), undefined]];
      for (const [keyword, day, position] of rows) {
        await ctx.db.insert("siteKeywordRanks", {
          websiteId, locationCode: UK, keyword, band: "zz_none", page: "/", volume: 1, volumeKnown: true, intent: "BUYING",
          status: position === undefined ? "LOST" : "SAME", change: 0, day, firstSeenDay: day, ...(position === undefined ? {} : { position }),
        } as never);
      }
    });
    expect(await t.action(internal.seoStorageMeasure.measureLostRanks, {})).toEqual([{ host: "kordatackle.com", rows: 3, lost: 2, expired: 1 }]);
  });
});
