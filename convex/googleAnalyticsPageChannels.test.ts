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
import { historyFloors } from "./utils/analyticsHistory";

/**
 * Each page by channel over time (docs/plans/active/page-conversion-explorer-plan.md): kept by the first night's page
 * fill and each night after, every device; a website filled before takes a channels-only fill; and a page's explorer
 * reads its channels — the assistants' visits out of the channel Google filed them under — for the dates chosen, the
 * span before and a year before, never asking Google.
 */

const NOW = Date.parse("2026-10-09T09:30:00Z");
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

function twoYears(): Visit[] {
  return Array.from({ length: 730 }, (_, at) => dayOf(shiftDay(NEWEST, -at))).flat();
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

/** A page's number from Landing pages, by its address. */
async function pageRef(user: { query: (...args: never[]) => Promise<unknown> }, siteId: string, address: string) {
  const list = await (user.query as (ref: unknown, args: unknown) => Promise<{ rows: Array<{ label: string; key: string }> }>)(api.googleAnalyticsReads.analyticsListPage, { siteId, list: "landing", period: "30", device: "", page: 1, rows: 25 });
  return list.rows.find((row) => row.label === address)!.key;
}

describe("each page by channel over time", () => {
  test("the first night keeps each page by channel for two years, and its explorer reads them, assistants as AI assistants", async () => {
    const t = harness();
    const { siteId, connectionId, user, google } = await collectedWebsite(t, twoYears(), encryptConnectorToken);
    expect((await t.run(async (ctx) => await ctx.db.get(connectionId)))?.pageChannelsFrom).toBe(historyFloors(NEWEST).month);
    const asked = google.calls.length;
    const home = await pageRef(user as never, siteId, "https://www.acme-shop.test/");
    const month = await user.query(api.googleAnalyticsPageChannels.analyticsPageChannelExplorer, { siteId, page: home, period: "30", device: "" });
    expect(month).toMatchObject({ heldFrom: historyFloors(NEWEST).month, everyDevice: false, events: ["generate_lead", "click_tel", "sign_up"] });
    expect(month.channels[0]).toBe("Organic Search");
    // A day each, the home page's organic visits and their lead.
    expect(month.now).toHaveLength(30);
    expect(month.now.every((point) => point.rows.some((row) => row.channel === "Organic Search" && row.visits === 10 && row.counts[0] === 1))).toBe(true);
    // The span before and the same dates a year before, held too.
    expect(month.before).toHaveLength(30);
    expect(month.year.length).toBeGreaterThan(0);
    expect(month.year.every((point) => point.rows.some((row) => row.channel === "Organic Search" && row.visits > 0))).toBe(true);
    // The assistant's referral from Perplexity counts as AI assistants, out of Referral.
    const agency = await pageRef(user as never, siteId, "https://www.acme-shop.test/ai-agency/");
    const ai = await user.query(api.googleAnalyticsPageChannels.analyticsPageChannelExplorer, { siteId, page: agency, period: "7", device: "mobile" });
    expect(ai.everyDevice).toBe(true);
    expect(ai.channels).toEqual(["AI assistants"]);
    expect(ai.now.every((point) => point.rows.length === 1 && point.rows[0].channel === "AI assistants" && point.rows[0].visits === 4 && point.rows[0].counts[1] === 1)).toBe(true);
    expect(google.calls.length).toBe(asked);
  });

  test("a website filled before its pages were kept by channel: a channels-only fill keeps them, from where it reached", async () => {
    const t = harness();
    const { siteId, connectionId, user } = await collectedWebsite(t, twoYears(), encryptConnectorToken);
    // As a website filled before: no records by channel, nothing held by channel.
    await t.run(async (ctx) => {
      for (const record of await ctx.db.query("googleAnalyticsPageSeries").collect()) if (record.list === "landingChannel" || record.list === "landingAssistant") await ctx.db.delete(record._id);
      await ctx.db.patch(connectionId, { pageChannelsFrom: undefined });
    });
    const home = await pageRef(user as never, siteId, "https://www.acme-shop.test/");
    expect((await user.query(api.googleAnalyticsPageChannels.analyticsPageChannelExplorer, { siteId, page: home, period: "30", device: "" })).heldFrom).toBeNull();
    const pagesBefore = await t.run(async (ctx) => (await ctx.db.query("googleAnalyticsPageSeries").collect()).filter((record) => record.list === "landing").length);
    expect((await t.action(internal.googleAnalyticsSteps.fillPageHistory, { connectionId, channelsOnly: true })).ok).toBe(true);
    await finishScheduled(t);
    const records = await t.run(async (ctx) => await ctx.db.query("googleAnalyticsPageSeries").collect());
    // Only the lists by channel were asked: the landing pages' records stand as they were.
    expect(records.filter((record) => record.list === "landing").length).toBe(pagesBefore);
    expect(records.some((record) => record.list === "landingChannel" && record.device === "")).toBe(true);
    expect(records.filter((record) => record.list === "landingChannel").every((record) => record.device === "")).toBe(true);
    const connection = await t.run(async (ctx) => await ctx.db.get(connectionId));
    expect(connection?.pageChannelsFrom).toBe(historyFloors(NEWEST).month);
    expect(connection?.fillsReached ?? []).not.toContainEqual(expect.objectContaining({ fill: "pageChannels" }));
    const month = await user.query(api.googleAnalyticsPageChannels.analyticsPageChannelExplorer, { siteId, page: home, period: "30", device: "" });
    expect(month.now.every((point) => point.rows.some((row) => row.channel === "Organic Search" && row.visits === 10))).toBe(true);
  });
});
