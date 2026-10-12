import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import { enquiriesView, enquirySourceView } from "./insightsPeriod";
import schema from "./schema";
import { useFixedDay } from "@/src/test/realTime";
import { countingBreak, monthsOf, sourceOf, spanFigures, type HistoryRecord, type PageKind } from "./insightsPeriodData";
import { SOURCE_JOIN } from "./utils/insightHistory";

/**
 * Insights by period (insights-intelligence-plan.md phases 1 and 8): the
 * sixteen months kept, read as any month, quarter or twelve months against
 * the period before and a year ago, each page by its kind and each source by
 * its group, and why the enquiries moved.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

beforeEach(() => {
  useFixedDay("2026-10-12");
});

afterEach(() => {
  vi.useRealTimers();
});

const SERVICE: PageKind = { key: "service", name: "Service", type: "SERVICE" };
const ARTICLE: PageKind = { key: "hub", name: "Content hub", type: "INFORMATIONAL" };
const kindOf = (path: string) => (path.startsWith("/hub/") ? ARTICLE : SERVICE);

const monthEnd = (month: string) => {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
};

/** A month of history: Analytics' sources and pages, Search Console's pages, whole. */
function month(month: string, figures: { google: number; ai: number; enquiries: number; serviceClicks: number; shown: number; place: number }): HistoryRecord[] {
  const span = { month, from: `${month}-01`, to: monthEnd(month) };
  return [
    { kind: "GA_SOURCES", ...span, rows: [
      { key: ["Organic Search", "google"].join(SOURCE_JOIN), visits: figures.google, enquiries: figures.enquiries },
      { key: ["Referral", "chatgpt.com"].join(SOURCE_JOIN), visits: figures.ai, enquiries: 0 },
    ] },
    { kind: "GA_PAGES", ...span, rows: [{ key: "/ai-agency", visits: figures.google, enquiries: figures.enquiries }, { key: "/hub/guide/", visits: figures.ai, enquiries: 0 }] },
    { kind: "SC_PAGES", ...span, rows: [{ key: "/ai-agency/", clicks: figures.serviceClicks, impressions: figures.shown, positionSum: figures.place * figures.shown }] },
  ];
}

/** Search Console's days for a month: its clicks and times shown spread evenly, Analytics' visits from Google beside them. */
function days(monthKey: string, clicks: number, shown: number, place: number, googleVisits: number) {
  const count = Number(monthEnd(monthKey).slice(8));
  return Array.from({ length: count }, (_, at) => ({
    key: `${monthKey}-${String(at + 1).padStart(2, "0")}`, clicks: clicks / count, impressions: shown / count, positionSum: (place * shown) / count, googleVisits: googleVisits / count,
  }));
}

describe("the history read by month", () => {
  test("each month's figures, its pages by kind and its sources by group, whole months only", () => {
    const records = [...month("2025-09", { google: 300, ai: 30, enquiries: 26, serviceClicks: 140, shown: 300_000, place: 35 }), ...month("2026-09", { google: 200, ai: 6, enquiries: 10, serviceClicks: 125, shown: 220_000, place: 21 })];
    const months = monthsOf(records, kindOf);
    expect(months.map((entry) => [entry.month, entry.whole, entry.visits, entry.enquiries])).toEqual([["2025-09", true, 330, 26], ["2026-09", true, 206, 10]]);
    expect(months[1].kinds.get("service")).toMatchObject({ visits: 200, enquiries: 10 });
    expect(sourceOf(["Referral", "chatgpt.com"].join(SOURCE_JOIN))).toEqual({ group: "AI", name: "ChatGPT" });
    expect(spanFigures(months, ["2026-08"])).toBeNull();
  });

  test("finds the month Google changed what it counts as shown, past a half-way month", () => {
    const records: HistoryRecord[] = [
      ...month("2025-07", { google: 1, ai: 0, enquiries: 0, serviceClicks: 1, shown: 1, place: 1 }),
      ...month("2025-08", { google: 1, ai: 0, enquiries: 0, serviceClicks: 1, shown: 1, place: 1 }),
      ...month("2025-09", { google: 1, ai: 0, enquiries: 0, serviceClicks: 1, shown: 1, place: 1 }),
      ...month("2025-10", { google: 1, ai: 0, enquiries: 0, serviceClicks: 1, shown: 1, place: 1 }),
      { kind: "DAYS", month: "", from: "2025-07-01", to: "2025-10-31", rows: [
        ...days("2025-07", 395, 575_000, 46, 290), ...days("2025-08", 373, 532_000, 44, 222),
        // September: showings far down the results stop being counted part-way through, October whole.
        ...days("2025-09", 422, 329_000, 36, 247), ...days("2025-10", 464, 263_000, 25, 288),
      ] },
    ];
    expect(countingBreak(monthsOf(records, kindOf))).toBe("2025-10");
  });
});

describe("the period read", () => {
  test("a month against the same month a year ago, and why: counting, visitors, enquiring", async () => {
    const t = harness();
    const holdId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
      const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
      const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
      const records = [
        ...month("2025-09", { google: 336, ai: 30, enquiries: 26, serviceClicks: 140, shown: 300_000, place: 22 }),
        ...month("2026-08", { google: 190, ai: 11, enquiries: 7, serviceClicks: 117, shown: 290_000, place: 25 }),
        ...month("2026-09", { google: 250, ai: 6, enquiries: 10, serviceClicks: 125, shown: 220_000, place: 21 }),
        { kind: "DAYS" as const, month: "", from: "2025-09-01", to: "2026-09-30", rows: [...days("2025-09", 422, 330_000, 22, 249), ...days("2026-08", 338, 376_000, 23, 149), ...days("2026-09", 390, 295_000, 19, 179)] },
      ];
      for (const record of records) await ctx.db.insert("insightHistory", { companyWebsiteId: holdId, ...record, fetchedAt: 1 });
      return holdId;
    });
    const view = await t.query(internal.insightsPeriod.runView, { holdId });
    expect(view?.chosen).toMatchObject({ id: "2026-09", before: ["2026-08"], yearAgo: ["2025-09"] });
    expect(view?.periods.map((period) => period.id)).toEqual(["2026-09", "2026-08", "2025-09"]);
    expect(view?.figures?.enquiries).toEqual({ now: 10, before: 7, yearAgo: 26 });
    expect(view?.why?.compare).toBe("YEAR_AGO");
    const split = view!.why!.split;
    expect(split.counting + split.visits + split.rate).toBe(16);
    expect(split.counting).toBeGreaterThan(0);
    expect(view?.why?.tests.find((test) => test.id === "SOURCES")?.figures.source0).toBe("AI");
  });
});

describe("what brings enquiries", () => {
  /** A month's landing pages by source and its events, beside the month's own lists. */
  function bySource(month: string, rows: Array<[string, string, string, number, number]>, events: Array<[string, number, number]>): HistoryRecord[] {
    const span = { month, from: `${month}-01`, to: monthEnd(month) };
    return [
      { kind: "GA_PAGE_SOURCES", ...span, rows: rows.map(([path, channel, source, visits, enquiries]) => ({ key: [path, channel, source].join(SOURCE_JOIN), visits, enquiries })) },
      { kind: "GA_EVENTS", ...span, rows: events.map(([key, times, enquiries]) => ({ key, times, enquiries })) },
    ];
  }

  async function seeded() {
    const t = harness();
    const hold = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
      const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
      const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
      const records: HistoryRecord[] = [
        ...month("2026-07", { google: 200, ai: 10, enquiries: 6, serviceClicks: 100, shown: 200_000, place: 20 }),
        ...month("2026-08", { google: 190, ai: 11, enquiries: 7, serviceClicks: 117, shown: 290_000, place: 25 }),
        ...month("2026-09", { google: 250, ai: 6, enquiries: 10, serviceClicks: 125, shown: 220_000, place: 21 }),
        ...bySource("2026-07", [["/ai-agency", "Organic Search", "google", 190, 2]], [["form_submission", 8, 6]]),
        ...bySource("2026-08", [["/ai-agency", "Organic Search", "google", 180, 2], ["/ai-agency", "Referral", "chatgpt.com", 8, 0]], [["form_submission", 9, 7]]),
        ...bySource("2026-09", [["/ai-agency", "Organic Search", "google", 240, 4], ["/ai-agency", "Referral", "chatgpt.com", 5, 1]], [["form_submission", 13, 10], ["contact", 2, 0]]),
        // The page's clicks in the three months: 342, of which Google names "ai agency" for 171.
        { kind: "SC_SEARCH_PAGES", month: "", from: "2026-07-03", to: "2026-09-30", rows: [
          { key: ["ai agency", "/ai-agency/"].join(SOURCE_JOIN), clicks: 171, impressions: 3_000, positionSum: 9_000 },
          { key: ["ai agency london", "/ai-agency/"].join(SOURCE_JOIN), clicks: 10, impressions: 500, positionSum: 4_000 },
        ] },
        { kind: "GA_JOURNEY", month: "", from: "2026-07-03", to: "2026-09-30", rows: [{ key: "/about-us/", visits: 65, enquiries: 4 }, { key: "/hub/guide/", visits: 20, enquiries: 0 }] },
      ];
      for (const record of records) await ctx.db.insert("insightHistory", { companyWebsiteId: holdId, ...record, fetchedAt: 1 });
      return (await ctx.db.get(holdId))!;
    });
    return { t, hold };
  }

  test("each source by name, each event counted or not, and each search's share of its page's enquiries", async () => {
    const { t, hold } = await seeded();
    const view = await t.run(async (ctx) => await enquiriesView(ctx, hold, "acme-shop.test", "2026-09"));
    expect(view?.chosen).toMatchObject({ id: "2026-09", before: ["2026-08"], yearAgo: null });
    expect(view?.sources.find((row) => row.name === "ChatGPT")).toMatchObject({ group: "AI", visits: { now: 6, before: 11 } });
    expect(view?.events.map((row) => [row.name, row.counted, row.enquiries.now])).toEqual([["form_submission", true, 10], ["contact", false, 0]]);
    expect(view?.pages[0]).toMatchObject({ path: "/ai-agency", kind: null, from: { GOOGLE: 4, AI: 1, TYPED: 0, OTHER: 0 } });
    // 8 enquiries from Google over the three months, shared by the page's 342 clicks: never all of them to one named search.
    expect(view?.searches.map((row) => [row.search, row.estimate, row.sure])).toEqual([["ai agency", 4, true], ["ai agency london", 0.2, false]]);
    expect(view?.noEnquiries).toEqual([]);
    expect(view?.journey?.rows.map((row) => row.path)).toEqual(["/about-us/"]);
    expect(view?.byMonth.at(-1)?.events).toEqual([{ name: "form_submission", enquiries: 10 }]);
  });

  test("one source's months, kinds of page and pages, by its own name", async () => {
    const { t, hold } = await seeded();
    const view = await t.run(async (ctx) => await enquirySourceView(ctx, hold, "ChatGPT", "2026-09"));
    expect(view).toMatchObject({ group: "AI", figures: { visits: { now: 6, before: 11 }, enquiries: { now: 0, before: 0 } } });
    expect(view?.months?.map((entry) => entry.visits)).toEqual([10, 11, 6]);
    expect(view?.pages).toEqual([{ path: "/ai-agency", kind: null, visits: 5, enquiries: 1 }]);
    const unknown = await t.run(async (ctx) => await enquirySourceView(ctx, hold, "Nowhere", "2026-09"));
    expect(unknown).toEqual({ chosen: null });
  });
});
