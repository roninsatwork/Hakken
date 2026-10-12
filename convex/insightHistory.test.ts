import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { encryptConnectorToken } from "./connectorTokenCrypto";
import { useFixedDay } from "@/src/test/realTime";
import { seedGoogleSignIn } from "@/src/test/googleGrant";
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
      stream: "https://www.acme-shop.test", addresses: ["www.acme-shop.test"], otherAddresses: [], timeZone: "Europe/London", currency: "GBP", eventsReadAt: 1,
      events: [{ eventName: "generate_lead", counted: true, analyticsValue: null, hakkenValue: null, lastThirtyDays: 0 }],
      newestDay: NEWEST, createdAt: 1, updatedAt: 1,
    });
    await seedGoogleSignIn(ctx, encryptConnectorToken, { companyWebsiteId: holdId, connectionId });
    return { holdId };
  });
}

describe("the research's history", () => {
  test("asks Analytics for sixteen months and keeps each landing page and source a month, people a month, and the website a day", async () => {
    const t = harness();
    const { holdId } = await withAnalytics(t);
    // A day a year and more ago, and a day last month: each the fake's day of visits, from Google, Perplexity and typed in.
    fakeGoogle([...dayOf("2025-07-14"), ...dayOf("2026-09-15")]);
    const done = await t.action(internal.insightHistory.fetchHistory, { holdId });
    expect(done.problems).toEqual([]);

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
