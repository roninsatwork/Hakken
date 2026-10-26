import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { encryptConnectorToken } from "./connectorTokenCrypto";
import { useFixedDay } from "@/src/test/realTime";
import { seedGoogleSignIn } from "@/src/test/googleGrant";
import { stepKey } from "./collectionSteps";
import { NEWEST, PROPERTY, dayOf, fakeGoogle } from "@/src/test/googleAnalyticsFake";

/**
 * The research's history (insightHistory.ts; Anthony, 2026-10-12, "go back 16
 * months"): what is asked of Google and kept — each landing page and each
 * source a month, people a month, the website a day — and that the table
 * keeps to its rule, nothing older than sixteen months.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

beforeEach(() => {
  useFixedDay("2026-10-09");
  vi.stubEnv("CONNECTOR_TOKEN_ENCRYPTION_KEY", Buffer.from(new Uint8Array(32).fill(7)).toString("base64"));
  vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_ID", "sc-client.apps.googleusercontent.com");
  vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_SECRET", "sc-secret");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function withAnalytics(t: Harness) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    const connectionId = await ctx.db.insert("googleAnalyticsConnections", {
      companyId, companyWebsiteId: holdId, websiteId, status: "CONNECTED", property: PROPERTY, propertyName: "Acme",
      stream: "https://www.acme-shop.test", addresses: ["www.acme-shop.test"], otherAddresses: [], timeZone: "Europe/London", currency: "GBP", eventsReadAt: 1, listedWith: "EVENT_COUNT_ADDRESSES",
      events: [{ eventName: "generate_lead", counted: true, analyticsValue: null, hakkenValue: null, lastThirtyDays: 0 }],
      newestDay: NEWEST, createdAt: 1, updatedAt: 1,
    });
    await seedGoogleSignIn(ctx, encryptConnectorToken, { companyWebsiteId: holdId, connectionId });
    return { holdId };
  });
}

describe("the research's history", () => {
  test("the allowance probe asks one small report, then honours Google's saved reserve without another request", async () => {
    const t = harness();
    await withAnalytics(t);
    const google = fakeGoogle(dayOf(NEWEST));
    google.allowance = { thresholdedPerHour: 120, tokensPerAsk: 3 };
    const connection = (await t.run(async (ctx) => await ctx.db.query("googleAnalyticsConnections").first()))!;
    const probe = await t.action(internal.googleAnalyticsQuotaActions.readAllowance, { connectionId: connection._id });
    expect(probe).toMatchObject({ requests: 1, problem: null, quota: { tokensPerProjectPerHour: 13_997 } });
    const report = JSON.parse(google.calls.find((call) => call.url.endsWith(":runReport"))!.body);
    expect(report.dimensions).toEqual([]);
    expect(report.dateRanges).toEqual([{ startDate: NEWEST, endDate: NEWEST }]);
    await t.mutation(internal.googleAnalyticsQuota.noteQuota, { connectionId: connection._id, quota: { ...probe.quota!, tokensPerProjectPerHour: 2_799 } });
    expect(await t.action(internal.googleAnalyticsQuotaActions.readAllowance, { connectionId: connection._id })).toMatchObject({ requests: 0, problem: expect.stringContaining("BUDGET") });
    expect(google.calls.filter((call) => call.url.endsWith(":runReport"))).toHaveLength(1);
  });

  test("asks Analytics for sixteen months and keeps each landing page and source a month, people a month, and the website a day", async () => {
    const t = harness();
    const { holdId } = await withAnalytics(t);
    // A day a year and more ago, and a day last month: each the fake's day of visits, from Google, Perplexity and typed in.
    const google = fakeGoogle([...dayOf("2025-07-14"), ...dayOf("2026-09-15")]);
    const provider = globalThis.fetch;
    let savedBeforeNextMonth = false;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith(":runReport") && typeof init?.body === "string") {
        const request = JSON.parse(init.body) as { dateRanges: Array<{ startDate: string }>; dimensions: Array<{ name: string }> };
        if (request.dateRanges[0].startDate === "2025-08-01" && request.dimensions.some((dimension) => dimension.name === "landingPage")) {
          const kept = await t.query(internal.insightHistory.historyMetadataPart, { holdId, paginationOpts: { cursor: null, numItems: 100 } });
          savedBeforeNextMonth ||= kept.page.some((record) => record.kind === "GA_PAGES" && record.month === "2025-07");
        }
      }
      return await provider(input, init);
    }));
    const done = await t.action(internal.insightHistory.fetchHistory, { holdId });
    expect(done.problems).toEqual([]);
    expect(savedBeforeNextMonth).toBe(true);
    const pageRequests = google.calls.filter((call) => call.url.endsWith(":runReport"))
      .map((call) => JSON.parse(call.body) as { dateRanges: Array<{ startDate: string; endDate: string }>; dimensions: Array<{ name: string }> })
      .filter((request) => request.dimensions.some((dimension) => dimension.name === "landingPage"));
    expect(pageRequests.length).toBeGreaterThan(2);
    for (const request of pageRequests) {
      const range = request.dateRanges[0];
      expect(range.startDate.slice(0, 7)).toBe(range.endDate.slice(0, 7));
    }


    const history = await t.query(internal.insightHistory.historyOf, { holdId });
    const pages = history.find((record) => record.kind === "GA_PAGES" && record.month === "2025-07");
    // The other address in the property is never read; a landing page keeps its path and query as Analytics names it.
    expect(pages?.rows).toEqual([
      { key: "/", visits: 10, enquiries: 1 },
      { key: "/ai-agency/", visits: 4, enquiries: 0 },
      { key: "/contact/?utm=x", visits: 2, enquiries: 0 },
    ]);
    expect(history.filter((record) => record.kind === "GA_PAGES").map((record) => record.month)).toHaveLength(17);
    const sources = history.find((record) => record.kind === "GA_SOURCES" && record.month === "2026-09");
    expect(sources?.rows.map((row) => [row.key.split("\u001f")[1], row.visits, row.enquiries])).toEqual([
      ["google", 10, 1], ["perplexity.ai", 4, 0], ["(direct)", 2, 0],
    ]);
    const days = history.find((record) => record.kind === "DAYS");
    // Visits from Google's own search, a day, to set against Search Console's clicks.
    expect(days?.rows.find((row) => row.key === "2026-09-15")).toMatchObject({ visits: 16, googleVisits: 10, enquiries: 1 });
    const months = history.find((record) => record.kind === "GA_MONTHS");
    expect(months?.rows.map((row) => row.key)).toEqual(["2025-07", "2026-09"]);
    // Phase 2: each landing page by its source, each event counted or not, and the pages read on the way to an enquiry.
    const bySource = history.find((record) => record.kind === "GA_PAGE_SOURCES" && record.month === "2026-09");
    expect(bySource?.rows.map((row) => [...row.key.split("\u001f"), row.visits, row.enquiries])).toEqual([
      ["/", "Organic Search", "google", 10, 1], ["/ai-agency/", "Referral", "perplexity.ai", 4, 0], ["/contact/?utm=x", "Direct", "(direct)", 2, 0],
    ]);
    // Every event's times; enquiries only for the events ticked as counted on the connection.
    const events = history.find((record) => record.kind === "GA_EVENTS" && record.month === "2026-09");
    expect(events?.rows.map((row) => [row.key, row.times, row.enquiries])).toEqual([["page_view", 32, 0], ["session_start", 16, 0], ["click_tel", 1, 0], ["generate_lead", 1, 1]]);
    const journey = history.find((record) => record.kind === "GA_JOURNEY");
    expect(journey).toMatchObject({ from: "2026-07-11", to: NEWEST });
    expect(journey?.rows.map((row) => row.key)).toEqual(["/", "/ai-agency/", "/contact/"]);
  });

  test("keeps nothing older than sixteen months, and writes a month over its own", async () => {
    const t = harness();
    const { holdId } = await withAnalytics(t);
    const record = (month: string, visits: number) => ({ kind: "GA_PAGES" as const, month, from: `${month}-01`, to: `${month}-28`, rows: [{ key: "/", visits }] });
    await t.mutation(internal.insightHistory.saveHistory, { holdId, newestDay: "2026-10-08", records: [record("2025-06", 1), record("2026-09", 2)] });
    await t.mutation(internal.insightHistory.saveHistory, { holdId, newestDay: "2026-11-08", records: [record("2026-09", 3)] });
    const history = await t.query(internal.insightHistory.historyOf, { holdId });
    expect(history.map((kept) => [kept.month, kept.rows[0].visits])).toEqual([["2026-09", 3]]);
  });

  test("says what is not connected, and keeps nothing", async () => {
    const t = harness();
    const holdId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
      const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
      return await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    });
    const done = await t.action(internal.insightHistory.fetchHistory, { holdId });
    expect(done).toEqual({ records: 0, asks: 0, problems: ["Neither Search Console nor Google Analytics is connected."] });
  });
});


async function watchedHistory(t: Harness) {
  const { holdId } = await withAnalytics(t);
  const run = await t.run(async (ctx) => {
    const hold = (await ctx.db.get(holdId))!;
    const agentId = await ctx.db.insert("agents", { name: "Insights", modelId: "test", thinkingMode: false, isActive: true, createdAt: 1, updatedAt: 1 });
    const runId = await ctx.db.insert("agentRuns", { agentId, companyId: hold.companyId, triggerType: "EVENT", objective: "History", status: "RUNNING", startedAt: Date.now(), updatedAt: Date.now() });
    const workflowExecutionId = await ctx.db.insert("workflowExecutions", { agentId, agentRunId: runId, triggerType: "EVENT", status: "RUNNING", startedAt: Date.now() });
    return { runId, workflowExecutionId, companyId: hold.companyId, holdId, host: "acme-shop.test" };
  });
  const pieces = (await t.action(internal.insightHistorySteps.planForRun, { holdId })).filter((piece) => piece.kind === "GA_PAGES" && ["2025-07", "2025-08"].includes(piece.month ?? "")).sort((a, b) => a.month!.localeCompare(b.month!));
  const history = { pieces, at: 0, records: 0, asks: 0, problems: [] as string[], waits: 0, attempt: 0 };
  const key = stepKey("INSIGHTS", holdId);
  await t.mutation(internal.collectionSteps.startChain, { key, chain: "INSIGHTS", runId: run.runId, place: "HISTORY:0", args: { ...run, stage: "HISTORY", history } });
  const watchId = await t.mutation(internal.insightsRunSteps.bookInsightsWatch, { ...run, step: "HISTORY" });
  return { run, history, key, watchId };
}

describe("history carried in pieces", () => {
  test("saves one month and its successor before stopping; that successor never requests the completed month", async () => {
    const t = harness();
    const state = await watchedHistory(t);
    const google = fakeGoogle([...dayOf("2025-07-14"), ...dayOf("2025-08-14")]);
    await t.action(internal.insightHistorySteps.fillForRun, { ...state.run, watchId: state.watchId, pagesChanged: [], history: state.history });
    const next = await t.run(async (ctx) => (await ctx.db.query("collectionSteps").withIndex("by_key", (q) => q.eq("key", state.key)).unique())!);
    expect(next.args.history).toMatchObject({ at: 1, records: 1 });
    const before = google.calls.length;
    await t.action(internal.insightHistorySteps.fillForRun, { ...state.run, watchId: state.watchId, pagesChanged: [], history: next.args.history });
    const reports = google.calls.slice(before).filter((call) => call.url.endsWith(":runReport")).map((call) => JSON.parse(call.body));
    expect(reports.length).toBeGreaterThan(0);
    expect(reports.map((call) => ({ from: call.dateRanges[0].startDate, dims: call.dimensions.map((dimension: { name: string }) => dimension.name) }))).toEqual([{ from: "2025-08-01", dims: ["yearMonth", "landingPage"] }, { from: "2025-08-01", dims: ["yearMonth", "landingPage", "eventName"] }]);
    const kept = await t.query(internal.insightHistory.historyOf, { holdId: state.run.holdId });
    expect(kept.filter((row) => row.kind === "GA_PAGES").map((row) => row.month)).toEqual(["2025-07", "2025-08"]);
  });

  test("books its own quota continuation at the same position without a quick retry", async () => {
    const t = harness();
    const state = await watchedHistory(t);
    fakeGoogle([]);
    const provider = globalThis.fetch;
    let asks = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith(":runReport")) { asks += 1; return Response.json({ error: { message: "Hourly quota exhausted" } }, { status: 429 }); }
      return await provider(input, init);
    }));
    await t.action(internal.insightHistorySteps.fillForRun, { ...state.run, watchId: state.watchId, pagesChanged: [], history: state.history });
    const next = await t.run(async (ctx) => (await ctx.db.query("collectionSteps").withIndex("by_key", (q) => q.eq("key", state.key)).unique())!);
    expect(asks).toBe(1);
    expect(next.args.history).toMatchObject({ at: 0, waits: 1, records: 0 });
    expect(next.bookedAt - Date.now()).toBeGreaterThan(60 * 60 * 1_000);
  });

  test("saving Analytics days preserves Search Console's figures and other completed months", async () => {
    const t = harness();
    const { holdId } = await withAnalytics(t);
    const record = { kind: "DAYS" as const, month: "", from: "2026-08-01", to: "2026-09-30", rows: [{ key: "2026-08-12", clicks: 12 }, { key: "2026-09-15", clicks: 7 }] };
    await t.mutation(internal.insightHistory.saveHistory, { holdId, newestDay: NEWEST, records: [record] });
    await t.mutation(internal.insightHistory.saveHistory, { holdId, newestDay: NEWEST, mergeDays: true, records: [{ ...record, from: "2026-09-01", rows: [{ key: "2026-09-15", visits: 20, enquiries: 3 }] }] });
    expect((await t.query(internal.insightHistory.historyOf, { holdId }))[0].rows).toEqual([{ key: "2026-08-12", clicks: 12 }, { key: "2026-09-15", clicks: 7, visits: 20, enquiries: 3 }]);
    await t.mutation(internal.insightHistory.saveHistory, { holdId, newestDay: NEWEST, mergeDays: true, mergeDaySource: "GA", records: [{ ...record, from: "2026-09-01", rows: [] }] });
    expect((await t.query(internal.insightHistory.historyOf, { holdId }))[0].rows).toEqual([{ key: "2026-08-12", clicks: 12 }, { key: "2026-09-15", clicks: 7 }]);
  });
  test("streams a 150,000-page month, keeps the existing top-and-other rule, and counts every Google request", async () => {
    const t = harness(), state = await watchedHistory(t);
    fakeGoogle([]);
    const provider = globalThis.fetch;
    const rows = 150_000;
    let requests = 0, biggest = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!String(input).endsWith(":runReport")) return await provider(input, init);
      const report = JSON.parse(String(init?.body)) as { offset: number; limit: number; dimensions: Array<{ name: string }> };
      requests += 1;
      const events = report.dimensions.some((dimension) => dimension.name === "eventName");
      const count = Math.min(report.limit, rows - report.offset);
      biggest = Math.max(biggest, count);
      return Response.json({ rowCount: rows, rows: Array.from({ length: count }, (_, index) => {
        const at = report.offset + index;
        return { dimensionValues: ["202507", `/page-${at}/`, ...(events ? ["generate_lead"] : [])].map((value) => ({ value })), metricValues: (events ? [2, 1] : [at + 1]).map((value) => ({ value: String(value) })) };
      }) });
    }));
    const history = { ...state.history, pieces: state.history.pieces.slice(0, 1) };
    await t.action(internal.insightHistorySteps.fillForRun, { ...state.run, watchId: state.watchId, pagesChanged: [], history });
    const kept = (await t.query(internal.insightHistory.historyOf, { holdId: state.run.holdId })).find((record) => record.kind === "GA_PAGES")!;
    expect(biggest).toBe(25_000);
    expect(requests).toBe(12);
    expect(kept.rows).toHaveLength(1_500);
    expect(kept.rows.some((row) => row.key === "(other)")).toBe(true);
    expect(kept.rows.reduce((sum, row) => sum + (row.visits ?? 0), 0)).toBe(rows * (rows + 1) / 2);
    expect(kept.rows.reduce((sum, row) => sum + (row.enquiries ?? 0), 0)).toBe(rows * 2);
    const stages = await t.query(internal.insightsRunSteps.stageResults, { runId: state.run.runId });
    expect(stages.find((stage) => stage.stage === "History")?.detail).toContain("12 asks");
  });

});
