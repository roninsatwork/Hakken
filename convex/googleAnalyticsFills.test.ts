import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { useFixedDay } from "@/src/test/realTime";
import { finishScheduled } from "@/src/test/finishScheduled";
import { NEWEST, dayOf, history, type Visit } from "@/src/test/googleAnalyticsFake";
import { FINISHED_ON_9_OCTOBER, collectedWebsite } from "@/src/test/googleAnalyticsCollected";
import { shiftDay } from "./searchConsoleDays";
import { encryptConnectorToken } from "./connectorTokenCrypto";
import { fillStops } from "./googleAnalyticsHistory";
import { PAGE_ROWS_PER_ASK, pageFillPieces, unitsPerAsk } from "./googleAnalyticsPageSeries";
import { RUN_DAY_MS } from "./googleAnalyticsBudget";
import { historyFloors } from "./utils/analyticsHistory";

/**
 * The two-year fills on a big website (docs/plans/active/ga-big-site-reliability-plan.md
 * BR5–BR7): they start only after a night's run, never on connecting; a fill
 * stopped part-way starts after the last piece it wrote; one that spends the
 * hour's budget waits for the hour while the night lasts, and stops past it;
 * each page's two years are asked in pieces sized to the website. Counted,
 * not timed, with Google faked.
 */

const NOW = Date.parse("2026-10-09T09:30:00Z");
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

/** Two years of the plain day. */
function twoYears(): Visit[] {
  return Array.from({ length: 730 }, (_, at) => dayOf(shiftDay(NEWEST, -at))).flat();
}

const reportsOf = (google: { calls: { url: string; body: string }[] }, from = 0) =>
  google.calls.slice(from).filter((call) => call.url.endsWith(":runReport")).map((call) => call.body);

beforeEach(() => {
  useFixedDay();
  vi.setSystemTime(NOW);
  vi.stubEnv("CONNECTOR_TOKEN_ENCRYPTION_KEY", Buffer.from(new Uint8Array(32).fill(7)).toString("base64"));
  vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_ID", "sc-client.apps.googleusercontent.com");
  vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_SECRET", "sc-secret");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("each page's fill pieces (BR5)", () => {
  test("as many months, weeks or days an ask as keep the answer near 30,000 rows: a small website's spans whole, a big one's a unit at a time", () => {
    expect(PAGE_ROWS_PER_ASK).toBe(30_000);
    expect(unitsPerAsk(95)).toBe(105);
    expect(unitsPerAsk(15_000)).toBe(1);
    expect(unitsPerAsk(null)).toBe(1);
    const floors = historyFloors(NEWEST);
    for (const units of [unitsPerAsk(95), unitsPerAsk(1_400), unitsPerAsk(15_000)]) {
      const pieces = pageFillPieces(NEWEST, units);
      // Oldest first, from two years back to the newest day, no day missed or asked twice.
      expect(pieces[0].from).toBe(floors.month);
      expect(pieces.at(-1)?.to).toBe(NEWEST);
      for (const [at, piece] of pieces.entries()) if (at > 0) expect(piece.from).toBe(shiftDay(pieces[at - 1].to, 1));
    }
    // A 95-page website: the months, the weeks, the week the 92 days kept begin in, and the 92 days — one ask each.
    expect(pageFillPieces(NEWEST, unitsPerAsk(95)).map((piece) => piece.lead)).toEqual(["yearMonth", "isoYearIsoWeek", "isoYearIsoWeek", "date"]);
    // A 15,000-page website: a month, a week or a day an ask.
    const big = pageFillPieces(NEWEST, unitsPerAsk(15_000));
    expect(big.filter((piece) => piece.lead === "date")).toHaveLength(92);
    expect(big.filter((piece) => piece.lead === "date").every((piece) => piece.from === piece.to)).toBe(true);
    expect(big.filter((piece) => piece.lead === "yearMonth").every((piece) => piece.from.slice(0, 7) === piece.to.slice(0, 7))).toBe(true);
  });

  test("a fill's step hands on once its minutes are up, and inside the night only waits for the hour", async () => {
    const again: number[] = [];
    const outcome = () => ({ pieces: 1, rows: 0, requests: 0 });
    const wait = { ok: false as const, reason: "Exhausted … under an hour.", access: false, busy: false, wait: true, requests: 1 };
    const step = fillStops({} as never, async (atMs) => again.push(atMs), NOW, outcome);
    expect(step.timeUp()).toBe(false);
    vi.setSystemTime(NOW + 5 * 60_000);
    expect(step.timeUp()).toBe(true);
    expect(await step.handOn()).toMatchObject({ ok: true, handedOn: "STEP" });
    expect(await step.stopped(wait)).toMatchObject({ ok: true, handedOn: "HOUR" });
    expect(again).toEqual([0, 62 * 60_000]);
    // Past the night, or not a night's fill: stopped, for the next night's run.
    vi.setSystemTime(NOW + RUN_DAY_MS - 30 * 60_000);
    expect(await fillStops({} as never, async () => undefined, NOW, outcome).stopped(wait)).toMatchObject({ ok: false });
    expect(await fillStops({} as never, async () => undefined, undefined, outcome).stopped(wait)).toMatchObject({ ok: false });
  });
});

describe("the fills follow the night (BR6, BR7)", () => {
  test("connecting brings the 92 days at once; the two years wait for the night's run, then fill", async () => {
    const t = harness();
    // A short past is enough: what is asked, not how much comes back. Counted by Google's own counts already, with its
    // finished periods fetched, so its runs ask the periods still going alone: the fills are this test's subject.
    const { connectionId } = await collectedWebsite(t, history(91), encryptConnectorToken, {
      firstNight: false,
      connection: FINISHED_ON_9_OCTOBER,
    });
    const connected = (await t.run(async (ctx) => await ctx.db.get(connectionId)))!;
    expect(connected.newestDay).toBe(NEWEST);
    expect(connected.historyFilled).toBeUndefined();
    expect(connected.pageHistoryFrom).toBeUndefined();

    // The night's run: one run of its own for the website, then the fills.
    vi.setSystemTime(NOW + 15 * 60 * 60_000);
    const agentId = (await t.run(async (ctx) => await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", "GOOGLE_ANALYTICS_COLLECTOR")).first()))!._id;
    const runId = await t.run(async (ctx) => await ctx.db.insert("agentRuns", {
      agentId, triggerType: "SCHEDULE", objective: "Collect", title: "Google Analytics: Data Collection Scheduler",
      status: "QUEUED", startedAt: Date.now(), updatedAt: Date.now(),
    }));
    await t.action(internal.googleAnalyticsAgentRun.runGoogleAnalyticsCollectorNow, { runId });
    await finishScheduled(t);
    const filled = (await t.run(async (ctx) => await ctx.db.get(connectionId)))!;
    expect(filled.historyFilled).toEqual(expect.arrayContaining(["total", "channel", "event", "campaign", "visitorType"]));
    expect(filled.pageHistoryFrom).toBe(historyFloors(filled.newestDay!).month);
    // Done: no place left behind.
    expect(filled.fillsReached).toBeUndefined();
  });

  test("a page fill stopped part-way starts after the last piece it wrote, and asks none again", async () => {
    const t = harness();
    const { connectionId, google } = await collectedWebsite(t, twoYears(), encryptConnectorToken, { firstNight: false });
    // Google refuses the weeks: the months are written, then the fill stops.
    google.refusing = { when: "isoYearIsoWeek", times: 1, status: 400, message: "Invalid argument." };
    const first = await t.action(internal.googleAnalyticsSteps.fillPageHistory, { connectionId });
    expect(first).toMatchObject({ ok: false });
    const stopped = (await t.run(async (ctx) => await ctx.db.get(connectionId)))!;
    const floors = historyFloors(stopped.newestDay!);
    expect(stopped.fillsReached).toEqual([{ country: "", fill: "pages", to: shiftDay(floors.week, -1) }]);
    expect(stopped.pageHistoryFrom).toBeUndefined();

    const asked = google.calls.length;
    expect((await t.action(internal.googleAnalyticsSteps.fillPageHistory, { connectionId })).ok).toBe(true);
    const again = reportsOf(google, asked);
    expect(again.some((body) => body.includes("yearMonth"))).toBe(false);
    expect(again.some((body) => body.includes("isoYearIsoWeek"))).toBe(true);
    const done = (await t.run(async (ctx) => await ctx.db.get(connectionId)))!;
    expect(done.pageHistoryFrom).toBe(floors.month);
    expect(done.fillsReached).toBeUndefined();
  });

  test("a day-list fill that spends the hour's budget inside the night waits for the hour, and carries on where it stopped", async () => {
    const t = harness();
    const { connectionId, google } = await collectedWebsite(t, twoYears(), encryptConnectorToken, { firstNight: false });
    // The 92 days are held, so the fill asks the months first: the first piece's channels refused for the hour.
    google.refusing = { when: "\"startDate\":\"" + historyFloors(NEWEST).month, times: 1, status: 429, message: "Exhausted property tokens per hour quota. This quota will refresh in under an hour." };
    const waited = await t.action(internal.googleAnalyticsSteps.fillHistory, { connectionId, lists: ["channel"], nightFrom: Date.now() });
    expect(waited).toMatchObject({ ok: true, handedOn: "HOUR" });
    expect((await t.run(async (ctx) => await ctx.db.get(connectionId)))!.historyFilled).toBeUndefined();
    // After the hour, by itself: filled.
    await finishScheduled(t);
    expect((await t.run(async (ctx) => await ctx.db.get(connectionId)))!.historyFilled).toEqual(["channel"]);
  });
});
