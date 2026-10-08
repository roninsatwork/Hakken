import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { KEYWORD_LIST_OPERATION_ID } from "./dataForSeoKeywordListOperations";
import { copyRequestKey, LIST_PAGE_STUCK_MS } from "./siteListCopies";
import { noteDataChanged, siteRebuildKey } from "./siteRankings";
import { useFixedDay } from "@/src/test/realTime";

/**
 * The nightly refresh of the Sites lists' compact copies
 * (docs/plans/active/dataforseo-cost-plan.md, A1): a copy is rebuilt only
 * when it is out of date with its data — its data changed after its last
 * rebuild began, that rebuild failed, or none ever finished — not every copy
 * every second night. The one value the calendar alone moves, a site's
 * latest keyword check when a list page stays out past a fortnight, is
 * looked for too.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;
const UK = 2826;

beforeEach(() => useFixedDay());
afterEach(() => vi.useRealTimers());

/** The clock moved on, firing nothing: the rebuilds asked for stay asked for, and only those the test runs run. */
const later = (ms: number) => vi.setSystemTime(Date.now() + ms);

async function site(t: Harness, host: string) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: host, createdAt: Date.now() });
    const websiteId = await ctx.db.insert("websites", { host, displayHost: host, firstSeenAt: Date.now() });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", locationCode: UK, createdAt: Date.now() });
    return { websiteId, holdId };
  });
}

async function links(t: Harness, websiteId: Id<"websites">) {
  await t.run(async (ctx) => {
    const pullId = await ctx.db.insert("seoDataPulls", {
      operationId: "backlinks_all", family: "Backlinks", mode: "LIVE", websiteId, taskArgsJson: "{}",
      status: "READY", tag: `t-${Math.random()}`, attempts: 0, costUsd: 0.02, sandbox: false, submittedAt: Date.now(),
    } as never);
    await ctx.db.insert("siteBacklinks", {
      websiteId, pass: "ALL", pullId, day: "2026-10-01", domainFrom: "linker.com", urlFrom: "https://linker.com/a",
      urlTo: "https://korda.test/", pageTo: "/", dofollow: true, status: "LIVE", isBroken: false, domainRank: 10, searchText: "linker.com",
    });
  });
}

/** A ranked-keywords result filed as the parser files it. */
async function ranks(t: Harness, websiteId: Id<"websites">, day: string) {
  const pullId = await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
    operationId: "domain_ranked_keywords", family: "DataForSEO Labs", mode: "LIVE", websiteId, taskArgsJson: "{}",
    status: "READY", tag: `t-${Math.random()}`, attempts: 0, costUsd: 0.02, sandbox: false, submittedAt: Date.now(),
  } as never));
  await t.mutation(internal.seoCollectionParse.writeSeoMetrics, {
    pullId, websiteId, operationId: "domain_ranked_keywords", day, locationCode: UK,
    metricsJson: JSON.stringify({ returnedKeywords: 1, rankedKeywords: 50 }),
    positions: [{ keyword: "carp rods", position: 3 }] as never,
  });
}

/** A page of the site's keyword list, sent and not yet answered. */
async function listPageOut(t: Harness, websiteId: Id<"websites">) {
  return await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
    operationId: KEYWORD_LIST_OPERATION_ID, family: "DataForSEO Labs", mode: "QUEUED", websiteId, taskArgsJson: "{}",
    status: "SUBMITTED", tag: `t-${Math.random()}`, attempts: 1, costUsd: 0.02, sandbox: false, submittedAt: Date.now(),
  } as never));
}

/** The jobs the nightly refresh asks for: the rebuilds it scheduled, by name. */
async function refresh(t: Harness): Promise<string[]> {
  const before = new Set((await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect())).map((job) => job._id));
  await t.mutation(internal.siteListCopies.refreshListCopies, { cursor: null });
  const jobs = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
  return jobs.filter((job) => !before.has(job._id) && job.state.kind === "pending").map((job) => job.name);
}

const buildLinks = (t: Harness, websiteId: Id<"websites">) =>
  t.action(internal.siteListCopyBuilders.buildListCopy, { kind: "links", key: websiteId });
const rebuildSite = (t: Harness, websiteId: Id<"websites">) =>
  t.action(internal.siteSummaries.rebuildSite, { websiteId, locationCode: UK });

describe("the nightly refresh of the list copies", () => {
  test("leaves a copy alone whose data has not changed since its last rebuild", async () => {
    const t = harness();
    const korda = await site(t, "korda.test");
    await links(t, korda.websiteId);
    await ranks(t, korda.websiteId, "2026-10-01");
    later(30_000);
    await buildLinks(t, korda.websiteId);
    await rebuildSite(t, korda.websiteId);
    later(3 * 24 * 60 * 60 * 1000);

    // Three nights later, nothing changed: nothing rebuilt — each was rebuilt every second night before.
    expect(await refresh(t)).toEqual([]);
  });

  test("rebuilds a copy whose data changed after its last rebuild began, whether asked for or only noted", async () => {
    const t = harness();
    const korda = await site(t, "korda.test");
    await links(t, korda.websiteId);
    await buildLinks(t, korda.websiteId);
    await ranks(t, korda.websiteId, "2026-10-01");
    later(30_000);
    await rebuildSite(t, korda.websiteId);
    later(60_000);

    // A source that asks for no rebuild of its own — noted — is rebuilt that night.
    await t.run(async (ctx) => await noteDataChanged(ctx, copyRequestKey("links", korda.websiteId)));
    // New rankings filed: asked for at once, and the request missed — its turn
    // taken, and given back without finishing.
    await ranks(t, korda.websiteId, "2026-10-02");
    later(30_000);
    await t.mutation(internal.siteSummaries.beginRebuild, { key: siteRebuildKey(korda.websiteId, UK) });
    await t.mutation(internal.siteSummaries.endRebuild, { key: siteRebuildKey(korda.websiteId, UK) });

    const jobs = await refresh(t);
    expect(jobs.filter((name) => name.includes("buildListCopy"))).toHaveLength(1);
    expect(jobs.filter((name) => name.includes("rebuildSite"))).toHaveLength(1);

    // Once each is rebuilt, the next night leaves them alone.
    later(30_000);
    await buildLinks(t, korda.websiteId);
    await rebuildSite(t, korda.websiteId);
    expect(await refresh(t)).toEqual([]);
  });

  test("rebuilds a copy whose last rebuild failed, or that no finished rebuild stands behind", async () => {
    const t = harness();
    const korda = await site(t, "korda.test");
    await links(t, korda.websiteId);
    await buildLinks(t, korda.websiteId);
    later(60_000);

    // Asked for, and its build died part-way: still out of date.
    await t.mutation(internal.siteListCopies.requestCopies, { requests: [{ kind: "links", key: korda.websiteId }] });
    later(30_000);
    const key = copyRequestKey("links", korda.websiteId);
    await t.mutation(internal.siteSummaries.beginRebuild, { key });
    await t.mutation(internal.siteSummaries.endRebuild, { key, done: false });
    expect((await refresh(t)).filter((name) => name.includes("buildListCopy"))).toHaveLength(1);

    // A copy with no record of a finished rebuild — built before it was kept — is rebuilt once.
    const nash = await site(t, "nash.test");
    await links(t, nash.websiteId);
    await buildLinks(t, nash.websiteId);
    await t.run(async (ctx) => {
      const row = await ctx.db.query("siteSummaryRequests").withIndex("by_key", (q) => q.eq("key", copyRequestKey("links", nash.websiteId))).unique();
      await ctx.db.delete(row!._id);
    });
    later(30_000);
    expect(await refresh(t)).toHaveLength(1);
  });

  test("rebuilds a site whose keyword-list page ended, or went past a fortnight out, since its rebuild", async () => {
    const t = harness();
    const korda = await site(t, "korda.test");
    const nash = await site(t, "nash.test");
    for (const each of [korda, nash]) await ranks(t, each.websiteId, "2026-10-01");
    const kordaPage = await listPageOut(t, korda.websiteId);
    await listPageOut(t, nash.websiteId);
    later(30_000);
    for (const each of [korda, nash]) await rebuildSite(t, each.websiteId);
    later(60_000);
    expect(await refresh(t)).toEqual([]);

    // Korda's page fails: no filing asks, and its list's day is no longer held back.
    await t.run(async (ctx) => await ctx.db.patch(kordaPage, { status: "FAILED", completedAt: Date.now() }));
    const failed = await refresh(t);
    expect(failed.filter((name) => name.includes("rebuildSite"))).toHaveLength(1);

    // Nash's page is still out a fortnight on: the calendar alone moves its latest check.
    later(30_000);
    await rebuildSite(t, korda.websiteId);
    later(LIST_PAGE_STUCK_MS);
    const stuck = await refresh(t);
    expect(stuck.filter((name) => name.includes("rebuildSite"))).toHaveLength(1);
    const asked = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
    expect(asked.filter((job) => job.state.kind === "pending" && job.name.includes("rebuildSite")).at(-1)?.args[0])
      .toMatchObject({ websiteId: nash.websiteId });
  });
});
