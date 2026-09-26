import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";
import { bucketOf, stepValidator } from "./siteFigures";
import { linksCopyKey, readListCopy } from "./siteListCopies";
import { heldTo, listOrder, listPageArgs, listPageResult, newestPerKey, pageOfList, preparingPage, sortDirectionArg, type ListSorts } from "./siteListPages";
import { ipSortKey, type SortDirection } from "./utils/sortOrder";
import { wordStartMatcher } from "./utils/wordStarts";

/**
 * The link lists behind the Sites backlink pages (Phase 4): every link, the
 * broken ones, every linking website, the anchors, the servers and their
 * networks, and links gained and lost over time.
 *
 * **Counted exactly, any page at once** (docs/plans/active/
 * sites-table-pages-plan.md §5): a list bought in one request of a thousand
 * is read whole, through its index, and searched, filtered, sorted and cut
 * into a page here; every link, which runs to the site's backlink limit, is
 * counted from its compact copy. Every query enters through the caller's own
 * hold (`requireMySite`).
 */

/**
 * A link list bought in one request of at most 1,000 rows — broken links,
 * linking websites, anchors, servers — read whole, so its total is exact and
 * any page opens at once (docs/plans/active/sites-table-pages-plan.md §5.1).
 * The room above 1,000 is for last week's rows, which stay beside this week's
 * until they are cleared (`clearOlder` in `siteLinkFiling.ts`); `newestPerKey`
 * keeps one of each.
 */
const LINK_LIST_READ = 2_500;

/** The every-link copy's layout (`siteListCopyBuilders.ts` writes it): what All backlinks is searched, filtered and sorted by. */
export const LINK_COPY_FIELDS = ["id", "domainFrom", "urlFrom", "anchor", "pageTo", "dofollow", "status", "domainRank", "firstSeen"] as const;

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

/** What a link is searched, filtered and sorted by: a stored row, or its line in the every-link copy. */
type LinkFacts = {
  domainFrom: string;
  urlFrom: string;
  anchor?: string | null;
  pageTo: string;
  dofollow: boolean;
  status: "LIVE" | "NEW" | "LOST";
  domainRank: number;
  firstSeen?: string | null;
};

/**
 * All backlinks' columns that sort (docs/plans/active/
 * sites-table-sorting-plan.md): the linking website A to Z, as the column
 * shows it first, then its page; the strongest linking website first; the
 * newest first.
 */
const LINK_SORTS: ListSorts<LinkFacts, "from" | "domainRank" | "firstSeen"> = {
  from: { value: (link) => link.domainFrom, first: "asc" },
  domainRank: { value: (link) => link.domainRank, first: "desc" },
  firstSeen: { value: (link) => link.firstSeen, first: "desc" },
};

/** The links matching a search, a status and followed or not, in the order asked for: strongest first unless a heading says otherwise. */
function narrowLinks<Link extends LinkFacts>(
  links: readonly Link[],
  args: { search?: string; status?: LinkFacts["status"]; follow?: "FOLLOW" | "NOFOLLOW"; sort?: keyof typeof LINK_SORTS; direction?: SortDirection },
): Link[] {
  const matches = wordStartMatcher(args.search);
  const dofollow = args.follow === undefined ? undefined : args.follow === "FOLLOW";
  return links
    .filter((link) => (!args.status || link.status === args.status)
      && (dofollow === undefined || link.dofollow === dofollow)
      && (!matches || matches(link.domainFrom, link.urlFrom, link.anchor, link.pageTo)))
    .sort(listOrder(LINK_SORTS, args.sort ?? "domainRank", args.direction, (link) => link.urlFrom));
}

/**
 * The links to the site — the strongest from each linking website, or with
 * `every` every link its limit keeps (`backlinks_all`) — strongest first,
 * newest first, or matching a search (word starts, T8); filtered by live, new
 * or lost, and followed or not.
 *
 * One per linking website is a list of at most a thousand, read whole; every
 * link can run to the site's backlink limit, and is counted from its compact
 * copy (docs/plans/active/sites-table-pages-plan.md §5).
 */
export const listBacklinks = tenantQuery({
  args: {
    siteId: v.id("companyWebsites"),
    ...listPageArgs,
    every: v.optional(v.boolean()),
    search: v.optional(v.string()),
    status: v.optional(status),
    follow: v.optional(v.union(v.literal("FOLLOW"), v.literal("NOFOLLOW"))),
    sort: v.optional(v.union(v.literal("from"), v.literal("domainRank"), v.literal("firstSeen"))),
    direction: sortDirectionArg,
  },
  returns: listPageResult(backlinkRow),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const websiteId = site.website._id;
    if (!args.every) {
      const read = await ctx.db
        .query("siteBacklinks")
        .withIndex("by_site_pass_rank", (q) => q.eq("websiteId", websiteId).eq("pass", "ONE_PER_DOMAIN"))
        .order("desc")
        .take(LINK_LIST_READ + 1);
      const { rows: held, cut } = heldTo(read, LINK_LIST_READ);
      const list = narrowLinks(newestPerKey(held, (row) => `${row.urlFrom} ${row.urlTo} ${row.anchor ?? ""}`), args);
      const page = pageOfList(list, args.page, args.rows, cut);
      return { ...page, rows: page.rows.map(shapeBacklink) };
    }

    const copy = await readListCopy(ctx, "links", linksCopyKey(websiteId), LINK_COPY_FIELDS);
    if (!copy) return preparingPage(args.rows);
    const links = copy.rows.map(([id, domainFrom, urlFrom, anchor, pageTo, dofollow, linkStatus, domainRank, firstSeen]) => ({
      id: id as Id<"siteBacklinks">,
      domainFrom: domainFrom as string,
      urlFrom: urlFrom as string,
      anchor: anchor as string | null,
      pageTo: pageTo as string,
      dofollow: dofollow as boolean,
      status: linkStatus as LinkFacts["status"],
      domainRank: domainRank as number,
      firstSeen: firstSeen as string | null,
    }));
    const page = pageOfList(narrowLinks(links, args), args.page, args.rows, copy.cut);
    const full = await Promise.all(page.rows.map((link) => ctx.db.get(link.id)));
    return { ...page, rows: full.flatMap((row) => (row ? [shapeBacklink(row)] : [])) };
  },
});

/**
 * Broken backlinks' columns that sort: the linking website A to Z, then its
 * page; the answer the broken page gives (server errors before a 404); the
 * strongest linking website first.
 */
const BROKEN_SORTS: ListSorts<Doc<"siteBacklinks">, "from" | "code" | "domainRank"> = {
  from: { value: (row) => row.domainFrom, first: "asc" },
  code: { value: (row) => row.statusCode, first: "desc" },
  domainRank: { value: (row) => row.domainRank, first: "desc" },
};

/** Links pointing at pages here that no longer work, strongest linking website first unless a heading says otherwise. */
export const listBrokenBacklinks = tenantQuery({
  args: {
    siteId: v.id("companyWebsites"),
    ...listPageArgs,
    search: v.optional(v.string()),
    sort: v.optional(v.union(v.literal("from"), v.literal("code"), v.literal("domainRank"))),
    direction: sortDirectionArg,
  },
  returns: listPageResult(backlinkRow),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const read = await ctx.db
      .query("siteBacklinks")
      .withIndex("by_site_pass_rank", (q) => q.eq("websiteId", site.website._id).eq("pass", "BROKEN"))
      .order("desc")
      .take(LINK_LIST_READ + 1);
    const { rows: held, cut } = heldTo(read, LINK_LIST_READ);
    const matches = wordStartMatcher(args.search);
    const list = newestPerKey(held, (row) => `${row.urlFrom} ${row.urlTo} ${row.anchor ?? ""}`)
      .filter((row) => !matches || matches(row.domainFrom, row.urlFrom, row.anchor, row.pageTo))
      .sort(listOrder(BROKEN_SORTS, args.sort ?? "domainRank", args.direction, (row) => row.urlFrom));
    const page = pageOfList(list, args.page, args.rows, cut);
    return { ...page, rows: page.rows.map(shapeBacklink) };
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

/**
 * Referring domains' columns that sort: the website A to Z; the strongest,
 * most links, most suspicious and newest first.
 */
const DOMAIN_SORTS: ListSorts<Doc<"siteReferringDomains">, "domain" | "rank" | "backlinks" | "spam" | "firstSeen"> = {
  domain: { value: (row) => row.domain, first: "asc" },
  rank: { value: (row) => row.rank, first: "desc" },
  backlinks: { value: (row) => row.backlinks, first: "desc" },
  spam: { value: (row) => row.spamScore, first: "desc" },
  firstSeen: { value: (row) => row.firstSeen, first: "desc" },
};

/** Every website linking here, live or lost: strongest first unless a heading says otherwise. */
export const listReferringDomains = tenantQuery({
  args: {
    siteId: v.id("companyWebsites"),
    ...listPageArgs,
    search: v.optional(v.string()),
    status: v.optional(status),
    sort: v.optional(v.union(v.literal("domain"), v.literal("rank"), v.literal("backlinks"), v.literal("spam"), v.literal("firstSeen"))),
    direction: sortDirectionArg,
  },
  returns: listPageResult(v.object({
    _id: v.id("siteReferringDomains"),
    domain: v.string(),
    ...groupShape,
    brokenBacklinks: nullableNumber,
    referringPages: nullableNumber,
    nofollowPages: nullableNumber,
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const read = await ctx.db
      .query("siteReferringDomains")
      .withIndex("by_site_rank", (q) => q.eq("websiteId", site.website._id))
      .order("desc")
      .take(LINK_LIST_READ + 1);
    const { rows: held, cut } = heldTo(read, LINK_LIST_READ);
    const matches = wordStartMatcher(args.search);
    const name = (row: Doc<"siteReferringDomains">) => row.domain;
    const list = newestPerKey(held, name)
      .filter((row) => (!args.status || row.status === args.status) && (!matches || matches(row.domain)))
      .sort(listOrder(DOMAIN_SORTS, args.sort ?? "rank", args.direction, name));
    const page = pageOfList(list, args.page, args.rows, cut);
    return {
      ...page,
      rows: page.rows.map((row) => ({
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

/** Anchors' columns that sort: the words A to Z; most links, most linking websites and newest first. */
const ANCHOR_SORTS: ListSorts<Doc<"siteAnchors">, "anchor" | "backlinks" | "domains" | "firstSeen"> = {
  anchor: { value: (row) => row.anchor, first: "asc" },
  backlinks: { value: (row) => row.backlinks, first: "desc" },
  domains: { value: (row) => row.referringDomains, first: "desc" },
  firstSeen: { value: (row) => row.firstSeen, first: "desc" },
};

/** The words other websites link here with: most links first unless a heading says otherwise. */
export const listAnchors = tenantQuery({
  args: {
    siteId: v.id("companyWebsites"),
    ...listPageArgs,
    search: v.optional(v.string()),
    sort: v.optional(v.union(v.literal("anchor"), v.literal("backlinks"), v.literal("domains"), v.literal("firstSeen"))),
    direction: sortDirectionArg,
  },
  returns: listPageResult(v.object({
    _id: v.id("siteAnchors"),
    anchor: v.string(),
    ...groupShape,
    referringDomains: v.number(),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const read = await ctx.db
      .query("siteAnchors")
      .withIndex("by_site_backlinks", (q) => q.eq("websiteId", site.website._id))
      .order("desc")
      .take(LINK_LIST_READ + 1);
    const { rows: held, cut } = heldTo(read, LINK_LIST_READ);
    const matches = wordStartMatcher(args.search);
    const name = (row: Doc<"siteAnchors">) => row.anchor;
    const list = newestPerKey(held, name)
      .filter((row) => !matches || matches(row.anchor))
      .sort(listOrder(ANCHOR_SORTS, args.sort ?? "backlinks", args.direction, name));
    const page = pageOfList(list, args.page, args.rows, cut);
    return {
      ...page,
      rows: page.rows.map((row) => ({ _id: row._id, anchor: row.anchor, ...shapeGroup(row), referringDomains: row.referringDomains })),
    };
  },
});

/** Referring IPs' columns that sort: the address in number order; most linking websites and most links first. */
const IP_SORTS: ListSorts<Doc<"siteReferringIps">, "ip" | "domains" | "backlinks"> = {
  ip: { value: (row) => ipSortKey(row.ip), first: "asc" },
  domains: { value: (row) => row.referringDomains, first: "desc" },
  backlinks: { value: (row) => row.backlinks, first: "desc" },
};

/** The servers links come from, or those on one network: most links first unless a heading says otherwise. */
export const listReferringIps = tenantQuery({
  args: {
    siteId: v.id("companyWebsites"),
    ...listPageArgs,
    search: v.optional(v.string()),
    subnet: v.optional(v.string()),
    sort: v.optional(v.union(v.literal("ip"), v.literal("domains"), v.literal("backlinks"))),
    direction: sortDirectionArg,
  },
  returns: listPageResult(v.object({
    _id: v.id("siteReferringIps"),
    ip: v.string(),
    subnet: v.string(),
    ...groupShape,
    referringDomains: v.number(),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const read = await ctx.db
      .query("siteReferringIps")
      .withIndex("by_site_backlinks", (q) => q.eq("websiteId", site.website._id))
      .order("desc")
      .take(LINK_LIST_READ + 1);
    const { rows: held, cut } = heldTo(read, LINK_LIST_READ);
    const matches = wordStartMatcher(args.search);
    const name = (row: Doc<"siteReferringIps">) => row.ip;
    // The network chosen holds while searching, and the order holds within it.
    const list = newestPerKey(held, name)
      .filter((row) => (!args.subnet || row.subnet === args.subnet) && (!matches || matches(row.ip, row.subnet)))
      .sort(listOrder(IP_SORTS, args.sort ?? "backlinks", args.direction, name));
    const page = pageOfList(list, args.page, args.rows, cut);
    return {
      ...page,
      rows: page.rows.map((row) => ({
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
