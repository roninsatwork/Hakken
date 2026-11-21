import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { MENU_FEATURE_KEYS, menuFeaturesOn, normalizeFeaturesOff } from "./utils/coreModules";
import { featureOffCheck, writeFeaturesOff } from "./utils/featureSwitchReads";
import { toolOfferedWith } from "./utils/assistantToolFeatures";
import { openSeoCycle } from "./seoTools";

/**
 * Features, switched for everyone and for each company
 * (docs/plans/active/features-switches-plan-2026-11-21.md). Three promises:
 * a company that never touched the switches has every section; off for
 * everyone wins, and each company's own tick comes back when it's ticked
 * again; and a switched-off section fetches nothing new for that company.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

const MONTHLY = JSON.stringify({ version: 2, kind: "recurring", cadence: "monthly", dayOfMonth: 1, timeLocal: "02:10", timezone: "Europe/London" });

/** A company collecting monthly, with one own website, a member and a platform administrator. */
async function seed(t: Harness, featuresOff?: string[]) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const companyId = await ctx.db.insert("companies", { name: "Korda", createdAt: now });
    if (featuresOff) await writeFeaturesOff(ctx, companyId, featuresOff);
    await ctx.db.insert("schedules", { name: "SEO data — Korda", companyId, intervalStr: MONTHLY, isActive: true, createdAt: now });
    const websiteId = await ctx.db.insert("websites", { host: "kordatacle.com", displayHost: "kordatacle.com", firstSeenAt: now });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: now });
    const memberId = await ctx.db.insert("users", { name: "Member", email: "member@test.com", role: "USER", companyId, createdAt: now });
    const adminId = await ctx.db.insert("users", { name: "Admin", email: "admin@test.com", role: "ADMIN", companyId, createdAt: now });
    // Working in the company, so the Insights team's Test mode reads it.
    const superId = await ctx.db.insert("users", { name: "Super", email: "super@test.com", role: "SUPER_ADMIN", impersonatingCompanyId: companyId, createdAt: now });
    return { companyId, websiteId, holdId, memberId, adminId, superId };
  });
}

type Seeded = Awaited<ReturnType<typeof seed>>;

async function modulesOf(t: Harness, seeded: Seeded) {
  return (await t.withIdentity({ subject: seeded.memberId }).query(api.companies.getMyWorkspaceModules, {})).enabledModules;
}

/** Search Console, Google Analytics, Bing and Clarity, all connected for the website. */
async function connectEverySource(t: Harness, seeded: Seeded) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const base = { companyId: seeded.companyId, companyWebsiteId: seeded.holdId, websiteId: seeded.websiteId, status: "CONNECTED" as const, createdAt: now, updatedAt: now };
    await ctx.db.insert("searchConsoleConnections", { ...base, property: "sc-domain:kordatacle.com", lastCollectedAt: now - 3_600_000 });
    await ctx.db.insert("googleAnalyticsConnections", { ...base, property: "properties/1" });
    await ctx.db.insert("bingConnections", { ...base, site: "https://kordatacle.com/" });
    await ctx.db.insert("clarityConnections", {
      companyId: seeded.companyId, companyWebsiteId: seeded.holdId, status: "CONNECTED", tokenCiphertext: "sealed", createdAt: now, updatedAt: now,
    });
  });
}

async function collectorLists(t: Harness) {
  return {
    searchConsole: (await t.query(internal.searchConsoleSync.agentCollections, {})).length,
    googleAnalytics: (await t.query(internal.googleAnalyticsAgentRun.agentCollections, {})).length,
    bingWebmaster: (await t.query(internal.bingWebmasterAgentRun.agentCollections, {})).length,
    clarity: (await t.query(internal.clarityAgentRun.agentCollections, {})).length,
  };
}

describe("the switches", () => {
  test("a company that never touched them has every section", async () => {
    const t = harness();
    const seeded = await seed(t);
    expect(await modulesOf(t, seeded)).toEqual(expect.arrayContaining([...MENU_FEATURE_KEYS]));
  });

  test("off for everyone wins, and each company's own tick comes back when it's ticked again", async () => {
    const t = harness();
    const seeded = await seed(t, ["bingWebmaster"]);
    const asSuper = t.withIdentity({ subject: seeded.superId });

    await asSuper.mutation(api.featureSwitches.setFeaturesOffForEveryone, { featuresOff: ["clarity"] });
    const off = await modulesOf(t, seeded);
    expect(off).not.toContain("clarity");
    expect(off).not.toContain("bingWebmaster");
    expect(off).toContain("searchConsole");

    await asSuper.mutation(api.featureSwitches.setFeaturesOffForEveryone, { featuresOff: [] });
    const back = await modulesOf(t, seeded);
    expect(back).toContain("clarity");
    expect(back).not.toContain("bingWebmaster");
  });

  test("only a platform administrator saves what's off for everyone, cleaned and recorded", async () => {
    const t = harness();
    const seeded = await seed(t);

    await expect(
      t.withIdentity({ subject: seeded.adminId }).mutation(api.featureSwitches.setFeaturesOffForEveryone, { featuresOff: ["clarity"] }),
    ).rejects.toThrow();

    await expect(
      t.withIdentity({ subject: seeded.superId }).mutation(api.featureSwitches.setFeaturesOffForEveryone, {
        featuresOff: ["clarity", "notAFeature", "insights", "clarity"],
      }),
    ).resolves.toEqual(["insights", "clarity"]);
    const audit = await t.run(async (ctx) => await ctx.db.query("auditLogs").collect());
    expect(audit.map((row) => row.actionType)).toContain("UPDATE_FEATURES_OFF_FOR_EVERYONE");
  });

  test("the page counts how many companies have each one ticked on their own page", async () => {
    const t = harness();
    const seeded = await seed(t);
    const nash = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Nash", createdAt: Date.now() });
      await writeFeaturesOff(ctx, companyId, ["bingWebmaster"]);
      return companyId;
    });

    const switches = await t.withIdentity({ subject: seeded.superId }).query(api.featureSwitches.getFeatureSwitches, {});
    expect(switches.companies).toBe(2);
    expect(switches.offForEveryone).toEqual([]);
    expect(switches.ticked.find((entry) => entry.feature === "bingWebmaster")?.companies).toBe(1);
    expect(switches.ticked.find((entry) => entry.feature === "clarity")?.companies).toBe(2);
    // Given a company, its own list comes back for its Features tab.
    expect((await t.withIdentity({ subject: seeded.superId }).query(api.featureSwitches.getFeatureSwitches, { companyId: nash })).companyOff).toEqual(["bingWebmaster"]);
  });

  test("a list switched back on leaves no row, so no row means every section is on", async () => {
    const t = harness();
    const seeded = await seed(t, ["clarity"]);
    await t.withIdentity({ subject: seeded.superId }).mutation(api.featureSwitches.setFeaturesOffForEveryone, { featuresOff: ["insights"] });
    expect(await t.run(async (ctx) => (await ctx.db.query("featureSwitches").collect()).length)).toBe(2);
    await t.withIdentity({ subject: seeded.superId }).mutation(api.companies.setCompanyModules, { id: seeded.companyId, enabledModules: [], featuresOff: [] });
    await t.withIdentity({ subject: seeded.superId }).mutation(api.featureSwitches.setFeaturesOffForEveryone, { featuresOff: [] });
    expect(await t.run(async (ctx) => (await ctx.db.query("featureSwitches").collect()).length)).toBe(0);
  });

  test("an off list keeps known keys once, in menu order, and the on list is what's left", () => {
    expect(normalizeFeaturesOff(["clarity", " insights ", "nope", "clarity"])).toEqual(["insights", "clarity"]);
    expect(menuFeaturesOn(["clarity"], ["insights"])).toEqual(["visibility", "searchConsole", "bingWebmaster", "googleAnalytics", "hakkenTasks"]);
    expect(menuFeaturesOn(undefined, undefined)).toEqual([...MENU_FEATURE_KEYS]);
  });
});

describe("a switched-off section fetches nothing new for that company", () => {
  test("every source's collector passes the company by, and picks it up again when it's ticked", async () => {
    const t = harness();
    const seeded = await seed(t);
    await connectEverySource(t, seeded);
    expect(await collectorLists(t)).toEqual({ searchConsole: 1, googleAnalytics: 1, bingWebmaster: 1, clarity: 1 });

    await t.run(async (ctx) => await writeFeaturesOff(ctx, seeded.companyId, ["searchConsole", "googleAnalytics", "bingWebmaster", "clarity"]));
    expect(await collectorLists(t)).toEqual({ searchConsole: 0, googleAnalytics: 0, bingWebmaster: 0, clarity: 0 });

    await t.run(async (ctx) => await writeFeaturesOff(ctx, seeded.companyId, []));
    expect(await collectorLists(t)).toEqual({ searchConsole: 1, googleAnalytics: 1, bingWebmaster: 1, clarity: 1 });
  });

  test("off for everyone stops every company's collection too", async () => {
    const t = harness();
    const seeded = await seed(t);
    await connectEverySource(t, seeded);
    await t.withIdentity({ subject: seeded.superId }).mutation(api.featureSwitches.setFeaturesOffForEveryone, { featuresOff: ["searchConsole", "clarity"] });

    expect(await collectorLists(t)).toEqual({ searchConsole: 0, googleAnalytics: 1, bingWebmaster: 1, clarity: 0 });
  });

  test("Visibility off: nothing is bought, and the Planner leaves the company out", async () => {
    const t = harness();
    const seeded = await seed(t, ["visibility"]);

    const listed = await t.query(internal.seoAgentRuns.listCollectingCompanies, { cursor: null });
    expect(listed.companies.map((company) => company.companyId)).not.toContain(seeded.companyId);

    const opened = await t.run(async (ctx) => await openSeoCycle(ctx, { companyId: seeded.companyId, trigger: "MANUAL" }));
    expect(opened).toMatchObject({ ok: false, cycleId: null });
    expect(await t.run(async (ctx) => await ctx.db.query("seoCollectionCycles").collect())).toEqual([]);
  });

  test("Insights off: the team's run leaves the company's website out", async () => {
    const t = harness();
    const seeded = await seed(t, ["insights"]);
    await connectEverySource(t, seeded);

    const setup = await t.query(internal.insightsTeam.teamSetup, {});
    expect(setup.websites).toEqual([]);
    expect(setup.notDue.join(" ")).toContain("Insights switched off in Features");
  });

  test("Hakken tasks off: a due alert moves on to its next time, with nothing judged", async () => {
    const t = harness();
    const seeded = await seed(t, ["hakkenTasks"]);
    const past = Date.now() - 60_000;
    const taskId: Id<"hakkenTasks"> = await t.run(async (ctx) => await ctx.db.insert("hakkenTasks", {
      companyId: seeded.companyId, userId: seeded.memberId, kind: "ALERT", state: "ON", title: "Visitors fall",
      timeOfDay: "09:00", timeZone: "Europe/London", channels: { bell: true, email: false, telegram: false },
      nextCheckAt: past, createdAt: past, updatedAt: past,
    }));

    expect(await t.query(internal.hakkenWatcher.taskSwitchedOffInternal, { taskId })).toBe(true);
    await t.action(internal.hakkenWatcherActions.watchDue, {});

    const after = await t.run(async (ctx) => ({
      task: await ctx.db.get(taskId),
      checks: await ctx.db.query("hakkenTaskChecks").collect(),
    }));
    expect(after.task?.nextCheckAt).toBeGreaterThan(Date.now());
    expect(after.task?.state).toBe("ON");
    expect(after.checks).toEqual([]);
  });

  test("a check for many companies reads each once and answers for everyone's list too", async () => {
    const t = harness();
    const seeded = await seed(t, ["clarity"]);
    const answers = await t.run(async (ctx) => {
      const clarityOff = await featureOffCheck(ctx, "clarity");
      const insightsOff = await featureOffCheck(ctx, "insights");
      return { clarity: await clarityOff(seeded.companyId), insights: await insightsOff(seeded.companyId), none: await clarityOff(null) };
    });
    expect(answers).toEqual({ clarity: true, insights: false, none: false });
  });
});

describe("Ask Hakken", () => {
  test("isn't offered a switched-off section's tools, and keeps the ones that read across sections", () => {
    const on = ["insights", "googleAnalytics"];
    expect(toolOfferedWith("assistant.searchConsole", on)).toBe(false);
    expect(toolOfferedWith("assistant.googleAnalytics.live", on)).toBe(true);
    expect(toolOfferedWith("assistant.tasks.proposeReport", on)).toBe(false);
    expect(toolOfferedWith("assistant.chart", on)).toBe(true);
    expect(toolOfferedWith(undefined, on)).toBe(true);
  });
});

describe("a switched-off section is refused on the server (phase 2)", () => {
  const OFF = /switched off for your workspace/;

  test("its reads, its writes and its live asks to Google are refused, whoever calls them", async () => {
    const t = harness();
    const seeded = await seed(t, ["clarity", "bingWebmaster", "searchConsole"]);
    const asMember = t.withIdentity({ subject: seeded.memberId });
    const asAdmin = t.withIdentity({ subject: seeded.adminId });

    await expect(asMember.query(api.clarityScreens.clarityRecordingsList, { siteId: seeded.holdId })).rejects.toThrow(OFF);
    await expect(asAdmin.mutation(api.bingWebmasterConnect.disconnectBing, { siteId: seeded.holdId })).rejects.toThrow(OFF);
    await expect(asMember.action(api.searchConsoleBreakdowns.searchConsoleLiveDeviceCurve, {
      siteId: seeded.holdId, searchType: "web", from: "2026-10-01", to: "2026-10-31",
    })).rejects.toThrow(OFF);
  });

  test("ticked again, the same read answers", async () => {
    const t = harness();
    const seeded = await seed(t);
    const asMember = t.withIdentity({ subject: seeded.memberId });
    expect(await asMember.query(api.clarityScreens.clarityRecordingsList, { siteId: seeded.holdId })).toEqual(expect.objectContaining({ recordings: [] }));
  });

  test("off for everyone refuses every company's reads too", async () => {
    const t = harness();
    const seeded = await seed(t);
    await t.withIdentity({ subject: seeded.superId }).mutation(api.featureSwitches.setFeaturesOffForEveryone, { featuresOff: ["clarity"] });
    await expect(t.withIdentity({ subject: seeded.memberId }).query(api.clarityScreens.clarityRecordingsList, { siteId: seeded.holdId })).rejects.toThrow(OFF);
  });

  test("a read two sections show stays open while either is on", async () => {
    const t = harness();
    const seeded = await seed(t, ["searchConsole"]);
    const asMember = t.withIdentity({ subject: seeded.memberId });
    // Search Console's connection line shows on Visibility's keyword research too.
    await expect(asMember.query(api.searchConsoleConnect.searchConsoleStatus, { siteId: seeded.holdId })).resolves.toBeDefined();
    await t.run(async (ctx) => { await writeFeaturesOff(ctx, seeded.companyId, ["searchConsole", "visibility"]); });
    await expect(asMember.query(api.searchConsoleConnect.searchConsoleStatus, { siteId: seeded.holdId })).rejects.toThrow(OFF);
  });

  test("a platform administrator working in the company still reads it, as with every switch", async () => {
    const t = harness();
    const seeded = await seed(t, ["clarity"]);
    expect(await t.withIdentity({ subject: seeded.superId }).query(api.clarityScreens.clarityRecordingsList, { siteId: seeded.holdId })).toEqual(expect.objectContaining({ recordings: [] }));
  });

  test("the eye answers to the section of the screen it was pressed on", async () => {
    const t = harness();
    const seeded = await seed(t, ["searchConsole"]);
    const asMember = t.withIdentity({ subject: seeded.memberId });
    await expect(asMember.query(api.seesAsk.seesAnswer, { siteId: seeded.holdId, key: "searchConsole.keywords|lastMonth|||GB|all" })).rejects.toThrow(OFF);
    expect(await asMember.query(api.seesAsk.seesAnswer, { siteId: seeded.holdId, key: "googleAnalytics.conversions|lastMonth|||GB|all" })).toBeNull();
  });
});
