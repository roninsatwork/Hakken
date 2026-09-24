import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";

/**
 * Writing the work list without buying anything twice.
 *
 * DataForSEO charges when a task is posted, not when its result is read, so
 * every duplicate this file prevents is a real invoice line. The tests are
 * arranged by the ways a duplicate gets in: a second company watching a host
 * somebody already pulled, two cycles landing in the same hour, a website
 * collected again before its own schedule asked for it.
 *
 * The other half is chunking. A company with thousands of websites cannot be
 * expanded inside one transaction, and a cursor that loses its place either
 * skips sites silently or collects them twice.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

const DAILY = JSON.stringify({
  version: 2,
  kind: "recurring",
  cadence: "daily",
  timeLocal: "09:00",
  timezone: "UTC",
});

const WEEKLY = JSON.stringify({
  version: 2,
  kind: "recurring",
  cadence: "weekly",
  dayOfWeek: 1,
  timeLocal: "09:00",
  timezone: "UTC",
});

/**
 * The whole-site operations a cycle runs once per website.
 *
 * Three since competitor discovery joined them: it needs only a host, so
 * `seoSiteOperations()` picks it up without a second edit anywhere. That is
 * the point of deriving the set rather than listing it, and it is why this
 * number is a constant here rather than a literal in eight assertions.
 *
 * Ten since the six Sites link calls and the site crawl joined them on
 * 2026-09-23 (`dataForSeoLinkOperations.ts`, `dataForSeoCrawlOperations.ts`).
 * Each has its own cadence, so on a first collection — every test here —
 * each is planned like any other.
 */
const SITE_OPERATIONS = 10;

/**
 * The operations that ask about every website on a page in one paid call.
 *
 * One pull each, however many websites the page held. That is the whole point
 * of them, and it is why every count below is site operations times websites,
 * plus this, rather than everything times websites.
 */
const BULK_OPERATIONS = 3;

async function seedCompany(t: Harness, name: string) {
  return await t.run(async (ctx) => await ctx.db.insert("companies", { name, createdAt: Date.now() }));
}

async function seedSchedule(
  t: Harness,
  companyId: Id<"companies">,
  intervalStr: string,
  isActive = true,
) {
  return await t.run(async (ctx) =>
    await ctx.db.insert("schedules", {
      name: "Collection",
      companyId,
      intervalStr,
      isActive,
      createdAt: Date.now(),
    } as never));
}

async function seedWebsite(t: Harness, host: string) {
  return await t.run(async (ctx) =>
    await ctx.db.insert("websites", { host, displayHost: host, firstSeenAt: Date.now() }));
}

async function seedCompanyWebsite(
  t: Harness,
  companyId: Id<"companies">,
  websiteId: Id<"websites">,
  overrides: { refreshIntervalStr?: string; collectionEnabled?: boolean } = {},
) {
  return await t.run(async (ctx) =>
    await ctx.db.insert("companyWebsites", {
      companyId,
      websiteId,
      createdAt: Date.now(),
      ...overrides,
    }));
}

async function openCycle(
  t: Harness,
  companyId: Id<"companies">,
  startedAt = Date.now(),
  trigger: "SCHEDULE" | "MANUAL" = "SCHEDULE",
) {
  return await t.run(async (ctx) =>
    await ctx.db.insert("seoCollectionCycles", {
      companyId,
      trigger,
      status: "EXPANDING",
      plannedCount: 0,
      reusedCount: 0,
      sentCount: 0,
      readyCount: 0,
      failedCount: 0,
      totalCostUsd: 0,
      startedAt,
    }));
}

const pulls = (t: Harness) => t.run(async (ctx) => await ctx.db.query("seoDataPulls").collect());
const lines = (t: Harness) => t.run(async (ctx) => await ctx.db.query("seoCycleLines").collect());
const cycle = (t: Harness, id: Id<"seoCollectionCycles">) => t.run(async (ctx) => await ctx.db.get(id));

describe("expanding a cycle", () => {
  test("plans one pull per operation for a company's website", async () => {
    const t = harness();
    const company = await seedCompany(t, "Ronins Agency");
    await seedSchedule(t, company, DAILY);
    const website = await seedWebsite(t, "ourshop.com");
    await seedCompanyWebsite(t, company, website);
    const cycleId = await openCycle(t, company);

    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId });

    expect(await pulls(t)).toHaveLength(SITE_OPERATIONS + BULK_OPERATIONS);
    expect((await cycle(t, cycleId))?.plannedCount).toBe(SITE_OPERATIONS + BULK_OPERATIONS);
  });

  test("collects a competitor at the rate of the website it is measured against", async () => {
    const t = harness();
    const company = await seedCompany(t, "Ronins Agency");
    await seedSchedule(t, company, DAILY);
    const own = await seedWebsite(t, "ourshop.com");
    const rival = await seedWebsite(t, "rival.com");
    await seedCompanyWebsite(t, company, own);
    // The company's own choice to watch it, paired with the site it is compared
    // with. The host's competition graph is not consulted: a rivalry another
    // company asserted must not decide what this one buys.
    await t.run(async (ctx) =>
      await ctx.db.insert("companyWebsites", {
        companyId: company,
        websiteId: rival,
        relationship: "TRACKED",
        againstWebsiteId: own,
        createdAt: Date.now(),
      }));
    const cycleId = await openCycle(t, company);

    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId });

    // The rival is pulled because the site it is compared with was pulled.
    // Numbers from different weeks are not a comparison.
    const perSite = (await pulls(t)).filter((row) => row.websiteId !== undefined);
    expect(new Set(perSite.map((row) => row.websiteId)).size).toBe(2);
    // Two websites: the per-site operations run twice each, the bulk ones once
    // in total, because one call covered both hosts.
    expect(await pulls(t)).toHaveLength(SITE_OPERATIONS * 2 + BULK_OPERATIONS);
  });

  test("collects a tracked site with no pair on its own", async () => {
    // It was skipped outright for a while: tracked holds were only reached as
    // targets of a pair, so a site watched with nothing to pair it to was
    // chosen, shown on the list, and never collected.
    const t = harness();
    const company = await seedCompany(t, "Ronins Agency");
    await seedSchedule(t, company, DAILY);
    const watched = await seedWebsite(t, "rival.com");
    await t.run(async (ctx) =>
      await ctx.db.insert("companyWebsites", {
        companyId: company,
        websiteId: watched,
        relationship: "TRACKED",
        createdAt: Date.now(),
      }));
    const cycleId = await openCycle(t, company);

    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId });

    const perSite = (await pulls(t)).filter((row) => row.websiteId === watched);
    expect(perSite).toHaveLength(SITE_OPERATIONS);
  });

  test("plans a paired tracked site once, as its pair's target, not twice", async () => {
    const t = harness();
    const company = await seedCompany(t, "Ronins Agency");
    await seedSchedule(t, company, DAILY);
    const own = await seedWebsite(t, "ourshop.com");
    const rival = await seedWebsite(t, "rival.com");
    await seedCompanyWebsite(t, company, own);
    await t.run(async (ctx) =>
      await ctx.db.insert("companyWebsites", {
        companyId: company,
        websiteId: rival,
        relationship: "TRACKED",
        againstWebsiteId: own,
        createdAt: Date.now(),
      }));
    const cycleId = await openCycle(t, company);

    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId });

    // One line per site operation and one per bulk call, as for any site on
    // the page. Walked twice, it would carry each of those twice.
    const rivalLines = (await lines(t)).filter((row) => row.websiteId === rival);
    expect(rivalLines).toHaveLength(SITE_OPERATIONS + BULK_OPERATIONS);
  });

  test("a pairing to a site the company has let go collects the tracked site on its own", async () => {
    // The pair was removed; the tracked hold is still something the company
    // chose and pays for, so it falls back to its own settings rather than to
    // nothing.
    const t = harness();
    const company = await seedCompany(t, "Ronins Agency");
    await seedSchedule(t, company, DAILY);
    const gone = await seedWebsite(t, "old-site.com");
    const rival = await seedWebsite(t, "rival.com");
    await t.run(async (ctx) =>
      await ctx.db.insert("companyWebsites", {
        companyId: company,
        websiteId: rival,
        relationship: "TRACKED",
        againstWebsiteId: gone,
        createdAt: Date.now(),
      }));
    const cycleId = await openCycle(t, company);

    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId });

    expect((await pulls(t)).filter((row) => row.websiteId === rival)).toHaveLength(SITE_OPERATIONS);
  });

  test("asks about every website on a page in one paid call", async () => {
    const t = harness();
    const company = await seedCompany(t, "Big Agency");
    await seedSchedule(t, company, DAILY);
    for (let index = 0; index < 8; index += 1) {
      await seedCompanyWebsite(t, company, await seedWebsite(t, `site-${index}.com`));
    }
    const cycleId = await openCycle(t, company);

    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId });

    // Eight websites, and the bulk operations are still three charges rather
    // than twenty-four. This is the whole economics of the bulk shape.
    const bulk = (await pulls(t)).filter((row) => row.operationId.startsWith("bulk_"));
    expect(bulk).toHaveLength(BULK_OPERATIONS);

    // Every website still gets its own line, so its history is complete, and
    // all but one are marked as not having paid — because they did not.
    const bulkLines = (await lines(t)).filter((line) => line.operationId === "bulk_backlinks");
    expect(bulkLines).toHaveLength(8);
    expect(bulkLines.filter((line) => !line.reused)).toHaveLength(1);
  });

  test("spaces the sends out instead of firing them together", async () => {
    const t = harness();
    const company = await seedCompany(t, "Ronins Agency");
    await seedSchedule(t, company, DAILY);
    for (const host of ["a.com", "b.com", "c.com"]) {
      await seedCompanyWebsite(t, company, await seedWebsite(t, host));
    }
    const startedAt = Date.now();
    const cycleId = await openCycle(t, company, startedAt);

    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId });

    // Spacing is the whole of this pipeline's rate limiting and its tenant
    // fairness, so a cycle whose rows all came due at once would be the bug.
    const dueTimes = (await pulls(t)).map((row) => row.dueAt ?? 0).sort((a, b) => a - b);
    expect(new Set(dueTimes).size).toBe(dueTimes.length);
    expect(dueTimes[0]).toBe(startedAt);
  });

  test("plans nothing for a company nobody has scheduled", async () => {
    const t = harness();
    const company = await seedCompany(t, "Unscheduled Ltd");
    await seedCompanyWebsite(t, company, await seedWebsite(t, "quiet.com"));
    const cycleId = await openCycle(t, company);

    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId });

    // Absent must read as off, or the day this shipped it would have started
    // spending on every company at once.
    expect(await pulls(t)).toHaveLength(0);
    expect((await cycle(t, cycleId))?.status).toBe("DONE");
  });

  test("plans nothing for a website switched off on its own", async () => {
    const t = harness();
    const company = await seedCompany(t, "Ronins Agency");
    await seedSchedule(t, company, DAILY);
    await seedCompanyWebsite(t, company, await seedWebsite(t, "paused.com"), {
      collectionEnabled: false,
    });
    const cycleId = await openCycle(t, company);

    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId });

    expect(await pulls(t)).toHaveLength(0);
  });
});

describe("checking the searches on a website's record", () => {
  const LEEDS = 1006925;

  async function trackSearch(t: Harness, websiteId: Id<"websites">, keyword: string, isActive = true) {
    await t.run(async (ctx) =>
      await ctx.db.insert("websiteKeywords", { websiteId, keyword, isActive, createdAt: Date.now() }));
  }

  const checks = async (t: Harness) =>
    (await pulls(t)).filter((row) => row.operationId === "serp_google_organic");

  test("checks each live search once, from the watcher's place, and skips a paused one", async () => {
    const t = harness();
    const company = await seedCompany(t, "Ronins Agency");
    await seedSchedule(t, company, DAILY);
    const website = await seedWebsite(t, "ronins.co.uk");
    await t.run(async (ctx) =>
      await ctx.db.insert("companyWebsites", {
        companyId: company, websiteId: website, locationCode: LEEDS, locationLabel: "Leeds, England", createdAt: Date.now(),
      }));
    await trackSearch(t, website, "branding agency leeds");
    await trackSearch(t, website, "rebrand consultancy");
    await trackSearch(t, website, "old campaign phrase", false);

    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId: await openCycle(t, company) });

    const planned = await checks(t);
    expect(planned).toHaveLength(2);
    // Keyed on the search and the place, not on any website: it answers for
    // every known site on the page.
    expect(planned.every((row) => row.websiteId === undefined)).toBe(true);
    expect(planned.map((row) => JSON.parse(row.taskArgsJson ?? "{}").location_code)).toEqual([LEEDS, LEEDS]);
  });

  test("two companies checking one search from one place buy one page", async () => {
    const t = harness();
    const ronins = await seedCompany(t, "Ronins Agency");
    const acme = await seedCompany(t, "Acme Ltd");
    await seedSchedule(t, ronins, DAILY);
    await seedSchedule(t, acme, DAILY);
    const shared = await seedWebsite(t, "shared.co.uk");
    await seedCompanyWebsite(t, ronins, shared);
    await seedCompanyWebsite(t, acme, shared);
    await trackSearch(t, shared, "branding agency leeds");

    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId: await openCycle(t, ronins) });
    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId: await openCycle(t, acme) });

    expect(await checks(t)).toHaveLength(1);
    const checkLines = (await lines(t)).filter((row) => row.operationId === "serp_google_organic");
    expect(checkLines.map((row) => row.reused).sort()).toEqual([false, true]);
  });

  test("two hosts tracking the same phrase in the same place share the page too", async () => {
    const t = harness();
    const company = await seedCompany(t, "Ronins Agency");
    await seedSchedule(t, company, DAILY);
    const one = await seedWebsite(t, "one.co.uk");
    const two = await seedWebsite(t, "two.co.uk");
    await seedCompanyWebsite(t, company, one);
    await seedCompanyWebsite(t, company, two);
    await trackSearch(t, one, "branding agency leeds");
    await trackSearch(t, two, "branding agency leeds");

    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId: await openCycle(t, company) });

    expect(await checks(t)).toHaveLength(1);
  });

  test("the same search from another place is another page", async () => {
    const t = harness();
    const ronins = await seedCompany(t, "Ronins Agency");
    const acme = await seedCompany(t, "Acme Ltd");
    await seedSchedule(t, ronins, DAILY);
    await seedSchedule(t, acme, DAILY);
    const shared = await seedWebsite(t, "shared.co.uk");
    await seedCompanyWebsite(t, ronins, shared);
    await t.run(async (ctx) =>
      await ctx.db.insert("companyWebsites", {
        companyId: acme, websiteId: shared, locationCode: LEEDS, locationLabel: "Leeds, England", createdAt: Date.now(),
      }));
    await trackSearch(t, shared, "branding agency leeds");

    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId: await openCycle(t, ronins) });
    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId: await openCycle(t, acme) });

    expect(await checks(t)).toHaveLength(2);
  });

  test("a site's rankings are asked from its place, and another place's answer is not reused", async () => {
    const t = harness();
    const london = await seedCompany(t, "London Agency");
    const leeds = await seedCompany(t, "Leeds Agency");
    await seedSchedule(t, london, WEEKLY);
    await seedSchedule(t, leeds, WEEKLY);
    const shared = await seedWebsite(t, "shared.co.uk");
    await seedCompanyWebsite(t, london, shared);
    await t.run(async (ctx) =>
      await ctx.db.insert("companyWebsites", {
        companyId: leeds, websiteId: shared, locationCode: LEEDS, locationLabel: "Leeds, England", createdAt: Date.now(),
      }));

    // London's rankings were bought an hour ago and are fresh for a weekly
    // watcher — but they are London's.
    const startedAt = Date.now();
    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId: await openCycle(t, london, startedAt) });
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("seoDataPulls").collect()) {
        await ctx.db.patch(row._id, { status: "READY", completedAt: startedAt });
      }
    });
    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId: await openCycle(t, leeds, startedAt + 3_600_000) });

    const ranked = (await pulls(t)).filter((row) => row.operationId === "domain_ranked_keywords");
    expect(ranked.map((row) => JSON.parse(row.taskArgsJson ?? "{}").location_code).sort())
      .toEqual([2826, LEEDS].sort());
  });
});

describe("the reuse ladder", () => {
  test("a fresh enough answer is reused and nothing is bought", async () => {
    const t = harness();
    const ronins = await seedCompany(t, "Ronins Agency");
    const acme = await seedCompany(t, "Acme Ltd");
    await seedSchedule(t, ronins, WEEKLY);
    await seedSchedule(t, acme, WEEKLY);

    const shared = await seedWebsite(t, "shared.com");
    await seedCompanyWebsite(t, ronins, shared);
    await seedCompanyWebsite(t, acme, shared);

    const first = await openCycle(t, ronins);
    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId: first });

    // Ronins' pulls come back today.
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("seoDataPulls").collect()) {
        await ctx.db.patch(row._id, { status: "READY", completedAt: Date.now() });
      }
    });

    const boughtBefore = (await pulls(t)).length;
    const second = await openCycle(t, acme);
    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId: second });

    // One host is stored once and fetched once. Acme is served by the answer
    // Ronins already paid for, and a weekly watcher handed today's numbers is
    // being served correctly.
    // Nothing new was bought at all. The per-site answers are fresh enough to
    // reuse, and the bulk ones are keyed on the batch — both companies track
    // exactly the one host, so it is the same batch and therefore the same
    // question. Two customers with the same estate share even the bulk call.
    expect(await pulls(t)).toHaveLength(boughtBefore);

    const secondLines = (await lines(t)).filter((line) => line.cycleId === second);
    expect(secondLines.every((line) => line.reused)).toBe(true);
    expect((await cycle(t, second))?.plannedCount).toBe(0);
  });

  test("a stale answer is bought again", async () => {
    const t = harness();
    const company = await seedCompany(t, "Ronins Agency");
    await seedSchedule(t, company, DAILY);
    const website = await seedWebsite(t, "ourshop.com");
    await seedCompanyWebsite(t, company, website);

    const old = Date.now() - 5 * 24 * 60 * 60 * 1000;
    await t.run(async (ctx) => {
      await ctx.db.insert("seoDataPulls", {
        operationId: "backlinks_summary",
        family: "Backlinks",
        mode: "LIVE",
        target: "ourshop.com",
        websiteId: website,
        taskArgsJson: "{}",
        status: "READY",
        tag: "old",
        costUsd: 1,
        sandbox: false,
        submittedAt: old,
        completedAt: old,
      });
    });

    const cycleId = await openCycle(t, company);
    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId });

    // Five days old for a daily watcher is not an answer any more.
    expect((await cycle(t, cycleId))?.plannedCount).toBe(SITE_OPERATIONS + BULK_OPERATIONS);
  });

  test("a call with its own cadence is held for it, even by a manual collection", async () => {
    const t = harness();
    const company = await seedCompany(t, "Ronins Agency");
    await seedSchedule(t, company, DAILY);
    const website = await seedWebsite(t, "ourshop.com");
    await seedCompanyWebsite(t, company, website);

    const day = 24 * 60 * 60 * 1000;
    const bought = async (operationId: string, ago: number) => await t.run(async (ctx) => {
      const at = Date.now() - ago;
      await ctx.db.insert("seoDataPulls", {
        operationId, family: "Backlinks", mode: "LIVE", target: "ourshop.com", websiteId: website,
        taskArgsJson: "{}", status: "READY", tag: `old-${operationId}`, costUsd: 0.05, sandbox: false,
        submittedAt: at, completedAt: at,
      });
    });
    // A weekly list bought four days ago is still this week's; a monthly one
    // bought forty days ago is not.
    await bought("backlinks_list", 4 * day);
    await bought("anchors_list", 40 * day);

    const cycleId = await openCycle(t, company, Date.now(), "MANUAL");
    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId });

    const planned = (await pulls(t)).filter((row) => row.status === "PENDING").map((row) => row.operationId);
    expect(planned).not.toContain("backlinks_list");
    expect(planned).toContain("anchors_list");
    expect((await cycle(t, cycleId))?.reusedCount).toBe(1);
    // No history is ever bought: the plan does not backfill (2026-09-23).
    expect(planned).not.toContain("backlinks_history");
    expect(planned).not.toContain("ranking_history");
  });

  test("a weekly list already on its way is not planned again the next day", async () => {
    const t = harness();
    const company = await seedCompany(t, "Ronins Agency");
    await seedSchedule(t, company, DAILY);
    const website = await seedWebsite(t, "ourshop.com");
    await seedCompanyWebsite(t, company, website);

    // Planned yesterday and still unsent — the Collector was at its cap.
    const yesterday = Date.now() - 24 * 60 * 60 * 1000;
    await t.run(async (ctx) => {
      await ctx.db.insert("seoDataPulls", {
        operationId: "backlinks_list", family: "Backlinks", mode: "LIVE", target: "ourshop.com", websiteId: website,
        taskArgsJson: "{}", status: "PENDING", tag: "waiting-list", costUsd: 0, sandbox: false, submittedAt: yesterday,
      });
      // A failed one is no answer, and is not held on.
      await ctx.db.insert("seoDataPulls", {
        operationId: "anchors_list", family: "Backlinks", mode: "LIVE", target: "ourshop.com", websiteId: website,
        taskArgsJson: "{}", status: "FAILED", tag: "failed-anchors", costUsd: 0, sandbox: false, submittedAt: yesterday,
      });
    });

    const cycleId = await openCycle(t, company, Date.now());
    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId });

    const planned = (await pulls(t)).filter((row) => row.status === "PENDING" && row.tag !== "waiting-list").map((row) => row.operationId);
    expect(planned).not.toContain("backlinks_list");
    expect(planned).toContain("anchors_list");
  });

  test("two cycles in the same hour share the one in-flight pull", async () => {
    const t = harness();
    const ronins = await seedCompany(t, "Ronins Agency");
    const acme = await seedCompany(t, "Acme Ltd");
    await seedSchedule(t, ronins, DAILY);
    await seedSchedule(t, acme, DAILY);

    const shared = await seedWebsite(t, "shared.com");
    await seedCompanyWebsite(t, ronins, shared);
    await seedCompanyWebsite(t, acme, shared);

    const startedAt = Date.now();
    const first = await openCycle(t, ronins, startedAt);
    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId: first });

    const second = await openCycle(t, acme, startedAt);
    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId: second });

    // Nothing has come back yet, so freshness cannot save the second company.
    // The idempotency key does: the same question on the same day is one
    // purchase, and both cycles point at it.
    const perSitePulls = (await pulls(t)).filter((row) => !row.operationId.startsWith("bulk_"));
    expect(perSitePulls).toHaveLength(SITE_OPERATIONS);

    const perSiteLines = (await lines(t))
      .filter((line) => line.cycleId === second && !line.operationId.startsWith("bulk_"));
    expect(perSiteLines.every((line) => line.reused)).toBe(true);
  });

  test("a website with a slower schedule of its own is left alone", async () => {
    const t = harness();
    const company = await seedCompany(t, "Ronins Agency");
    await seedSchedule(t, company, DAILY);
    const website = await seedWebsite(t, "slow.com");
    await seedCompanyWebsite(t, company, website, { refreshIntervalStr: WEEKLY });

    // Pinned to real dates rather than "yesterday", because whether a weekly
    // schedule is due depends on which weekday it is and a floating clock
    // would make this pass or fail by the day it was run.
    const monday = Date.UTC(2026, 8, 21, 9, 0, 0);
    const yesterday = Date.UTC(2026, 8, 22, 9, 0, 0);
    const wednesday = Date.UTC(2026, 8, 23, 10, 0, 0);
    expect(monday).toBeLessThan(yesterday);
    await t.run(async (ctx) => {
      const pullId = await ctx.db.insert("seoDataPulls", {
        operationId: "backlinks_summary",
        family: "Backlinks",
        mode: "LIVE",
        websiteId: website,
        taskArgsJson: "{}",
        status: "READY",
        tag: "yesterday",
        costUsd: 1,
        sandbox: false,
        submittedAt: yesterday,
        completedAt: yesterday,
      });
      await ctx.db.insert("seoCycleLines", {
        cycleId: await ctx.db.insert("seoCollectionCycles", {
          companyId: company,
          trigger: "SCHEDULE",
          status: "DONE",
          plannedCount: 1,
          reusedCount: 0,
          sentCount: 1,
          readyCount: 1,
          failedCount: 0,
          totalCostUsd: 1,
          startedAt: yesterday,
        }),
        companyId: company,
        websiteId: website,
        operationId: "backlinks_summary",
        pullId,
        reused: false,
        createdAt: yesterday,
      });
    });

    const cycleId = await openCycle(t, company, wednesday);
    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId });

    // The company's daily turn does not drag a weekly site along with it.
    // Absence of an override is what makes a site follow its company;
    // presence is what makes it stop.
    expect((await cycle(t, cycleId))?.plannedCount).toBe(0);
  });
});

describe("collecting now, by hand", () => {
  /** One site collected yesterday for real, on a weekly schedule. */
  async function collectedYesterday(t: Harness, fields: { sandbox: boolean; completedAt: number }) {
    const company = await seedCompany(t, "Ronins Agency");
    await seedSchedule(t, company, WEEKLY);
    const website = await seedWebsite(t, "ronins.co.uk");
    await seedCompanyWebsite(t, company, website);
    const first = await openCycle(t, company, fields.completedAt);
    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId: first });
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("seoDataPulls").collect()) {
        await ctx.db.patch(row._id, { status: "READY", completedAt: fields.completedAt, sandbox: fields.sandbox });
      }
    });
    return company;
  }

  test("collects a site the timetable says is not due yet", async () => {
    const t = harness();
    const company = await collectedYesterday(t, { sandbox: false, completedAt: Date.now() - 86_400_000 });

    const scheduled = await openCycle(t, company);
    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId: scheduled });
    expect((await cycle(t, scheduled))?.plannedCount).toBe(0);

    // The first live run on 2026-09-23 planned nothing for exactly this reason.
    const manual = await openCycle(t, company, Date.now(), "MANUAL");
    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId: manual });
    expect((await cycle(t, manual))?.plannedCount).toBeGreaterThan(0);
  });

  test("reuses an answer from the last hour, so a double press does not pay twice", async () => {
    const t = harness();
    const company = await collectedYesterday(t, { sandbox: false, completedAt: Date.now() - 10 * 60_000 });

    const manual = await openCycle(t, company, Date.now(), "MANUAL");
    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId: manual });
    expect((await cycle(t, manual))?.plannedCount).toBe(0);
  });

  test("never serves a sandbox answer to a live run, however fresh", async () => {
    const t = harness();
    await collectedYesterday(t, { sandbox: true, completedAt: Date.now() - 60_000 });
    // A second company on the same host, due now: a real answer this fresh
    // would serve it for free, as "the reuse ladder" shows. A made-up one must not.
    const acme = await seedCompany(t, "Acme Ltd");
    await seedSchedule(t, acme, WEEKLY);
    const host = await t.run(async (ctx) => (await ctx.db.query("websites").first())!._id);
    await seedCompanyWebsite(t, acme, host);

    const second = await openCycle(t, acme);
    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId: second });
    const secondLines = (await lines(t)).filter((line) => line.cycleId === second);
    expect(secondLines.length).toBeGreaterThan(0);
    expect(secondLines.some((line) => line.reused)).toBe(false);
  });
});

describe("chunking", () => {
  test("a cursor resumes after the last website it wrote", async () => {
    const t = harness();
    const company = await seedCompany(t, "Big Agency");
    await seedSchedule(t, company, DAILY);

    const ids: Id<"companyWebsites">[] = [];
    for (let index = 0; index < 5; index += 1) {
      ids.push(await seedCompanyWebsite(t, company, await seedWebsite(t, `site-${index}.com`)));
    }

    const cycleId = await openCycle(t, company);
    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId, cursor: ids[2] });

    // Everything before and including the cursor was done by an earlier page.
    // Redoing it would not double-charge, because the idempotency key would
    // catch it — but it would waste the page and never reach the end.
    const touched = new Set(
      (await pulls(t)).map((row) => row.websiteId).filter((id) => id !== undefined),
    );
    expect(touched.size).toBe(2);
  });
});

describe("a company too big for one page", () => {
  test("every website is reached, page after page", async () => {
    // Each page used to read the company's *first* rows and slice after the
    // cursor in memory. Past the first page the cursor was no longer among the
    // rows read, and every website after roughly the hundred and second was
    // never collected.
    const t = harness();
    const company = await seedCompany(t, "Big Agency");
    await seedSchedule(t, company, DAILY);
    const total = 230;
    await t.run(async (ctx) => {
      for (let index = 0; index < total; index += 1) {
        const websiteId = await ctx.db.insert("websites", {
          host: `site-${index}.com`, displayHost: `site-${index}.com`, firstSeenAt: Date.now(),
        });
        await ctx.db.insert("companyWebsites", { companyId: company, websiteId, createdAt: Date.now() });
      }
    });
    const cycleId = await openCycle(t, company);

    let cursor: Id<"companyWebsites"> | undefined;
    for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
      await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId, ...(cursor ? { cursor } : {}) });
      const row = await cycle(t, cycleId);
      if (row?.status !== "EXPANDING") break;
      cursor = row.cursor as Id<"companyWebsites">;
    }

    const reached = new Set((await lines(t)).map((row) => row.websiteId));
    expect(reached.size).toBe(total);
  });
});

describe("asking the AI engines", () => {
  /*
    Seeded on the website, not on a company's hold on it. A question belongs to
    the site, so three clients watching one host share one row and buy one
    answer between them rather than three identical ones.
  */
  async function seedPrompt(t: Harness, companyWebsiteId: Id<"companyWebsites">, engines: Array<"chatgpt" | "gemini">) {
    await t.run(async (ctx) => {
      const hold = await ctx.db.get(companyWebsiteId);
      await ctx.db.insert("websiteQuestions", {
        websiteId: hold!.websiteId,
        prompt: "best plumber in Leeds", engines, isActive: true, createdAt: Date.now(),
      });
    });
  }

  test("plans one pull per question per engine, once per website", async () => {
    const t = harness();
    const company = await seedCompany(t, "Ronins Agency");
    await seedSchedule(t, company, DAILY);
    const own = await seedWebsite(t, "ourshop.com");
    const rival = await seedWebsite(t, "rival.com");
    const hold = await seedCompanyWebsite(t, company, own);
    await t.run(async (ctx) =>
      await ctx.db.insert("companyWebsites", {
        companyId: company, websiteId: rival,
        relationship: "TRACKED", againstWebsiteId: own, createdAt: Date.now(),
      }));
    await seedPrompt(t, hold, ["chatgpt", "gemini"]);
    const cycleId = await openCycle(t, company);

    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId });

    // Two engines, two pulls. Not four: the competitor is named *in* the
    // answer, it is not asked its own question.
    const citation = (await pulls(t)).filter((row) => row.operationId.startsWith("ai_citation_"));
    expect(citation.map((row) => row.operationId).sort())
      .toEqual(["ai_citation_chatgpt", "ai_citation_gemini"]);
  });

  test("two companies asking the same question in the same place buy one answer", async () => {
    const t = harness();
    const ronins = await seedCompany(t, "Ronins Agency");
    const acme = await seedCompany(t, "Acme Ltd");
    await seedSchedule(t, ronins, DAILY);
    await seedSchedule(t, acme, DAILY);
    const first = await seedCompanyWebsite(t, ronins, await seedWebsite(t, "a.com"));
    const second = await seedCompanyWebsite(t, acme, await seedWebsite(t, "b.com"));
    await seedPrompt(t, first, ["chatgpt"]);
    await seedPrompt(t, second, ["chatgpt"]);

    const startedAt = Date.now();
    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId: await openCycle(t, ronins, startedAt) });
    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId: await openCycle(t, acme, startedAt) });

    // The key is the question, the engine and the place — not the website.
    // Same trick as one row per host: one purchase, every watcher served.
    const citation = (await pulls(t)).filter((row) => row.operationId === "ai_citation_chatgpt");
    expect(citation).toHaveLength(1);
    const citationLines = (await lines(t)).filter((line) => line.operationId === "ai_citation_chatgpt");
    expect(citationLines).toHaveLength(2);
    expect(citationLines.filter((line) => line.reused)).toHaveLength(1);
  });

  test("one question on a host is asked for every company holding it", async () => {
    const t = harness();
    const site = await seedWebsite(t, "shared.com");

    const first = await seedCompany(t, "Ronins Agency");
    await seedSchedule(t, first, DAILY);
    const firstHold = await seedCompanyWebsite(t, first, site);

    const second = await seedCompany(t, "Northbrook Ltd");
    await seedSchedule(t, second, DAILY);
    await seedCompanyWebsite(t, second, site);

    // Added once, against the website. Before this, the second company saw
    // nothing until somebody typed the same question again on their own hold.
    await seedPrompt(t, firstHold, ["chatgpt"]);

    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId: await openCycle(t, second) });

    const citation = (await pulls(t)).filter((row) => row.operationId.startsWith("ai_citation_"));
    expect(citation).toHaveLength(1);
  });

  test("two companies on one host buy one answer between them", async () => {
    const t = harness();
    const site = await seedWebsite(t, "shared.com");

    const first = await seedCompany(t, "Ronins Agency");
    await seedSchedule(t, first, DAILY);
    const firstHold = await seedCompanyWebsite(t, first, site);
    const second = await seedCompany(t, "Northbrook Ltd");
    await seedSchedule(t, second, DAILY);
    await seedCompanyWebsite(t, second, site);
    await seedPrompt(t, firstHold, ["chatgpt"]);

    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId: await openCycle(t, first) });
    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId: await openCycle(t, second) });

    // One purchase, read by both. The key is the question, the engine and the
    // place, so the second cycle joins the first rather than paying again.
    const citation = (await pulls(t)).filter((row) => row.operationId.startsWith("ai_citation_"));
    expect(citation).toHaveLength(1);
  });

  test("a paused question is not asked", async () => {
    const t = harness();
    const company = await seedCompany(t, "Ronins Agency");
    await seedSchedule(t, company, DAILY);
    const hold = await seedCompanyWebsite(t, company, await seedWebsite(t, "a.com"));
    await t.run(async (ctx) => {
      const row = await ctx.db.get(hold);
      await ctx.db.insert("websiteQuestions", {
        websiteId: row!.websiteId,
        prompt: "best plumber in Leeds", engines: ["chatgpt"], isActive: false, createdAt: Date.now(),
      });
    });

    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId: await openCycle(t, company) });

    expect((await pulls(t)).filter((row) => row.operationId.startsWith("ai_citation_"))).toHaveLength(0);
  });
});

describe("a refused pull", () => {
  test("is asked again, because a refusal was never charged", async () => {
    const t = harness();
    const company = await seedCompany(t, "Ronins Agency");
    await seedSchedule(t, company, DAILY);
    const hold = await seedCompanyWebsite(t, company, await seedWebsite(t, "a.com"));
    await t.run(async (ctx) => {
      const row = await ctx.db.get(hold);
      await ctx.db.insert("websiteQuestions", {
        websiteId: row!.websiteId,
        prompt: "best plumber in Leeds", engines: ["gemini"], isActive: true, createdAt: Date.now(),
      });
    });
    const startedAt = Date.now();

    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId: await openCycle(t, company, startedAt) });
    // DataForSEO refuses it outright: no task id, nothing charged.
    await t.run(async (ctx) => {
      const pull = (await ctx.db.query("seoDataPulls").collect())
        .find((row) => row.operationId === "ai_citation_gemini")!;
      await ctx.db.patch(pull._id, { status: "FAILED", error: "Invalid Field", completedAt: Date.now() });
    });

    // The website is fresh for the second cycle, so it is due again today.
    await t.run(async (ctx) => {
      for (const line of await ctx.db.query("seoCycleLines").collect()) await ctx.db.delete(line._id);
    });
    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId: await openCycle(t, company, startedAt) });

    // One row still — re-opened, not duplicated — and it is pending again.
    const gemini = (await pulls(t)).filter((row) => row.operationId === "ai_citation_gemini");
    expect(gemini).toHaveLength(1);
    expect(gemini[0].status).toBe("PENDING");
    expect(gemini[0].error).toBeUndefined();
  });

  test("is left alone once it has a task id, because that one was paid for", async () => {
    const t = harness();
    const company = await seedCompany(t, "Ronins Agency");
    await seedSchedule(t, company, DAILY);
    const hold = await seedCompanyWebsite(t, company, await seedWebsite(t, "a.com"));
    await t.run(async (ctx) => {
      const row = await ctx.db.get(hold);
      await ctx.db.insert("websiteQuestions", {
        websiteId: row!.websiteId,
        prompt: "best plumber in Leeds", engines: ["chatgpt"], isActive: true, createdAt: Date.now(),
      });
    });
    const startedAt = Date.now();

    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId: await openCycle(t, company, startedAt) });
    await t.run(async (ctx) => {
      const pull = (await ctx.db.query("seoDataPulls").collect())
        .find((row) => row.operationId === "ai_citation_chatgpt")!;
      await ctx.db.patch(pull._id, { status: "FAILED", taskId: "task-1", error: "never returned", completedAt: Date.now() });
      for (const line of await ctx.db.query("seoCycleLines").collect()) await ctx.db.delete(line._id);
    });
    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId: await openCycle(t, company, startedAt) });

    // Re-posting a task we hold an id for is buying the same data twice.
    const chatgpt = (await pulls(t)).filter((row) => row.operationId === "ai_citation_chatgpt");
    expect(chatgpt).toHaveLength(1);
    expect(chatgpt[0].status).toBe("FAILED");
  });
});
