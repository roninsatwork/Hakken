import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";

/**
 * The backlinks records' own screens on the client's Sites pages: one linking
 * website, or one anchor, with every link of it kept and everything stored
 * about each (docs/plans/active/sites-ux-updates-plan.md §4, "one link in
 * full"). Anthony, 2026-09-24: "These are all new screens with a back button."
 *
 * Point reads by the record's key, capped. A link is read from the list of
 * every link kept (`ALL`); a site collected before that list existed has only
 * its one-per-website list, which is read instead.
 */

type Reader = { db: QueryCtx["db"] };

/** Links listed on one record's screen. A linking website rarely has more worth reading. */
const LINKS_SHOWN = 50;

/** A domain or anchor no longer than any real one. */
const MAX_KEY = 500;

/**
 * Links looked through for a website's subdomains. The list of linking
 * websites names a website by its main domain (`bing.com`) and a link by the
 * host it is on (`4.bing.com`), so a website's links are its own host's and
 * every subdomain's: found through the search box's index, then kept only
 * when the host really is the website or under it.
 */
const SUBDOMAIN_LINKS_READ = 256;

/** The website a host sits under, nearest first: `4.bing.com` → `bing.com`. Never a bare ending like `com`. */
function parentDomains(host: string): string[] {
  const labels = host.split(".");
  const parents: string[] = [];
  for (let at = 1; at < labels.length - 1; at += 1) parents.push(labels.slice(at).join("."));
  return parents;
}

/** Whether a link's host is the website or one of its subdomains. */
function isOnWebsite(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

const nullableNumber = v.union(v.number(), v.null());
const nullableString = v.union(v.string(), v.null());
const statusValidator = v.union(v.literal("LIVE"), v.literal("NEW"), v.literal("LOST"));

/** One link, in full. */
const linkValidator = v.object({
  _id: v.id("siteBacklinks"),
  domainFrom: v.string(),
  urlFrom: v.string(),
  urlTo: v.string(),
  pageTo: v.string(),
  anchor: nullableString,
  dofollow: v.boolean(),
  status: statusValidator,
  isBroken: v.boolean(),
  statusCode: nullableNumber,
  itemType: nullableString,
  domainRank: v.number(),
  pageRank: nullableNumber,
  attributes: v.array(v.string()),
  location: nullableString,
  platformTypes: v.array(v.string()),
  spamScore: nullableNumber,
  linkRank: nullableNumber,
  linksOnPage: nullableNumber,
  indirect: v.boolean(),
  language: nullableString,
  country: nullableString,
  firstSeen: nullableString,
  lastSeen: nullableString,
  previousSeen: nullableString,
});

function linkOf(row: Doc<"siteBacklinks">) {
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
    statusCode: row.statusCode ?? null,
    itemType: row.itemType ?? null,
    domainRank: row.domainRank,
    pageRank: row.pageRank ?? null,
    attributes: row.attributes ?? [],
    location: row.location ?? null,
    platformTypes: row.platformTypes ?? [],
    spamScore: row.spamScore ?? null,
    linkRank: row.linkRank ?? null,
    linksOnPage: row.linksOnPage ?? null,
    indirect: row.indirect ?? false,
    language: row.language ?? null,
    country: row.country ?? null,
    firstSeen: row.firstSeen ?? null,
    lastSeen: row.lastSeen ?? null,
    previousSeen: row.previousSeen ?? null,
  };
}

/** A record's links, from the list of every link kept, or the one-per-website list for a site collected before it. */
async function linksBy(
  ctx: Reader,
  read: (pass: "ALL" | "ONE_PER_DOMAIN") => Promise<Array<Doc<"siteBacklinks">>>,
): Promise<Array<Doc<"siteBacklinks">>> {
  const every = await read("ALL");
  return every.length > 0 ? every : await read("ONE_PER_DOMAIN");
}

/**
 * One website linking to this site: how strong it is, how many links and
 * pages it has pointing here, and each of its links in full.
 */
export const linkingWebsiteRecord = tenantQuery({
  args: { siteId: v.id("companyWebsites"), domain: v.string() },
  returns: v.object({
    domain: v.string(),
    website: v.union(v.object({
      rank: v.number(),
      backlinks: v.number(),
      referringPages: nullableNumber,
      nofollowPages: nullableNumber,
      brokenBacklinks: nullableNumber,
      spamScore: nullableNumber,
      firstSeen: nullableString,
      lostDate: nullableString,
      status: statusValidator,
      day: v.string(),
    }), v.null()),
    links: v.array(linkValidator),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const websiteId: Id<"websites"> = site.website._id;
    const domain = args.domain.trim().toLowerCase().slice(0, MAX_KEY);
    // The website as the list of linking websites names it: this host, or the
    // nearest website it sits under.
    const findWebsite = async () => {
      for (const candidate of [domain, ...parentDomains(domain)]) {
        const found = await ctx.db
          .query("siteReferringDomains")
          .withIndex("by_site_domain", (q) => q.eq("websiteId", websiteId).eq("domain", candidate))
          .order("desc")
          .first();
        if (found) return found;
      }
      return null;
    };
    const [row, links] = await Promise.all([
      findWebsite(),
      linksBy(ctx, async (pass) => {
        const [own, underIt] = await Promise.all([
          ctx.db
            .query("siteBacklinks")
            .withIndex("by_site_pass_domain", (q) => q.eq("websiteId", websiteId).eq("pass", pass).eq("domainFrom", domain))
            .take(LINKS_SHOWN),
          ctx.db
            .query("siteBacklinks")
            .withSearchIndex("search_text", (q) => q.search("searchText", domain).eq("websiteId", websiteId).eq("pass", pass))
            .take(SUBDOMAIN_LINKS_READ),
        ]);
        const seen = new Set(own.map((link) => link._id));
        const subdomains = underIt.filter((link) => !seen.has(link._id) && link.domainFrom !== domain && isOnWebsite(link.domainFrom, domain));
        return [...own, ...subdomains].slice(0, LINKS_SHOWN);
      }),
    ]);
    return {
      domain,
      website: row
        ? {
          rank: row.rank,
          backlinks: row.backlinks,
          referringPages: row.referringPages ?? null,
          nofollowPages: row.nofollowPages ?? null,
          brokenBacklinks: row.brokenBacklinks ?? null,
          spamScore: row.spamScore ?? null,
          firstSeen: row.firstSeen ?? null,
          lostDate: row.lostDate ?? null,
          status: row.status,
          day: row.day,
        }
        : null,
      links: links.sort((left, right) => right.domainRank - left.domainRank || (right.linkRank ?? 0) - (left.linkRank ?? 0)).map(linkOf),
    };
  },
});

/**
 * One anchor — the words other websites link here with — and each link that
 * uses them, strongest linking website first. The empty anchor is a link with
 * no words: an image.
 */
export const anchorRecord = tenantQuery({
  args: { siteId: v.id("companyWebsites"), anchor: v.string() },
  returns: v.object({
    anchor: v.string(),
    summary: v.union(v.object({
      backlinks: v.number(),
      referringDomains: v.number(),
      firstSeen: nullableString,
      lostDate: nullableString,
      status: statusValidator,
      spamScore: nullableNumber,
      day: v.string(),
    }), v.null()),
    links: v.array(linkValidator),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const websiteId = site.website._id;
    const anchor = args.anchor.slice(0, MAX_KEY);
    const [row, links] = await Promise.all([
      ctx.db
        .query("siteAnchors")
        .withIndex("by_site_anchor", (q) => q.eq("websiteId", websiteId).eq("anchor", anchor))
        .order("desc")
        .first(),
      // A link with no words has no anchor at all on its row.
      linksBy(ctx, (pass) => ctx.db
        .query("siteBacklinks")
        .withIndex("by_site_pass_anchor", (q) => q.eq("websiteId", websiteId).eq("pass", pass).eq("anchor", anchor === "" ? undefined : anchor))
        .take(LINKS_SHOWN)),
    ]);
    return {
      anchor,
      summary: row
        ? {
          backlinks: row.backlinks,
          referringDomains: row.referringDomains,
          firstSeen: row.firstSeen ?? null,
          lostDate: row.lostDate ?? null,
          status: row.status,
          spamScore: row.spamScore ?? null,
          day: row.day,
        }
        : null,
      links: links.sort((left, right) => right.domainRank - left.domainRank).map(linkOf),
    };
  },
});
