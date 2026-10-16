import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { encryptConnectorToken } from "./connectorTokenCrypto";
import { unpackTotals } from "./utils/clarityPacks";
import { CLARITY_COLLECTOR, CLARITY_COLLECTOR_SCHEDULE } from "./utils/clarityCollectorAgent";
import { finishScheduled } from "@/src/test/finishScheduled";
import { useFixedDay } from "@/src/test/realTime";

/**
 * The Microsoft Clarity: Collector Agent end to end, Clarity faked at the
 * network (docs/plans/active/agents-and-clarity-plan.md, Part 2, CC1–CC6): a
 * run of its own for each website, a missed morning worked out from Clarity's
 * days together, its ten asks a day with two kept in hand, a refused token
 * told to the company's admins once, and connecting starting the first run.
 */

const KEY = Buffer.from(new Uint8Array(32).fill(7)).toString("base64");
// `useFixedDay`: 1 October 2026, so Clarity's last day is filed as 30 September.
const YESTERDAY = "2026-09-30";
const DAY_BEFORE = "2026-09-29";

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

/** One of Clarity's recordings, as its recordings service lists them (its shape, from ronins.co.uk's own on 2026-10-16). */
const RECORDING = {
  link: "https://clarity.microsoft.com/player/proj123/user1/session1",
  timestamp: "2026-09-30 12:27:58",
  totalDuration: "16 minutes and 36 seconds",
  activeDuration: "05 minutes and 51 seconds",
  pagesCount: 2,
  sessionClickCount: 1,
  timeline: [
    { url: "https://www.ronins.test/case-study/catch-app/", referrerUrl: "https://www.google.com/", duration: 351038, displayTitle: "Catch App", timelineEvents: [] },
    { url: "https://www.ronins.test/contact/", referrerUrl: null, duration: 645414, displayTitle: "Contact", timelineEvents: [{ eventtype: "Click", start: "06:09" }] },
  ],
};

/**
 * Clarity's answer over `days` days, as its export names its rows (`Url`,
 * `Device`, `Source`, `Browser`): the contact page's people grow by 10 a day,
 * the bots by 1. Its recordings service answers with one recording. What was
 * asked is the export's question, or "recordings" and the filter.
 */
function fakeClarity(answer: (url: URL) => Response | null = () => null): string[] {
  const asked: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const recordings = url.hostname === "clarity.microsoft.com";
    asked.push(recordings ? `recordings ${JSON.stringify((JSON.parse(String(init?.body)) as { filters: object }).filters).replace(/,?"date":\{[^}]*\}/, "")}` : url.search);
    const own = answer(url);
    if (own) return own;
    if (recordings) return new Response(JSON.stringify([RECORDING]), { status: 200 });
    const days = Number(url.searchParams.get("numOfDays"));
    const splits = [1, 2, 3].map((at) => url.searchParams.get(`dimension${at}`));
    const row = {
      ...(splits.includes("URL") ? { Url: "https://www.ronins.test/contact/" } : {}),
      Device: "PC",
      ...(splits.includes("Source") ? { Source: "google" } : {}),
      ...(splits.includes("Browser") ? { Browser: "Chrome" } : {}),
    };
    return new Response(JSON.stringify([
      { metricName: "Traffic", information: [{ ...row, totalSessionCount: String(11 * days), totalBotSessionCount: String(days), distantUserCount: String(9 * days), PagesPerSessionPercentage: 1.5 }] },
      { metricName: "ScrollDepth", information: [{ ...row, averageScrollDepth: 40 }] },
      { metricName: "EngagementTime", information: [{ ...row, activeTime: 30 }] },
    ]), { status: 200 });
  }));
  return asked;
}

/** Every ask a morning makes once the day's own figures are in: sources and browsers, the website's and by page, then the longest visits' recordings. */
const SPLIT_ASKS = [
  "?numOfDays=1&dimension1=Device&dimension2=Source",
  "?numOfDays=1&dimension1=URL&dimension2=Device&dimension3=Source",
  "?numOfDays=1&dimension1=Browser&dimension2=Device",
  "?numOfDays=1&dimension1=URL&dimension2=Browser&dimension3=Device",
];

/** A website connected to Clarity with a sealed token and an admin, and the Collector made as connecting makes it. */
async function connected(t: Harness, extra: { newestDay?: string; asks?: { day: string; used: number } } = {}) {
  const tokenCiphertext = await encryptConnectorToken("clarity-token");
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Ronins", createdAt: 1 });
    const adminId = await ctx.db.insert("users", { email: "owner@ronins.test", role: "ADMIN", companyId });
    await ctx.db.insert("users", { email: "member@ronins.test", role: "USER", companyId });
    const websiteId = await ctx.db.insert("websites", { host: "ronins.test", displayHost: "ronins.test", firstSeenAt: 1 });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    const connectionId = await ctx.db.insert("clarityConnections", { companyId, companyWebsiteId: holdId, status: "CONNECTED", tokenCiphertext, ...extra, createdAt: 1, updatedAt: 1 });
    return { companyId, adminId, holdId, connectionId };
  });
  const agentId = await t.mutation(internal.clarityAgentRun.ensureClarityCollectorInternal, {});
  return { ...ids, agentId };
}

async function runCollector(t: Harness, agentId: Id<"agents">) {
  const runId = await t.run(async (ctx) => await ctx.db.insert("agentRuns", {
    agentId, triggerType: "SCHEDULE", objective: "Collect", title: CLARITY_COLLECTOR_SCHEDULE.name, status: "QUEUED", startedAt: Date.now(), updatedAt: Date.now(),
  }));
  await t.action(internal.clarityAgentRun.runClarityCollectorNow, { runId });
  await finishScheduled(t);
  const runs = await t.run(async (ctx) => await ctx.db.query("agentRuns").collect());
  return { parent: runs.find((run) => run._id === runId)!, site: runs.filter((run) => run.title === "Microsoft Clarity: ronins.test").at(-1) };
}

/** A day's own figures as kept, its parts together: the website's in the first, its pages in the rest. */
const dayVisits = async (t: Harness, holdId: Id<"companyWebsites">, day: string) => await t.run(async (ctx) => {
  const parts = await ctx.db.query("clarityFigures").withIndex("by_hold_span_kind_key", (q) => q.eq("companyWebsiteId", holdId).eq("span", "DAY").eq("kind", undefined).eq("key", day)).collect();
  return parts.length > 0
    ? { pages: parts.flatMap((part) => unpackTotals(part.pages)).map((row) => [row.page, row.visits, row.bots]), site: parts.flatMap((part) => unpackTotals(part.site)).map((row) => [row.device, row.visits, row.bots]) }
    : null;
});

beforeEach(() => {
  useFixedDay();
  vi.stubEnv("CONNECTOR_TOKEN_ENCRYPTION_KEY", KEY);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the Microsoft Clarity: Collector Agent", () => {
  test("keeps yesterday in a run of the website's own — its figures, sources, browsers and recordings, seven asks counted — and lets the website go", async () => {
    const t = harness();
    const { holdId, connectionId, agentId } = await connected(t, { newestDay: DAY_BEFORE });
    const asked = fakeClarity();
    const { parent, site } = await runCollector(t, agentId);

    expect(parent.finalOutput).toContain("Started a run of its own for the 1 website connected to Microsoft Clarity: ronins.test");
    expect(site?.status).toBe("SUCCESS");
    expect(site?.finalOutput).toContain("Kept ronins.test's Clarity figures for 30 Sept, with yesterday's sources and browsers and 1 recordings worth watching.");
    // Nothing went wrong yesterday, so the only recordings asked for are the longest visits.
    expect(asked).toEqual(["?numOfDays=1&dimension1=URL&dimension2=Device", "?numOfDays=1&dimension1=Device", ...SPLIT_ASKS, "recordings {}"]);
    expect(await dayVisits(t, holdId, YESTERDAY)).toEqual({ pages: [["/contact/", 10, 1]], site: [["PC", 10, 1]] });
    const kinds = await t.run(async (ctx) => (await ctx.db.query("clarityFigures").withIndex("by_hold_span_kind_key", (q) => q.eq("companyWebsiteId", holdId).eq("span", "DAY").eq("kind", "SOURCES")).collect()).flatMap((record) => unpackTotals(record.pages).map((row) => [row.page, row.device, row.split, row.visits])));
    expect(kinds).toEqual([["/contact/", "PC", "google", 10]]);
    const connection = await t.run(async (ctx) => await ctx.db.get(connectionId));
    expect(connection).toMatchObject({ newestDay: YESTERDAY, asks: { day: "2026-10-01", used: 7 }, projectId: "proj123", origin: "https://www.ronins.test" });
    expect(connection?.collecting).toBeUndefined();
    const recordings = await t.run(async (ctx) => await ctx.db.query("clarityRecordings").collect());
    expect(recordings.map((row) => [row.day, row.kind, row.page, row.activeSeconds, row.totalSeconds, row.pages, row.referrer])).toEqual([[YESTERDAY, "LONGEST", "/contact/", 351, 996, 2, "google.com"]]);
  });

  test("asks for recordings of what yesterday's figures say happened, two kinds at most", async () => {
    const t = harness();
    const { agentId } = await connected(t, { newestDay: DAY_BEFORE });
    const asked = fakeClarity((url) => {
      if (url.hostname === "clarity.microsoft.com" || url.searchParams.get("dimension1") !== "Device" || url.searchParams.get("dimension2")) return null;
      const row = { Device: "PC" };
      return new Response(JSON.stringify([
        { metricName: "Traffic", information: [{ ...row, totalSessionCount: "20", totalBotSessionCount: "0", distantUserCount: "18" }] },
        { metricName: "ScriptErrorCount", information: [{ ...row, sessionsWithMetricPercentage: 10 }] },
        { metricName: "QuickbackClick", information: [{ ...row, sessionsWithMetricPercentage: 5 }] },
      ]), { status: 200 });
    });
    await runCollector(t, agentId);
    expect(asked.filter((ask) => ask.startsWith("recordings"))).toEqual(['recordings {"javascriptErrors":[""]}', 'recordings {"quickbackClickPresent":true}']);
  });

  test("a large website's cut pages are asked again without their devices, and a list still cut is kept as cut", async () => {
    const answerOf = (rows: Array<Record<string, unknown>>) => new Response(JSON.stringify([{ metricName: "Traffic", information: rows.map((row) => ({ ...row, totalSessionCount: "3", totalBotSessionCount: "0", distinctUserCount: "3" })) }]), { status: 200 });
    // By page and device: 1,000 rows, 334 pages on three devices — Clarity's whole answer, cut.
    const byDevice = Array.from({ length: 1_000 }, (_, at) => ({ Url: `https://www.ronins.test/p-${Math.floor(at / 3)}/`, Device: ["PC", "Mobile", "Tablet"][at % 3] }));
    const run = async (alone: number) => {
      const t = harness();
      const { holdId, agentId, connectionId } = await connected(t, { newestDay: DAY_BEFORE });
      const asked = fakeClarity((url) => {
        if (url.hostname === "clarity.microsoft.com") return null;
        const splits = [1, 2, 3].map((at) => url.searchParams.get(`dimension${at}`)).join(",");
        if (splits === "URL,Device,") return answerOf(byDevice);
        if (splits === "URL,,") return answerOf(Array.from({ length: alone }, (_, at) => ({ Url: `https://www.ronins.test/p-${at}/` })));
        return null;
      });
      const { site } = await runCollector(t, agentId);
      const parts = await t.run(async (ctx) => await ctx.db.query("clarityFigures").withIndex("by_hold_span_kind_key", (q) => q.eq("companyWebsiteId", holdId).eq("span", "DAY").eq("kind", undefined).eq("key", YESTERDAY)).collect());
      const rows = parts.flatMap((part) => unpackTotals(part.pages));
      return { asked, site, parts, rows, connection: await t.run(async (ctx) => await ctx.db.get(connectionId)) };
    };

    const filled = await run(600);
    expect(filled.asked.slice(0, 3)).toEqual(["?numOfDays=1&dimension1=URL&dimension2=Device", "?numOfDays=1&dimension1=Device", "?numOfDays=1&dimension1=URL"]);
    expect(new Set(filled.rows.map((row) => row.page)).size).toBe(600);
    // The pages only the second list holds are counted across devices, on none of them.
    expect(filled.rows.filter((row) => row.device === "Any")).toHaveLength(600 - 334);
    expect(filled.parts.find((part) => part.part === 0)?.cut).toBeUndefined();
    // Eight asks: the day's two, the pages again, sources and browsers; one recording ask.
    expect(filled.connection?.asks?.used).toBe(8);

    const stillCut = await run(1_000);
    expect(stillCut.parts.find((part) => part.part === 0)?.cut).toBe(true);
    expect(stillCut.site?.status).toBe("SUCCESS");
  });

  test("a missed morning is worked out as Clarity's two days together less the day after it", async () => {
    const t = harness();
    const { holdId, connectionId, agentId } = await connected(t, { newestDay: "2026-09-28" });
    const asked = fakeClarity();
    const { site } = await runCollector(t, agentId);

    // Two days' own figures, four asks; yesterday's sources and browsers, four more; and none left for recordings.
    expect(asked).toHaveLength(8);
    expect(asked.slice(4)).toEqual(SPLIT_ASKS);
    expect(site?.finalOutput).toContain("for 29 Sept, 30 Sept");
    expect(await dayVisits(t, holdId, DAY_BEFORE)).toEqual({ pages: [["/contact/", 10, 1]], site: [["PC", 10, 1]] });
    expect(await dayVisits(t, holdId, YESTERDAY)).toEqual({ pages: [["/contact/", 10, 1]], site: [["PC", 10, 1]] });
    expect((await t.run(async (ctx) => await ctx.db.get(connectionId)))?.asks?.used).toBe(8);
    const log = await t.run(async (ctx) => (await ctx.db.query("agentLogs").collect()).map((entry) => `${entry.interactionType}: ${entry.responseContent}`));
    expect(log).toContain("Recordings: None picked today: the asks left are the 2 kept in hand.");
  });

  test("asks nothing when the website is up to date, or when only the two kept in hand are left", async () => {
    const t = harness();
    const upToDate = await connected(t, { newestDay: YESTERDAY });
    const asked = fakeClarity();
    const first = await runCollector(t, upToDate.agentId);
    expect(first.site?.finalOutput).toContain("Already up to date");

    await t.run(async (ctx) => await ctx.db.patch(upToDate.connectionId, { newestDay: DAY_BEFORE, asks: { day: "2026-10-01", used: 7 } }));
    const second = await runCollector(t, upToDate.agentId);
    expect(second.site?.finalOutput).toContain("7 of Clarity's 10 asks for today are used, and 2 are kept in hand");
    expect(asked).toEqual([]);
  });

  test("grants asks in whole steps, keeping two in hand, and a new day starts the count again", async () => {
    const t = harness();
    const { holdId, connectionId } = await connected(t, { asks: { day: "2026-10-01", used: 3 } });
    expect(await t.mutation(internal.clarityAgentRun.takeAsks, { holdId, want: 6 })).toEqual({ granted: 4, used: 7 });
    expect(await t.mutation(internal.clarityAgentRun.takeAsks, { holdId, want: 2 })).toEqual({ granted: 0, used: 7 });
    // One left of the eight: a recording's ask, never half a day's.
    expect(await t.mutation(internal.clarityAgentRun.takeAsks, { holdId, want: 2, step: 1 })).toEqual({ granted: 1, used: 8 });

    await t.run(async (ctx) => await ctx.db.patch(connectionId, { asks: { day: "2026-09-30", used: 10 } }));
    expect(await t.mutation(internal.clarityAgentRun.takeAsks, { holdId, want: 6 })).toEqual({ granted: 6, used: 6 });
  });

  test("a refused token marks the connection Needs connecting again and tells the company's admin once", async () => {
    const t = harness();
    const { holdId, connectionId, adminId, agentId } = await connected(t, { newestDay: DAY_BEFORE });
    fakeClarity(() => new Response("Unauthorized", { status: 401 }));
    const { site } = await runCollector(t, agentId);

    expect(site?.status).toBe("FAILED");
    expect(await t.run(async (ctx) => await ctx.db.get(connectionId))).toMatchObject({ status: "NEEDS_RECONNECT", problem: expect.stringContaining("Clarity refused the token") });
    const told = await t.run(async (ctx) => await ctx.db.query("notifications").collect());
    expect(told.map((note) => [note.userId, note.kind, note.href])).toEqual([[adminId, "CLARITY_NEEDS_RECONNECT", `/app/clarity/${holdId}/connection`]]);
    // Refused again, nobody is told twice.
    expect(await t.mutation(internal.clarityAgentRun.noteRefused, { holdId, problem: "Still refused." })).toBe(0);
  });

  test("Clarity's asks spent for the day marks the day spent, never asked again in a loop", async () => {
    const t = harness();
    const { connectionId, agentId } = await connected(t, { newestDay: DAY_BEFORE });
    const asked = fakeClarity(() => new Response("Too many", { status: 429 }));
    const { site } = await runCollector(t, agentId);

    expect(site?.status).toBe("FAILED");
    expect(asked).toHaveLength(1);
    expect((await t.run(async (ctx) => await ctx.db.get(connectionId)))?.asks?.used).toBe(10);
  });

  test("a website switched off on its Schedules page gets no run and hands over no token", async () => {
    const t = harness();
    const { holdId, connectionId, agentId } = await connected(t);
    expect(await t.query(internal.clarityAgentRun.agentCollections, {})).toEqual([{ holdId, companyId: expect.any(String), host: "ronins.test" }]);

    await t.run(async (ctx) => await ctx.db.patch(connectionId, { switchedOff: true }));
    expect(await t.query(internal.clarityAgentRun.agentCollections, {})).toEqual([]);
    expect((await t.query(internal.clarityAgentRun.sitePlan, { holdId })).ciphertext).toBeNull();
    const { parent } = await runCollector(t, agentId);
    expect(parent.finalOutput).toContain("nothing to collect");
  });

  test("connecting makes the agent and its morning schedule once, and starts the website's first collection", async () => {
    const t = harness();
    const { holdId } = await connected(t);
    const asked = fakeClarity();
    expect(await t.mutation(internal.clarityAgentRun.startFirstCollection, { holdId })).toBe("STARTED");
    await finishScheduled(t);

    const agents = await t.run(async (ctx) => await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", CLARITY_COLLECTOR.systemKey)).collect());
    expect(agents).toHaveLength(1);
    const schedules = await t.run(async (ctx) => (await ctx.db.query("schedules").collect()).filter((row) => row.agentId === agents[0]._id));
    expect(schedules.map((row) => [row.name, row.intervalStr, row.isActive])).toEqual([[CLARITY_COLLECTOR_SCHEDULE.name, CLARITY_COLLECTOR_SCHEDULE.intervalStr, true]]);
    expect(asked).toHaveLength(7);
    expect(await dayVisits(t, holdId, YESTERDAY)).not.toBeNull();

    // Switched off on the Agents screen, connecting starts nothing.
    await t.run(async (ctx) => await ctx.db.patch(agents[0]._id, { isActive: false }));
    expect(await t.mutation(internal.clarityAgentRun.startFirstCollection, { holdId })).toBe("AGENT_OFF");
  });
});
