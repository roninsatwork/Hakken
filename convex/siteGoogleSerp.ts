import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { tenantQuery } from "./tenantFunctions";
import { listHold, myRivals, requireMySite } from "./siteAccess";
import { holdSearches } from "./holdLists";
import { MAX_LIST, type Site } from "./websiteSiteRows";
import { listWithCut } from "./siteListPages";

/**
 * Google's results for each of the site's searches, down to position 100, as
 * the Sites screens read them: who ranks above the site, which features the
 * page shows, and what people also ask (docs/plans/active/user-sites-plan.md,
 * section 2).
 *
 * Read from the kept results pages (`siteSerpPages`), the newest for each
 * search on the site's list at the place the site is read from. The list is
 * the company's own choice, capped on its record, so it is read whole (the
 * "bounded lists" rule in the plan's build log) — one page per search.
 */

type Reader = { db: QueryCtx["db"] };

/**
 * Questions and related searches returned at most: about a dozen for each of
 * the thousand searches a site can track, which is all a site's results pages
 * can hold, so the list is whole. Past it, the screen says the list is longer
 * (docs/plans/active/sites-table-pages-plan.md, T11).
 */
const QUESTIONS_KEPT = 12_000;

/** The domain as a site is known: lower case, without `www.`. */
export function bare(domain: string): string {
  return domain.toLowerCase().replace(/^www\./, "");
}

/** Whether a domain on the page is this host or one of its subdomains. */
export function isHost(domain: string, host: string): boolean {
  const name = bare(domain);
  return name === host || name.endsWith(`.${host}`);
}

type Checked = { keyword: string; isActive: boolean; page: Doc<"siteSerpPages"> | null };

/** The newest kept results page of every search on the site's list — this company's own. */
async function latestPages(ctx: Reader, site: Site): Promise<Checked[]> {
  const searches = await holdSearches(ctx, listHold(site), MAX_LIST);
  return await Promise.all(searches.map(async (search) => ({
    keyword: search.keyword,
    isActive: search.isActive,
    page: await ctx.db
      .query("siteSerpPages")
      .withIndex("by_keyword_place_day", (q) => q.eq("keyword", search.keyword).eq("locationCode", site.place))
      .order("desc")
      .first(),
  })));
}

/** The company's other holds on the page, by host, to mark them as rivals. */
async function rivalHosts(ctx: Reader, site: Site): Promise<Set<string>> {
  return new Set((await myRivals(ctx, site)).map((rival) => rival.website.host));
}

const resultValidator = v.object({
  position: v.number(),
  domain: v.string(),
  url: v.union(v.string(), v.null()),
  isRival: v.boolean(),
});

/** The results a search's first page holds. */
const PAGE_ONE = 10;

/**
 * Who ranks above the site on each of its searches: every result higher on
 * the page than the site's own, or the whole of page one when the site is not
 * in the hundred a check reads.
 */
export const listAbove = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.array(v.object({
    keyword: v.string(),
    isActive: v.boolean(),
    day: v.union(v.string(), v.null()),
    position: v.union(v.number(), v.null()),
    url: v.union(v.string(), v.null()),
    above: v.array(resultValidator),
    rivalsAbove: v.number(),
    results: v.number(),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const host = site.website.host;
    const rivals = await rivalHosts(ctx, site);
    const rows = (await latestPages(ctx, site)).map(({ keyword, isActive, page }) => {
      const mine = page?.results.find((result) => isHost(result.domain, host)) ?? null;
      const above = (page?.results ?? [])
        .filter((result) => !isHost(result.domain, host) && (mine === null ? result.position <= PAGE_ONE : result.position < mine.position))
        .map((result) => ({
          position: result.position,
          domain: bare(result.domain),
          url: result.url ?? null,
          isRival: [...rivals].some((rival) => isHost(result.domain, rival)),
        }));
      return {
        keyword,
        isActive,
        day: page?.day ?? null,
        position: mine?.position ?? null,
        url: mine?.url ?? null,
        above,
        rivalsAbove: above.filter((result) => result.isRival).length,
        results: page?.results.length ?? 0,
      };
    });
    // Searches with most to win first: on the page but beaten, then not on it.
    return rows.sort((left, right) =>
      Number(right.isActive) - Number(left.isActive)
      || (left.position ?? 999) - (right.position ?? 999)
      || left.keyword.localeCompare(right.keyword));
  },
});

/**
 * Which features Google shows on each of the site's searches — an AI
 * Overview, a map pack, a featured snippet, "People also ask" — and whether
 * the site is in the ones that name websites.
 */
export const listFeatures = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.object({
    searches: v.array(v.object({
      keyword: v.string(),
      isActive: v.boolean(),
      day: v.union(v.string(), v.null()),
      features: v.array(v.string()),
      inAiOverview: v.boolean(),
      inLocalPack: v.boolean(),
      hasFeaturedSnippet: v.boolean(),
    })),
    totals: v.array(v.object({ feature: v.string(), searches: v.number(), withSite: v.union(v.number(), v.null()) })),
    checked: v.number(),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const host = site.website.host;
    const checked = (await latestPages(ctx, site)).filter((row) => row.page !== null);
    const searches = checked.map(({ keyword, isActive, page }) => ({
      keyword,
      isActive,
      day: page!.day,
      features: page!.features,
      inAiOverview: page!.aiOverviewDomains.some((domain) => isHost(domain, host)),
      inLocalPack: page!.localPackDomains.some((domain) => isHost(domain, host)),
      hasFeaturedSnippet: page!.featuredSnippetDomain !== undefined && isHost(page!.featuredSnippetDomain, host),
    }));

    // How many searches show each feature, and — for the three that name
    // websites — on how many of them the site is one of those named.
    const totals = new Map<string, { feature: string; searches: number; withSite: number | null }>();
    for (const row of searches) {
      for (const feature of row.features) {
        const held = totals.get(feature) ?? {
          feature,
          searches: 0,
          withSite: ["ai_overview", "local_pack", "featured_snippet"].includes(feature) ? 0 : null,
        };
        held.searches += 1;
        if (feature === "ai_overview" && row.inAiOverview) held.withSite! += 1;
        if (feature === "local_pack" && row.inLocalPack) held.withSite! += 1;
        if (feature === "featured_snippet" && row.hasFeaturedSnippet) held.withSite! += 1;
        totals.set(feature, held);
      }
    }
    return {
      searches: searches.sort((left, right) => right.features.length - left.features.length || left.keyword.localeCompare(right.keyword)),
      totals: [...totals.values()].sort((left, right) => right.searches - left.searches || left.feature.localeCompare(right.feature)),
      checked: searches.length,
    };
  },
});

/**
 * "People also ask" questions and related searches from the site's searches'
 * results pages, each once, with the searches it came up on.
 */
export const listQuestions = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: listWithCut(v.object({
    text: v.string(),
    kind: v.union(v.literal("QUESTION"), v.literal("RELATED")),
    searches: v.array(v.string()),
    day: v.string(),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const found = new Map<string, { text: string; kind: "QUESTION" | "RELATED"; searches: string[]; day: string }>();
    let cut = false;
    for (const { keyword, page } of await latestPages(ctx, site)) {
      if (!page) continue;
      const add = (text: string, kind: "QUESTION" | "RELATED") => {
        const key = `${kind}:${text.toLowerCase()}`;
        const held = found.get(key);
        if (held) {
          if (!held.searches.includes(keyword)) held.searches.push(keyword);
          if (page.day > held.day) held.day = page.day;
        } else if (found.size < QUESTIONS_KEPT) {
          found.set(key, { text, kind, searches: [keyword], day: page.day });
        } else {
          cut = true;
        }
      };
      for (const question of page.questions) add(question, "QUESTION");
      for (const related of page.related) add(related, "RELATED");
    }
    const rows = [...found.values()].sort((left, right) =>
      right.searches.length - left.searches.length
      || left.kind.localeCompare(right.kind)
      || left.text.localeCompare(right.text));
    return { rows, cut: cut ? rows.length : null };
  },
});
