import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { postDataForSeoTask, readDataForSeoCredentials } from "./dataForSeoRest";
import { requireMySite } from "./siteAccess";
import { CRAWL_ISSUES } from "./siteCrawl";
import { tenantQuery } from "./tenantFunctions";
import { getErrorMessage } from "./utils/lang";
import { pagePath } from "./utils/siteShapes";

/**
 * The page-by-page detail of a site crawl (Anthony, 2026-09-24: "store
 * whatever we can"): which pages have which problem, and which links are
 * broken and where. The crawl's summary said only how many pages had each
 * problem; DataForSEO keeps the pages and links behind it for thirty days
 * after the crawl, free to fetch — they were paid for with the crawl — so they
 * are fetched as soon as the summary is in, and kept for the newest crawl.
 *
 * **Never the page's words.** A page's title, description and text are page
 * text, which is not kept (docs/plans/active/user-sites-plan.md, "No page
 * text"). What is kept is its address, the answer it gave, the checks it
 * failed, and figures: size, speed, links, words counted.
 *
 * Paths and fields read from DataForSEO's docs on 2026-09-24
 * (docs.dataforseo.com/v3/on_page-pages, …/on_page-links).
 */

/** Rows one request returns at most. */
const DETAIL_PAGE = 1_000;

/** Requests per list: a crawl reads at most a thousand pages today, and ten thousand broken links is a site in trouble. */
const MAX_DETAIL_REQUESTS = 10;

/** Rows filed per mutation. */
const ROWS_PER_WRITE = 250;

/** An older crawl's rows cleared per pass. */
const OLD_ROWS_CLEARED = 500;

type Unknown = Record<string, unknown>;

const asRecord = (value: unknown): Unknown | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Unknown : null;
const asNumber = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
const asString = (value: unknown): string | undefined => (typeof value === "string" && value.length > 0 ? value : undefined);

/** The items of an On-Page result, wherever the envelope put them. */
function itemsOf(result: unknown): Unknown[] {
  const first = Array.isArray(result) ? asRecord(result[0]) : asRecord(result);
  return (Array.isArray(first?.items) ? first.items : []).flatMap((item) => (asRecord(item) ? [asRecord(item)!] : []));
}

export type CrawlPageRow = {
  url: string;
  page: string;
  statusCode?: number;
  resourceType?: string;
  problems: string[];
  score?: number;
  loadMs?: number;
  largestPaintMs?: number;
  sizeBytes?: number;
  words?: number;
  internalLinks?: number;
  externalLinks?: number;
  inboundLinks?: number;
  clickDepth?: number;
  redirectTo?: string;
  canonical?: string;
};

/** One On-Page `pages` result as rows: the problems are the checks that failed, as the Site audit names them. */
export function parseCrawlPages(result: unknown): CrawlPageRow[] {
  return itemsOf(result).flatMap((item) => {
    const url = asString(item.url);
    if (!url) return [];
    const checks = asRecord(item.checks);
    const meta = asRecord(item.meta);
    const timing = asRecord(item.page_timing);
    const content = asRecord(meta?.content);
    const problems = Object.keys(CRAWL_ISSUES).filter((check) => checks?.[check] === true);
    const optional = <T>(key: string, value: T | undefined) => (value === undefined ? {} : { [key]: value });
    return [{
      url,
      page: pagePath(url),
      problems,
      ...optional("statusCode", asNumber(item.status_code)),
      ...optional("resourceType", asString(item.resource_type)),
      ...optional("score", asNumber(item.onpage_score)),
      ...optional("loadMs", asNumber(timing?.duration_time)),
      ...optional("largestPaintMs", asNumber(timing?.largest_contentful_paint)),
      ...optional("sizeBytes", asNumber(item.size)),
      ...optional("words", asNumber(content?.plain_text_word_count)),
      ...optional("internalLinks", asNumber(meta?.internal_links_count)),
      ...optional("externalLinks", asNumber(meta?.external_links_count)),
      ...optional("inboundLinks", asNumber(meta?.inbound_links_count)),
      ...optional("clickDepth", asNumber(item.click_depth)),
      ...optional("redirectTo", asString(item.location)),
      ...optional("canonical", asString(meta?.canonical)),
    } as CrawlPageRow];
  });
}

export type CrawlLinkRow = {
  from: string;
  fromPage: string;
  to: string;
  type?: string;
  direction?: string;
  statusCode?: number;
  dofollow?: boolean;
};

/** One On-Page `links` result, asked for broken links only, as rows. The link's words are not kept. */
export function parseBrokenLinks(result: unknown): CrawlLinkRow[] {
  return itemsOf(result).flatMap((item) => {
    const from = asString(item.link_from);
    const to = asString(item.link_to);
    if (!from || !to) return [];
    const optional = <T>(key: string, value: T | undefined) => (value === undefined ? {} : { [key]: value });
    return [{
      from,
      fromPage: pagePath(from),
      to,
      ...optional("type", asString(item.type)),
      ...optional("direction", asString(item.direction)),
      ...optional("statusCode", asNumber(item.page_to_status_code)),
      ...(typeof item.dofollow === "boolean" ? { dofollow: item.dofollow } : {}),
    } as CrawlLinkRow];
  });
}

/** The crawl pull behind a fetch: its task, its site and its day. */
export const crawlOf = internalQuery({
  args: { pullId: v.id("seoDataPulls") },
  returns: v.union(v.null(), v.object({ taskId: v.string(), websiteId: v.id("websites"), day: v.string() })),
  handler: async (ctx, args) => {
    const pull = await ctx.db.get(args.pullId);
    if (!pull?.taskId || !pull.websiteId || pull.operationId !== "site_crawl") return null;
    return { taskId: pull.taskId, websiteId: pull.websiteId, day: new Date(pull.completedAt ?? pull.submittedAt).toISOString().slice(0, 10) };
  },
});

/**
 * Fetch a finished crawl's pages and broken links, free, and keep them. Run
 * once the crawl's summary is in; safe to run again — each run replaces the
 * pull's rows.
 *
 * **Nothing is replaced until the whole detail is in hand.** A refusal on the
 * first request used to end the fetch as if the crawl had no pages, and the
 * older crawl's detail was then cleared: the Site audit was left empty
 * (reliability plan 3.6). Now a refusal or a failure changes nothing, and the
 * fetch is tried again later — the detail is kept free for thirty days — a
 * few times before the crawl says why it has none. Old rows are cleared
 * whole, not a thousand at a time, so a fetch run twice never doubles them.
 */
export const fetchCrawlDetail = internalAction({
  args: {
    pullId: v.id("seoDataPulls"),
    /** Tries so far; the first is none. */
    attempt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const crawl: { taskId: string; websiteId: Id<"websites">; day: string } | null =
      await ctx.runQuery(internal.siteCrawlDetail.crawlOf, { pullId: args.pullId });
    if (!crawl) return null;
    let failure: string | null = null;
    try {
      const credentials = readDataForSeoCredentials();
      // Every row of one list, or why it could not all be read.
      const collect = async <Row>(
        path: string,
        extra: Record<string, unknown>,
        parse: (result: unknown) => Row[],
      ): Promise<{ rows: Row[] } | { failure: string }> => {
        const rows: Row[] = [];
        for (let request = 0; request < MAX_DETAIL_REQUESTS; request += 1) {
          const envelope = await postDataForSeoTask(path, { id: crawl.taskId, limit: DETAIL_PAGE, offset: request * DETAIL_PAGE, ...extra }, credentials);
          const task = envelope.tasks?.[0];
          if (!task) return { failure: "DataForSEO's reply had no task in it." };
          if (task.status_code !== undefined && task.status_code >= 40000) {
            return { failure: task.status_message ?? `DataForSEO answered ${task.status_code}.` };
          }
          const page = parse(task.result);
          rows.push(...page);
          if (page.length < DETAIL_PAGE) break;
        }
        return { rows };
      };
      const pages = await collect("/v3/on_page/pages", {}, parseCrawlPages);
      const links = "failure" in pages ? pages : await collect("/v3/on_page/links", { filters: [["is_broken", "=", true]] }, parseBrokenLinks);
      if ("failure" in pages) failure = pages.failure;
      else if ("failure" in links) failure = links.failure;
      else {
        for (let more = true; more;) more = (await ctx.runMutation(internal.siteCrawlDetail.clearCrawlDetail, { pullId: args.pullId })).more;
        for (let start = 0; start < pages.rows.length; start += ROWS_PER_WRITE) {
          await ctx.runMutation(internal.siteCrawlDetail.writeCrawlPages, {
            websiteId: crawl.websiteId, pullId: args.pullId, day: crawl.day, rows: pages.rows.slice(start, start + ROWS_PER_WRITE),
          });
        }
        for (let start = 0; start < links.rows.length; start += ROWS_PER_WRITE) {
          await ctx.runMutation(internal.siteCrawlDetail.writeCrawlLinks, {
            websiteId: crawl.websiteId, pullId: args.pullId, day: crawl.day, rows: links.rows.slice(start, start + ROWS_PER_WRITE),
          });
        }
        for (let more = true; more;) {
          more = (await ctx.runMutation(internal.siteCrawlDetail.clearOlderCrawlDetail, { websiteId: crawl.websiteId, pullId: args.pullId })).more;
        }
      }
    } catch (error) {
      failure = getErrorMessage(error);
    }
    if (failure === null) return null;

    const attempt = (args.attempt ?? 0) + 1;
    if (attempt < DETAIL_TRIES) {
      await ctx.scheduler.runAfter(DETAIL_RETRY_MS, internal.siteCrawlDetail.fetchCrawlDetail, { pullId: args.pullId, attempt });
      return null;
    }
    await ctx.runMutation(internal.seoCollectionParse.recordParseFailure, {
      pullId: args.pullId,
      error: `The crawl's page detail could not be fetched: ${failure}`,
    });
    return null;
  },
});

/** Tries at a crawl's detail before it is left saying why, each a quarter of an hour after the last. */
const DETAIL_TRIES = 3;
const DETAIL_RETRY_MS = 15 * 60 * 1000;

const pageRowValidator = v.object({
  url: v.string(),
  page: v.string(),
  statusCode: v.optional(v.number()),
  resourceType: v.optional(v.string()),
  problems: v.array(v.string()),
  score: v.optional(v.number()),
  loadMs: v.optional(v.number()),
  largestPaintMs: v.optional(v.number()),
  sizeBytes: v.optional(v.number()),
  words: v.optional(v.number()),
  internalLinks: v.optional(v.number()),
  externalLinks: v.optional(v.number()),
  inboundLinks: v.optional(v.number()),
  clickDepth: v.optional(v.number()),
  redirectTo: v.optional(v.string()),
  canonical: v.optional(v.string()),
});

const linkRowValidator = v.object({
  from: v.string(),
  fromPage: v.string(),
  to: v.string(),
  type: v.optional(v.string()),
  direction: v.optional(v.string()),
  statusCode: v.optional(v.number()),
  dofollow: v.optional(v.boolean()),
});

/** Clear a batch of what an earlier fetch of this crawl kept, so a second fetch replaces it; `more` while any is left. */
export const clearCrawlDetail = internalMutation({
  args: { pullId: v.id("seoDataPulls") },
  returns: v.object({ more: v.boolean() }),
  handler: async (ctx, args) => {
    const pages = await ctx.db.query("siteCrawlPages").withIndex("by_pull", (q) => q.eq("pullId", args.pullId)).take(OLD_ROWS_CLEARED);
    for (const row of pages) await ctx.db.delete(row._id);
    const links = await ctx.db.query("siteCrawlLinks").withIndex("by_pull", (q) => q.eq("pullId", args.pullId)).take(OLD_ROWS_CLEARED);
    for (const row of links) await ctx.db.delete(row._id);
    return { more: pages.length === OLD_ROWS_CLEARED || links.length === OLD_ROWS_CLEARED };
  },
});

export const writeCrawlPages = internalMutation({
  args: { websiteId: v.id("websites"), pullId: v.id("seoDataPulls"), day: v.string(), rows: v.array(pageRowValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const row of args.rows) await ctx.db.insert("siteCrawlPages", { websiteId: args.websiteId, pullId: args.pullId, day: args.day, ...row });
    return null;
  },
});

export const writeCrawlLinks = internalMutation({
  args: { websiteId: v.id("websites"), pullId: v.id("seoDataPulls"), day: v.string(), rows: v.array(linkRowValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const row of args.rows) await ctx.db.insert("siteCrawlLinks", { websiteId: args.websiteId, pullId: args.pullId, day: args.day, ...row });
    return null;
  },
});

/**
 * A batch of an older crawl's pages and links, cleared once the newest
 * crawl's are in; `more` while any may be left. Oldest first — the index
 * keeps a site's rows in the order they were written — so a batch that finds
 * only the newest crawl's rows has cleared everything older.
 */
export const clearOlderCrawlDetail = internalMutation({
  args: { websiteId: v.id("websites"), pullId: v.id("seoDataPulls") },
  returns: v.object({ more: v.boolean() }),
  handler: async (ctx, args) => {
    let more = false;
    const pages = await ctx.db.query("siteCrawlPages").withIndex("by_site", (q) => q.eq("websiteId", args.websiteId)).take(OLD_ROWS_CLEARED);
    const oldPages = pages.filter((row) => row.pullId !== args.pullId);
    for (const row of oldPages) await ctx.db.delete(row._id);
    if (oldPages.length > 0 && pages.length === OLD_ROWS_CLEARED) more = true;
    const links = await ctx.db.query("siteCrawlLinks").withIndex("by_site", (q) => q.eq("websiteId", args.websiteId)).take(OLD_ROWS_CLEARED);
    const oldLinks = links.filter((row) => row.pullId !== args.pullId);
    for (const row of oldLinks) await ctx.db.delete(row._id);
    if (oldLinks.length > 0 && links.length === OLD_ROWS_CLEARED) more = true;
    return { more };
  },
});

/** Pages read from the newest crawl: every page it reached. */
const PAGES_READ = 1_000;

/**
 * The pages of the newest crawl with one problem, and — for broken links —
 * the broken links on each: what "4 pages" on the Site audit is made of.
 */
export const crawlProblemPages = tenantQuery({
  args: { siteId: v.id("companyWebsites"), check: v.string() },
  returns: v.array(v.object({
    page: v.string(),
    url: v.string(),
    statusCode: v.union(v.number(), v.null()),
    brokenLinks: v.array(v.object({ to: v.string(), statusCode: v.union(v.number(), v.null()) })),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const newest = await ctx.db
      .query("siteCrawls")
      .withIndex("by_site_day", (q) => q.eq("websiteId", site.website._id))
      .order("desc")
      .first();
    if (!newest) return [];
    const pages = (await ctx.db.query("siteCrawlPages").withIndex("by_pull", (q) => q.eq("pullId", newest.pullId)).take(PAGES_READ))
      .filter((row) => row.problems.includes(args.check));
    const broken = args.check === "broken_links"
      ? await ctx.db.query("siteCrawlLinks").withIndex("by_pull", (q) => q.eq("pullId", newest.pullId)).take(PAGES_READ)
      : [];
    return pages
      .sort((left, right) => left.page.localeCompare(right.page))
      .map((row) => ({
        page: row.page,
        url: row.url,
        statusCode: row.statusCode ?? null,
        brokenLinks: broken
          .filter((link) => link.from === row.url)
          .map((link) => ({ to: link.to, statusCode: link.statusCode ?? null })),
      }));
  },
});
