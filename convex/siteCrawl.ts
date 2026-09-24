import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type ActionCtx } from "./_generated/server";
import { requireMySite } from "./siteAccess";
import { placesWatching } from "./siteRankings";
import { tenantQuery } from "./tenantFunctions";
import { getErrorMessage } from "./utils/lang";

/**
 * The site crawl, filed and read (docs/plans/active/user-sites-plan.md, Phase
 * 5): each finished crawl's summary is kept a row per crawl, its page count
 * and score go into the day summaries the charts read, and the Site audit page
 * reads the newest.
 *
 * Only named problems are kept, as counts of pages. DataForSEO's checks mix
 * problems ("no title") with good news ("is https") and neutral facts; the
 * list below is the problems, each with how much it matters.
 */

export type IssueSeverity = "ERROR" | "WARNING" | "NOTICE";

/** The checks that name a problem, and how much each matters. */
export const CRAWL_ISSUES: Record<string, IssueSeverity> = {
  is_broken: "ERROR",
  is_4xx_code: "ERROR",
  is_5xx_code: "ERROR",
  no_title: "ERROR",
  canonical_to_broken: "ERROR",
  https_to_http_links: "ERROR",
  is_http: "ERROR",
  broken_links: "ERROR",
  broken_resources: "WARNING",
  redirect_loop: "ERROR",
  duplicate_title: "WARNING",
  duplicate_description: "WARNING",
  duplicate_content: "WARNING",
  duplicate_title_tag: "WARNING",
  duplicate_meta_tags: "WARNING",
  no_description: "WARNING",
  no_h1_tag: "WARNING",
  title_too_long: "WARNING",
  title_too_short: "WARNING",
  large_page_size: "WARNING",
  size_greater_than_3mb: "WARNING",
  high_loading_time: "WARNING",
  high_waiting_time: "WARNING",
  redirect_chain: "WARNING",
  canonical_chain: "WARNING",
  canonical_to_redirect: "WARNING",
  recursive_canonical: "WARNING",
  has_links_to_redirects: "WARNING",
  has_meta_refresh_redirect: "WARNING",
  is_link_relation_conflict: "WARNING",
  links_relation_conflict: "WARNING",
  has_render_blocking_resources: "WARNING",
  is_orphan_page: "WARNING",
  low_content_rate: "WARNING",
  no_image_alt: "WARNING",
  non_indexable: "WARNING",
  no_doctype: "WARNING",
  no_encoding_meta_tag: "NOTICE",
  no_content_encoding: "NOTICE",
  deprecated_html_tags: "NOTICE",
  frame: "NOTICE",
  flash: "NOTICE",
  lorem_ipsum: "WARNING",
  has_misspelling: "NOTICE",
  no_favicon: "NOTICE",
  no_image_title: "NOTICE",
  low_character_count: "NOTICE",
  low_readability_rate: "NOTICE",
  irrelevant_title: "NOTICE",
  irrelevant_description: "NOTICE",
  irrelevant_meta_keywords: "NOTICE",
  is_redirect: "NOTICE",
};

type Unknown = Record<string, unknown>;
const record = (value: unknown): Unknown | null =>
  (typeof value === "object" && value !== null && !Array.isArray(value) ? value as Unknown : null);
const number = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
const text = (value: unknown): string | undefined => (typeof value === "string" && value.length > 0 ? value : undefined);

export type CrawlSummary = {
  pagesCrawled: number;
  maxPages?: number;
  onPageScore?: number;
  linksInternal?: number;
  linksExternal?: number;
  cms?: string;
  server?: string;
  crawlEnd?: string;
  issues: Array<{ check: string; pages: number }>;
};

/** A finished crawl's summary, as the audit keeps it. Null for anything else. */
export function parseCrawlSummary(result: unknown): CrawlSummary | null {
  const first = record(Array.isArray(result) ? result[0] : null);
  if (!first || first.crawl_progress !== "finished") return null;
  const status = record(first.crawl_status);
  const domain = record(first.domain_info);
  const metrics = record(first.page_metrics);
  const checks = record(metrics?.checks);
  const issues: Array<{ check: string; pages: number }> = [];
  for (const check of Object.keys(CRAWL_ISSUES)) {
    const pages = number(checks?.[check]) ?? number(metrics?.[check]);
    if (pages !== undefined && pages > 0) issues.push({ check, pages });
  }
  const optional = <T>(key: string, value: T | undefined) => (value === undefined ? {} : { [key]: value });
  return {
    pagesCrawled: number(status?.pages_crawled) ?? 0,
    ...optional("maxPages", number(status?.max_crawl_pages)),
    ...optional("onPageScore", number(metrics?.onpage_score)),
    ...optional("linksInternal", number(metrics?.links_internal)),
    ...optional("linksExternal", number(metrics?.links_external)),
    ...optional("cms", text(domain?.cms)?.slice(0, 80)),
    ...optional("server", text(domain?.server)?.slice(0, 80)),
    ...optional("crawlEnd", text(domain?.crawl_end)?.slice(0, 10)),
    issues: issues.sort((left, right) => right.pages - left.pages),
  } as CrawlSummary;
}

/** File one pull of the site crawl. */
export async function fileSiteCrawlPull(
  ctx: ActionCtx,
  pullId: Id<"seoDataPulls">,
  pull: { websiteId: Id<"websites"> | null; resultJson: string | null; completedAt: number | null },
): Promise<null> {
  if (!pull.resultJson || !pull.websiteId) return null;
  try {
    const summary = parseCrawlSummary(JSON.parse(pull.resultJson) as unknown);
    if (summary) {
      await ctx.runMutation(internal.siteCrawl.writeCrawl, {
        websiteId: pull.websiteId,
        pullId,
        day: new Date(pull.completedAt ?? Date.now()).toISOString().slice(0, 10),
        summary,
      });
    }
  } catch (error) {
    await ctx.runMutation(internal.seoCollectionParse.recordParseFailure, { pullId, error: getErrorMessage(error) });
  }
  return null;
}

const summaryValidator = v.object({
  pagesCrawled: v.number(),
  maxPages: v.optional(v.number()),
  onPageScore: v.optional(v.number()),
  linksInternal: v.optional(v.number()),
  linksExternal: v.optional(v.number()),
  cms: v.optional(v.string()),
  server: v.optional(v.string()),
  crawlEnd: v.optional(v.string()),
  issues: v.array(v.object({ check: v.string(), pages: v.number() })),
});

/** Keep the crawl, replacing a re-parse of the same pull, and put its figures in the day summaries. */
export const writeCrawl = internalMutation({
  args: { websiteId: v.id("websites"), pullId: v.id("seoDataPulls"), day: v.string(), summary: summaryValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const earlier = await ctx.db.query("siteCrawls").withIndex("by_pull", (q) => q.eq("pullId", args.pullId)).take(5);
    for (const row of earlier) await ctx.db.delete(row._id);
    await ctx.db.insert("siteCrawls", { websiteId: args.websiteId, pullId: args.pullId, day: args.day, ...args.summary, createdAt: Date.now() });
    await ctx.db.patch(args.pullId, { error: undefined });

    // A crawl is the website's alone, so every place it is watched from shows it.
    for (const place of await placesWatching(ctx, args.websiteId)) {
      const row = await ctx.db
        .query("siteDaySummaries")
        .withIndex("by_site_day", (q) => q.eq("websiteId", args.websiteId).eq("locationCode", place).eq("day", args.day))
        .unique();
      const figures = {
        crawledPages: args.summary.pagesCrawled,
        ...(args.summary.onPageScore !== undefined ? { onPageScore: Math.round(args.summary.onPageScore) } : {}),
        updatedAt: Date.now(),
      };
      if (row) await ctx.db.patch(row._id, figures);
      else await ctx.db.insert("siteDaySummaries", { websiteId: args.websiteId, locationCode: place, day: args.day, ...figures });
    }
    return null;
  },
});

/** The newest finished crawl of the site: the Site audit page. Null until the first. */
export const siteAudit = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.object({
    day: v.string(),
    pagesCrawled: v.number(),
    maxPages: v.union(v.number(), v.null()),
    onPageScore: v.union(v.number(), v.null()),
    linksInternal: v.union(v.number(), v.null()),
    linksExternal: v.union(v.number(), v.null()),
    cms: v.union(v.string(), v.null()),
    server: v.union(v.string(), v.null()),
    issues: v.array(v.object({
      check: v.string(),
      pages: v.number(),
      severity: v.union(v.literal("ERROR"), v.literal("WARNING"), v.literal("NOTICE")),
    })),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const newest = await ctx.db
      .query("siteCrawls")
      .withIndex("by_site_day", (q) => q.eq("websiteId", site.website._id))
      .order("desc")
      .first();
    if (!newest) return null;
    return {
      day: newest.day,
      pagesCrawled: newest.pagesCrawled,
      maxPages: newest.maxPages ?? null,
      onPageScore: newest.onPageScore ?? null,
      linksInternal: newest.linksInternal ?? null,
      linksExternal: newest.linksExternal ?? null,
      cms: newest.cms ?? null,
      server: newest.server ?? null,
      issues: newest.issues.flatMap((issue) => {
        const severity = CRAWL_ISSUES[issue.check];
        return severity ? [{ ...issue, severity }] : [];
      }),
    };
  },
});
