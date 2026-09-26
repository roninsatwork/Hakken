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
    const list = async (args: Record<string, unknown>) =>
      (await asRonins.query(api.siteLinkLists.listBacklinks, { siteId: own.holdId, page: 1, rows: 25, ...args })).rows.map((row) => row.domainFrom);
    expect(await list({})).toEqual(["b.com", "c.com"]);
    expect(await list({ status: "NEW" })).toEqual(["c.com"]);
    expect(await list({ follow: "NOFOLLOW" })).toEqual(["c.com"]);
    expect(await list({ search: "c.com" })).toEqual(["c.com"]);
    const broken = await asRonins.query(api.siteLinkLists.listBrokenBacklinks, { siteId: own.holdId, page: 1, rows: 25 });
    expect(broken.rows.map((row) => [row.domainFrom, row.day])).toEqual([["broken.com", "2026-09-01"]]);
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
    // Every link is counted from its compact copy: none until it is built.
    const before = await asKorda.query(api.siteLinkLists.listBacklinks, { siteId: own.holdId, page: 1, rows: 25, every: true });
    expect(before.preparing).toBe(true);
    await t.action(internal.siteListCopyBuilders.buildListCopy, { kind: "links", key: own.websiteId });
    const every = await asKorda.query(api.siteLinkLists.listBacklinks, { siteId: own.holdId, page: 1, rows: 25, every: true });
    expect(every).toMatchObject({ total: 3, pages: 1, preparing: false });
    expect(every.rows.map((row) => row.domainFrom)).toEqual(["a.com", "a.com", "b.com"]);
    // The strongest link from each website is a list of its own.
    const one = await asKorda.query(api.siteLinkLists.listBacklinks, { siteId: own.holdId, page: 1, rows: 25 });
    expect(one.rows).toEqual([]);
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
    const domains = async (args: Record<string, unknown>) =>
      (await asRonins.query(api.siteLinkLists.listReferringDomains, { siteId: own.holdId, page: 1, rows: 25, ...args })).rows.map((row) => row.domain);
    expect(await domains({})).toEqual(["strong.com", "many.com", "gone.com"]);
    expect(await domains({ sort: "backlinks" })).toEqual(["many.com", "strong.com", "gone.com"]);
    expect(await domains({ status: "LOST" })).toEqual(["gone.com"]);

    const anchors = await asRonins.query(api.siteLinkLists.listAnchors, { siteId: own.holdId, page: 1, rows: 25, sort: "domains" });
    expect(anchors.rows.map((row) => row.anchor)).toEqual(["web design", "Ronins"]);

    expect(await asRonins.query(api.siteLinkLists.topSubnets, { siteId: own.holdId })).toEqual([
      { subnet: "10.0.0.0/24", ips: 2, backlinks: 8, referringDomains: 7 },
      { subnet: "192.168.1.0/24", ips: 1, backlinks: 9, referringDomains: 1 },
    ]);
    const onNetwork = await asRonins.query(api.siteLinkLists.listReferringIps, { siteId: own.holdId, page: 1, rows: 25, subnet: "10.0.0.0/24" });
    expect(onNetwork.rows.map((row) => row.ip)).toEqual(["10.0.0.1", "10.0.0.2"]);
    // The network chosen holds while searching, and the sort within it.
    const searched = async (subnet: string) =>
      (await asRonins.query(api.siteLinkLists.listReferringIps, { siteId: own.holdId, page: 1, rows: 25, search: "10.0.0.1", subnet }))
        .rows.map((row) => row.ip);
    expect(await searched("10.0.0.0/24")).toContain("10.0.0.1");
    expect(await searched("192.168.1.0/24")).toEqual([]);
    const byDomains = await asRonins.query(api.siteLinkLists.listReferringIps, { siteId: own.holdId, page: 1, rows: 25, subnet: "10.0.0.0/24", sort: "domains" });
    expect(byDomains.rows.map((row) => row.referringDomains)).toEqual([4, 3]);

    // Any heading, either way round, over the whole list (docs/plans/active/
    // sites-table-sorting-plan.md): the fewest links first; A to Z; the
    // weakest first; and only strong.com says when it first linked, so it
    // leads either way and the others follow.
    expect(await domains({ sort: "backlinks", direction: "asc" })).toEqual(["gone.com", "strong.com", "many.com"]);
    expect(await domains({ sort: "domain" })).toEqual(["gone.com", "many.com", "strong.com"]);
    expect(await domains({ sort: "rank", direction: "asc" })).toEqual(["gone.com", "many.com", "strong.com"]);
    expect((await domains({ sort: "firstSeen" }))[0]).toBe("strong.com");
    expect((await domains({ sort: "firstSeen", direction: "asc" }))[0]).toBe("strong.com");
    // A page at a time: the last page is the other end of the whole list.
    const lastPage = await asRonins.query(api.siteLinkLists.listReferringDomains, { siteId: own.holdId, page: 2, rows: 2 });
    expect(lastPage.rows.map((row) => row.domain)).toEqual(["gone.com"]);
    // The dropdown's "newest" is not a heading: refused, not guessed at.
    await expect(asRonins.query(api.siteLinkLists.listReferringDomains, { siteId: own.holdId, page: 1, rows: 25, sort: "newest" } as never)).rejects.toThrow();

    const anchorsBy = async (args: Record<string, unknown>) =>
      (await asRonins.query(api.siteLinkLists.listAnchors, { siteId: own.holdId, page: 1, rows: 25, ...args })).rows.map((row) => row.anchor);
    expect(await anchorsBy({})).toEqual(["Ronins", "web design"]);
    expect(await anchorsBy({ direction: "asc" })).toEqual(["web design", "Ronins"]);
    expect(await anchorsBy({ sort: "anchor", direction: "desc" })).toEqual(["web design", "Ronins"]);

    // Addresses in number order, and turned round.
    const ipsBy = async (args: Record<string, unknown>) =>
      (await asRonins.query(api.siteLinkLists.listReferringIps, { siteId: own.holdId, page: 1, rows: 25, ...args })).rows.map((row) => row.ip);
    expect(await ipsBy({ sort: "ip" })).toEqual(["10.0.0.1", "10.0.0.2", "192.168.1.9"]);
    expect(await ipsBy({ sort: "ip", direction: "desc" })).toEqual(["192.168.1.9", "10.0.0.2", "10.0.0.1"]);
    expect(await ipsBy({})).toEqual(["192.168.1.9", "10.0.0.1", "10.0.0.2"]);
  });
});

/**
 * The link lists read whole and counted exactly (docs/plans/active/
 * sites-table-pages-plan.md §5.1): any page opens at once, the total is the
 * list's own, and a list being filed over last week's counts each linking
 * website once.
 */
describe("exact pages of the link lists", () => {
  async function pull(t: Harness, websiteId: Id<"websites">) {
    return await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
      operationId: "referring_domains_list", family: "Backlinks", mode: "LIVE", websiteId, taskArgsJson: "{}", status: "READY",
      tag: `t-${Math.random()}`, attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now(),
    } as never));
  }

  async function domains(t: Harness, websiteId: Id<"websites">, pullId: Id<"seoDataPulls">, names: string[], day: string) {
    await t.run(async (ctx) => {
      for (const [index, domain] of names.entries()) {
        await ctx.db.insert("siteReferringDomains", {
          websiteId, pullId, day, domain, rank: 1_000 - index, backlinks: index + 1, status: "LIVE",
          firstSeen: `2026-01-${String((index % 28) + 1).padStart(2, "0")}`,
        });
      }
    });
  }

  test("counts each linking website once while a new list is filed over the last, and opens any page", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "ronins.co.uk");
    // Last week's list: ten websites still linking, and five that have gone.
    const lastWeek = await pull(t, own.websiteId);
    await domains(t, own.websiteId, lastWeek, [
      ...Array.from({ length: 10 }, (_, i) => `site-${i}.com`),
      ...Array.from({ length: 5 }, (_, i) => `gone-${i}.com`),
    ], "2026-09-01");
    vi.advanceTimersByTime(1_000);
    // This week's, filed over it and not yet cleared: sixty websites, the ten among them.
    const thisWeek = await pull(t, own.websiteId);
    await domains(t, own.websiteId, thisWeek, Array.from({ length: 60 }, (_, i) => `site-${i}.com`), "2026-09-08");

    const asRonins = await member(t, ronins);
    const page = async (n: number, rows = 25) =>
      await asRonins.query(api.siteLinkLists.listReferringDomains, { siteId: own.holdId, page: n, rows });
    const first = await page(1);
    expect(first).toMatchObject({ total: 65, pages: 3, page: 1, size: 25, cut: null });
    expect(first.rows).toHaveLength(25);
    expect(first.rows.find((row) => row.domain === "site-0.com")?.day).toBe("2026-09-08");

    const last = await page(3);
    expect(last.rows).toHaveLength(15);
    const everyone = [...first.rows, ...(await page(2)).rows, ...last.rows];
    expect(new Set(everyone.map((row) => row.domain)).size).toBe(65);

    // A page past the end answers the last page, and a page is never more than 100 rows.
    expect((await page(9)).page).toBe(3);
    expect((await page(1, 500)).size).toBe(100);
  });

  test("searches the start of each word, and counts what it finds", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "ronins.co.uk");
    const pullId = await pull(t, own.websiteId);
    await domains(t, own.websiteId, pullId, ["carp-rods.co.uk", "rod-pod.com", "products.com", "fishing-rodney.net", "tackle.com"], "2026-09-08");
    const asRonins = await member(t, ronins);

    const found = async (search: string) =>
      (await asRonins.query(api.siteLinkLists.listReferringDomains, { siteId: own.holdId, page: 1, rows: 25, search })).rows
        .map((row) => row.domain).sort();
    expect(await found("rod")).toEqual(["carp-rods.co.uk", "fishing-rodney.net", "rod-pod.com"]);
    expect(await found("carp ro")).toEqual(["carp-rods.co.uk"]);
    expect(await found("ROD POD")).toEqual(["rod-pod.com"]);
    expect(await found("odd")).toEqual([]);
    expect((await asRonins.query(api.siteLinkLists.listReferringDomains, { siteId: own.holdId, page: 1, rows: 25, search: "rod" })).total).toBe(3);
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
    const attempts: Array<() => Promise<unknown>> = [
      () => asRonins.query(api.siteLinkLists.listBacklinks, { siteId, page: 1, rows: 25 }),
      () => asRonins.query(api.siteLinkLists.listBrokenBacklinks, { siteId, page: 1, rows: 25 }),
      () => asRonins.query(api.siteLinkLists.listReferringDomains, { siteId, page: 1, rows: 25 }),
      () => asRonins.query(api.siteLinkLists.listAnchors, { siteId, page: 1, rows: 25 }),
      () => asRonins.query(api.siteLinkLists.listReferringIps, { siteId, page: 1, rows: 25 }),
      () => asRonins.query(api.siteLinkLists.topSubnets, { siteId }),
      () => asRonins.query(api.siteLinkLists.linkChanges, { siteId, from: "2026-09-01", to: "2026-09-30", step: "day" }),
    ];
    for (const attempt of attempts) await expect(attempt()).rejects.toThrow(/not one your company holds/);
  });
});
