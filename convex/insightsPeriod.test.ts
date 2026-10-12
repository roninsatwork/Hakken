import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
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
