import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MOST_REPORT_PAGES, REPORT_PAGE_ROWS, runReport, type ReportRow } from "./googleAnalyticsApi";
import { ask, type Session } from "./googleAnalyticsCollect";
import { heldRows, topPerPage, trimTo } from "./googleAnalyticsPageLists";
import { channelKey, listJoiner, splitChannelKey, type ListRow } from "./googleAnalyticsLists";
import { OTHER_ROWS, PAGE_TOP_ROWS, TRIM_ABOVE, TRIM_KEEP, trimDue } from "./utils/analyticsSharedLists";
import { useFixedDay, whileMovingClock } from "@/src/test/realTime";

/**
 * A big website's nightly pull stays inside what a step can hold
 * (docs/plans/active/ga-big-site-reliability-plan.md BR2–BR4, BR8): Google's
 * answers asked 25,000 rows at a time and handed on as they arrive; an answer
 * stopped part-way asked again from the page it reached; a page list trimmed
 * while it is read, its top 20 and its sums the same as from the whole list;
 * and the steps that hold Google's answers in the Node runtime. Counted, not
 * timed: rows held and pages asked, on any machine.
 */

const PROPERTY = "properties/1";
const ASK = { startDate: "2025-10-09", endDate: "2026-10-08", dimensions: ["pagePath", "pageReferrer"], metrics: ["screenPageViews"] };

/** Google's answer for `rows` rows, `limit` from `offset`, as the Data API pages it. */
function googleWith(rows: number, failing: { offset: number; times: number } | null = null) {
  const asked: Array<{ limit: number; offset: number }> = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { limit: number; offset: number };
    asked.push({ limit: body.limit, offset: body.offset });
    if (failing && failing.offset === body.offset && failing.times > 0) {
      failing.times -= 1;
      return new Response(JSON.stringify({ error: { message: "The service is currently unavailable." } }), { status: 503 });
    }
    const count = Math.max(0, Math.min(body.limit, rows - body.offset));
    return Response.json({
      rowCount: rows,
      rows: Array.from({ length: count }, (_, at) => ({
        dimensionValues: [{ value: `/page-${(body.offset + at) % 10}` }, { value: `https://elsewhere.test/${body.offset + at}` }],
        metricValues: [{ value: "1" }],
      })),
    });
  }));
  return asked;
}

const sum = (rows: readonly ListRow[]) => rows.reduce((total, row) => total + row.views, 0);

beforeEach(() => {
  useFixedDay();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Google's answers on a big website (BR2)", () => {
  test("asked 25,000 rows at a time, at most 20 times, each handed on as it arrives and none held", async () => {
    expect([REPORT_PAGE_ROWS, MOST_REPORT_PAGES]).toEqual([25_000, 20]);
    const asked = googleWith(60_000);
    const arrived: number[] = [];
    const report = await runReport("token", PROPERTY, ASK, (rows) => arrived.push(rows.length));
    expect(report).toMatchObject({ ok: true, rows: [], cut: false, requests: 3 });
    expect(asked).toEqual([{ limit: 25_000, offset: 0 }, { limit: 25_000, offset: 25_000 }, { limit: 25_000, offset: 50_000 }]);
    expect(arrived).toEqual([25_000, 25_000, 10_000]);
  });

  test("an answer Google stops part-way is asked again from the page it reached, never from the start", async () => {
    const asked = googleWith(60_000, { offset: 25_000, times: 1 });
    const session = { ctx: {} as never, connectionId: "connection" as never, accessToken: "token", requests: 0, stopped: null, quota: null } satisfies Session;
    let held = 0;
    const report = await whileMovingClock(ask(session, PROPERTY, ASK, (rows) => { held += rows.length; }));
    expect(report.ok).toBe(true);
    expect(asked.map((one) => one.offset)).toEqual([0, 25_000, 25_000, 50_000]);
    // Every row once: the first page was not asked again.
    expect(held).toBe(60_000);
  });
});

describe("a big website's page lists, trimmed while they are read (BR3)", () => {
  /** Ten pages of 20,000 rows each, as the page before each view of a website's busiest pages: 200,000 rows. */
  const wide = (): ReportRow[] => Array.from({ length: 200_000 }, (_, at) => ({
    keys: [`/page-${at % 10}`, `page:/from-${Math.floor(at / 10)}`],
    values: [1 + (Math.floor(at / 10) % 997)],
  }));

  test("never more than 50,000 rows and one answer held; each page's top 20 and every view the same as from the whole list", () => {
    const rows = wide();
    const held = heldRows((row, one) => { row.views += one.values[0] ?? 0; }, trimTo((row) => row.views));
    let most = 0;
    for (let at = 0; at < rows.length; at += 25_000) {
      held.sink(rows.slice(at, at + 25_000));
      most = Math.max(most, held.size());
    }
    expect([TRIM_ABOVE, TRIM_KEEP]).toEqual([50_000, 100]);
    expect(most).toBeLessThanOrEqual(TRIM_ABOVE + 25_000);

    const whole = heldRows((row, one) => { row.views += one.values[0] ?? 0; }, (all) => all);
    whole.sink(rows);
    const kept = topPerPage(held.rows(), (row) => row.views);
    const truth = topPerPage(whole.rows(), (row) => row.views);
    const tops = (list: ListRow[]) => list.filter((row) => splitChannelKey(row.key).source !== OTHER_ROWS).map((row) => `${row.key}=${row.views}`).sort();
    expect(tops(kept)).toEqual(tops(truth));
    expect(tops(kept)).toHaveLength(10 * PAGE_TOP_ROWS);
    expect(sum(kept)).toBe(sum(truth));
  });

  test("a list joined from two asks trims as it goes too, the sums kept whole", () => {
    const joined = listJoiner("landingPagesSeen", []);
    const cut = trimTo((row) => row.visits);
    const rows = Array.from({ length: 120_000 }, (_, at) => ({ keys: [`/landing-${at % 4}`, `/seen-${at}`], values: [1, 1, 30, 2, 0, 0, 1, 1, 60] }));
    const due = trimDue();
    let most = 0;
    for (let at = 0; at < rows.length; at += 25_000) {
      joined.addMain(rows.slice(at, at + 25_000));
      if (due.now(joined.size())) {
        joined.trim(cut);
        due.after(joined.size());
      }
      most = Math.max(most, joined.size());
    }
    expect(most).toBeLessThanOrEqual(TRIM_ABOVE + 25_000);
    const out = [...joined.groups().values()].flat();
    expect(out.reduce((total, row) => total + row.visits, 0)).toBe(120_000);
  });

  test("a list a cut cannot shorten is not cut again with every answer, only once it has doubled", () => {
    const due = trimDue();
    expect(due.now(TRIM_ABOVE)).toBe(false);
    expect(due.now(TRIM_ABOVE + 1)).toBe(true);
    // Every page under 100 rows: the cut left 70,000.
    due.after(70_000);
    expect(due.now(100_000)).toBe(false);
    expect(due.now(140_001)).toBe(true);
    due.after(10_000);
    expect(due.now(TRIM_ABOVE + 1)).toBe(true);
  });

  test("an \"other\" row added up while read never takes one of a page's top places", () => {
    const row = (key: string, views: number): ListRow => ({
      key, visits: 0, engaged: 0, seconds: 0, views, purchases: 0, revenue: 0, people: 0, newPeople: 0, length: 0, counts: new Map(), values: new Map(),
    });
    const rows = [
      row(channelKey("/a", OTHER_ROWS), 5_000),
      ...Array.from({ length: 25 }, (_, at) => row(channelKey("/a", `page:/from-${at}`), 100 - at)),
    ];
    const kept = topPerPage(rows, (one) => one.views);
    expect(kept.filter((one) => splitChannelKey(one.key).source !== OTHER_ROWS)).toHaveLength(PAGE_TOP_ROWS);
    const other = kept.filter((one) => splitChannelKey(one.key).source === OTHER_ROWS);
    expect(other).toHaveLength(1);
    expect(other[0].views).toBe(5_000 + [80, 79, 78, 77, 76].reduce((total, views) => total + views, 0));
  });
});

describe("the steps that hold Google's answers (BR4)", () => {
  test("run in the Node runtime, and are scheduled only there", () => {
    const steps = readFileSync("convex/googleAnalyticsSteps.ts", "utf8");
    expect(steps.startsWith("\"use node\";")).toBe(true);
    for (const name of ["collectSiteStep", "fillHistory", "fillPageHistory"]) expect(steps).toContain(`export const ${name} = internalAction(`);
    for (const file of ["googleAnalyticsAgentRun.ts", "googleAnalyticsHistory.ts", "googleAnalyticsPageSeries.ts", "googleAnalyticsFillAfter.ts"]) {
      const source = readFileSync(`convex/${file}`, "utf8");
      expect(source, file).not.toMatch(/export const (collectSiteStep|fillHistory|fillPageHistory) = internalAction/);
      expect(source, file).not.toMatch(/internal\.(googleAnalyticsAgentRun\.collectSiteStep|googleAnalyticsHistory\.fillHistory|googleAnalyticsPageSeries\.fillPageHistory)\b/);
    }
  });
});
