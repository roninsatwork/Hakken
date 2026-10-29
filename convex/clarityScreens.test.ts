import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { emptyTotals, type ClarityTotalsRow } from "./utils/clarityRows";
import { finishScheduled } from "@/src/test/finishScheduled";
import { useFixedDay } from "@/src/test/realTime";

/**
 * Microsoft Clarity's screens read (agents-and-clarity-plan.md, Part 4,
 * CS1–CS9): every figure from the same totals, set against the days before,
 * narrowed to the device chosen, too few visits counted rather than left
 * out, the website's own titles and groups on its pages, and the recordings
 * picked over the days shown.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

const row = (page: string | null, device: string, visits: number, scroll: number, extra: Partial<ClarityTotalsRow> = {}): ClarityTotalsRow => ({ ...emptyTotals(), page, device, visits, users: visits, pagesSum: visits * 150, scrollSum: Math.round(scroll * 10 * visits), activeSum: visits * 40, ...extra });

async function seed(t: Harness) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Ronins", createdAt: 1 });
    const userId = await ctx.db.insert("users", { email: "owner@ronins.test", role: "ADMIN", companyId });
    const websiteId = await ctx.db.insert("websites", { host: "ronins.test", displayHost: "ronins.test", firstSeenAt: 1 });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    await ctx.db.insert("clarityConnections", { companyId, companyWebsiteId: holdId, status: "CONNECTED", tokenCiphertext: "x", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("holdPages", { companyWebsiteId: holdId, page: "/ai-agency/", crawled: true, shown: true, clicks: 0, ranks: true, title: "AI Agency | London" });
    return { userId, holdId };
  });
}

async function keep(t: Harness, holdId: Id<"companyWebsites">, day: string, rows: { pages: ClarityTotalsRow[]; site: ClarityTotalsRow[]; sources?: { site: ClarityTotalsRow[]; pages: ClarityTotalsRow[] }; browsers?: { site: ClarityTotalsRow[]; pages: ClarityTotalsRow[] } }) {
  await t.mutation(internal.clarity.saveDay, { holdId, day, ...rows, problem: null, refused: false });
  await finishScheduled(t);
}

/** Two days in last month (September, on the fixed 1 October), and two in the month before; `earlier` leaves the second of those out. */
async function threeDays(t: Harness, holdId: Id<"companyWebsites">, earlier = 2) {
  for (const day of ["2026-08-20", "2026-08-21"].slice(0, earlier)) {
    await keep(t, holdId, day, {
      pages: [row("/ai-agency/", "PC", 10, 30)],
      site: [row(null, "PC", 10, 30)],
    });
  }
  await keep(t, holdId, "2026-09-29", {
    pages: [row("/ai-agency/", "PC", 10, 20, { errors: 2, errorClicks: 1 }), row("/ai-agency/", "Mobile", 4, 10, { quickBack: 3 }), row("/hub/prism/", "PC", 6, 60)],
    site: [row(null, "PC", 16, 30, { bots: 5, errors: 2, errorClicks: 1 }), row(null, "Mobile", 4, 10, { quickBack: 3 })],
    sources: { site: [row(null, "PC", 12, 30, { split: "google" }), row(null, "PC", 4, 30, { split: "Direct" }), row(null, "Mobile", 4, 10, { split: "google" })], pages: [row("/ai-agency/", "PC", 10, 20, { split: "google" })] },
    browsers: { site: [row(null, "PC", 16, 30, { split: "Chrome", errors: 2 }), row(null, "Mobile", 4, 10, { split: "Safari" })], pages: [row("/ai-agency/", "PC", 10, 20, { split: "Chrome", errors: 2, errorClicks: 1 })] },
  });
  await keep(t, holdId, "2026-09-30", {
    pages: [row("/ai-agency/", "PC", 6, 26)],
    site: [row(null, "PC", 6, 26)],
  });
}

describe("Microsoft Clarity's screens", () => {
  beforeEach(() => useFixedDay());
  afterEach(() => vi.useRealTimers());

  test("Overview: the website's figures against the month before, its pages, groups, devices, sources and errors, from the same totals", async () => {
    const t = harness();
    const { userId, holdId } = await seed(t);
    await threeDays(t, holdId);
    await t.run(async (ctx) => {
      await ctx.db.insert("clarityRecordings", { companyWebsiteId: holdId, day: "2026-09-29", kind: "LONGEST", link: "https://clarity.microsoft.com/player/p/u/1", startedAt: 2, activeSeconds: 300, totalSeconds: 400, pages: 2, clicks: 1, page: "/hub/prism/", visited: ["/hub/prism/"], referrer: "google.com", createdAt: 1 });
      await ctx.db.insert("clarityRecordings", { companyWebsiteId: holdId, day: "2026-09-29", kind: "ERRORS", link: "https://clarity.microsoft.com/player/p/u/2", startedAt: 1, activeSeconds: 30, totalSeconds: 40, pages: 1, clicks: 2, page: "/ai-agency/", visited: ["/ai-agency/"], referrer: null, createdAt: 1 });
    });
    const overview = await t.withIdentity({ subject: userId }).query(api.clarityScreens.clarityOverview, { siteId: holdId, period: "lastMonth" });

    expect(overview.period).toEqual({ now: { from: "2026-09-29", to: "2026-09-30", days: 2 }, before: { from: "2026-08-20", to: "2026-08-21", days: 2 }, firstDay: "2026-08-20", countedFrom: null, pages: null, cutDays: 0, expected: 30, waiting: false, preparing: false, newest: "2026-09-30" });
    expect(overview.now).toMatchObject({ visits: 26, bots: 5, errors: 2, errorClicks: 1, quickBack: 3 });
    expect(overview.before).toMatchObject({ visits: 20, scroll: 30 });
    expect(overview.byDay.map((day) => [day.day, day.visits])).toEqual([["2026-09-29", 20], ["2026-09-30", 6]]);
    expect(overview.pages).toMatchObject({ count: 2, few: 1 });
    // The busiest page carries its title and its scroll against the days before.
    expect(overview.pages.top[0]).toMatchObject({ page: "/ai-agency/", title: "AI Agency | London", scrollBefore: 30 });
    expect(overview.pages.top[0].now.visits).toBe(20);
    expect(overview.devices.map((device) => [device.name, device.now.visits])).toEqual([["PC", 22], ["Mobile", 4]]);
    expect(overview.sources?.rows.map((source) => [source.name, source.now.visits])).toEqual([["google", 16], ["Direct", 4]]);
    expect(overview.errors.pages.map((entry) => [entry.line.page, entry.mostly])).toEqual([["/ai-agency/", { browser: "Chrome", device: "PC" }]]);
    expect(overview.stuck.quickBackPage).toEqual({ page: "/ai-agency/", visits: 3 });
    // What went wrong first.
    expect(overview.recordings.top.map((recording) => recording.kind)).toEqual(["ERRORS", "LONGEST"]);
  });

  test("the days before are set against the days shown only when as many of them were recorded", async () => {
    const t = harness();
    const { userId, holdId } = await seed(t);
    await threeDays(t, holdId, 1);
    const overview = await t.withIdentity({ subject: userId }).query(api.clarityScreens.clarityOverview, { siteId: holdId, period: "lastMonth" });
    expect(overview.period.before).toBeNull();
    expect(overview.before).toBeNull();
    expect(overview.pages.top[0].scrollBefore).toBeNull();
  });

  test("errors and pages a visit are counted only over the days that hold them, never as none on the days kept before", async () => {
    const t = harness();
    const { userId, holdId } = await seed(t);
    // A day kept before 2026-10-16: visits, and no people, errors or pages a visit read.
    await keep(t, holdId, "2026-09-28", { pages: [], site: [row(null, "PC", 30, 30, { users: 0, pagesSum: 0 })] });
    await keep(t, holdId, "2026-09-29", { pages: [row("/", "PC", 10, 30)], site: [row(null, "PC", 10, 30, { errors: 1 })] });
    const overview = await t.withIdentity({ subject: userId }).query(api.clarityScreens.clarityOverview, { siteId: holdId, period: "lastMonth" });
    expect(overview.period.countedFrom).toBe("2026-09-29");
    // The day kept before holds the website's figures only: each page's own start the day after.
    expect(overview.period.pages).toEqual({ days: 1, from: "2026-09-29" });
    expect(overview.now).toMatchObject({ visits: 40, pagesPerVisit: 1.5, shares: { errors: 10 } });
    expect(overview.byDay.map((day) => [day.day, day.errors])).toEqual([["2026-09-28", null], ["2026-09-29", 1]]);
  });

  test("days whose pages Clarity cut at its 1,000 rows are counted, and a page asked for without its devices is in every device's figures but none's own", async () => {
    const t = harness();
    const { userId, holdId } = await seed(t);
    await t.mutation(internal.clarity.saveDay, { holdId, day: "2026-09-29", pages: [row("/", "PC", 10, 30), row("/quiet/", "Any", 2, 50)], site: [row(null, "PC", 12, 30)], pagesCut: true, problem: null, refused: false });
    await finishScheduled(t);
    const asOwner = t.withIdentity({ subject: userId });
    const every = await asOwner.query(api.clarityScreens.clarityPagesList, { siteId: holdId, period: "lastMonth", page: 1, rows: 25 });
    expect(every.period.cutDays).toBe(1);
    expect(every.rows.map((line) => line.page)).toEqual(["/", "/quiet/"]);
    const computers = await asOwner.query(api.clarityScreens.clarityPagesList, { siteId: holdId, period: "lastMonth", device: "PC", page: 1, rows: 25 });
    expect(computers.rows.map((line) => line.page)).toEqual(["/"]);
  });

  test("a device chosen narrows every figure but the comparison of the devices", async () => {
    const t = harness();
    const { userId, holdId } = await seed(t);
    await threeDays(t, holdId);
    const phones = await t.withIdentity({ subject: userId }).query(api.clarityScreens.clarityOverview, { siteId: holdId, period: "lastMonth", device: "Mobile" });
    expect(phones.now.visits).toBe(4);
    expect(phones.byDay.map((day) => [day.day, day.visits])).toEqual([["2026-09-29", 4]]);
    expect(phones.pages.top.map((line) => [line.page, line.now.visits])).toEqual([["/ai-agency/", 4]]);
    expect(phones.devices).toHaveLength(2);
    expect(phones.sources?.rows.map((source) => [source.name, source.now.visits])).toEqual([["google", 4]]);
  });

  test("Pages: searched, filtered and sorted over the whole list on the server, then titled for the page shown", async () => {
    const t = harness();
    const { userId, holdId } = await seed(t);
    await threeDays(t, holdId);
    const asOwner = t.withIdentity({ subject: userId });
    const list = await asOwner.query(api.clarityScreens.clarityPagesList, { siteId: holdId, period: "lastMonth", page: 1, rows: 25 });
    expect(list).toMatchObject({ total: 2, count: 2, few: 1 });
    expect(list.rows.map((line) => [line.page, line.title])).toEqual([["/ai-agency/", "AI Agency | London"], ["/hub/prism/", null]]);
    const scrolledLeast = await asOwner.query(api.clarityScreens.clarityPagesList, { siteId: holdId, period: "lastMonth", page: 1, rows: 25, sort: "scroll" });
    expect(scrolledLeast.rows.map((line) => line.page)).toEqual(["/ai-agency/", "/hub/prism/"]);
    const found = await asOwner.query(api.clarityScreens.clarityPagesList, { siteId: holdId, period: "lastMonth", page: 1, rows: 25, q: "prism" });
    expect(found.rows.map((line) => line.page)).toEqual(["/hub/prism/"]);
    expect(found.count).toBe(2);
  });

  test("a page's own screen: its figures, the website's and its days, its errors by browser, its sources and recordings", async () => {
    const t = harness();
    const { userId, holdId } = await seed(t);
    await threeDays(t, holdId);
    const page = await t.withIdentity({ subject: userId }).query(api.clarityScreens.clarityPage, { siteId: holdId, period: "lastMonth", page: "/ai-agency/" });
    expect(page).toMatchObject({ title: "AI Agency | London", now: { visits: 20, errors: 2 }, before: { visits: 20, scroll: 30 }, website: { visits: 26 } });
    expect(page.byDay.map((day) => [day.day, day.visits])).toEqual([["2026-09-29", 14], ["2026-09-30", 6]]);
    expect(page.errors.map((entry) => [entry.name, entry.now.errors])).toEqual([["Chrome|PC", 2]]);
    expect(page.devices.map((device) => [device.name, device.now.visits])).toEqual([["PC", 16], ["Mobile", 4]]);
    expect(page.sources?.rows.map((source) => [source.name, source.now.visits])).toEqual([["google", 10]]);
  });

  test("Errors: the visits with an error against the days before, by browser and by page, each page with where it mostly happens", async () => {
    const t = harness();
    const { userId, holdId } = await seed(t);
    await threeDays(t, holdId);
    const errors = await t.withIdentity({ subject: userId }).query(api.clarityScreens.clarityErrors, { siteId: holdId, period: "lastMonth" });
    expect(errors.now).toMatchObject({ errors: 2, errorClicks: 1 });
    expect(errors.browsers?.rows.map((browser) => [browser.name, browser.now.visits, browser.now.errors])).toEqual([["Chrome", 16, 2], ["Safari", 4, 0]]);
    expect(errors.pages.map((entry) => [entry.line.page, entry.line.title, entry.mostly])).toEqual([["/ai-agency/", "AI Agency | London", { browser: "Chrome", device: "PC" }]]);
    expect(errors.pagesWithVisits).toBe(2);
  });

  test("another company's website answers as a missing one", async () => {
    const t = harness();
    const { holdId } = await seed(t);
    const strangerId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Other", createdAt: 1 });
      return await ctx.db.insert("users", { email: "other@else.test", role: "ADMIN", companyId });
    });
    await expect(t.withIdentity({ subject: strangerId }).query(api.clarityScreens.clarityOverview, { siteId: holdId, period: "lastMonth" })).rejects.toThrow();
  });
});
