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

/** The two whole-site operations a cycle runs for every website. */
const SITE_OPERATIONS = 2;

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

async function openCycle(t: Harness, companyId: Id<"companies">, startedAt = Date.now()) {
  return await t.run(async (ctx) =>
    await ctx.db.insert("seoCollectionCycles", {
      companyId,
      trigger: "SCHEDULE",
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

    expect(await pulls(t)).toHaveLength(SITE_OPERATIONS);
    expect((await cycle(t, cycleId))?.plannedCount).toBe(SITE_OPERATIONS);
  });

  test("collects a competitor at the rate of the website it is measured against", async () => {
    const t = harness();
    const company = await seedCompany(t, "Ronins Agency");
    await seedSchedule(t, company, DAILY);
    const own = await seedWebsite(t, "ourshop.com");
    const rival = await seedWebsite(t, "rival.com");
    const companyWebsiteId = await seedCompanyWebsite(t, company, own);
    await t.run(async (ctx) =>
      await ctx.db.insert("trackedCompetitors", {
        companyWebsiteId,
        companyId: company,
        websiteId: rival,
        createdAt: Date.now(),
      }));
    const cycleId = await openCycle(t, company);

    await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId });

    // The rival is pulled because the site it is compared with was pulled.
    // Numbers from different weeks are not a comparison.
    const targets = new Set((await pulls(t)).map((row) => row.websiteId));
    expect(targets.size).toBe(2);
    expect(await pulls(t)).toHaveLength(SITE_OPERATIONS * 2);
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
    expect(await pulls(t)).toHaveLength(boughtBefore);
    expect((await cycle(t, second))?.reusedCount).toBe(SITE_OPERATIONS);
    expect((await cycle(t, second))?.plannedCount).toBe(0);
    // It still gets its own lines, so its history is complete.
    expect((await lines(t)).filter((line) => line.cycleId === second)).toHaveLength(SITE_OPERATIONS);
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
    expect((await cycle(t, cycleId))?.plannedCount).toBe(SITE_OPERATIONS);
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
    expect(await pulls(t)).toHaveLength(SITE_OPERATIONS);
    expect((await cycle(t, second))?.reusedCount).toBe(SITE_OPERATIONS);

    const pullIds = new Set((await lines(t)).map((line) => line.pullId));
    expect(pullIds.size).toBe(SITE_OPERATIONS);
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
    const touched = new Set((await pulls(t)).map((row) => row.websiteId));
    expect(touched.size).toBe(2);
  });
});
