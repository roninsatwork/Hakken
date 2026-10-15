import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";

/**
 * A website's Schedules (docs/plans/active/website-schedules-plan.md): what
 * Hakken collects for it, and the switch for each source.
 *
 * Two promises matter most. The company's switch is the master: a website
 * whose own switch is on still says nothing is collected while its company's
 * is off, because the Planner plans only companies whose switch is on (Korda,
 * 2026-10-15). And a free source switched off is kept — connected, its data
 * held — while every collector passes it by.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

const MONTHLY = JSON.stringify({ version: 2, kind: "recurring", cadence: "monthly", dayOfMonth: 1, timeLocal: "02:10", timezone: "Europe/Madrid" });
const NIGHTLY = JSON.stringify({ version: 2, kind: "recurring", cadence: "daily", timeLocal: "04:00", timezone: "Europe/London" });

async function superAdmin(t: Harness) {
  const userId = await t.run(async (ctx) => await ctx.db.insert("users", { name: "Super", email: "super@test.com", role: "SUPER_ADMIN", createdAt: Date.now() }));
  return t.withIdentity({ subject: userId });
}

/** A company collecting (or not) on a monthly schedule, with one own website and one competitor paired with it. */
async function seed(t: Harness, { companyOn = true, siteSwitch }: { companyOn?: boolean; siteSwitch?: boolean } = {}) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const companyId = await ctx.db.insert("companies", { name: "Korda", createdAt: now });
    await ctx.db.insert("schedules", { name: "SEO data — Korda", companyId, intervalStr: MONTHLY, isActive: companyOn, createdAt: now });
    const websiteId = await ctx.db.insert("websites", { host: "kordatacle.com", displayHost: "kordatacle.com", firstSeenAt: now });
    const rivalId = await ctx.db.insert("websites", { host: "rival.com", displayHost: "rival.com", firstSeenAt: now });
    const holdId = await ctx.db.insert("companyWebsites", {
      companyId, websiteId, relationship: "OWNED", createdAt: now,
      ...(siteSwitch === undefined ? {} : { collectionEnabled: siteSwitch, refreshIntervalStr: MONTHLY }),
    });
    const rivalHoldId = await ctx.db.insert("companyWebsites", { companyId, websiteId: rivalId, relationship: "TRACKED", againstWebsiteId: websiteId, createdAt: now });
    return { companyId, websiteId, holdId, rivalHoldId };
  });
}

/** Search Console connected for the hold, with the Search Console Collector scheduled nightly. */
async function connectSearchConsole(t: Harness, seeded: { companyId: Id<"companies">; websiteId: Id<"websites">; holdId: Id<"companyWebsites"> }, extra: { switchedOff?: boolean } = {}) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const agentId = await ctx.db.insert("agents", { name: "Search Console: Collector", systemKey: "SEARCH_CONSOLE_COLLECTOR", modelId: "none", thinkingMode: false, isActive: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("schedules", { name: "Search Console: Data Collection Scheduler", agentId, intervalStr: NIGHTLY, isActive: true, nextRunAt: now + 3_600_000, createdAt: now });
    return await ctx.db.insert("searchConsoleConnections", {
      companyId: seeded.companyId, companyWebsiteId: seeded.holdId, websiteId: seeded.websiteId,
      status: "CONNECTED", property: "sc-domain:kordatacle.com", lastCollectedAt: now - 3_600_000,
      createdAt: now, updatedAt: now, ...extra,
    });
  });
}

describe("what Hakken collects for a website", () => {
  test("a website's own switch on says nothing is collected while its company's switch is off", async () => {
    const t = harness();
    const seeded = await seed(t, { companyOn: false, siteSwitch: true });
    const page = await (await superAdmin(t)).query(api.websiteSources.getWebsiteSources, { companyWebsiteId: seeded.holdId });

    expect(page?.companyOn).toBe(false);
    expect(page?.rankings).toMatchObject({ on: true, collecting: false, nextRunAt: null, ownIntervalStr: MONTHLY });
  });

  test("collects on the company's schedule while both switches are on, and not once the website's is off", async () => {
    const t = harness();
    const seeded = await seed(t);
    const admin = await superAdmin(t);
    const on = await admin.query(api.websiteSources.getWebsiteSources, { companyWebsiteId: seeded.holdId });
    expect(on?.rankings).toMatchObject({ on: true, collecting: true, ownIntervalStr: null, intervalStr: MONTHLY });
    expect(on?.rankings.nextRunAt).toEqual(expect.any(Number));

    await admin.mutation(api.websiteSources.setRankingsOn, { companyWebsiteId: seeded.holdId, on: false });
    const off = await admin.query(api.websiteSources.getWebsiteSources, { companyWebsiteId: seeded.holdId });
    expect(off?.rankings).toMatchObject({ on: false, collecting: false, nextRunAt: null });

    // On again is "follow the company's switch": nothing stored to outrank it.
    await admin.mutation(api.websiteSources.setRankingsOn, { companyWebsiteId: seeded.holdId, on: true });
    expect(await t.run(async (ctx) => "collectionEnabled" in ((await ctx.db.get(seeded.holdId)) ?? {}))).toBe(false);
  });

  test("lists each free source with its connection, its collector's schedule and its own switch", async () => {
    const t = harness();
    const seeded = await seed(t);
    await connectSearchConsole(t, seeded);
    const page = await (await superAdmin(t)).query(api.websiteSources.getWebsiteSources, { companyWebsiteId: seeded.holdId });

    expect(page?.sources.map((row) => [row.source, row.state, row.scheduled])).toEqual([
      ["SEARCH_CONSOLE", "CONNECTED", true],
      ["GOOGLE_ANALYTICS", "NOT_CONNECTED", false],
      ["BING", "NOT_CONNECTED", false],
      // Clarity has no agent: its morning job always runs.
      ["CLARITY", "NOT_CONNECTED", true],
    ]);
    expect(page?.sources[0]).toMatchObject({ on: true, intervalStr: NIGHTLY, nextRunAt: expect.any(Number), lastCollectedAt: expect.any(Number) });
    // Not connected, nothing is next.
    expect(page?.sources[3].nextRunAt).toBeNull();
  });

  test("gives a competitor its rankings and its pair, and no free sources", async () => {
    const t = harness();
    const seeded = await seed(t);
    const page = await (await superAdmin(t)).query(api.websiteSources.getWebsiteSources, { companyWebsiteId: seeded.rivalHoldId });

    expect(page?.owned).toBe(false);
    expect(page?.sources).toEqual([]);
    expect(page?.rankings.pairedWith).toEqual({ companyWebsiteId: seeded.holdId, displayHost: "kordatacle.com" });
  });

  test("switching a free source off keeps its connection and everything held", async () => {
    const t = harness();
    const seeded = await seed(t);
    const connectionId = await connectSearchConsole(t, seeded);
    const admin = await superAdmin(t);

    await admin.mutation(api.websiteSources.setSourceOn, { companyWebsiteId: seeded.holdId, source: "SEARCH_CONSOLE", on: false });
    const off = await t.run(async (ctx) => await ctx.db.get(connectionId));
    expect(off).toMatchObject({ status: "CONNECTED", switchedOff: true, property: "sc-domain:kordatacle.com" });
    const page = await admin.query(api.websiteSources.getWebsiteSources, { companyWebsiteId: seeded.holdId });
    expect(page?.sources[0]).toMatchObject({ on: false, nextRunAt: null });

    await admin.mutation(api.websiteSources.setSourceOn, { companyWebsiteId: seeded.holdId, source: "SEARCH_CONSOLE", on: true });
    expect((await t.run(async (ctx) => await ctx.db.get(connectionId)))?.switchedOff).toBeUndefined();
  });

  test("refuses a switch for a source that is not connected, and anyone but a super admin", async () => {
    const t = harness();
    const seeded = await seed(t);
    await expect((await superAdmin(t)).mutation(api.websiteSources.setSourceOn, { companyWebsiteId: seeded.holdId, source: "BING", on: false }))
      .rejects.toThrow(/not connected/);

    const adminId = await t.run(async (ctx) => await ctx.db.insert("users", { name: "Admin", email: "admin@test.com", role: "ADMIN", companyId: seeded.companyId, createdAt: Date.now() }));
    await expect(t.withIdentity({ subject: adminId }).mutation(api.websiteSources.setRankingsOn, { companyWebsiteId: seeded.holdId, on: false }))
      .rejects.toThrow();
    await expect(t.withIdentity({ subject: adminId }).query(api.websiteSources.getWebsiteSources, { companyWebsiteId: seeded.holdId }))
      .rejects.toThrow();
  });

  test("saving the schedule leaves the website's switch as it is", async () => {
    const t = harness();
    const seeded = await seed(t, { siteSwitch: false });
    await (await superAdmin(t)).mutation(api.websites.setCompanyWebsiteSchedule, { id: seeded.holdId, refreshIntervalStr: undefined });

    expect(await t.run(async (ctx) => (await ctx.db.get(seeded.holdId))?.collectionEnabled)).toBe(false);
  });
});

describe("every collector passes a switched-off website by", () => {
  test("Search Console's run lists it no more", async () => {
    const t = harness();
    const seeded = await seed(t);
    const connectionId = await connectSearchConsole(t, seeded);
    expect((await t.query(internal.searchConsoleSync.agentCollections, {})).map((site) => site.connectionId)).toEqual([connectionId]);

    await t.run(async (ctx) => await ctx.db.patch(connectionId, { switchedOff: true }));
    expect(await t.query(internal.searchConsoleSync.agentCollections, {})).toEqual([]);
  });

  test("Google Analytics' and Bing's runs list it no more", async () => {
    const t = harness();
    const seeded = await seed(t);
    const ids = await t.run(async (ctx) => {
      const now = Date.now();
      const base = { companyId: seeded.companyId, companyWebsiteId: seeded.holdId, websiteId: seeded.websiteId, status: "CONNECTED" as const, createdAt: now, updatedAt: now };
      return {
        ga: await ctx.db.insert("googleAnalyticsConnections", { ...base, property: "properties/1" }),
        bing: await ctx.db.insert("bingConnections", { ...base, site: "https://kordatacle.com/" }),
      };
    });
    expect(await t.query(internal.googleAnalyticsAgentRun.agentCollections, {})).toHaveLength(1);
    expect(await t.query(internal.bingWebmasterAgentRun.agentCollections, {})).toHaveLength(1);

    await t.run(async (ctx) => {
      await ctx.db.patch(ids.ga, { switchedOff: true });
      await ctx.db.patch(ids.bing, { switchedOff: true });
    });
    expect(await t.query(internal.googleAnalyticsAgentRun.agentCollections, {})).toEqual([]);
    expect(await t.query(internal.bingWebmasterAgentRun.agentCollections, {})).toEqual([]);
  });

  test("Clarity's morning neither lists it nor hands over its token", async () => {
    const t = harness();
    const seeded = await seed(t);
    const connectionId = await t.run(async (ctx) => await ctx.db.insert("clarityConnections", {
      companyId: seeded.companyId, companyWebsiteId: seeded.holdId, status: "CONNECTED", tokenCiphertext: "sealed", createdAt: Date.now(), updatedAt: Date.now(),
    }));
    expect(await t.query(internal.clarity.connectedWebsites, {})).toEqual([seeded.holdId]);

    await t.run(async (ctx) => await ctx.db.patch(connectionId, { switchedOff: true }));
    expect(await t.query(internal.clarity.connectedWebsites, {})).toEqual([]);
    expect(await t.query(internal.clarity.tokenOf, { holdId: seeded.holdId })).toBeNull();
  });
});
