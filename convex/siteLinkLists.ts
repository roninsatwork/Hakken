import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite, sitePage } from "./siteAccess";
import { bucketOf, stepValidator } from "./siteFigures";

/**
 * The link lists behind the Sites backlink pages (Phase 4): every link, the
 * broken ones, every linking website, the anchors, the servers and their
 * networks, and links gained and lost over time.
 *
 * **Server-side, from indexes** (D15): each list is a website's newest
 * thousand rows and is still paged, searched and filtered here, a page at a
 * time — a second filter with no index of its own narrows the read, capped
 * by `maximumRowsRead`, exactly as the keyword table does. Every query enters
 * through the caller's own hold (`requireMySite`).
 */

/** How far a narrowed read may look for one page of matches. */
const MAX_ROWS_READ = 1_000;

/** Networks shown at once: a chart's worth. */
const SUBNETS_SHOWN = 15;

/** Days of link changes read for one chart: two years and change. */
const CHANGE_DAYS = 800;

const status = v.union(v.literal("LIVE"), v.literal("NEW"), v.literal("LOST"));
const nullableNumber = v.union(v.number(), v.null());
const nullableString = v.union(v.string(), v.null());

const backlinkRow = v.object({
  _id: v.id("siteBacklinks"),
  domainFrom: v.string(),
  urlFrom: v.string(),
  urlTo: v.string(),
  pageTo: v.string(),
  anchor: nullableString,
  dofollow: v.boolean(),
  status,
  isBroken: v.boolean(),
  itemType: nullableString,
  domainRank: v.number(),
  pageRank: nullableNumber,
  firstSeen: nullableString,
  lastSeen: nullableString,
  statusCode: nullableNumber,
  day: v.string(),
});

function shapeBacklink(row: Doc<"siteBacklinks">) {
  return {
    _id: row._id,
    domainFrom: row.domainFrom,
    urlFrom: row.urlFrom,
    urlTo: row.urlTo,
    pageTo: row.pageTo,
    anchor: row.anchor ?? null,
    dofollow: row.dofollow,
    status: row.status,
    isBroken: row.isBroken,
    itemType: row.itemType ?? null,
    domainRank: row.domainRank,
    pageRank: row.pageRank ?? null,
    firstSeen: row.firstSeen ?? null,
    lastSeen: row.lastSeen ?? null,
    statusCode: row.statusCode ?? null,
    day: row.day,
  };
}

/**
 * Every link to the site — one per linking website — strongest first, newest
 * first, or matching a search; filtered by live, new or lost, and followed or
 * not.
 */
export const listBacklinks = tenantQuery({
  args: {
    siteId: v.id("companyWebsites"),
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    status: v.optional(status),
    follow: v.optional(v.union(v.literal("FOLLOW"), v.literal("NOFOLLOW"))),
    sort: v.optional(v.union(v.literal("rank"), v.literal("newest"))),
  },
  returns: paginationResultValidator(backlinkRow),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const websiteId = site.website._id;
    const pass = "ONE_PER_DOMAIN" as const;
    const dofollow = args.follow === undefined ? undefined : args.follow === "FOLLOW";
    const term = args.search?.trim();
    const narrowed = { ...sitePage(args.paginationOpts), maximumRowsRead: MAX_ROWS_READ };
    const shape = <Result extends { page: Doc<"siteBacklinks">[] }>(result: Result) => ({ ...result, page: result.page.map(shapeBacklink) });

    if (term) {
      return shape(await ctx.db
        .query("siteBacklinks")
        .withSearchIndex("search_text", (q) => {
          let search = q.search("searchText", term).eq("websiteId", websiteId).eq("pass", pass);
          if (args.status) search = search.eq("status", args.status);
          if (dofollow !== undefined) search = search.eq("dofollow", dofollow);
          return search;
        })
        .paginate(sitePage(args.paginationOpts)));
    }
    if (args.sort === "newest") {
      return shape(await ctx.db
        .query("siteBacklinks")
        .withIndex("by_site_pass_first_seen", (q) => q.eq("websiteId", websiteId).eq("pass", pass))
        .order("desc")
        .filter((q) => q.and(
          args.status ? q.eq(q.field("status"), args.status) : true,
          dofollow !== undefined ? q.eq(q.field("dofollow"), dofollow) : true,
        ))
        .paginate(narrowed));
    }
    if (args.status) {
      const wanted = args.status;
      return shape(await ctx.db
        .query("siteBacklinks")
        .withIndex("by_site_pass_status_rank", (q) => q.eq("websiteId", websiteId).eq("pass", pass).eq("status", wanted))
        .order("desc")
        .filter((q) => (dofollow !== undefined ? q.eq(q.field("dofollow"), dofollow) : true))
        .paginate(narrowed));
    }
    if (dofollow !== undefined) {
      return shape(await ctx.db
        .query("siteBacklinks")
        .withIndex("by_site_pass_follow_rank", (q) => q.eq("websiteId", websiteId).eq("pass", pass).eq("dofollow", dofollow))
        .order("desc")
        .paginate(sitePage(args.paginationOpts)));
    }
    return shape(await ctx.db
      .query("siteBacklinks")
      .withIndex("by_site_pass_rank", (q) => q.eq("websiteId", websiteId).eq("pass", pass))
      .order("desc")
      .paginate(sitePage(args.paginationOpts)));
  },
});

/** Links pointing at pages here that no longer work, strongest linking website first. */
export const listBrokenBacklinks = tenantQuery({
  args: { siteId: v.id("companyWebsites"), paginationOpts: paginationOptsValidator, search: v.optional(v.string()) },
  returns: paginationResultValidator(backlinkRow),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const websiteId = site.website._id;
    const term = args.search?.trim();
    const result = term
      ? await ctx.db
        .query("siteBacklinks")
        .withSearchIndex("search_text", (q) => q.search("searchText", term).eq("websiteId", websiteId).eq("pass", "BROKEN"))
        .paginate(sitePage(args.paginationOpts))
      : await ctx.db
        .query("siteBacklinks")
        .withIndex("by_site_pass_rank", (q) => q.eq("websiteId", websiteId).eq("pass", "BROKEN"))
        .order("desc")
        .paginate(sitePage(args.paginationOpts));
    return { ...result, page: result.page.map(shapeBacklink) };
  },
});

const groupShape = {
  rank: v.number(),
  backlinks: v.number(),
  firstSeen: nullableString,
  lostDate: nullableString,
  status,
  spamScore: nullableNumber,
  day: v.string(),
};

function shapeGroup(row: { rank: number; backlinks: number; firstSeen?: string; lostDate?: string; status: "LIVE" | "NEW" | "LOST"; spamScore?: number; day: string }) {
  return {
    rank: row.rank,
    backlinks: row.backlinks,
    firstSeen: row.firstSeen ?? null,
    lostDate: row.lostDate ?? null,
    status: row.status,
    spamScore: row.spamScore ?? null,
    day: row.day,
  };
}

/** Every website linking here: strongest, most links or newest first, live or lost. */
export const listReferringDomains = tenantQuery({
  args: {
    siteId: v.id("companyWebsites"),
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    status: v.optional(status),
    sort: v.optional(v.union(v.literal("rank"), v.literal("backlinks"), v.literal("newest"))),
  },
  returns: paginationResultValidator(v.object({
    _id: v.id("siteReferringDomains"),
    domain: v.string(),
    ...groupShape,
    brokenBacklinks: nullableNumber,
    referringPages: nullableNumber,
    nofollowPages: nullableNumber,
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const websiteId = site.website._id;
    const term = args.search?.trim();
    const narrowed = { ...sitePage(args.paginationOpts), maximumRowsRead: MAX_ROWS_READ };
    const wanted = args.status;
    const onlyWanted = (row: Doc<"siteReferringDomains">) => !wanted || row.status === wanted;
    const result = term
      ? await ctx.db
        .query("siteReferringDomains")
        .withSearchIndex("search_domain", (q) => {
          const search = q.search("domain", term).eq("websiteId", websiteId);
          return wanted ? search.eq("status", wanted) : search;
        })
        .paginate(sitePage(args.paginationOpts))
      : args.sort === "backlinks" || args.sort === "newest"
        ? await ctx.db
          .query("siteReferringDomains")
          .withIndex(args.sort === "backlinks" ? "by_site_backlinks" : "by_site_first_seen", (q) => q.eq("websiteId", websiteId))
          .order("desc")
          .filter((q) => (wanted ? q.eq(q.field("status"), wanted) : true))
          .paginate(narrowed)
        : wanted
          ? await ctx.db
            .query("siteReferringDomains")
            .withIndex("by_site_status_rank", (q) => q.eq("websiteId", websiteId).eq("status", wanted))
            .order("desc")
            .paginate(sitePage(args.paginationOpts))
          : await ctx.db
            .query("siteReferringDomains")
            .withIndex("by_site_rank", (q) => q.eq("websiteId", websiteId))
            .order("desc")
            .paginate(sitePage(args.paginationOpts));
    return {
      ...result,
      page: result.page.filter(onlyWanted).map((row) => ({
        _id: row._id,
        domain: row.domain,
        ...shapeGroup(row),
        brokenBacklinks: row.brokenBacklinks ?? null,
        referringPages: row.referringPages ?? null,
        nofollowPages: row.nofollowPages ?? null,
      })),
    };
  },
});

/** The words other websites link here with: most links, or most linking websites, first. */
export const listAnchors = tenantQuery({
  args: {
    siteId: v.id("companyWebsites"),
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    sort: v.optional(v.union(v.literal("backlinks"), v.literal("domains"))),
  },
  returns: paginationResultValidator(v.object({
    _id: v.id("siteAnchors"),
    anchor: v.string(),
    ...groupShape,
    referringDomains: v.number(),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const websiteId = site.website._id;
    const term = args.search?.trim();
    const result = term
      ? await ctx.db
        .query("siteAnchors")
        .withSearchIndex("search_anchor", (q) => q.search("anchor", term).eq("websiteId", websiteId))
        .paginate(sitePage(args.paginationOpts))
      : await ctx.db
        .query("siteAnchors")
        .withIndex(args.sort === "domains" ? "by_site_domains" : "by_site_backlinks", (q) => q.eq("websiteId", websiteId))
        .order("desc")
        .paginate(sitePage(args.paginationOpts));
    return {
      ...result,
      page: result.page.map((row) => ({ _id: row._id, anchor: row.anchor, ...shapeGroup(row), referringDomains: row.referringDomains })),
    };
  },
});

/** The servers links come from: most links or most linking websites first, or those on one network. */
export const listReferringIps = tenantQuery({
  args: {
    siteId: v.id("companyWebsites"),
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    subnet: v.optional(v.string()),
    sort: v.optional(v.union(v.literal("backlinks"), v.literal("domains"))),
  },
  returns: paginationResultValidator(v.object({
    _id: v.id("siteReferringIps"),
    ip: v.string(),
    subnet: v.string(),
    ...groupShape,
    referringDomains: v.number(),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const websiteId = site.website._id;
    const term = args.search?.trim();
    const subnet = args.subnet;
    // The network chosen holds while searching, and the sort holds within a
    // network: each has an index or a search filter of its own.
    const result = term
      ? await ctx.db
        .query("siteReferringIps")
        .withSearchIndex("search_text", (q) => {
          const search = q.search("searchText", term).eq("websiteId", websiteId);
          return subnet ? search.eq("subnet", subnet) : search;
        })
        .paginate(sitePage(args.paginationOpts))
      : subnet
        ? await ctx.db
          .query("siteReferringIps")
          .withIndex(args.sort === "domains" ? "by_site_subnet_domains" : "by_site_subnet_backlinks", (q) =>
            q.eq("websiteId", websiteId).eq("subnet", subnet))
          .order("desc")
          .paginate(sitePage(args.paginationOpts))
        : await ctx.db
          .query("siteReferringIps")
          .withIndex(args.sort === "domains" ? "by_site_domains" : "by_site_backlinks", (q) => q.eq("websiteId", websiteId))
          .order("desc")
          .paginate(sitePage(args.paginationOpts));
    return {
      ...result,
      page: result.page.map((row) => ({
        _id: row._id, ip: row.ip, subnet: row.subnet, ...shapeGroup(row), referringDomains: row.referringDomains,
      })),
    };
  },
});

/** The networks with the most linking websites: the Referring IPs chart. */
export const topSubnets = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.array(v.object({ subnet: v.string(), ips: v.number(), backlinks: v.number(), referringDomains: v.number() })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const rows = await ctx.db
      .query("siteReferringSubnets")
      .withIndex("by_site_domains", (q) => q.eq("websiteId", site.website._id))
      .order("desc")
      .take(SUBNETS_SHOWN);
    return rows.map((row) => ({ subnet: row.subnet, ips: row.ips, backlinks: row.backlinks, referringDomains: row.referringDomains }));
  },
});

/** Links and linking websites gained and lost, added up per day, week or month. */
export const linkChanges = tenantQuery({
  args: { siteId: v.id("companyWebsites"), from: v.string(), to: v.string(), step: stepValidator },
  returns: v.array(v.object({
    day: v.string(),
    newBacklinks: v.number(),
    lostBacklinks: v.number(),
    newReferringDomains: v.number(),
    lostReferringDomains: v.number(),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const rows = await ctx.db
      .query("siteLinkDays")
      .withIndex("by_site_day", (q) => q.eq("websiteId", site.website._id).gte("day", args.from).lte("day", args.to))
      .take(CHANGE_DAYS);
    const points = new Map<string, { day: string; newBacklinks: number; lostBacklinks: number; newReferringDomains: number; lostReferringDomains: number }>();
    for (const row of rows) {
      const key = bucketOf(row.day, args.step);
      const held = points.get(key) ?? { day: key, newBacklinks: 0, lostBacklinks: 0, newReferringDomains: 0, lostReferringDomains: 0 };
      held.newBacklinks += row.newBacklinks;
      held.lostBacklinks += row.lostBacklinks;
      held.newReferringDomains += row.newReferringDomains;
      held.lostReferringDomains += row.lostReferringDomains;
      points.set(key, held);
    }
    return [...points.values()].sort((left, right) => left.day.localeCompare(right.day));
  },
});
