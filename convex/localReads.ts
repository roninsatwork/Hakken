import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { readFanOutLimits } from "./fanOutLimits";
import { localWatchList, officesForSearch } from "./localPlanning";
import { holdSearches } from "./holdLists";
import { withinFanOutLimit } from "./fanOutFirstCheckSteps";
import { SEO_KEYWORD_CHECKS_PER_WEBSITE } from "./seoCollectionPolicy";
import { searchVolumeOf } from "./searchVolumes";
import { groupOwner, listHold } from "./siteAccess";
import type { Site } from "./websiteSiteRows";

/**
 * What every Local screen reads first (docs/plans/active/discovery-local-
 * reputation-ai-plan.md, §7): the website's offices and rivals, which office
 * is open, the searches it is checked for, and where it stood on each — every
 * figure worked out here from the packed records (rule 4), none stored twice.
 */

type Reader = { db: QueryCtx["db"] };

/** Google's map box on its results page: the first three businesses on Maps. */
export const MAP_BOX = 3;

/**
 * The website's Local set-up: its offices and the rivals watched against
 * them, within its limits — read from the company's own website, also when a
 * competitor's pages are open (`groupOwner`).
 */
export async function localSetup(ctx: Reader, site: Site) {
  const hold = groupOwner(site);
  if (!hold) return { hold: null, offices: [] as Doc<"listings">[], rivals: [] as Doc<"listings">[], rivalOffice: new Map<Id<"listings">, Id<"listings"> | null>(), limits: null };
  const limits = await readFanOutLimits(ctx, hold.companyId, hold._id);
  const { offices, rivals } = await localWatchList(ctx, hold, limits);
  const links = await ctx.db.query("holdListings").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).take(200);
  const rivalOffice = new Map(links.filter((link) => link.role === "RIVAL").map((link) => [link.listingId, link.againstListingId ?? null]));
  return { hold, offices, rivals, rivalOffice, limits };
}

/** The office a screen opens on: the one asked for, else the first. */
export function openOffice(offices: readonly Doc<"listings">[], officeId: Id<"listings"> | undefined): Doc<"listings"> | null {
  return offices.find((office) => office._id === officeId) ?? offices[0] ?? null;
}

/** The rivals watched against an office: those against it and those against every office. */
export function rivalsOf(office: Doc<"listings">, rivals: readonly Doc<"listings">[], rivalOffice: Map<Id<"listings">, Id<"listings"> | null>) {
  return rivals.filter((rival) => {
    const against = rivalOffice.get(rival._id);
    return !against || against === office._id;
  });
}

/** The tracked searches each office is checked for on Maps, as the planner chooses them (`localPlanning.ts`), read once for every office. */
export async function searchesByOffice(ctx: Reader, site: Site, offices: readonly Doc<"listings">[]): Promise<Map<Id<"listings">, string[]>> {
  const byOffice = new Map<Id<"listings">, string[]>(offices.map((office) => [office._id, []]));
  const holdId = listHold(site);
  const hold = groupOwner(site);
  if (!holdId || !hold) return byOffice;
  const limits = await readFanOutLimits(ctx, hold.companyId, hold._id);
  const searches = withinFanOutLimit(
    await holdSearches(ctx, holdId, Math.min(SEO_KEYWORD_CHECKS_PER_WEBSITE, limits.trackedPerSite), { activeOnly: true }),
    limits.fanOutTrackedPerSite,
  );
  const placed = offices.filter((entry) => entry.point);
  for (const search of searches) {
    for (const office of officesForSearch(search.keyword, placed)) byOffice.get(office._id)?.push(search.keyword);
  }
  return byOffice;
}

/** The tracked searches one office is checked for on Maps. */
export async function officeSearches(ctx: Reader, site: Site, office: Doc<"listings">, offices: readonly Doc<"listings">[]): Promise<string[]> {
  return (await searchesByOffice(ctx, site, offices)).get(office._id) ?? [];
}

export type OfficeCheck = {
  latest: Doc<"mapChecks">;
  previous: Doc<"mapChecks"> | null;
  /** The office's place on the newest check: 0 when it was not among those read. */
  place: number;
  previousPlace: number | null;
};

/**
 * An office's newest map check of each search, and the one before when asked
 * for: its place on each, and who was round it. The screens read a place from
 * the checks themselves — the year-long series (`mapPositionWeeks`) is the
 * history kept past the checks' 90 days, and no screen needs all of it.
 */
export async function officeChecks(ctx: Reader, office: Doc<"listings">, searches: readonly string[], withPrevious: boolean): Promise<Map<string, OfficeCheck>> {
  const checks = new Map<string, OfficeCheck>();
  if (!office.point) return checks;
  for (const keyword of searches) {
    const found = await ctx.db
      .query("mapChecks")
      .withIndex("by_point_keyword_day", (q) => q.eq("point", office.point!).eq("keyword", keyword))
      .order("desc")
      .take(withPrevious ? 2 : 1);
    const [latest, previous] = found;
    if (!latest) continue;
    checks.set(keyword, {
      latest,
      previous: previous ?? null,
      place: latest.listingIds.indexOf(office._id) + 1,
      previousPlace: previous ? previous.listingIds.indexOf(office._id) + 1 : null,
    });
  }
  return checks;
}

/** The newest map check of a search from an office, and the one before. */
export async function latestChecks(ctx: Reader, point: string, keyword: string): Promise<Doc<"mapChecks">[]> {
  return await ctx.db
    .query("mapChecks")
    .withIndex("by_point_keyword_day", (q) => q.eq("point", point).eq("keyword", keyword))
    .order("desc")
    .take(2);
}

/** How many search for each search where the website is watched from, from its own keyword list or the volumes bought for searches it does not rank for. */
export async function searchVolumesOf(ctx: Reader, site: Site, keywords: readonly string[]): Promise<Map<string, number | null>> {
  const volumes = new Map<string, number | null>();
  for (const keyword of keywords) {
    const ranked = await ctx.db
      .query("siteKeywordRanks")
      .withIndex("by_site_keyword", (q) => q.eq("websiteId", site.website._id).eq("locationCode", site.place).eq("keyword", keyword))
      .first();
    if (ranked?.volumeKnown) {
      volumes.set(keyword, ranked.volume ?? null);
      continue;
    }
    volumes.set(keyword, (await searchVolumeOf(ctx, keyword, site.place))?.volume ?? null);
  }
  return volumes;
}

/** Listings by id, read once each. */
export async function listingsById(ctx: Reader, ids: Iterable<Id<"listings">>): Promise<Map<Id<"listings">, Doc<"listings">>> {
  const found = new Map<Id<"listings">, Doc<"listings">>();
  for (const id of new Set(ids)) {
    const listing = await ctx.db.get(id);
    if (listing) found.set(id, listing);
  }
  return found;
}

/** A value's average over those that have one, or null. */
export function averageOf(values: ReadonlyArray<number | undefined | null>): number | null {
  const held = values.filter((value): value is number => typeof value === "number");
  return held.length > 0 ? held.reduce((sum, value) => sum + value, 0) / held.length : null;
}
