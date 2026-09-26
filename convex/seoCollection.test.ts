import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { SEO_MAX_SENDS_PER_CYCLE } from "./seoCollectionPolicy";
import { findSeoOperation, seoSiteOperationParams } from "./dataForSeoRegistry";
import { companyHasWorkDue } from "./seoCollectionDue";

/** What the planner sends for a call about a host — as a held answer was really asked. */
const sentFor = (operationId: string, host: string, locationCode?: number) =>
  JSON.stringify(seoSiteOperationParams(findSeoOperation(operationId)!, host, { locationCode }));

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

const FORTNIGHTLY = JSON.stringify({ version: 2, kind: "recurring", cadence: "fortnightly", dayOfWeek: 1, timeLocal: "09:00", timezone: "UTC" });
const MONTHLY = JSON.stringify({ version: 2, kind: "recurring", cadence: "monthly", dayOfMonth: 1, timeLocal: "09:00", timezone: "UTC" });

/**
 * The whole-site operations a cycle runs once per website.
 *
 * Three since competitor discovery joined them: it needs only a host, so
 * `seoSiteOperations()` picks it up without a second edit anywhere. That is
 * the point of deriving the set rather than listing it, and it is why this
 * number is a constant here rather than a literal in eight assertions.
 *
 * Ten since the six Sites link calls and the site crawl joined them on
 * 2026-09-23 (`dataForSeoLinkOperations.ts`, `dataForSeoCrawlOperations.ts`),
 * and eleven with the full keyword list's first request on 2026-09-24
 * (`dataForSeoKeywordListOperations.ts`): a company on the default limit keeps
 * a thousand keywords a site, and a site whose count is not known yet gets the
 * list's first request alone. Twelve with the list of every link
 * (`backlinks_all`), paged the same way on the same limits
 * (`sitePagedLists.ts`). Each has its own cadence, so on a first collection —
 * every test here — each is planned like any other.
 */
const SITE_OPERATIONS = 12;

/**
 * The operations that ask about every website on a page in one paid call.
 *
 * One pull each, however many websites the page held. That is the whole point
 * of them, and it is why every count below is site operations times websites,
 * plus this, rather than everything times websites.
 */
/**
 * Bulk calls bought per page. None since 2026-09-25: nothing filed them, and
 * the screens take the same figures from `backlinks_summary` (collection
 * reliability plan, 1.10).
 */
const BULK_OPERATIONS = 0;

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
    // Two websites: the per-site operations run twice each.
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

    // One line per site operation, as for any site on the page. Walked twice,
    // it would carry each of those twice.
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

  test("buys no bulk call: nothing filed them, and the screens have the figures", async () => {
    const t = harness();
    const company = await seedCompany(t, "Big Agency");
    await seedSchedule(t, company, DAILY);
    for (let index = 0; index < 8; index += 1) {
      await seedCompanyWebsite(t, company, await seedWebsite(t, `site-${index}.com`));
    }
    const cycleId = await openCycle(t, company);

    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId });

    expect((await pulls(t)).filter((row) => row.operationId.startsWith("bulk_"))).toEqual([]);
    expect((await lines(t)).filter((line) => line.operationId.startsWith("bulk_"))).toEqual([]);
    expect(await pulls(t)).toHaveLength(SITE_OPERATIONS * 8);
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

  /** A search on one company's own list for its website. */
  async function trackSearch(t: Harness, holdId: Id<"companyWebsites">, keyword: string, isActive = true) {
    await t.run(async (ctx) => {
      const hold = await ctx.db.get(holdId);
      await ctx.db.insert("websiteKeywords", { websiteId: hold!.websiteId, companyWebsiteId: holdId, keyword, isActive, createdAt: Date.now() });
    });
  }

  const checks = async (t: Harness) =>
    (await pulls(t)).filter((row) => row.operationId === "serp_google_organic");

  test("checks each live search once, from the watcher's place, and skips a paused one", async () => {
    const t = harness();
    const company = await seedCompany(t, "Ronins Agency");
    await seedSchedule(t, company, DAILY);
    const website = await seedWebsite(t, "ronins.co.uk");
    const hold = await t.run(async (ctx) =>
      await ctx.db.insert("companyWebsites", {
        companyId: company, websiteId: website, locationCode: LEEDS, locationLabel: "Leeds, England", createdAt: Date.now(),
      }));
    await trackSearch(t, hold, "branding agency leeds");
    await trackSearch(t, hold, "rebrand consultancy");
    await trackSearch(t, hold, "old campaign phrase", false);

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
    // Each company's own list holds it; the page is still bought once.
    await trackSearch(t, await seedCompanyWebsite(t, ronins, shared), "branding agency leeds");
    await trackSearch(t, await seedCompanyWebsite(t, acme, shared), "branding agency leeds");

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
    await trackSearch(t, await seedCompanyWebsite(t, company, one), "branding agency leeds");
    await trackSearch(t, await seedCompanyWebsite(t, company, two), "branding agency leeds");

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
    await trackSearch(t, await seedCompanyWebsite(t, ronins, shared), "branding agency leeds");
    const acmeHold = await t.run(async (ctx) =>
      await ctx.db.insert("companyWebsites", {
        companyId: acme, websiteId: shared, locationCode: LEEDS, locationLabel: "Leeds, England", createdAt: Date.now(),
      }));
    await trackSearch(t, acmeHold, "branding agency leeds");

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
    // Nothing new was bought at all: the per-site answers are fresh enough to reuse.
    expect(await pulls(t)).toHaveLength(boughtBefore);

    const secondLines = (await lines(t)).filter((line) => line.cycleId === second);
    expect(secondLines.every((line) => line.reused)).toBe(true);
    expect((await cycle(t, second))?.plannedCount).toBe(0);
    // Finished the one way a collection is: done, and its report asked for —
    // with nothing sent, nothing else would ever have asked (reliability plan 2.5).
    expect(await cycle(t, second)).toMatchObject({ status: "DONE" });
    expect((await cycle(t, second))?.finishedAt).toBeDefined();
    const reports = await t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect())
      .filter((job) => job.name.includes("buildRunReport") && (job.args[0] as { cycleId?: string }).cycleId === second));
    expect(reports.length).toBeGreaterThan(0);
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
        taskArgsJson: sentFor(operationId, "ourshop.com"), status: "READY", tag: `old-${operationId}`, costUsd: 0.05, sandbox: false,
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

  test("the long lists ask a thousand a request, up to the company's limit — no keyword list on the everyday hundred", async () => {
    const t = harness();
    const big = await seedCompany(t, "Korda");
    const small = await seedCompany(t, "Small Co");
    await seedSchedule(t, big, DAILY);
    await seedSchedule(t, small, DAILY);
    const bigSite = await seedWebsite(t, "kordatackle.com");
    const smallSite = await seedWebsite(t, "smallshop.com");
    await seedCompanyWebsite(t, big, bigSite);
    await seedCompanyWebsite(t, small, smallSite);
    await t.run(async (ctx) => {
      await ctx.db.insert("companyDataLimits", { companyId: big, keywordsPerSite: 10_000, backlinksPerSite: 10_000, updatedAt: Date.now() });
      await ctx.db.insert("companyDataLimits", { companyId: small, keywordsPerSite: 100, backlinksPerSite: 100, updatedAt: Date.now() });
      // The everyday calls' last counts: 2,500 keywords and 3,200 links.
      await ctx.db.insert("siteDaySummaries", {
        websiteId: bigSite, locationCode: 2826, day: "2026-09-20", rankedKeywordsTotal: 2_500, backlinks: 3_200, updatedAt: Date.now(),
      } as never);
    });

    for (const company of [big, small]) {
      const cycleId = await openCycle(t, company);
      await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId });
    }
    const all = await pulls(t);
    const pages = (operationId: string, websiteId: Id<"websites">) => all
      .filter((row) => row.operationId === operationId && row.websiteId === websiteId)
      .map((row) => JSON.parse(row.taskArgsJson) as { offset: number; limit: number })
      .sort((a, b) => a.offset - b.offset)
      .map((sent) => [sent.offset, sent.limit]);
    expect(pages("domain_ranked_keywords_list", bigSite)).toEqual([[0, 1_000], [1_000, 1_000], [2_000, 1_000]]);
    expect(pages("domain_ranked_keywords_list", smallSite)).toEqual([]);
    // Every link: no everyday call lists them all, so even a hundred is a list.
    expect(pages("backlinks_all", bigSite)).toEqual([[0, 1_000], [1_000, 1_000], [2_000, 1_000], [3_000, 1_000]]);
    expect(pages("backlinks_all", smallSite)).toEqual([[0, 100]]);
  });

  test("a website's own limit wins over its company's: a small competitor on the everyday hundred gets no list", async () => {
    const t = harness();
    const korda = await seedCompany(t, "Korda");
    await seedSchedule(t, korda, DAILY);
    const own = await seedWebsite(t, "kordatackle.com");
    const small = await seedWebsite(t, "gocatch.fish");
    await seedCompanyWebsite(t, korda, own);
    const smallHold = await t.run(async (ctx) => await ctx.db.insert("companyWebsites", {
      companyId: korda, websiteId: small, relationship: "TRACKED", againstWebsiteId: own, createdAt: Date.now(),
    }));
    await t.run(async (ctx) => {
      await ctx.db.insert("companyDataLimits", { companyId: korda, keywordsPerSite: 10_000, backlinksPerSite: 10_000, updatedAt: Date.now() });
      await ctx.db.insert("websiteDataLimits", { companyWebsiteId: smallHold, companyId: korda, keywordsPerSite: 100, updatedAt: Date.now() });
    });

    const cycleId = await openCycle(t, korda);
    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId });
    const list = (await pulls(t)).filter((row) => row.operationId === "domain_ranked_keywords_list");
    expect(list.map((row) => row.websiteId)).toEqual([own]);
  });

  test("each schedule buys a call on the run nearest its own cadence: weekly lists every week, the crawl every fourth", async () => {
    // Held for its whole cadence, a weekly list bought a few minutes short of
    // seven days before was held on a weekly schedule, and bought every other
    // week; a monthly company skipped the crawl after a month of 30 days or
    // fewer (2026-09-25).
    const day = 24 * 60 * 60 * 1000;
    const plannedFor = async (cadence: string, bought: Array<[string, number]>) => {
      const t = harness();
      const company = await seedCompany(t, "Ronins Agency");
      await seedSchedule(t, company, cadence);
      const website = await seedWebsite(t, "ourshop.com");
      await seedCompanyWebsite(t, company, website);
      await t.run(async (ctx) => {
        for (const [operationId, ago] of bought) {
          const at = Date.now() - ago;
          await ctx.db.insert("seoDataPulls", {
            operationId, family: "Backlinks", mode: "LIVE", target: "ourshop.com", websiteId: website,
            taskArgsJson: sentFor(operationId, "ourshop.com"), status: "READY", tag: `old-${operationId}`, costUsd: 0.05, sandbox: false,
            submittedAt: at, completedAt: at,
          });
        }
      });
      const cycleId = await openCycle(t, company, Date.now(), "MANUAL");
      await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId });
      return (await pulls(t)).filter((row) => row.status === "PENDING").map((row) => row.operationId);
    };
    const lastWeek = 7 * day - 5 * 60_000;
    const threeWeeks = 21 * day - 5 * 60_000;
    const fourWeeks = 28 * day - 5 * 60_000;

    // Weekly: the lists every run, even a few minutes short of a week; the crawl every fourth week.
    const weekly = await plannedFor(WEEKLY, [["backlinks_list", lastWeek], ["site_crawl", threeWeeks], ["anchors_list", fourWeeks]]);
    expect(weekly).toContain("backlinks_list");
    expect(weekly).not.toContain("site_crawl");
    expect(weekly).toContain("anchors_list");

    // Fortnightly: the crawl every other run.
    const fortnightly = await plannedFor(FORTNIGHTLY, [["site_crawl", 14 * day - 5 * 60_000], ["anchors_list", fourWeeks]]);
    expect(fortnightly).not.toContain("site_crawl");
    expect(fortnightly).toContain("anchors_list");

    // Monthly: the full scan, whatever the month's length — even a crawl bought a week ago.
    const monthly = await plannedFor(MONTHLY, [["backlinks_list", day], ["site_crawl", 7 * day], ["anchors_list", fourWeeks]]);
    expect(monthly).toEqual(expect.arrayContaining(["backlinks_list", "site_crawl", "anchors_list"]));

    // Daily: the lists weekly, the crawl monthly.
    const daily = await plannedFor(DAILY, [["backlinks_list", 6 * day], ["site_crawl", 29 * day], ["anchors_list", 30 * day - 5 * 60_000]]);
    expect(daily).not.toContain("backlinks_list");
    expect(daily).not.toContain("site_crawl");
    expect(daily).toContain("anchors_list");
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
        taskArgsJson: sentFor("backlinks_list", "ourshop.com"), status: "PENDING", tag: "waiting-list", costUsd: 0, sandbox: false,
        submittedAt: yesterday,
      });
      // A failed one is no answer, and is not held on.
      await ctx.db.insert("seoDataPulls", {
        operationId: "anchors_list", family: "Backlinks", mode: "LIVE", target: "ourshop.com", websiteId: website,
        taskArgsJson: sentFor("anchors_list", "ourshop.com"), status: "FAILED", tag: "failed-anchors", costUsd: 0, sandbox: false,
        submittedAt: yesterday,
      });
    });

    const cycleId = await openCycle(t, company, Date.now());
    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId });

    const planned = (await pulls(t)).filter((row) => row.status === "PENDING" && row.tag !== "waiting-list").map((row) => row.operationId);
    expect(planned).not.toContain("backlinks_list");
    expect(planned).toContain("anchors_list");
  });

  test("a weekly list held for one place, or one page, does not stand for another", async () => {
    // Held for the whole list, any page bought by anyone stood for every page
    // — another place's, or a smaller limit's — for a week (reliability plan 3.6).
    const t = harness();
    const company = await seedCompany(t, "Pesca Italia");
    await seedSchedule(t, company, DAILY);
    const website = await seedWebsite(t, "ourshop.com");
    await t.run(async (ctx) => {
      await ctx.db.insert("companyWebsites", { companyId: company, websiteId: website, locationCode: 2380, createdAt: Date.now() });
      // Four days ago, from the United Kingdom: the backlinks list, which is
      // the same from everywhere, and the keyword list, which is not.
      const at = Date.now() - 4 * 24 * 60 * 60 * 1000;
      for (const [operationId, sent] of [
        ["backlinks_list", sentFor("backlinks_list", "ourshop.com")],
        ["domain_ranked_keywords_list", JSON.stringify({ target: "ourshop.com", location_code: 2826, language_code: "en", limit: 1000, offset: 0 })],
      ] as const) {
        await ctx.db.insert("seoDataPulls", {
          operationId, family: "Labs", mode: "LIVE", target: "ourshop.com", websiteId: website, taskArgsJson: sent,
          status: "READY", tag: `uk-${operationId}`, costUsd: 0.05, sandbox: false, submittedAt: at, completedAt: at,
        });
      }
    });

    const cycleId = await openCycle(t, company, Date.now(), "MANUAL");
    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId });

    const planned = (await pulls(t)).filter((row) => row.status === "PENDING");
    expect(planned.map((row) => row.operationId)).not.toContain("backlinks_list");
    const italian = planned.filter((row) => row.operationId === "domain_ranked_keywords_list");
    expect(italian.length).toBeGreaterThan(0);
    expect(italian.every((row) => JSON.parse(row.taskArgsJson).location_code === 2380)).toBe(true);
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

  test("a website whose last collection all failed is due again, not left for its whole period", async () => {
    // Judged from what was planned, a site whose every request failed waited
    // its whole cadence for the next try (reliability plan 3.6).
    const t = harness();
    const company = await seedCompany(t, "Ronins Agency");
    await seedSchedule(t, company, DAILY);
    const website = await seedWebsite(t, "slow.com");
    await seedCompanyWebsite(t, company, website, { refreshIntervalStr: WEEKLY });
    const yesterday = Date.UTC(2026, 8, 22, 9, 0, 0);
    const wednesday = Date.UTC(2026, 8, 23, 10, 0, 0);
    await t.run(async (ctx) => {
      const cycleId = await ctx.db.insert("seoCollectionCycles", {
        companyId: company, trigger: "SCHEDULE", status: "DONE", plannedCount: 2, reusedCount: 0, sentCount: 2,
        readyCount: 0, failedCount: 2, totalCostUsd: 0, startedAt: yesterday,
      });
      for (const operationId of ["backlinks_summary", "domain_ranked_keywords"]) {
        const pullId = await ctx.db.insert("seoDataPulls", {
          operationId, family: "Backlinks", mode: "LIVE", websiteId: website, taskArgsJson: "{}", status: "FAILED",
          error: "DataForSEO refused it.", tag: `failed-${operationId}`, costUsd: 0, sandbox: false,
          submittedAt: yesterday, completedAt: yesterday,
        });
        await ctx.db.insert("seoCycleLines", {
          cycleId, companyId: company, websiteId: website, operationId, pullId, reused: false, createdAt: yesterday,
        });
      }
    });

    const cycleId = await openCycle(t, company, wednesday);
    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId });

    expect((await lines(t)).filter((line) => line.cycleId === cycleId).length).toBeGreaterThan(0);
  });

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

// Plans a whole 230-website company, page by page. About four seconds on a
// laptop; coverage on the two-core CI runner took it past 45s (run #14,
// 2026-09-24) without a planning failure — the same slowdown the Arcade's
// whole-map simulations were given room for.
const WHOLE_COMPANY_TIMEOUT_MS = 120_000;

// Run here, not on GitHub, where its time limit failed a push without a
// planning fault (Anthony, 2026-09-25: "just remove these new ones that are
// causing failures in GitHub"). It runs in every local run before a push.
const ON_GITHUB = process.env.GITHUB_ACTIONS === "true";

describe("a company too big for one page", () => {
  test.skipIf(ON_GITHUB)("every website is reached, page after page", async () => {
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
  }, WHOLE_COMPANY_TIMEOUT_MS);
});

describe("one website too big for one page", () => {
  test("is written over several pages, from the step each stopped at — nothing lost, nothing twice", async () => {
    // A page stopped only between websites, and budgeted on lines rather than
    // reads, so one website with many rivals and searches passed what a
    // transaction may read, failed every page, and its work list was never
    // written (reliability plan 3.2).
    const t = harness();
    const company = await seedCompany(t, "Big Agency");
    await seedSchedule(t, company, DAILY);
    const own = await seedWebsite(t, "ourshop.com");
    const ownHold = await seedCompanyWebsite(t, company, own);
    const rivals = 60;
    // Past the 200 a website's searches were once cut to (reliability plan 3.6).
    const searches = 250;
    await t.run(async (ctx) => {
      for (let index = 0; index < rivals; index += 1) {
        const websiteId = await ctx.db.insert("websites", {
          host: `rival-${index}.com`, displayHost: `rival-${index}.com`, firstSeenAt: Date.now(),
        });
        await ctx.db.insert("companyWebsites", {
          companyId: company, websiteId, relationship: "TRACKED", againstWebsiteId: own, createdAt: Date.now(),
        });
      }
      for (let index = 0; index < searches; index += 1) {
        await ctx.db.insert("websiteKeywords", { websiteId: own, companyWebsiteId: ownHold, keyword: `carp bait ${index}`, isActive: true, createdAt: Date.now() });
      }
    });
    const cycleId = await openCycle(t, company);

    // Each page as the one before it schedules it: from the cursor, at the step it stopped.
    let pages = 0;
    let stoppedInside = false;
    for (let next: Record<string, unknown> = {}; pages < 20; pages += 1) {
      await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId, ...next });
      const row = await cycle(t, cycleId);
      if (row?.status !== "EXPANDING") break;
      if ((row.cursorStep ?? 0) > 0) stoppedInside = true;
      next = {
        ...(row.cursor ? { cursor: row.cursor } : {}),
        ...(row.cursorCreatedAt !== undefined ? { cursorCreatedAt: row.cursorCreatedAt } : {}),
        ...(row.cursorStep ? { step: row.cursorStep } : {}),
      };
    }

    expect(pages).toBeGreaterThan(0);
    expect(stoppedInside).toBe(true);
    const written = await lines(t);
    // Every line its own request: nothing planned twice across the pages.
    expect(new Set(written.map((line) => line.pullId)).size).toBe(written.length);
    expect(written.filter((line) => line.operationId === "serp_google_organic")).toHaveLength(searches);
    // Every rival reached, each with every one of its calls.
    const perSite = new Map<string, number>();
    for (const line of written) perSite.set(line.websiteId, (perSite.get(line.websiteId) ?? 0) + 1);
    expect(perSite.size).toBe(rivals + 1);
    const rivalCounts = [...perSite.entries()].filter(([websiteId]) => websiteId !== own).map(([, count]) => count);
    expect(new Set(rivalCounts).size).toBe(1);
    expect((await cycle(t, cycleId))?.status).toBe("SENDING");
  }, WHOLE_COMPANY_TIMEOUT_MS);
});

describe("asking the AI engines", () => {
  /*
    Seeded on a company's own list for its website
    (docs/plans/active/private-tracking-lists-plan.md). Two companies asking
    the same thing hold a row each and still buy one answer between them.
  */
  async function seedPrompt(t: Harness, companyWebsiteId: Id<"companyWebsites">, engines: Array<"chatgpt" | "gemini">) {
    await t.run(async (ctx) => {
      const hold = await ctx.db.get(companyWebsiteId);
      await ctx.db.insert("websiteQuestions", {
        websiteId: hold!.websiteId, companyWebsiteId,
        prompt: "best plumber in Leeds", engines, isActive: true, createdAt: Date.now(),
      });
    });
  }

  test("questions stop at the cycle's ceiling like every other call", async () => {
    // Questions were the one kind planned past it (reliability plan 3.2).
    const t = harness();
    const company = await seedCompany(t, "Ronins Agency");
    await seedSchedule(t, company, DAILY);
    const hold = await seedCompanyWebsite(t, company, await seedWebsite(t, "ourshop.com"));
    await seedPrompt(t, hold, ["chatgpt", "gemini"]);
    const cycleId = await openCycle(t, company);
    await t.run(async (ctx) => await ctx.db.patch(cycleId, { plannedCount: SEO_MAX_SENDS_PER_CYCLE - 1 }));

    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId });

    expect(await cycle(t, cycleId)).toMatchObject({ status: "CAPPED_PLAN", plannedCount: SEO_MAX_SENDS_PER_CYCLE });
    expect(await pulls(t)).toHaveLength(1);
  });

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

  test("a question is asked only for the company whose list holds it", async () => {
    const t = harness();
    const site = await seedWebsite(t, "shared.com");

    const first = await seedCompany(t, "Ronins Agency");
    await seedSchedule(t, first, DAILY);
    const firstHold = await seedCompanyWebsite(t, first, site);

    const second = await seedCompany(t, "Northbrook Ltd");
    await seedSchedule(t, second, DAILY);
    await seedCompanyWebsite(t, second, site);

    // On the first company's list only: it is that company's own, and only
    // its own list may spend its money (reversing 2026-09-22's shared list).
    await seedPrompt(t, firstHold, ["chatgpt"]);

    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId: await openCycle(t, second) });

    const citation = (await pulls(t)).filter((row) => row.operationId.startsWith("ai_citation_"));
    expect(citation).toHaveLength(0);
  });

  test("two companies on one host buy one answer between them", async () => {
    const t = harness();
    const site = await seedWebsite(t, "shared.com");

    const first = await seedCompany(t, "Ronins Agency");
    await seedSchedule(t, first, DAILY);
    const firstHold = await seedCompanyWebsite(t, first, site);
    const second = await seedCompany(t, "Northbrook Ltd");
    await seedSchedule(t, second, DAILY);
    // The same question on each company's own list.
    await seedPrompt(t, firstHold, ["chatgpt"]);
    await seedPrompt(t, await seedCompanyWebsite(t, second, site), ["chatgpt"]);

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
        websiteId: row!.websiteId, companyWebsiteId: hold,
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
        websiteId: row!.websiteId, companyWebsiteId: hold,
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
        websiteId: row!.websiteId, companyWebsiteId: hold,
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

/**
 * Whether a company has anything due, asked before a Live Planner run opens
 * its collection (`companyHasWorkDue`). The Planner runs on its own schedule
 * and meets every company collecting on every run; one with nothing due must
 * get no collection at all, and one with anything due must never be missed.
 */
describe("whether a company has anything due", () => {
  /** One of the company's websites collected at a time, with its answer in. */
  const collectedAt = (t: Harness, company: Id<"companies">, website: Id<"websites">, at: number) =>
    t.run(async (ctx) => {
      const cycleId = await ctx.db.insert("seoCollectionCycles", {
        companyId: company, trigger: "SCHEDULE", status: "DONE", plannedCount: 1, reusedCount: 0, sentCount: 1,
        readyCount: 1, failedCount: 0, totalCostUsd: 0, startedAt: at,
      });
      const pullId = await ctx.db.insert("seoDataPulls", {
        operationId: "backlinks_summary", family: "Backlinks", mode: "LIVE", websiteId: website, taskArgsJson: "{}",
        status: "READY", tag: `ready-${website}-${at}`, costUsd: 0, sandbox: false, submittedAt: at, completedAt: at,
      });
      await ctx.db.insert("seoCycleLines", {
        cycleId, companyId: company, websiteId: website, operationId: "backlinks_summary", pullId, reused: false, createdAt: at,
      });
    });

  const hasWorkDue = (t: Harness, company: Id<"companies">, now: number) =>
    t.run(async (ctx) => await companyHasWorkDue(ctx, company, new Date(now)));

  // Monday 21 September 2026, and the days after it.
  const mondayMorning = Date.UTC(2026, 8, 21, 9, 30);
  const wednesday = Date.UTC(2026, 8, 23, 10, 0);
  const nextMonday = Date.UTC(2026, 8, 28, 9, 30);

  test("a website never collected is due", async () => {
    const t = harness();
    const company = await seedCompany(t, "Korda");
    await seedSchedule(t, company, MONTHLY);
    await seedCompanyWebsite(t, company, await seedWebsite(t, "korda.com"));

    expect(await hasWorkDue(t, company, wednesday)).toBe(true);
  });

  test("nothing is due until the company's time comes round again", async () => {
    const t = harness();
    const company = await seedCompany(t, "Ronins Agency");
    await seedSchedule(t, company, WEEKLY);
    const website = await seedWebsite(t, "ronins.co.uk");
    await seedCompanyWebsite(t, company, website);
    await collectedAt(t, company, website, mondayMorning);

    expect(await hasWorkDue(t, company, wednesday)).toBe(false);
    expect(await hasWorkDue(t, company, nextMonday)).toBe(true);
  });

  test("a website on its own faster schedule makes the company due while the company's own time has not come", async () => {
    const t = harness();
    const company = await seedCompany(t, "Korda");
    await seedSchedule(t, company, MONTHLY);
    const follows = await seedWebsite(t, "korda.com");
    const faster = await seedWebsite(t, "shop.korda.com");
    await seedCompanyWebsite(t, company, follows);
    await seedCompanyWebsite(t, company, faster, { refreshIntervalStr: DAILY });
    await collectedAt(t, company, follows, mondayMorning);
    await collectedAt(t, company, faster, mondayMorning);

    expect(await hasWorkDue(t, company, wednesday)).toBe(true);
  });

  test("a company collecting nothing has nothing due", async () => {
    const t = harness();
    const off = await seedCompany(t, "Switched Off");
    await seedSchedule(t, off, DAILY, false);
    await seedCompanyWebsite(t, off, await seedWebsite(t, "off.com"));
    const noWebsites = await seedCompany(t, "No Websites");
    await seedSchedule(t, noWebsites, DAILY);
    const websiteOff = await seedCompany(t, "Website Off");
    await seedSchedule(t, websiteOff, DAILY);
    await seedCompanyWebsite(t, websiteOff, await seedWebsite(t, "paused.com"), { collectionEnabled: false });

    expect(await hasWorkDue(t, off, wednesday)).toBe(false);
    expect(await hasWorkDue(t, noWebsites, wednesday)).toBe(false);
    expect(await hasWorkDue(t, websiteOff, wednesday)).toBe(false);
  });
});
