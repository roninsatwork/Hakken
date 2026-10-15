import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { useFixedDay } from "@/src/test/realTime";
import { NEWEST, dayOf, type Visit } from "@/src/test/googleAnalyticsFake";
import { collectedWebsite } from "@/src/test/googleAnalyticsCollected";
import { shiftDay } from "./searchConsoleDays";
import { encryptConnectorToken } from "./connectorTokenCrypto";
import { NOT_SORTED_KIND } from "./utils/pageKinds";

/**
 * Overview's panels (docs/plans/active/ga-overview-plan.md OV2–OV7), read from
 * a property collected with Google faked: each kind of data's first rows,
 * only from what the collection kept.
 */

const NOW = Date.parse("2026-10-09T09:30:00Z");
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
const args = { period: "30" as const, device: "" };

/**
 * Sixty days of the plain day, and from search a service page where people
 * send a form that is listed but not counted, made by returning people of
 * 25 to 34 Google could name.
 */
function visits(): Visit[] {
  const out: Visit[] = [];
  for (let at = 0; at < 60; at += 1) {
    const date = shiftDay(NEWEST, -at);
    out.push(...dayOf(date));
    out.push({
      date, device: "mobile", channel: "Organic Search", source: "google", landing: "/services/web/", page: "/services/web/",
      sessions: 3, engaged: 3, seconds: 90, views: 6, events: { form_submit: [1, 0] }, visitor: "returning", age: "25-34", gender: "female",
    });
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

describe("Overview's panels", () => {
  test("each kind of data's first rows, from what the collection kept", async () => {
    const t = harness();
    const { siteId, user, rival } = await collectedWebsite(t, visits(), encryptConnectorToken);
    const services = await t.run(async (ctx) => {
      const id = await ctx.db.insert("pageClassifications", { companyWebsiteId: siteId, name: "Services", type: "SERVICE", createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("pageClassificationLines", { companyWebsiteId: siteId, classificationId: id, kind: "STARTS_WITH", value: "/services/", createdAt: 1 });
      return id;
    });
    const panels = (await user.query(api.googleAnalyticsOverviewReads.analyticsOverviewPanels, { siteId, ...args }))!;

    // OV2: the channels with the most visits; nothing from tagged links or ad keywords.
    expect(panels.channels).toMatchObject({ count: 3, tagged: 0, keywords: 0 });
    expect(panels.channels.rows.map((row) => [row.label, row.visits, row.conversions])).toEqual([
      ["Organic Search", 390, 30], ["AI assistants", 120, 30], ["Direct", 60, 0],
    ]);
    expect(panels.channels.rows[0].change).toBe(0);

    // OV3: the classifications by their landing pages' visits, Unclassified among them.
    expect(panels.kinds!.count).toBe(2);
    expect(panels.kinds!.rows.map((row) => [row.key, row.kindName, row.visits])).toEqual([[NOT_SORTED_KIND, null, 480], [services, "Services", 90]]);

    // OV4: the landing pages with the most visits, each with its classification.
    expect(panels.landing.count).toBe(4);
    expect(panels.landing.rows.map((row) => [row.label.replace("https://www.acme-shop.test", ""), row.kindName, row.visits])).toEqual([
      ["/", null, 300], ["/ai-agency/", null, 120], ["/services/web/", "Services", 90],
    ]);

    // OV5: what counts, then the form listed but not counted; the counted kind that never happened is fourth, past the three.
    expect(panels.conversions.count).toBe(4);
    expect(panels.conversions.rows.map((row) => [row.eventName, row.status, row.times])).toEqual([
      ["click_tel", "counted", 30], ["generate_lead", "counted", 30], ["form_submit", "uncounted", 30],
    ]);
    expect(panels.conversions.rows.find((row) => row.eventName === "generate_lead")!.value).toBe(750_000);
    expect(panels.conversions.rows.find((row) => row.eventName === "form_submit")!.value).toBeNull();

    // OV6: each kind's biggest named group; interests, all unknown, left out.
    expect(panels.who.map((row) => [row.kind, row.label])).toEqual([
      ["visitorType", "new"], ["device", "mobile"], ["age", "25-34"], ["gender", "female"], ["browser", "Chrome"], ["system", "Windows"],
    ]);
    expect(panels.who.find((row) => row.kind === "device")!.share).toBeCloseTo(390 / 570);
    expect(panels.who.find((row) => row.kind === "age")).toMatchObject({ share: 90 / 570, shareBefore: 90 / 570 });

    // OV7: not a shop.
    expect(panels.shop).toBeNull();

    // One device: no Device row, which would always be all of it.
    const mobile = (await user.query(api.googleAnalyticsOverviewReads.analyticsOverviewPanels, { siteId, period: "30", device: "mobile" }))!;
    expect(mobile.who.map((row) => row.kind)).not.toContain("device");

    // Another company's website is never read.
    await expect(rival.query(api.googleAnalyticsOverviewReads.analyticsOverviewPanels, { siteId, ...args })).rejects.toThrow();
  });
});
