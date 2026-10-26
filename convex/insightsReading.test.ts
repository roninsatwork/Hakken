import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { encryptConnectorToken } from "./connectorTokenCrypto";
import { finishScheduled } from "@/src/test/finishScheduled";
import { useFixedDay } from "@/src/test/realTime";
import { seedGoogleSignIn } from "@/src/test/googleGrant";
import { PROPERTY, dayOf, fakeGoogle, type Visit } from "@/src/test/googleAnalyticsFake";
import { shiftDay } from "./searchConsoleDays";
import { factsByKey, fillFacts, formatFact, spansOf, type Fact } from "./utils/insightFacts";

/**
 * Insights' reading layer (insights-analyst-plan.md §8, phase 1): each source
 * read as facts where it is kept — Google Analytics from its ready-made lists,
 * the channel that first brought each person among them (I35); Search Console
 * from its days, its spans only when wholly held — and a finding's words
 * filled from the facts, a fact not held sent back rather than left blank.
 */

const NOW = Date.parse("2026-10-09T09:30:00Z");
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

beforeEach(() => {
  useFixedDay();
  vi.setSystemTime(NOW);
  vi.stubEnv("CONNECTOR_TOKEN_ENCRYPTION_KEY", Buffer.from(new Uint8Array(32).fill(7)).toString("base64"));
  vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_ID", "sc-client.apps.googleusercontent.com");
  vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_SECRET", "sc-secret");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function owned(t: Harness) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const adminId = await ctx.db.insert("users", { name: "Admin", email: "admin@acme-shop.test", role: "ADMIN", companyId, createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    return { companyId, adminId, websiteId, siteId };
  });
}

describe("Analytics health reused by Insights", () => {
  test("retains the current health result fields including the related event names", async () => {
    const t = harness();
    const ids = await owned(t);
    const health = [{ check: "SOMETHING_ELSE" as const, passing: false, names: ["generate_lead"], others: ["page_view"] }];
    await t.run(async (ctx) => {
      await ctx.db.insert("googleAnalyticsConnections", {
        companyId: ids.companyId, companyWebsiteId: ids.siteId, websiteId: ids.websiteId,
        status: "CONNECTED", health: { checkedAt: Date.now(), checks: health }, createdAt: 1, updatedAt: 1,
      });
    });
    expect(await t.query(internal.insightsReading.measurementInternal, { holdId: ids.siteId }))
      .toEqual({ health, byDay: [] });
  });
});

describe("Google Analytics, as facts", () => {
  test("visits, people and conversions for each period kept, and the people each channel first brought", async () => {
    const t = harness();
    const ids = await owned(t);
    await t.run(async (ctx) => {
      const connectionId = await ctx.db.insert("googleAnalyticsConnections", {
        companyId: ids.companyId, companyWebsiteId: ids.siteId, websiteId: ids.websiteId, status: "COUNTING", property: PROPERTY, propertyName: "Acme",
        stream: "https://www.acme-shop.test", addresses: ["www.acme-shop.test"], otherAddresses: [], timeZone: "Europe/London", currency: "GBP", eventsReadAt: 1, listedWith: "EVENT_COUNT_ADDRESSES",
        events: [{ eventName: "generate_lead", counted: true, analyticsValue: null, hakkenValue: null, lastThirtyDays: 0 }],
        createdAt: 1, updatedAt: 1,
      });
      await seedGoogleSignIn(ctx, encryptConnectorToken, { companyWebsiteId: ids.siteId, connectionId });
      await ctx.db.insert("agents", {
        name: "Google Analytics: Collector Agent", modelId: "model-test", thinkingMode: false, isActive: true,
        systemKey: "GOOGLE_ANALYTICS_COLLECTOR", createdAt: 1, updatedAt: 1,
      });
    });
    // September's 30 days: on 9 October, the "30" facts read last month and the "90" facts last quarter (calendar-periods-plan.md).
    const lastMonthEnd = "2026-09-30";
    const visits: Visit[] = [];
    for (let at = 0; at < 30; at += 1) {
      const day = dayOf(shiftDay(lastMonthEnd, -at));
      // Perplexity's visitors first came from an AI assistant.
      visits.push(...day.map((visit) => (visit.source === "perplexity.ai" ? { ...visit, firstChannel: "AI assistants" } : visit)));
    }
    fakeGoogle(visits);
    await t.withIdentity({ subject: ids.adminId }).mutation(api.googleAnalyticsConnect.saveWhatCounts, {
      siteId: ids.siteId,
      events: [{ eventName: "generate_lead", counted: true, hakkenValue: 250 }],
    });
    await finishScheduled(t);

    const facts = factsByKey(await t.query(internal.insightsReading.analyticsFactsInternal, { holdId: ids.siteId }));
    // Last month's thirty days of 16 visits a day on the website's own address; the staging address is never read.
    expect(facts.get("ga.visits.30.now")?.value).toBe(30 * 16);
    expect(facts.get("ga.conversions.30.now")?.value).toBe(30);
    expect(facts.get("ga.value.30.now")).toMatchObject({ value: 30 * 250, unit: "money", currency: "GBP" });
    expect(facts.get("ga.channel.Organic Search.conversions.30.now")?.value).toBe(30);
    // The channel that first brought each person (I35), from last quarter and this year.
    expect(facts.get("ga.firstChannel.AI assistants.visits.90.now")?.value).toBe(30 * 4);
    expect(facts.get("ga.firstChannel.Organic Search.conversions.90.now")?.value).toBe(30);
    // Every fact is the main home country's, with the span it counts: last month, whole.
    const visitsFact = facts.get("ga.visits.30.now")!;
    expect(visitsFact).toMatchObject({ source: "analytics", from: "2026-09-01", to: lastMonthEnd });
  });
});

describe("Search Console, as facts", () => {
  test("clicks for each span wholly held, never a part; the main home country's", async () => {
    const t = harness();
    const ids = await owned(t);
    const newest = "2026-10-07";
    await t.run(async (ctx) => {
      await ctx.db.insert("searchConsoleConnections", {
        companyId: ids.companyId, companyWebsiteId: ids.siteId, websiteId: ids.websiteId, status: "CONNECTED",
        newestDay: newest, oldestDay: shiftDay(newest, -119), mainCountry: "gbr", createdAt: 1, updatedAt: 1,
      } as never);
      for (let at = 0; at < 120; at += 1) {
        await ctx.db.insert("searchConsoleDays", {
          companyWebsiteId: ids.siteId, searchType: "web", day: shiftDay(newest, -at), clicks: at < 30 ? 3 : 2, impressions: 100, ctr: 0.02, position: 12, fetchedAt: 1,
        });
      }
    });
    const facts = factsByKey(await t.query(internal.insightsReading.searchConsoleFactsInternal, { holdId: ids.siteId }));
    expect(facts.get("sc.clicks.30.now")).toMatchObject({ value: 90, country: "gbr", from: spansOf(newest, 30).now.from, to: newest });
    expect(facts.get("sc.clicks.30.before")?.value).toBe(60);
    expect(facts.get("sc.clicks.90.now")?.value).toBe(90 + 120);
    // Four months held: the 90 days before, and every year before, are not.
    expect(facts.has("sc.clicks.90.before")).toBe(false);
    expect(facts.has("sc.clicks.30.year")).toBe(false);
  });
});

describe("a finding's words", () => {
  const fact = (key: string, value: number, unit: Fact["unit"] = "count"): Fact => ({ key, value, unit, source: "analytics", label: key, currency: "GBP" });

  test("each named fact filled in as a reader sees it; a fact not held is named back, never left blank", () => {
    const facts = factsByKey([fact("ga.conversions.365.now", 169), fact("ga.value.365.now", 3380, "money"), fact("ga.rate", 7.3, "percent")]);
    expect(fillFacts("[[ga.conversions.365.now]] enquiries worth [[ga.value.365.now]], [[ga.rate]] of visits", facts)).toEqual({
      text: "169 enquiries worth £3,380, 7.3% of visits",
      missing: [],
    });
    expect(fillFacts("[[ga.nothing]] enquiries", facts)).toEqual({ text: "[[ga.nothing]] enquiries", missing: ["ga.nothing"] });
  });

  test("seconds and positions read as people say them", () => {
    expect(formatFact({ value: 72, unit: "seconds" })).toBe("1m 12s");
    expect(formatFact({ value: 13.84, unit: "position" })).toBe("13.8");
    expect(formatFact({ value: 1070, unit: "count" })).toBe("1,070");
  });

  test("a period's spans: the days just before, and the same weekdays a year before", () => {
    expect(spansOf("2026-10-10", 90)).toEqual({
      now: { from: "2026-07-13", to: "2026-10-10" },
      before: { from: "2026-04-14", to: "2026-07-12" },
      year: { from: "2025-07-14", to: "2025-10-11" },
    });
  });
});

describe("the change log's page changes (I25)", () => {
  test("a money page's week-to-week change is logged too early, then teaches once, when judged", async () => {
    const t = harness();
    const ids = await owned(t);
    const facts = { title: "Services", headline: "We build websites", words: 800, price: false, proof: true, form: true, firstAsk: 0.3, opening: "We build" };
    const row = (price: boolean) => ({ page: "/services/", kind: "SERVICE", clicks: 40, indexed: null, speed: null, structured: ["Service"], facts: { ...facts, price } });
    expect(await t.mutation(internal.moneyPageChecks.saveChecks, { holdId: ids.siteId, rows: [row(false)] })).toEqual([]);
    const seen = await t.mutation(internal.moneyPageChecks.saveChecks, { holdId: ids.siteId, rows: [row(true)] });
    expect(seen).toEqual([{ kind: "PRICE_ADDED", page: "/services/" }]);

    const change = { kind: "PRICE_ADDED" as const, from: "/services/", to: null, day: "2026-09-01", seenIn: "pageCheck", before: 4 };
    const save = (after: number, result: "TOO_EARLY" | "GREW") => t.mutation(internal.insightsTeam.saveChanges, { holdId: ids.siteId, companyId: ids.companyId, week: "2026-08-31", changes: [{ ...change, after, result }] });
    const learned = () => t.run(async (ctx) => await ctx.db.query("insightLearnings").withIndex("by_kind", (q) => q.eq("kind", "PRICE_ADDED")).first());
    expect(await save(0, "TOO_EARLY")).toBe(1);
    expect(await learned()).toBeNull();
    expect(await save(9, "GREW")).toBe(0);
    expect(await save(9, "GREW")).toBe(0);
    expect(await learned()).toMatchObject({ grew: 1, held: 0, lost: 0 });
    const logged = await t.run(async (ctx) => await ctx.db.query("insightChanges").collect());
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ seenIn: "pageCheck", day: "2026-09-01", before: 4, after: 9, result: "GREW" });
  });
});

describe("an Insights agent's Instructions page (12 Oct 2026)", () => {
  test("a blank page takes Hakken's job and brief, Hakken's own old wording is brought up to date, and an edited brief is never touched", async () => {
    const t = harness();
    await t.mutation(internal.insightsTeam.ensureTeamInternal, {});
    const agentOf = (role: string) => t.run(async (ctx) => await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", role)).first());
    const { INSIGHT_BRIEFS, EARLIER_BRIEFS } = await import("./utils/insightBriefs");
    expect((await agentOf("INSIGHTS_SEARCH"))?.systemPrompt).toBe(INSIGHT_BRIEFS.INSIGHTS_SEARCH.brief);
    expect((await agentOf("INSIGHTS_SEARCH"))?.standingObjective).toBe(INSIGHT_BRIEFS.INSIGHTS_SEARCH.job);

    const search = await agentOf("INSIGHTS_SEARCH");
    const lead = await agentOf("INSIGHTS_HEAD_OF_STRATEGY");
    await t.run(async (ctx) => {
      await ctx.db.patch(search!._id, { systemPrompt: "Look harder at local searches.", standingObjective: "" });
      await ctx.db.patch(lead!._id, { systemPrompt: EARLIER_BRIEFS.INSIGHTS_HEAD_OF_STRATEGY![0] });
    });
    await t.mutation(internal.insightsTeam.ensureTeamInternal, {});
    expect((await agentOf("INSIGHTS_SEARCH"))?.systemPrompt).toBe("Look harder at local searches.");
    expect((await agentOf("INSIGHTS_SEARCH"))?.standingObjective).toBe(INSIGHT_BRIEFS.INSIGHTS_SEARCH.job);
    expect((await agentOf("INSIGHTS_HEAD_OF_STRATEGY"))?.systemPrompt).toBe(INSIGHT_BRIEFS.INSIGHTS_HEAD_OF_STRATEGY.brief);
  });
});
