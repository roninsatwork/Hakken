import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { slimSeoResult } from "./dataForSeoSlim";

/**
 * The Sites link pages (docs/plans/active/user-sites-plan.md, Phase 4): each
 * new list replaces the last of its kind, an older answer never puts old
 * links back, histories fill only the days we have no figure for, and every
 * list is read through the caller's own hold.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;
const UK = 2826;
const LEEDS = 1006886;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function company(t: Harness, name: string) {
  return await t.run(async (ctx) => await ctx.db.insert("companies", { name, createdAt: Date.now() }));
}

async function member(t: Harness, companyId: Id<"companies">) {
  const userId = await t.run(async (ctx) =>
    await ctx.db.insert("users", {
      name: "Member", email: `m-${Math.random()}@test.com`, role: "ADMIN" as const, companyId, createdAt: Date.now(),
    }));
  return t.withIdentity({ subject: userId });
}

async function hold(t: Harness, companyId: Id<"companies">, host: string, locationCode = UK) {
  return await t.run(async (ctx) => {
    const existing = await ctx.db.query("websites").withIndex("by_host", (q) => q.eq("host", host)).unique();
    const websiteId = existing?._id ?? await ctx.db.insert("websites", { host, displayHost: host, firstSeenAt: Date.now() });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", locationCode, createdAt: Date.now() });
    return { websiteId, holdId };
  });
}

/** A bought answer, filed exactly as the parser files it. */
async function file(t: Harness, websiteId: Id<"websites">, operationId: string, result: unknown, at: string, sent: Record<string, unknown> = {}) {
  const when = Date.parse(`${at}T10:00:00Z`);
  const pullId = await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
    operationId, family: "Backlinks", mode: "LIVE", websiteId, target: "ronins.co.uk", taskArgsJson: JSON.stringify(sent),
    status: "READY", tag: `t-${Math.random()}`, attempts: 0, costUsd: 0.05, sandbox: false,
    submittedAt: when, completedAt: when, resultJson: JSON.stringify(result),
  } as never));
  await t.action(internal.seoCollectionParse.parseSeoResult, { pullId });
  return pullId;
}

const link = (domain: string, extra: Record<string, unknown> = {}) => ({
  domain_from: domain, url_from: `https://${domain}/post`, url_to: "https://ronins.co.uk/", anchor: `about ${domain}`,
  dofollow: true, domain_from_rank: 100, first_seen: "2026-01-01 00:00:00 +00:00", ...extra,
});

describe("link lists", () => {
  test("a new list replaces the last of its kind, and an older one filed again changes nothing", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "ronins.co.uk");
    const older = await file(t, own.websiteId, "backlinks_list", [{ items: [link("a.com"), link("b.com")] }], "2026-09-01");
    await file(t, own.websiteId, "backlinks_broken", [{ items: [link("broken.com", { is_broken: true, url_to: "https://ronins.co.uk/gone", url_to_status_code: 404 })] }], "2026-09-01");
    await file(t, own.websiteId, "backlinks_list", [{ items: [link("b.com", { domain_from_rank: 300 }), link("c.com", { is_new: true, dofollow: false })] }], "2026-09-08");
    // A re-parse of last week's list must not put a.com back.
    await t.action(internal.seoCollectionParse.parseSeoResult, { pullId: older });

    const rows = await t.run(async (ctx) => await ctx.db.query("siteBacklinks").collect());
    expect(rows.filter((row) => row.pass === "ONE_PER_DOMAIN").map((row) => row.domainFrom).sort()).toEqual(["b.com", "c.com"]);
    expect(rows.filter((row) => row.pass === "BROKEN").map((row) => [row.domainFrom, row.pageTo, row.statusCode])).toEqual([["broken.com", "/gone", 404]]);

    const asRonins = await member(t, ronins);
    const first = { numItems: 15, cursor: null };
    const list = async (args: Record<string, unknown>) =>
      (await asRonins.query(api.siteLinkLists.listBacklinks, { siteId: own.holdId, paginationOpts: first, ...args })).page.map((row) => row.domainFrom);
    expect(await list({})).toEqual(["b.com", "c.com"]);
    expect(await list({ status: "NEW" })).toEqual(["c.com"]);
    expect(await list({ follow: "NOFOLLOW" })).toEqual(["c.com"]);
    expect(await list({ search: "c.com" })).toEqual(["c.com"]);
    const broken = await asRonins.query(api.siteLinkLists.listBrokenBacklinks, { siteId: own.holdId, paginationOpts: first });
    expect(broken.page.map((row) => [row.domainFrom, row.day])).toEqual([["broken.com", "2026-09-01"]]);
  });

  test("every link comes a thousand a page: filed under its list's day, the rest asked for up to the website's limit, older lists gone", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const own = await hold(t, korda, "kordatackle.com");
    await t.run(async (ctx) => {
      await ctx.db.insert("companyDataLimits", { companyId: korda, keywordsPerSite: 10_000, backlinksPerSite: 10_000, updatedAt: Date.now() });
      // This website keeps two thousand links, whatever its company keeps.
      await ctx.db.insert("websiteDataLimits", { companyWebsiteId: own.holdId, companyId: korda, backlinksPerSite: 2_000, updatedAt: Date.now() });
    });
    const page = async (day: string, offset: number, items: unknown[], total: number) => {
      const when = Date.parse(`${day}T10:00:00Z`);
      const pullId = await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
        operationId: "backlinks_all", family: "Backlinks", mode: "LIVE", websiteId: own.websiteId, companyId: korda,
        target: "kordatackle.com", taskArgsJson: JSON.stringify({ target: "kordatackle.com", limit: 1_000, offset, mode: "as_is" }),
        status: "READY", tag: `all-${day}-${offset}`, idempotencyKey: `all-${day}-${offset}`, attempts: 0, costUsd: 0.04,
        sandbox: false, submittedAt: when, completedAt: when + 60_000,
        resultJson: JSON.stringify(slimSeoResult("backlinks_all", [{ total_count: total, items }])),
      } as never));
      await t.action(internal.seoCollectionParse.parseSeoResult, { pullId });
    };
    const kept = async () => (await t.run(async (ctx) => await ctx.db.query("siteBacklinks").collect()))
      .filter((row) => row.pass === "ALL")
      .map((row) => `${row.domainFrom} ${row.day}`)
      .sort();

    await page("2026-09-14", 0, [link("old.com")], 1);
    await page("2026-09-21", 0, [
      link("a.com", { domain_from_rank: 400, attributes: ["nofollow"], semantic_location: "footer", backlink_spam_score: 30, rank: 12 }),
      link("a.com", { url_from: "https://a.com/other", domain_from_rank: 400 }),
      link("b.com"),
    ], 5_000);
    // Both of a.com's links — every link, not one per website — and last week's list gone.
    expect(await kept()).toEqual(["a.com 2026-09-21", "a.com 2026-09-21", "b.com 2026-09-21"]);
    const footer = await t.run(async (ctx) => (await ctx.db.query("siteBacklinks").collect()).find((row) => row.location === "footer"));
    expect(footer).toMatchObject({ attributes: ["nofollow"], spamScore: 30, linkRank: 12 });

    // 5,000 links, and this website keeps 2,000: one more page, asked for once.
    const queued = async () => (await t.run(async (ctx) => await ctx.db.query("seoDataPulls").collect()))
      .filter((pull) => pull.status === "PENDING")
      .map((pull) => JSON.parse(pull.taskArgsJson) as { offset: number; limit: number })
      .map((sent) => [sent.offset, sent.limit]);
    expect(await queued()).toEqual([[1_000, 1_000]]);

    // A late page of last week's list does not bring its links back.
    await page("2026-09-14", 1_000, [link("late.com")], 1);
    expect(await kept()).toEqual(["a.com 2026-09-21", "a.com 2026-09-21", "b.com 2026-09-21"]);

    const asKorda = await member(t, korda);
    const first = { numItems: 15, cursor: null };
    const every = await asKorda.query(api.siteLinkLists.listBacklinks, { siteId: own.holdId, paginationOpts: first, every: true });
    expect(every.page.map((row) => row.domainFrom)).toEqual(["a.com", "a.com", "b.com"]);
    // The strongest link from each website is a list of its own.
    const one = await asKorda.query(api.siteLinkLists.listBacklinks, { siteId: own.holdId, paginationOpts: first });
    expect(one.page).toEqual([]);
  });

  test("linking websites, anchors and servers, with the servers' networks counted once", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "ronins.co.uk");
    await file(t, own.websiteId, "referring_domains_list", [{ items: [
      { domain: "strong.com", rank: 500, backlinks: 2, first_seen: "2025-01-01 00:00:00 +00:00" },
      { domain: "many.com", rank: 100, backlinks: 40 },
      { domain: "gone.com", rank: 50, backlinks: 1, lost_date: "2026-08-01 00:00:00 +00:00" },
    ] }], "2026-09-08");
    await file(t, own.websiteId, "anchors_list", [{ items: [
      { anchor: "Ronins", backlinks: 30, referring_domains: 3 },
      { anchor: "web design", backlinks: 10, referring_domains: 9 },
    ] }], "2026-09-08");
    await file(t, own.websiteId, "referring_ips_list", [{ items: [
      { network_address: "10.0.0.1", backlinks: 5, referring_domains: 4 },
      { network_address: "10.0.0.2", backlinks: 3, referring_domains: 3 },
      { network_address: "192.168.1.9", backlinks: 9, referring_domains: 1 },
    ] }], "2026-09-08");

    const asRonins = await member(t, ronins);
    const first = { numItems: 15, cursor: null };
    const domains = async (args: Record<string, unknown>) =>
      (await asRonins.query(api.siteLinkLists.listReferringDomains, { siteId: own.holdId, paginationOpts: first, ...args })).page.map((row) => row.domain);
    expect(await domains({})).toEqual(["strong.com", "many.com", "gone.com"]);
    expect(await domains({ sort: "backlinks" })).toEqual(["many.com", "strong.com", "gone.com"]);
    expect(await domains({ status: "LOST" })).toEqual(["gone.com"]);

    const anchors = await asRonins.query(api.siteLinkLists.listAnchors, { siteId: own.holdId, paginationOpts: first, sort: "domains" });
    expect(anchors.page.map((row) => row.anchor)).toEqual(["web design", "Ronins"]);

    expect(await asRonins.query(api.siteLinkLists.topSubnets, { siteId: own.holdId })).toEqual([
      { subnet: "10.0.0.0/24", ips: 2, backlinks: 8, referringDomains: 7 },
      { subnet: "192.168.1.0/24", ips: 1, backlinks: 9, referringDomains: 1 },
    ]);
    const onNetwork = await asRonins.query(api.siteLinkLists.listReferringIps, { siteId: own.holdId, paginationOpts: first, subnet: "10.0.0.0/24" });
    expect(onNetwork.page.map((row) => row.ip)).toEqual(["10.0.0.1", "10.0.0.2"]);
    // The network chosen holds while searching, and the sort within it.
    const searched = async (subnet: string) =>
      (await asRonins.query(api.siteLinkLists.listReferringIps, { siteId: own.holdId, paginationOpts: first, search: "10.0.0.1", subnet }))
        .page.map((row) => row.ip);
    expect(await searched("10.0.0.0/24")).toContain("10.0.0.1");
    expect(await searched("192.168.1.0/24")).toEqual([]);
    const byDomains = await asRonins.query(api.siteLinkLists.listReferringIps, { siteId: own.holdId, paginationOpts: first, subnet: "10.0.0.0/24", sort: "domains" });
    expect(byDomains.page.map((row) => row.referringDomains)).toEqual([4, 3]);
  });
});

describe("link and ranking history", () => {
  test("links gained and lost, a week at a time, filed under the week's Monday", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "ronins.co.uk");
    // DataForSEO dates a week by its last day, a Sunday.
    const week = (sunday: string, gained: number) => ({ date: `${sunday} 00:00:00 +00:00`, new_backlinks: gained, lost_backlinks: 1, new_referring_domains: 1 });
    await file(t, own.websiteId, "backlinks_new_lost", [{ items: [week("2026-09-13", 5), week("2026-09-20", 3)] }], "2026-09-16");
    // A later answer about the same week replaces the earlier, partial count.
    await file(t, own.websiteId, "backlinks_new_lost", [{ items: [week("2026-09-20", 6), week("2026-09-27", 2)] }], "2026-09-23");

    const days = await t.run(async (ctx) => await ctx.db.query("siteLinkDays").collect());
    expect(days.map((row) => [row.day, row.newBacklinks]).sort()).toEqual([["2026-09-07", 5], ["2026-09-14", 6], ["2026-09-21", 2]]);

    const asRonins = await member(t, ronins);
    const monthly = await asRonins.query(api.siteLinkLists.linkChanges, { siteId: own.holdId, from: "2026-09-01", to: "2026-09-30", step: "month" });
    expect(monthly).toEqual([{ day: "2026-09-01", newBacklinks: 13, lostBacklinks: 3, newReferringDomains: 3, lostReferringDomains: 0 }]);
  });

  test("a history fills only the days with no figure of our own, and a ranking history only its own place", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "ronins.co.uk", LEEDS);
    // Our own measurement on one day, which a history bought later must not overwrite.
    await t.run(async (ctx) => await ctx.db.insert("siteDaySummaries", {
      websiteId: own.websiteId, locationCode: LEEDS, day: "2025-06-30", backlinks: 999, updatedAt: Date.now(),
    }));
    // Months arrive dated by their last day; this month's is still ahead, so
    // it is filed as of the day it was bought.
    await file(t, own.websiteId, "backlinks_history", [{ items: [
      { date: "2025-06-30 00:00:00 +00:00", rank: 150, backlinks: 700, referring_domains: 90 },
      { date: "2025-07-31 00:00:00 +00:00", rank: 151, backlinks: 710, referring_domains: 91 },
      { date: "2026-09-30 00:00:00 +00:00", rank: 201, backlinks: 1000, referring_domains: 505 },
    ] }], "2026-09-23");
    await file(t, own.websiteId, "ranking_history", [{ items: [{
      year: 2025, month: 6, metrics: { organic: { pos_1: 2, pos_4_10: 5, etv: 800.4, count: 300 }, paid: { count: 4, etv: 20, estimated_paid_traffic_cost: 55 } },
    }] }], "2026-09-23", { location_code: LEEDS });

    const days = await t.run(async (ctx) => await ctx.db.query("siteDaySummaries").collect());
    expect(days.find((row) => row.day === "2025-06-30")).toMatchObject({ backlinks: 999, referringDomains: 90, domainRank: 150 });
    expect(days.find((row) => row.day === "2025-06-01")).toMatchObject({
      rankedKeywordsTotal: 300, estimatedTraffic: 800, allBands: { p01_03: 2, p04_10: 5, p11_20: 0, p21_50: 0, p51_up: 0 },
      paidKeywords: 4, paidTraffic: 20, paidTrafficCost: 55,
    });
    expect(days.find((row) => row.day === "2025-07-31")).toMatchObject({ backlinks: 710, locationCode: LEEDS });
    expect(days.find((row) => row.day === "2026-09-23")).toMatchObject({ backlinks: 1000, referringDomains: 505 });
    expect(days.some((row) => row.day > "2026-09-23")).toBe(false);
    // Nothing was filed for a place nobody watches the site from.
    expect(days.every((row) => row.locationCode === LEEDS)).toBe(true);
  });
});

describe("one company never sees another's links", () => {
  test("every link query answers not found for a hold that is not the caller's", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const other = await company(t, "Someone Else");
    await hold(t, ronins, "ronins.co.uk");
    const theirs = await hold(t, other, "pixelfield.co.uk");
    const asRonins = await member(t, ronins);
    const siteId = theirs.holdId;
    const page = { numItems: 15, cursor: null };
    const attempts: Array<() => Promise<unknown>> = [
      () => asRonins.query(api.siteLinkLists.listBacklinks, { siteId, paginationOpts: page }),
      () => asRonins.query(api.siteLinkLists.listBrokenBacklinks, { siteId, paginationOpts: page }),
      () => asRonins.query(api.siteLinkLists.listReferringDomains, { siteId, paginationOpts: page }),
      () => asRonins.query(api.siteLinkLists.listAnchors, { siteId, paginationOpts: page }),
      () => asRonins.query(api.siteLinkLists.listReferringIps, { siteId, paginationOpts: page }),
      () => asRonins.query(api.siteLinkLists.topSubnets, { siteId }),
      () => asRonins.query(api.siteLinkLists.linkChanges, { siteId, from: "2026-09-01", to: "2026-09-30", step: "day" }),
    ];
    for (const attempt of attempts) await expect(attempt()).rejects.toThrow(/not one your company holds/);
  });
});
