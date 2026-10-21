import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { useFixedDay } from "@/src/test/realTime";
import { finishScheduled } from "@/src/test/finishScheduled";
import { NEWEST, dayOf, type Visit } from "@/src/test/googleAnalyticsFake";
import { collectedWebsite } from "@/src/test/googleAnalyticsCollected";
import { shiftDay } from "./searchConsoleDays";
import { encryptConnectorToken } from "./connectorTokenCrypto";
import { LEFT } from "./googleAnalyticsConversionReads";
import { NOT_SORTED_KIND } from "./utils/pageKinds";

/**
 * What Conversions and Visitors draw beyond their figures
 * (docs/plans/active/ga-conversions-visitors-plan.md CV3, CV4, CV7), read from
 * a property collected with Google faked: how visits reached a conversion by
 * page classification, conversions by page classification, what people did
 * before converting, and where each kind of visitor lands.
 */

/** 9 October 2026: Last month is September, its 30 days inside the sixty below. */
const NOW = Date.parse("2026-10-09T09:30:00Z");
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
const args = { period: "lastMonth" as const, device: "" };

/**
 * Sixty days of the plain day, and from search a service page where people
 * scroll and send a form that is listed but not counted; a few visits whose
 * new or returning Google could not tell, named two ways.
 */
function visits(): Visit[] {
  const out: Visit[] = [];
  for (let at = 0; at < 60; at += 1) {
    const date = shiftDay(NEWEST, -at);
    out.push(...dayOf(date));
    out.push({ date, device: "mobile", channel: "Organic Search", source: "google", landing: "/services/web/", page: "/services/web/", sessions: 3, engaged: 3, seconds: 90, views: 6, events: { form_submit: [1, 0], scroll: [2, 0] } });
    out.push({ date, device: "desktop", channel: "Direct", source: "(direct)", landing: "/about/", page: "/about/", sessions: 1, engaged: 1, seconds: 10, views: 1, visitor: "(not set)" as never });
    out.push({ date, device: "desktop", channel: "Direct", source: "(direct)", landing: "/about/", page: "/about/", sessions: 1, engaged: 0, seconds: 5, views: 1, visitor: "" as never });
  }
  return out;
}

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

/**
 * The website's next run, an hour on, as its schedule starts it. The actions asked for what people did before
 * converting are found in the events' 12 months held (calendar-periods-plan.md, rule 10), which the first night's
 * fills write after its run: the run after them asks those actions' funnels.
 */
async function nextRun(t: ReturnType<typeof harness>): Promise<void> {
  vi.setSystemTime(NOW + 60 * 60 * 1000);
  const agentId = await t.run(async (ctx) => (await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", "GOOGLE_ANALYTICS_COLLECTOR")).first())!._id);
  const runId = await t.run(async (ctx) => await ctx.db.insert("agentRuns", {
    agentId, triggerType: "SCHEDULE", objective: "Collect", title: "Google Analytics: Data Collection Scheduler", status: "QUEUED", startedAt: Date.now(), updatedAt: Date.now(),
  }));
  await t.action(internal.googleAnalyticsAgentRun.runGoogleAnalyticsCollectorNow, { runId });
  await finishScheduled(t);
}

describe("Conversions and Visitors' pictures", () => {
  test("how visits reached a conversion, conversions by page classification, and what people did before converting", async () => {
    const t = harness();
    const { siteId, user } = await collectedWebsite(t, visits(), encryptConnectorToken);
    await nextRun(t);
    const services = await t.run(async (ctx) => {
      const id = await ctx.db.insert("pageClassifications", { companyWebsiteId: siteId, name: "Services", type: "SERVICE", createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("pageClassificationLines", { companyWebsiteId: siteId, classificationId: id, kind: "STARTS_WITH", value: "/services/", createdAt: 1 });
      return id;
    });
    const answer = await user.query(api.googleAnalyticsReads.analyticsConversions, { siteId, ...args });
    const flow = answer.flow!;
    expect(flow.collecting).toBe(false);
    // Channels the busiest first; the service page its own classification, every other page Unclassified.
    expect(flow.channels.map((row) => [row.key, row.visits, row.conversions])).toEqual([
      ["Organic Search", 390, 30], ["AI assistants", 120, 30], ["Direct", 120, 0],
    ]);
    expect(flow.kinds.map((row) => [row.kind, row.name, row.visits])).toEqual([[services, "Services", 90], [NOT_SORTED_KIND, null, 540]]);
    // Every counted kind, the one that never happened too; the form sent, not counted; then the visits that made none.
    expect(flow.endings.map((row) => [row.key, row.counted, row.count])).toEqual([
      ["generate_lead", true, 30], ["click_tel", true, 30], ["sign_up", true, 0], ["form_submit", false, 30], [LEFT, false, 630 - 90],
    ]);
    const route = (from: string, to: string) => flow.routes.find((one) => one.from === from && one.to === to);
    expect(route("c:Organic Search", `k:${services}`)).toMatchObject({ visits: 90, conversions: 0 });
    expect(route(`k:${services}`, "e:form_submit")).toMatchObject({ visits: 30, conversions: 0, channels: ["c:Organic Search"] });
    expect(route(`k:${NOT_SORTED_KIND}`, "e:generate_lead")).toMatchObject({ visits: 30, conversions: 30 });
    expect(route(`k:${services}`, `e:${LEFT}`)).toMatchObject({ visits: 60 });

    // Each event by the kind of page its visits started on.
    const grid = flow.grid;
    const at = (kind: string) => grid.kinds.findIndex((one) => one.kind === kind);
    expect(grid.rows.map((row) => row.eventName)).toEqual(["generate_lead", "click_tel", "sign_up", "form_submit"]);
    expect(grid.rows.find((row) => row.eventName === "form_submit")!.cells[at(services)]).toBe(30);
    expect(grid.rows.find((row) => row.eventName === "generate_lead")!.cells[at(NOT_SORTED_KIND)]).toBe(30);

    // The actions' funnels over 12 months beside the website's: scrolling and the form, never a conversion.
    const before = answer.before!;
    expect(before.collecting).toBe(false);
    expect(before.siteRate).toBeGreaterThan(0);
    expect(before.rows.map((row) => row.eventName).sort()).toEqual(["form_submit", "scroll"]);
    expect(before.rows.find((row) => row.eventName === "form_submit")).toMatchObject({ then: 0 });

    // What Hakken sees: where the conversions came from, and the form not counted.
    expect(answer.seen.says.map((phrase) => phrase.code)).toEqual(["topKind", "cameMost", "uncounted"]);
    // The step order: decide on the form, try the kind never seen, value the call clicks.
    expect(answer.seen.steps.map((step) => step.code)).toEqual(["countUncounted", "trySilent", "setValue"]);
  });

  test("where each kind of visitor lands, and one Unknown in Visitors' table", async () => {
    const t = harness();
    const { siteId, user, rival } = await collectedWebsite(t, visits(), encryptConnectorToken);
    const types = (await user.query(api.googleAnalyticsConversionReads.analyticsVisitorMap, { siteId, ...args, list: "visitorType" }))!;
    expect(types.collecting).toBe(false);
    expect(types.conversions).toBe(true);
    // New visitors, and the two names Google gives for not knowing as one Unknown.
    expect(types.rows.map((row) => [row.key, row.visits])).toEqual([["new", 570], ["(not set)", 60]]);
    expect(types.rows[0].lands).toMatchObject({ kind: NOT_SORTED_KIND });
    const interests = (await user.query(api.googleAnalyticsConversionReads.analyticsVisitorMap, { siteId, ...args, list: "interest" }))!;
    expect(interests.conversions).toBe(false);
    // The table reads the same one Unknown.
    const table = await user.query(api.googleAnalyticsReads.analyticsListPage, { siteId, ...args, list: "visitorType", page: 1, rows: 25 });
    expect(table.rows.map((row) => [row.key, row.visits])).toEqual([["new", 570], ["(not set)", 60]]);
    // Another company's website is never read.
    await expect(rival.query(api.googleAnalyticsConversionReads.analyticsVisitorMap, { siteId, ...args, list: "visitorType" })).rejects.toThrow();
  });
});
