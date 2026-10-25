import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { useFixedDay } from "@/src/test/realTime";
import { finishScheduled } from "@/src/test/finishScheduled";
import { callGoogle } from "./googleApi";
import { REHEARSAL_HOST, TEN_TIMES_KORDA, isRehearsalToken, rehearsalAnswer, rehearsalToken } from "./utils/rehearsalGoogle";

/**
 * The collection's rehearsal (collection-reliability-plan.md, RR5): its pretend
 * Google answers as Google pages its answers, reaches nothing, and a whole
 * rehearsal — set up, both first collections run, reported, and removed —
 * works end to end at a small size here. Its real size, ten times
 * kordatackle.com, runs on the dev backend, where Convex's limits apply.
 */

const NOW = Date.parse("2026-10-16T02:00:00Z");
/** The pretend Google's answers checked at a size with every split whole. */
const SMALL = { pages: 30, consoleRowsADay: 200, breadth: 0, days: 800 };
/** A whole rehearsal run here: two pages, two of each split, and two days of history. */
const TINY = { pages: 2, consoleRowsADay: 4, breadth: 2, days: 2, countries: ["gbr"] };
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

beforeEach(() => {
  useFixedDay();
  vi.setSystemTime(NOW);
  vi.stubEnv("CONNECTOR_TOKEN_ENCRYPTION_KEY", Buffer.from(new Uint8Array(32).fill(7)).toString("base64"));
  // The platform's Google sign-in is set up, as on the dev backend; the rehearsal's own is never renewed with it.
  vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_ID", "sc-client.apps.googleusercontent.com");
  vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_SECRET", "sc-secret");
  // Nothing reaches the network: any call that tried would fail the test.
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    throw new Error(`The rehearsal reached the network: ${String(input)}`);
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

const report = (ask: Record<string, unknown>, size = SMALL) =>
  rehearsalAnswer("https://analyticsdata.googleapis.com/v1beta/properties/rehearsal:runReport", rehearsalToken(size), ask) as { ok: true; json: { rows: Array<{ dimensionValues: Array<{ value: string }>; metricValues: Array<{ value: string }> }>; rowCount: number } };
const search = (ask: Record<string, unknown>, size = SMALL) =>
  rehearsalAnswer(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(`sc-domain:${REHEARSAL_HOST}`)}/searchAnalytics/query`, rehearsalToken(size), ask) as { ok: true; json: { rows?: Array<{ keys: string[]; clicks: number; impressions: number }> } };

describe("the pretend Google", () => {
  test("only a rehearsal's own sign-in reaches it, and it answers it without the network", async () => {
    expect(isRehearsalToken(rehearsalToken(TEN_TIMES_KORDA))).toBe(true);
    expect(isRehearsalToken("ya29.a0AfH6SMB")).toBe(false);
    const answer = await callGoogle("https://analyticsdata.googleapis.com/v1beta/properties/rehearsal:runReport", rehearsalToken(SMALL), {
      dateRanges: [{ startDate: "2026-10-01", endDate: "2026-10-07" }], dimensions: [{ name: "date" }], metrics: [{ name: "sessions" }],
    });
    expect(answer.ok).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    // A call it has no answer for is refused, saying so, never guessed.
    expect(rehearsalAnswer("https://analyticsadmin.googleapis.com/v1beta/accountSummaries", rehearsalToken(SMALL), undefined)).toMatchObject({ ok: false, reason: "REFUSED" });
  });

  test("Analytics: every split of the website, a page at a time as Google pages it, the same each time", () => {
    const ask = { dateRanges: [{ startDate: "2026-10-01", endDate: "2026-10-07" }], dimensions: [{ name: "date" }, { name: "deviceCategory" }, { name: "landingPage" }], metrics: [{ name: "sessions" }, { name: "engagedSessions" }] };
    const whole = report({ ...ask, limit: 10_000 }).json;
    // A quarter of the pages are visited on a day.
    expect(whole.rowCount).toBe(7 * 4 * Math.ceil(SMALL.pages / 4));
    expect(whole.rows[0].dimensionValues.map((one) => one.value)).toEqual(["20261001", "desktop", "/shop/item-0/"]);
    expect(Number(whole.rows[0].metricValues[0].value)).toBeGreaterThan(Number(whole.rows.at(-1)!.metricValues[0].value));
    // Paged by `limit` and `offset`, as runReport asks.
    const second = report({ ...ask, limit: 100, offset: 100 }).json;
    expect(second.rows.map((row) => row.dimensionValues.map((one) => one.value).join("|"))).toEqual(whole.rows.slice(100, 200).map((row) => row.dimensionValues.map((one) => one.value).join("|")));
    // A page by the page before it: twenty a page, not every page.
    expect(report({ ...ask, dimensions: [{ name: "pagePath" }, { name: "pageReferrer" }] }).json.rowCount).toBe(SMALL.pages * 20);
    // A filter keeps its own values: one home country, a few events.
    const filtered = report({ ...ask, dimensions: [{ name: "countryId" }, { name: "eventName" }], dimensionFilter: { andGroup: { expressions: [
      { filter: { fieldName: "countryId", inListFilter: { values: ["IE"] } } },
      { filter: { fieldName: "eventName", inListFilter: { values: ["generate_lead", "click_tel"] } } },
    ] } } }).json;
    expect(filtered.rows.map((row) => row.dimensionValues.map((one) => one.value).join("|"))).toEqual(["IE|generate_lead", "IE|click_tel"]);
    // Weeks and months as Google names them.
    expect(report({ dateRanges: [{ startDate: "2026-09-28", endDate: "2026-10-11" }], dimensions: [{ name: "isoYearIsoWeek" }], metrics: [] }).json.rows.map((row) => row.dimensionValues[0].value)).toEqual(["202640", "202641"]);
    expect(report({ dateRanges: [{ startDate: "2026-09-28", endDate: "2026-10-11" }], dimensions: [{ name: "yearMonth" }], metrics: [] }).json.rows.map((row) => row.dimensionValues[0].value)).toEqual(["202609", "202610"]);
  });

  test("Search Console: a day's searches by page at the size asked, paged by startRow, and fewer for the other kinds", () => {
    const day = { startDate: "2026-10-01", endDate: "2026-10-01", type: "web", dimensions: ["query", "page"] };
    const first = search({ ...day, rowLimit: 150, startRow: 0 }).json.rows!;
    const rest = search({ ...day, rowLimit: 150, startRow: 150 }).json.rows!;
    expect(first.length + rest.length).toBe(SMALL.consoleRowsADay);
    expect(first[0].keys[1]).toContain(`https://www.${REHEARSAL_HOST}/`);
    expect(search({ ...day, rowLimit: 150, startRow: 300 }).json.rows).toBeUndefined();
    // Ten times kordatackle.com: past the 50,000 Google gives an ask, as its biggest days are.
    expect((search({ ...day, rowLimit: 25_000, startRow: 25_000 }, TEN_TIMES_KORDA).json.rows ?? []).length).toBe(25_000);
    expect(search({ ...day, type: "discover", rowLimit: 100, startRow: 0 }).json.rows).toBeUndefined();
    expect(search({ startDate: "2026-09-01", endDate: "2026-09-30", type: "web", dimensions: ["date"], rowLimit: 100, startRow: 0 }).json.rows).toHaveLength(30);
    // Nothing before the website's first day.
    expect(search({ ...day, startDate: "2024-01-01", endDate: "2024-01-01", rowLimit: 100, startRow: 0 }).json.rows).toBeUndefined();
    expect(report({ dateRanges: [{ startDate: "2024-01-01", endDate: "2024-01-31" }], dimensions: [{ name: "deviceCategory" }], metrics: [{ name: "sessions" }] }).json.rowCount).toBe(0);
  });
});

describe("a rehearsal, end to end at a small size", () => {
  test("sets up, runs both first collections to their end without the network, and reports them", async () => {
    const t = harness();
    await t.run(async (ctx) => {
      for (const systemKey of ["GOOGLE_ANALYTICS_COLLECTOR", "SEARCH_CONSOLE_COLLECTOR"]) {
        await ctx.db.insert("agents", { name: systemKey, modelId: "model-test", thinkingMode: false, isActive: true, systemKey, createdAt: 1, updatedAt: 1 });
      }
    });
    const started = await t.action(internal.collectionRehearsal.startRehearsal, TINY);
    expect(started).toMatchObject({ analytics: "STARTED", console: "STARTED" });
    await expect(t.action(internal.collectionRehearsal.startRehearsal, TINY)).rejects.toThrow("A rehearsal is set up already");
    await finishScheduled(t);

    const done = (await t.query(internal.collectionRehearsal.rehearsalReport, {}))!;
    expect(done.runs.map((run) => [run.title, run.status]).sort()).toEqual([
      [`Google Analytics: ${REHEARSAL_HOST}`, "SUCCESS"],
      [`Search Console: ${REHEARSAL_HOST}`, "SUCCESS"],
    ]);
    expect(done.chains.length).toBeGreaterThan(0);
    expect(done.chains.every((chain) => chain.closed)).toBe(true);
    expect(done.analytics).toMatchObject({ collecting: false, problem: null });
    expect(done.analytics?.newestDay).toBeTruthy();
    expect(done.console).toMatchObject({ settling: false, problem: null });
    expect(done.console?.daysFrom).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  test("removes every row made by a rehearsal setup", async () => {
    const t = harness();
    await t.mutation(internal.collectionRehearsal.seedRehearsal, { countries: TINY.countries });
    expect(await t.action(internal.collectionRehearsal.endRehearsal, {})).toContain("its figures are being cleared");
    await finishScheduled(t);
    expect(await t.query(internal.collectionRehearsal.rehearsalReport, {})).toBeNull();
    const left = await t.run(async (ctx) => ({
      companies: (await ctx.db.query("companies").collect()).length,
      websites: (await ctx.db.query("websites").collect()).length,
      analytics: (await ctx.db.query("googleAnalyticsConnections").collect()).length,
      console: (await ctx.db.query("searchConsoleConnections").collect()).length,
      days: (await ctx.db.query("googleAnalyticsDays").collect()).length + (await ctx.db.query("searchConsoleDays").collect()).length,
      tokens: (await ctx.db.query("googleTokens").collect()).length,
    }));
    expect(left).toEqual({ companies: 0, websites: 0, analytics: 0, console: 0, days: 0, tokens: 0 });
    expect(fetch).not.toHaveBeenCalled();
    expect(await t.action(internal.collectionRehearsal.endRehearsal, {})).toBe("No rehearsal is set up.");
  });
});
