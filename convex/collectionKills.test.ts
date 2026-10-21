import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { useFixedDay } from "@/src/test/realTime";
import { finishScheduled } from "@/src/test/finishScheduled";
import { history } from "@/src/test/googleAnalyticsFake";
import { FINISHED_ON_9_OCTOBER, collectedWebsite } from "@/src/test/googleAnalyticsCollected";
import { encryptConnectorToken } from "./connectorTokenCrypto";
import { STEP_WATCH_MS, bookStep } from "./collectionSteps";
import { runStepKey } from "./googleAnalyticsAgentRun";
import { fillStepKey } from "./googleAnalyticsFillAfter";
import { fillStepKey as consoleFillKey, runStepKey as consoleRunKey } from "./searchConsoleAgentRun";
import { fakeGoogle as fakeSearchConsole, row } from "@/src/test/searchConsoleFake";

/**
 * Killed on purpose (collection-reliability-plan.md, RR5): a step of a
 * website's collection stopped by the platform where it stands — out of
 * memory, past an action's ten minutes, a restart — at each kind of job, and
 * the run still finishes, with its closing done. The watch (`collectionSteps.ts`)
 * carries it on from its saved place.
 *
 * A stop is made the way the platform makes one: Google's answer at the
 * chosen ask is a marker nothing on the step can read, so the step's own
 * catch — whose words for the run are `failureSummary`'s — throws too, and
 * the step ends with nothing after it run: no closing, no handing on.
 */

const { STOPPED, settleStops } = vi.hoisted(() => ({ STOPPED: new Error("The platform stopped the step."), settleStops: { left: 0, made: 0 } }));

vi.mock("./roleRuns", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./roleRuns")>();
  return {
    ...actual,
    failureSummary: (error: unknown) => {
      if (error === STOPPED) throw error;
      return actual.failureSummary(error);
    },
  };
});

const NOW = Date.parse("2026-10-09T09:30:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

beforeEach(() => {
  useFixedDay();
  vi.setSystemTime(NOW);
  vi.stubEnv("CONNECTOR_TOKEN_ENCRYPTION_KEY", Buffer.from(new Uint8Array(32).fill(7)).toString("base64"));
  vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_ID", "sc-client.apps.googleusercontent.com");
  vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_SECRET", "sc-secret");
  // The step's messages about the stop it cannot read.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

// Search Console's adding-up asks Google nothing: its job is stopped where it builds the periods.
vi.mock("./searchConsolePeriods", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./searchConsolePeriods")>();
  return {
    ...actual,
    buildSitePeriods: async (...args: Parameters<typeof actual.buildSitePeriods>) => {
      if (settleStops.left > 0) {
        settleStops.left -= 1;
        settleStops.made += 1;
        throw STOPPED;
      }
      return await actual.buildSitePeriods(...args);
    },
  };
});

/** A Data API ask's dimensions, in order, as one line. */
function dimensionsOf(body: string): string {
  try {
    return ((JSON.parse(body) as { dimensions?: Array<{ name: string }> }).dimensions ?? []).map((one) => one.name).join(",");
  } catch {
    return "";
  }
}

/**
 * Google's answers stopped where they stand: the next `times` asks `when`
 * picks stop their step. Each ask also moves the clock on a few seconds, as
 * real asks take, so a step saves its place between jobs and hands on after
 * its minutes, as on the real backend.
 */
function stopAt(when: (ask: { url: string; body: string }) => boolean, times = 1) {
  const answer = globalThis.fetch;
  const stops = { left: times, made: 0 };
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? init.body : "";
    if (url.includes("analyticsdata.googleapis.com") || url.includes("/searchAnalytics/query")) {
      vi.setSystemTime(Date.now() + 6_000);
      if (stops.left > 0 && when({ url, body })) {
        stops.left -= 1;
        stops.made += 1;
        return { ok: true, status: 200, json: async () => { throw STOPPED; }, text: async () => "" } as unknown as Response;
      }
    }
    return await answer(input, init);
  });
  return stops;
}

/** A Google Analytics ask whose dimensions `when` picks. */
const analyticsAsk = (when: (dimensions: string) => boolean) => (ask: { url: string; body: string }) =>
  ask.url.includes("analyticsdata.googleapis.com") && when(dimensionsOf(ask.body));

/** Everything scheduled run, and the watch's look after each quiet, until it has nothing to carry on. */
async function finishWithWatch(t: Harness): Promise<number> {
  let carried = 0;
  for (let look = 0; look < 30; look += 1) {
    await finishScheduled(t);
    vi.setSystemTime(Date.now() + STEP_WATCH_MS + 1);
    const now = await t.mutation(internal.collectionSteps.watchChains, {});
    if (now === 0) return carried;
    carried += now;
  }
  throw new Error("The watch was still carrying chains on after 30 looks.");
}

/** The next morning's run of every website, as its schedule starts it. */
async function nextMorning(t: Harness): Promise<void> {
  vi.setSystemTime(NOW + DAY_MS);
  const agentId = await t.run(async (ctx) => (await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", "GOOGLE_ANALYTICS_COLLECTOR")).first())!._id);
  const runId = await t.run(async (ctx) => await ctx.db.insert("agentRuns", {
    agentId, triggerType: "SCHEDULE", objective: "Collect", title: "Google Analytics: Data Collection Scheduler", status: "QUEUED", startedAt: Date.now(), updatedAt: Date.now(),
  }));
  await t.action(internal.googleAnalyticsAgentRun.runGoogleAnalyticsCollectorNow, { runId });
}

async function siteRunOf(t: Harness) {
  const runs = await t.run(async (ctx) => await ctx.db.query("agentRuns").collect());
  const run = runs.filter((one) => one.title === "Google Analytics: acme-shop.test").at(-1)!;
  const lines = await t.run(async (ctx) => (await ctx.db.query("agentRunSteps").collect())
    .filter((step) => step.runId === run._id)
    .map((step) => ({ heading: step.input ?? "", detail: step.output ?? "", failed: step.status === "FAILED" })));
  return { run, lines };
}

const chainOf = (t: Harness, key: string) => t.run(async (ctx) => await ctx.db.query("collectionSteps").withIndex("by_key", (q) => q.eq("key", key)).unique());

describe("Google Analytics' run, a step stopped by the platform", () => {
  test.each([
    ["its days", (dimensions: string) => dimensions === "date,deviceCategory"],
    ["a ready-made list", (dimensions: string) => dimensions === "sessionManualTerm"],
    ["a page list", (dimensions: string) => dimensions === "pagePath,pageReferrer"],
  ])("at %s: carried on from its saved place, the run finishes whole, with its closing", async (_kind, when) => {
    const t = harness();
    const { connectionId } = await collectedWebsite(t, history(10), encryptConnectorToken, { connection: FINISHED_ON_9_OCTOBER });
    const stops = stopAt(analyticsAsk(when));
    await nextMorning(t);
    expect(await finishWithWatch(t)).toBeGreaterThanOrEqual(1);
    expect(stops.made).toBe(1);

    const { run, lines } = await siteRunOf(t);
    expect(run.status).toBe("SUCCESS");
    expect(lines.some((line) => line.heading === "Carried on")).toBe(true);
    // Its closing: the collecting mark gone, the lists' date its own, its chain closed.
    const connection = await t.run(async (ctx) => await ctx.db.get(connectionId));
    expect(connection?.collecting).toBeUndefined();
    expect(connection?.dailyPeriodsAt).toBeGreaterThan(NOW + DAY_MS);
    expect((await chainOf(t, runStepKey(connectionId)))?.closedAt).toBeDefined();
  });

  test("stopped three times at one list, the run leaves it out, says so, finishes, and the next run asks it first", async () => {
    const t = harness();
    const { connectionId } = await collectedWebsite(t, history(10), encryptConnectorToken, { connection: FINISHED_ON_9_OCTOBER });
    const stops = stopAt(analyticsAsk((dimensions) => dimensions === "sessionManualTerm"), 3);
    await nextMorning(t);
    await finishWithWatch(t);
    expect(stops.made).toBe(3);

    const { run, lines } = await siteRunOf(t);
    expect(run.status).toBe("SUCCESS");
    expect(lines.filter((line) => line.heading === "Carried on")).toHaveLength(3);
    const left = lines.find((line) => line.heading === "Left out");
    expect(left?.failed).toBe(true);
    expect(left?.detail).toContain("the platform stopped it three times");
    const connection = await t.run(async (ctx) => await ctx.db.get(connectionId));
    expect(connection?.collecting).toBeUndefined();
    expect(connection?.listsFrom).toBeDefined();
  });
});

describe("Google Analytics' run, ended other ways", () => {
  test("cancelled from Admin while a step waits: its chain closes and its collecting mark goes", async () => {
    const t = harness();
    const { connectionId } = await collectedWebsite(t, history(10), encryptConnectorToken, { connection: FINISHED_ON_9_OCTOBER });
    await nextMorning(t);
    const { run } = await siteRunOf(t);
    expect((await t.run(async (ctx) => await ctx.db.get(connectionId)))?.collecting?.runId).toBe(run._id);
    await t.run(async (ctx) => await ctx.db.patch(run._id, { status: "CANCELLED" }));
    await finishScheduled(t);
    expect((await t.run(async (ctx) => await ctx.db.get(connectionId)))?.collecting).toBeUndefined();
    expect((await chainOf(t, runStepKey(connectionId)))?.closedAt).toBeDefined();
  });

  test("cancelled while its step was stopped by the platform: the watch closes it, and its collecting mark goes", async () => {
    const t = harness();
    const { connectionId } = await collectedWebsite(t, history(10), encryptConnectorToken, { connection: FINISHED_ON_9_OCTOBER });
    await nextMorning(t);
    const { run } = await siteRunOf(t);
    const key = runStepKey(connectionId);
    await t.run(async (ctx) => {
      const held = (await ctx.db.query("collectionSteps").withIndex("by_key", (q) => q.eq("key", key)).unique())!;
      // The platform stops the step, and the run is cancelled from Admin before anything starts it again.
      await ctx.scheduler.cancel(held.stepJobId!);
      await ctx.db.patch(run._id, { status: "CANCELLED" });
    });
    vi.setSystemTime(Date.now() + STEP_WATCH_MS + 1);
    expect(await t.mutation(internal.collectionSteps.watchChains, {})).toBe(1);
    await finishScheduled(t);
    expect((await t.run(async (ctx) => await ctx.db.get(connectionId)))?.collecting).toBeUndefined();
    expect((await chainOf(t, key))?.closedAt).toBeDefined();
  });

  test("given up by its watch, it ends with what it has, and the next night starts from the list it had reached", async () => {
    const t = harness();
    const { connectionId } = await collectedWebsite(t, history(10), encryptConnectorToken, { connection: FINISHED_ON_9_OCTOBER });
    await nextMorning(t);
    const { run } = await siteRunOf(t);
    // As the watch books it past its most carries: the closing alone, at the 30th list of the run.
    const key = runStepKey(connectionId);
    await t.run(async (ctx) => {
      const held = (await ctx.db.query("collectionSteps").withIndex("by_key", (q) => q.eq("key", key)).unique())!;
      await ctx.scheduler.cancel(held.stepJobId!);
      const { booking: _booking, ...args } = held.args as Record<string, unknown>;
      await bookStep(ctx, { key, chain: "GA_RUN", runId: run._id, args: { ...args, to: null, weekly: true, jobAt: 30, closeOnly: true }, place: "list 31" }, true);
    });
    await finishScheduled(t);
    const ended = await siteRunOf(t);
    expect(ended.run.status).toBe("FAILED");
    expect(ended.run.finalOutput).toContain("The platform kept stopping");
    const connection = await t.run(async (ctx) => await ctx.db.get(connectionId));
    expect(connection?.collecting).toBeUndefined();
    expect(connection?.listsFrom).toBeDefined();
    expect((await chainOf(t, key))?.closedAt).toBeDefined();
  });
});

describe("Google Analytics' two-year fills, a step stopped by the platform", () => {
  test.each([
    ["the day lists' fill", "GA_FILL_DAYS" as const, (dimensions: string) => dimensions.startsWith("date,") && !/landingPage|pagePath/.test(dimensions)],
    ["each page's fill", "GA_FILL_PAGES" as const, (dimensions: string) => /^(yearMonth|isoYearIsoWeek|date),deviceCategory,(landingPage|pagePath)/.test(dimensions)],
  ])("%s is carried on from its saved place and finishes", async (_kind, chain, when) => {
    const t = harness();
    const { connectionId } = await collectedWebsite(t, history(10), encryptConnectorToken, { firstNight: false, connection: FINISHED_ON_9_OCTOBER });
    const stops = stopAt(analyticsAsk(when));
    await t.mutation(internal.googleAnalyticsFillAfter.startFills, { connectionId });
    expect(await finishWithWatch(t)).toBeGreaterThanOrEqual(1);
    expect(stops.made).toBe(1);

    const connection = await t.run(async (ctx) => await ctx.db.get(connectionId));
    expect(connection?.historyFilled?.length ?? 0).toBeGreaterThan(0);
    expect(connection?.pageHistoryFrom).toBeDefined();
    const held = await chainOf(t, fillStepKey(chain, connectionId as Id<"googleAnalyticsConnections">));
    expect(held?.closedAt).toBeDefined();
    // Carried on once (above), and its carries counted afresh once it moved past the place it was stopped at.
    expect(held?.resumes).toBe(0);
  });
});

describe("Search Console's run, a step stopped by the platform", () => {
  const SC_NOW = Date.parse("2026-09-27T09:30:00Z");
  const NEWEST = "2026-09-26";
  const property = "sc-domain:acme-shop.test";

  /** Acme's own website, with Google's Search Console faked, ready to be connected. */
  async function website(t: Harness) {
    vi.setSystemTime(SC_NOW);
    vi.stubEnv("SITE_URL", "http://localhost:3000");
    vi.stubEnv("CONVEX_SITE_URL", "https://dev-site.convex.site");
    fakeSearchConsole({
      figures: {
        [property]: {
          web: {
            [NEWEST]: {
              total: row("", 12, 400),
              query: [row("plumber leeds", 5), row("emergency plumber", 3)],
              page: [row("https://acme-shop.test/", 8)],
              country: [row("gbr", 11), row("irl", 1)],
              device: [row("MOBILE", 9), row("DESKTOP", 3)],
            },
            "2026-09-25": { total: row("", 4, 150), query: [row("plumber leeds", 4)] },
            "2025-06-01": { total: row("", 2, 60), query: [row("boiler repair", 2)] },
          },
        },
      },
    });
    return await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: Date.now() });
      const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: Date.now() });
      const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: Date.now() });
      const adminId = await ctx.db.insert("users", { name: "Admin", email: "admin@acme-shop.test", role: "ADMIN", companyId, createdAt: Date.now() });
      await ctx.db.insert("agents", {
        name: "Search Console: Collector Agent", modelId: "model-test", thinkingMode: false, isActive: true,
        systemKey: "SEARCH_CONSOLE_COLLECTOR", createdAt: Date.now(), updatedAt: Date.now(),
      });
      return { siteId, adminId };
    });
  }

  /** Connected as a person connects it, which starts its first collection at once. */
  async function connect(t: Harness, ids: { siteId: Id<"companyWebsites">; adminId: Id<"users"> }) {
    const { authorizeUrl } = await t.withIdentity({ subject: ids.adminId }).mutation(api.searchConsoleConnect.beginSearchConsoleConnect, { siteId: ids.siteId });
    const state = new URL(authorizeUrl).searchParams.get("state")!;
    await t.fetch(`/api/search-console/oauth/callback?state=${encodeURIComponent(state)}&code=auth-code`);
  }

  async function finished(t: Harness, siteId: Id<"companyWebsites">) {
    const connection = (await t.run(async (ctx) => await ctx.db.query("searchConsoleConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", siteId)).first()))!;
    const runs = await t.run(async (ctx) => await ctx.db.query("agentRuns").collect());
    const run = runs.filter((one) => one.title === "Search Console: acme-shop.test").at(-1)!;
    const lines = await t.run(async (ctx) => (await ctx.db.query("agentRunSteps").collect())
      .filter((step) => step.runId === run._id).map((step) => ({ heading: step.input ?? "", detail: step.output ?? "" })));
    return { connection, run, lines };
  }

  test.each([
    ["while asking for its 90 days", (body: string) => body.includes(`"startDate":"2026-06`)],
    ["in its 16-month fill", (body: string) => /"startDate":"2025-/.test(body)],
  ])("%s: carried on from its saved place, and the run finishes with its days and its 16 months", async (_when, when) => {
    const t = harness();
    const ids = await website(t);
    const stops = stopAt((ask) => ask.url.includes("/searchAnalytics/query") && when(ask.body));
    await connect(t, ids);
    expect(await finishWithWatch(t)).toBeGreaterThanOrEqual(1);
    expect(stops.made).toBe(1);

    const { connection, run, lines } = await finished(t, ids.siteId);
    expect(run.status).toBe("SUCCESS");
    expect(lines.some((line) => line.heading === "Carried on")).toBe(true);
    expect(connection).toMatchObject({ status: "CONNECTED", newestDay: NEWEST });
    expect(connection.daysFrom).toBeDefined();
    for (const key of [consoleRunKey(connection._id), consoleFillKey(connection._id)]) {
      expect((await chainOf(t, key))?.closedAt).toBeDefined();
    }
  });

  test("in an adding-up job: carried on, the settle ends, and the run finishes", async () => {
    const t = harness();
    const ids = await website(t);
    settleStops.left = 1;
    settleStops.made = 0;
    await connect(t, ids);
    expect(await finishWithWatch(t)).toBeGreaterThanOrEqual(1);
    expect(settleStops.made).toBe(1);

    const { connection, run, lines } = await finished(t, ids.siteId);
    expect(run.status).toBe("SUCCESS");
    expect(lines.some((line) => line.heading === "Carried on")).toBe(true);
    // The settle ended: nothing left half-way, and every chain closed.
    expect(connection.settling).toBeUndefined();
    const open = await t.run(async (ctx) => (await ctx.db.query("collectionSteps").collect()).filter((held) => held.closedAt === undefined));
    expect(open).toEqual([]);
  });
});
