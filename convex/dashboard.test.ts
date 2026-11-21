import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { addDays, addMeasures } from "./dashboard";
import { MENU_FEATURES } from "./utils/coreModules";
import { writeFeaturesOff } from "./utils/featureSwitchReads";

/**
 * The client Dashboard's four numbers (docs/plans/active/dashboard-way-1-plan-2026-11-21.md, "The one new read"):
 * several websites add up day by day, a "before" is only said when every website has one, and a section switched off
 * for the company or for everyone is left out rather than read.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

async function seed(t: ReturnType<typeof harness>, featuresOff?: string[], everyoneOff?: string[]) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const companyId = await ctx.db.insert("companies", { name: "Korda", createdAt: now });
    if (featuresOff) await writeFeaturesOff(ctx, companyId, featuresOff);
    if (everyoneOff) await writeFeaturesOff(ctx, undefined, everyoneOff);
    const websiteId = await ctx.db.insert("websites", { host: "kordatacle.com", displayHost: "kordatacle.com", firstSeenAt: now });
    const rivalId = await ctx.db.insert("websites", { host: "nashtackle.co.uk", displayHost: "nashtackle.co.uk", firstSeenAt: now });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: now });
    await ctx.db.insert("companyWebsites", { companyId, websiteId: rivalId, relationship: "TRACKED", againstWebsiteId: websiteId, createdAt: now });
    const memberId = await ctx.db.insert("users", { name: "Member", email: "member@test.com", role: "USER", companyId, createdAt: now });
    return { companyId, holdId, memberId };
  });
}

describe("adding up a company's websites", () => {
  test("adds days from several websites day by day, oldest first", () => {
    expect(addDays([
      [{ day: "2026-10-02", value: 3 }, { day: "2026-10-01", value: 1 }],
      [{ day: "2026-10-01", value: 4 }],
    ])).toEqual([{ day: "2026-10-01", value: 5 }, { day: "2026-10-02", value: 3 }]);
  });

  test("says the figure before only when every website has one", () => {
    const one = { now: 10, before: 8, days: [] };
    expect(addMeasures([one, { now: 5, before: 2, days: [] }])).toMatchObject({ now: 15, before: 10 });
    expect(addMeasures([one, { now: 5, before: null, days: [] }])).toMatchObject({ now: 15, before: null });
    expect(addMeasures([])).toBeNull();
  });
});

describe("the Dashboard's four numbers", () => {
  test("a website with nothing collected yet leaves both sections empty, and counts only own websites", async () => {
    const t = harness();
    const seeded = await seed(t);
    const figures = await t.withIdentity({ subject: seeded.memberId }).query(api.dashboard.dashboardFigures, { period: "lastMonth" });
    expect(figures.sites).toEqual([seeded.holdId]);
    expect(figures.analytics).toBeNull();
    expect(figures.searchConsole).toBeNull();
    expect(figures.shop).toBe(false);
  });

  test("a section switched off for the company is left out, and the read doesn't throw", async () => {
    const t = harness();
    const seeded = await seed(t, [MENU_FEATURES.googleAnalytics, MENU_FEATURES.searchConsole]);
    const figures = await t.withIdentity({ subject: seeded.memberId }).query(api.dashboard.dashboardFigures, { period: "last3Months" });
    expect(figures.analytics).toBeNull();
    expect(figures.searchConsole).toBeNull();
  });

  test("a section switched off for everyone is left out too", async () => {
    const t = harness();
    const seeded = await seed(t, undefined, [MENU_FEATURES.searchConsole]);
    const figures = await t.withIdentity({ subject: seeded.memberId }).query(api.dashboard.dashboardFigures, { period: "lastMonth" });
    expect(figures.searchConsole).toBeNull();
  });

  test("the Website menu narrows it to one own website, and a rival can't be asked for", async () => {
    const t = harness();
    const seeded = await seed(t);
    const asker = t.withIdentity({ subject: seeded.memberId });
    expect((await asker.query(api.dashboard.dashboardFigures, { period: "lastMonth", siteId: seeded.holdId })).sites).toEqual([seeded.holdId]);
    const rivalHold = await t.run(async (ctx) => (await ctx.db.query("companyWebsites").collect()).find((hold) => hold.relationship === "TRACKED")!._id);
    expect((await asker.query(api.dashboard.dashboardFigures, { period: "lastMonth", siteId: rivalHold })).sites).toEqual([]);
  });
});
