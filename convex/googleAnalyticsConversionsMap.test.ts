import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { encryptConnectorToken } from "./connectorTokenCrypto";
import { finishScheduled } from "@/src/test/finishScheduled";
import { useFixedDay } from "@/src/test/realTime";
import { seedGoogleSignIn } from "@/src/test/googleGrant";
import { PROPERTY, fakeGoogle, history } from "@/src/test/googleAnalyticsFake";

/**
 * The Conversions map and the lines by kind (conversion-charts-plan.md, 2026-10-29), read from what a first
 * collection kept with Google faked at the network: each conversion in visits and in times, by page kind and by
 * device, with the span before; and one conversion a day per channel. Nothing reaches Google.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

async function connected(t: Harness) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const adminId = await ctx.db.insert("users", { name: "Admin", email: "admin@acme-shop.test", role: "ADMIN", companyId, createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    const connectionId = await ctx.db.insert("googleAnalyticsConnections", {
      companyId, companyWebsiteId: siteId, websiteId, status: "COUNTING", property: PROPERTY, propertyName: "Acme",
      stream: "https://www.acme-shop.test", addresses: ["www.acme-shop.test"], otherAddresses: ["staging.acme-shop.test"],
      timeZone: "Europe/London", currency: "GBP", eventsReadAt: 1, listedWith: "EVENT_COUNT_ADDRESSES",
      events: [
        { eventName: "generate_lead", counted: true, analyticsValue: null, hakkenValue: null, lastThirtyDays: 14 },
        { eventName: "click_tel", counted: true, analyticsValue: null, hakkenValue: null, lastThirtyDays: 6 },
      ],
      createdAt: 1, updatedAt: 1,
    });
    await seedGoogleSignIn(ctx, encryptConnectorToken, { companyWebsiteId: siteId, connectionId });
    await ctx.db.insert("agents", { name: "Google Analytics: Collector Agent", modelId: "model-test", thinkingMode: false, isActive: true, systemKey: "GOOGLE_ANALYTICS_COLLECTOR", createdAt: 1, updatedAt: 1 });
    return { siteId, admin: adminId };
  }).then((ids) => ({ siteId: ids.siteId as Id<"companyWebsites">, admin: t.withIdentity({ subject: ids.admin }) }));
}

beforeEach(() => {
  useFixedDay();
  vi.setSystemTime(Date.parse("2026-10-06T09:30:00Z"));
  vi.stubEnv("CONNECTOR_TOKEN_ENCRYPTION_KEY", Buffer.from(new Uint8Array(32).fill(7)).toString("base64"));
  vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_ID", "sc-client.apps.googleusercontent.com");
  vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_SECRET", "sc-secret");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the Conversions map", () => {
  test("each conversion by page kind and by device, in visits and in times, with the span before; and a day a line per channel", async () => {
    const t = harness();
    const { siteId, admin } = await connected(t);
    fakeGoogle(history(70));
    await admin.mutation(api.googleAnalyticsConnect.saveWhatCounts, {
      siteId,
      events: [{ eventName: "generate_lead", counted: true, hakkenValue: 250 }, { eventName: "click_tel", counted: true, hakkenValue: 150 }],
    });
    await finishScheduled(t);

    // By page kind: the website has no classifications, so every page is Unclassified or no page recorded.
    const byKind = await admin.query(api.googleAnalyticsConversionsMap.analyticsConversionsMap, { siteId, period: "lastMonth", device: "", columns: "kind" });
    expect(byKind.collecting).toBe(false);
    expect(byKind.bothUnits).toBe(true);
    expect(byKind.hasBefore).toBe(true);
    expect(byKind.columns.length).toBeGreaterThan(0);
    expect(byKind.columns.reduce((sum, column) => sum + column.visits, 0)).toBeGreaterThan(0);
    const lead = byKind.rows.find((row) => row.eventName === "generate_lead");
    expect(lead).toBeDefined();
    // Visits with the event never exceed its times, and both units are carried for every square; the span before too.
    for (const cell of lead!.cells) {
      expect(cell.visits).toBeLessThanOrEqual(cell.times);
      expect(cell.visitsBefore).not.toBeNull();
      expect(cell.timesBefore).not.toBeNull();
    }
    expect(lead!.cells.reduce((sum, cell) => sum + cell.visits, 0)).toBeGreaterThan(0);

    // By device: desktop, mobile and tablet as kept, each with its own visits.
    const byDevice = await admin.query(api.googleAnalyticsConversionsMap.analyticsConversionsMap, { siteId, period: "lastMonth", device: "", columns: "device" });
    expect(byDevice.columns.map((column) => column.key)).toEqual(["desktop", "mobile"]);
    expect(byDevice.columns.every((column) => column.visits > 0)).toBe(true);
    const leadByDevice = byDevice.rows.find((row) => row.eventName === "generate_lead")!;
    expect(leadByDevice.cells.reduce((sum, cell) => sum + cell.visits, 0)).toBe(lead!.cells.reduce((sum, cell) => sum + cell.visits, 0));

    // A line a day per channel for one conversion, over last month's days.
    const lines = await admin.query(api.googleAnalyticsConversionsMap.analyticsConversionsByKindChart, { siteId, period: "lastMonth", device: "", columns: "channel", eventName: "generate_lead" });
    expect(lines.held).toBe(true);
    expect(lines.columns.map((column) => column.key)).toContain("Organic Search");
    expect(lines.points.length).toBe(30);
    expect(lines.points[0].day).toBe("2026-09-01");
    expect(lines.points.some((point) => point.cells.some((cell) => cell.did > 0))).toBe(true);
    // Page kinds are not kept by the day: nothing to draw, said so.
    const kinds = await admin.query(api.googleAnalyticsConversionsMap.analyticsConversionsByKindChart, { siteId, period: "lastMonth", device: "", columns: "kind", eventName: "generate_lead" });
    expect(kinds.held).toBe(false);
  });
});
