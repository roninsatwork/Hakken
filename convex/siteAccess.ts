import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import type { TenantQueryCtx } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { DEFAULT_LOCATION_CODE, findSeoLocation } from "./utils/seoLocations";
import { isTrackedHold, listOwnerHold } from "./utils/websitePairing";
import { loadSite, type Site } from "./websiteSiteRows";

/**
 * Who may read a site on the client's Sites screens, and what sits beside it.
 *
 * See docs/plans/active/user-sites-plan.md, "Only this company's data" and
 * D17. The company is the caller's — `ctx.companyId`, which honours a super
 * admin's impersonation — and **never** anything in the address. The site id
 * in the address is checked against it: a hold that belongs to another
 * company answers exactly as a missing one does, so an address cannot be
 * guessed into somebody else's data.
 *
 * **Every hold is a Site (D17).** The company's own websites and the ones it
 * watches all open the same pages. What sits beside the open site is its
 * **group**: an owned site and the competitors tracked against it. On the
 * owned site's pages the rivals are its competitors; on a competitor's pages
 * they are the owned site and the other competitors. A competitor watched
 * against nothing has no group, so its rivals are every other hold.
 *
 * Every Sites query enters through here and then reads only through the hold.
 * Nothing starts from a shared table and walks outward.
 */

type Reader = { db: QueryCtx["db"] };

/** Holds read for one company. More websites than this is a plan conversation. */
export const MAX_HOLDS = 200;

export type HoldSummary = {
  siteId: Id<"companyWebsites">;
  host: string;
  relationship: "OWNED" | "TRACKED";
  /** The owned site a competitor is watched against, when it is. */
  ofHost: string | null;
};

export type CompanyHold = { hold: Doc<"companyWebsites">; website: Doc<"websites">; summary: HoldSummary };

/** What reading a site needs: the database, and the caller's company. A query's or a mutation's. */
type SiteReader = Pick<TenantQueryCtx, "companyId"> & Reader;

/** The site, when it is one of the caller's company's holds; otherwise null. */
export async function findMySite(ctx: SiteReader, siteId: Id<"companyWebsites">): Promise<Site | null> {
  if (!ctx.companyId) return null;
  const hold = await ctx.db.get(siteId);
  if (!hold || hold.companyId !== ctx.companyId) return null;
  return await loadSite(ctx, siteId);
}

/** As `findMySite`, for a query that has nothing to show without the site. */
export async function requireMySite(ctx: SiteReader, siteId: Id<"companyWebsites">): Promise<Site> {
  const site = await findMySite(ctx, siteId);
  if (!site) throw appError("NOT_FOUND", "That website is not one your company holds.");
  return site;
}

/** Owned sites first, then by host, so every list reads the same way each time. */
export function byHoldOrder(left: { summary: HoldSummary }, right: { summary: HoldSummary }): number {
  if (left.summary.relationship !== right.summary.relationship) {
    return left.summary.relationship === "OWNED" ? -1 : 1;
  }
  return left.summary.host.localeCompare(right.summary.host);
}

/** Every website a company holds, owned and watched, each with its summary, in list order. */
export async function companyHolds(ctx: Reader, companyId: Id<"companies">): Promise<CompanyHold[]> {
  const holds = await ctx.db
    .query("companyWebsites")
    .withIndex("by_company", (q) => q.eq("companyId", companyId))
    .take(MAX_HOLDS);
  const websites = new Map<Id<"websites">, Doc<"websites">>();
  for (const website of await Promise.all(holds.map((hold) => ctx.db.get(hold.websiteId)))) {
    if (website) websites.set(website._id, website);
  }
  const rows = holds.flatMap((hold) => {
    const website = websites.get(hold.websiteId);
    if (!website) return [];
    const tracked = isTrackedHold(hold);
    const against = tracked && hold.againstWebsiteId ? websites.get(hold.againstWebsiteId) : undefined;
    return [{
      hold,
      website,
      summary: {
        siteId: hold._id,
        host: website.displayHost,
        relationship: tracked ? ("TRACKED" as const) : ("OWNED" as const),
        ofHost: against?.displayHost ?? null,
      },
    }];
  });
  return rows.sort(byHoldOrder);
}

export type MyRival = { hold: Doc<"companyWebsites">; website: Doc<"websites">; summary: HoldSummary };

/**
 * The owned hold a site's group hangs from: the site itself when it is owned,
 * the owned site it is watched against when it is a competitor, or null for a
 * competitor watched against nothing.
 */
export function groupOwner(site: Site): Doc<"companyWebsites"> | null {
  return listOwnerHold(site.hold, site.pair);
}

/** The holds beside this site on its pages: the rest of its group (see the header). */
export async function myRivals(ctx: Reader, site: Site): Promise<MyRival[]> {
  const holds = await companyHolds(ctx, site.hold.companyId);
  const owner = groupOwner(site);
  const others = holds.filter((entry) => entry.hold._id !== site.hold._id);
  if (!owner) return others;
  return others.filter((entry) =>
    entry.hold._id === owner._id
    || (isTrackedHold(entry.hold) && entry.hold.againstWebsiteId === owner.websiteId));
}

/**
 * The hold whose searches and questions a site's pages read
 * (docs/plans/active/private-tracking-lists-plan.md): an owned site's own; a
 * competitor's, the owned site it is watched against, because that is what
 * the company chose to measure it on; none for a competitor watched against
 * nothing (V8). A company's lists are read only through this, with
 * `holdLists.ts`, so no screen can reach another company's.
 */
export function listHold(site: Site): Id<"companyWebsites"> | null {
  return groupOwner(site)?._id ?? null;
}

/**
 * The place the site's questions are asked from, exactly as the collection
 * sends it (`seoCollection.ts`): the list's own website's chosen place, or none
 * when nobody chose one. Fan-out searches are filed under what was sent
 * (`fanOutPlace`), so they are read by it too — never by `site.place`, which
 * falls back to the United Kingdom when none was chosen. Reading by that hid
 * the fan-out searches of every engine that takes a place, on the Sites
 * screens, until 2026-09-26 (Anthony, asking why the page showed only one
 * engine's).
 */
export function askedPlace(site: Site): number | undefined {
  return groupOwner(site)?.locationCode;
}

/**
 * The website the site's questions are about, which keys the answer stats
 * (`websiteQuestionStats`): the list's own website — the owned site's, for a
 * competitor. Facts about answers, shared; which questions a screen walks
 * comes from `listHold`.
 */
export function listWebsiteId(site: Site): Id<"websites"> {
  return groupOwner(site)?.websiteId ?? site.website._id;
}

/** The name of the place a site is read from, for a person. */
export function placeName(site: Site): string {
  return findSeoLocation(site.place)?.label ?? findSeoLocation(DEFAULT_LOCATION_CODE)?.label ?? "";
}

/**
 * The most rows one page of a Sites table may ask for: the largest of the
 * reader's choices of 25, 50, 75 or 100 (docs/plans/active/
 * sites-table-pages-plan.md, T2).
 */
export const SITE_PAGE_MAX = 100;

/**
 * A page request as the browser sent it, held to `SITE_PAGE_MAX` rows: the
 * page size is the caller's to choose, and a caller asking for fifty thousand
 * rows would read a whole table in one go (D15).
 */
export function sitePage<Options extends { numItems: number }>(options: Options): Options {
  return { ...options, numItems: Math.max(1, Math.min(options.numItems, SITE_PAGE_MAX)) };
}
