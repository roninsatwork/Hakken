import { v } from "convex/values";
import { mapRankingsSees, mapSearchSees } from "./utils/sees/local";
import { seeing, seenValidator } from "./utils/hakkenSees";
import type { Doc, Id } from "./_generated/dataModel";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";
import { listingRowOf, listingRowValidator } from "./localListings";
import {
  MAP_BOX,
  averageOf,
  latestChecks,
  listingsById,
  localSetup,
  officeChecks,
  officeSearches,
  openOffice,
  searchVolumesOf,
} from "./localReads";
import { unpackColumn } from "./utils/packedColumns";

/**
 * Discovery → Local → Map rankings, and one search on the map
 * (docs/plans/active/discovery-local-reputation-ai-plan.md, §7; drawn as
 * "Local · Map rankings" and "Local · One search on the map"): where an office
 * sits on Google Maps for each tracked search, checked from its own address
 * (D6), and everyone on the map for one search in Google's order with
 * Google's own reason for showing each.
 */

const officeOptionValidator = v.object({ listingId: v.id("listings"), name: v.string(), town: v.union(v.string(), v.null()) });

/** Where the website itself ranks on Google for a search, from the place it is watched from. */
async function googlePositions(ctx: Parameters<typeof searchVolumesOf>[0], websiteId: Id<"websites">, place: number, keywords: readonly string[]) {
  const positions = new Map<string, number | null>();
  for (const keyword of keywords) {
    const stats = await ctx.db
      .query("websiteSearchStats")
      .withIndex("by_key", (q) => q.eq("websiteId", websiteId).eq("keyword", keyword).eq("locationCode", place))
      .first();
    positions.set(keyword, stats?.lastPosition ?? null);
  }
  return positions;
}

export const mapRankings = tenantQuery({
  args: { siteId: v.id("companyWebsites"), officeId: v.optional(v.id("listings")) },
  returns: v.object({
    offices: v.array(officeOptionValidator),
    office: v.union(v.null(), v.object({ listingId: v.id("listings"), name: v.string(), town: v.union(v.string(), v.null()) })),
    depth: v.number(),
    figures: v.object({
      inBox: v.number(),
      of: v.number(),
      /** In the map box now against the check before, across the searches checked twice. */
      inBoxChange: v.union(v.number(), v.null()),
      averagePlace: v.union(v.number(), v.null()),
      onMap: v.number(),
      notOnMap: v.number(),
      topMost: v.union(v.null(), v.object({ name: v.string(), first: v.number(), you: v.boolean() })),
    }),
    rows: v.array(v.object({
      keyword: v.string(),
      volume: v.union(v.number(), v.null()),
      /** Its place on Maps on the newest check: 0 not among those read, null not checked yet. */
      place: v.union(v.number(), v.null()),
      /** Places moved up since the check before: up is more than 0. */
      change: v.union(v.number(), v.null()),
      googlePosition: v.union(v.number(), v.null()),
      top: v.union(v.string(), v.null()),
      topIsYou: v.boolean(),
      checkedDay: v.union(v.string(), v.null()),
    })),
    seen: seenValidator,
  }),
  handler: seeing(async (ctx, args: { siteId: Id<"companyWebsites">; officeId?: Id<"listings"> }) => {
    const site = await requireMySite(ctx, args.siteId);
    const { offices, limits } = await localSetup(ctx, site);
    const office = openOffice(offices, args.officeId);
    const options = offices.map((entry) => ({ listingId: entry._id, name: entry.name, town: entry.town ?? null }));
    const depth = limits?.localMapDepth ?? 20;
    const empty = { inBox: 0, of: 0, inBoxChange: null, averagePlace: null, onMap: 0, notOnMap: 0, topMost: null };
    if (!office) return { offices: options, office: null, depth, figures: empty, rows: [] };

    const searches = await officeSearches(ctx, site, office, offices);
    const checks = await officeChecks(ctx, office, searches, true);
    const tops = await listingsById(ctx, [...checks.values()].flatMap((check) => check.latest.listingIds.slice(0, 1)));
    const [volumes, positions] = await Promise.all([
      searchVolumesOf(ctx, site, searches),
      googlePositions(ctx, site.website._id, site.place, searches),
    ]);

    const rows = searches.map((keyword) => {
      const check = checks.get(keyword);
      const first = check?.latest.listingIds[0];
      return {
        keyword,
        volume: volumes.get(keyword) ?? null,
        place: check ? check.place : null,
        change: check && check.previousPlace !== null && check.place > 0 && check.previousPlace > 0 ? check.previousPlace - check.place : null,
        googlePosition: positions.get(keyword) ?? null,
        top: first ? tops.get(first)?.name ?? null : null,
        topIsYou: first === office._id,
        checkedDay: check?.latest.day ?? null,
      };
    });
    const checked = rows.filter((row) => row.place !== null);
    const boxed = (place: number | null) => place !== null && place > 0 && place <= MAP_BOX;
    const twice = [...checks.values()].filter((check) => check.previousPlace !== null);
    const firstCounts = new Map<Id<"listings">, number>();
    for (const check of checks.values()) {
      const first = check.latest.listingIds[0];
      if (first) firstCounts.set(first, (firstCounts.get(first) ?? 0) + 1);
    }
    const [topId, topCount] = [...firstCounts.entries()].sort((left, right) => right[1] - left[1])[0] ?? [];
    return {
      offices: options,
      office: { listingId: office._id, name: office.name, town: office.town ?? null },
      depth,
      figures: {
        inBox: checked.filter((row) => boxed(row.place)).length,
        of: checked.length,
        inBoxChange: twice.length > 0
          ? twice.filter((check) => boxed(check.place)).length - twice.filter((check) => boxed(check.previousPlace)).length
          : null,
        averagePlace: averageOf(checked.filter((row) => row.place! > 0).map((row) => row.place)),
        onMap: checked.filter((row) => row.place! > 0).length,
        notOnMap: checked.filter((row) => row.place === 0).length,
        topMost: topId ? { name: tops.get(topId)?.name ?? "", first: topCount!, you: topId === office._id } : null,
      },
      rows,
    };
  }, mapRankingsSees),
});

export const mapSearch = tenantQuery({
  args: { siteId: v.id("companyWebsites"), officeId: v.optional(v.id("listings")), keyword: v.string() },
  returns: v.union(v.null(), v.object({
    office: v.object({ listingId: v.id("listings"), name: v.string(), town: v.union(v.string(), v.null()) }),
    keyword: v.string(),
    day: v.string(),
    volume: v.union(v.number(), v.null()),
    place: v.number(),
    change: v.union(v.number(), v.null()),
    googlePosition: v.union(v.number(), v.null()),
    boxRating: v.union(v.number(), v.null()),
    boxReviews: v.union(v.number(), v.null()),
    you: v.union(v.null(), listingRowValidator),
    businesses: v.array(v.object({
      ...listingRowValidator.fields,
      place: v.number(),
      reason: v.union(v.string(), v.null()),
      you: v.boolean(),
      watched: v.boolean(),
    })),
    seen: seenValidator,
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const { offices, rivals } = await localSetup(ctx, site);
    const office = openOffice(offices, args.officeId);
    if (!office?.point) return null;
    const [latest, before] = await latestChecks(ctx, office.point, args.keyword);
    if (!latest) return null;
    const listings = await listingsById(ctx, latest.listingIds);
    const reasonOf = unpackColumn(latest.reasonOf);
    const watched = new Set(rivals.map((rival) => rival._id as string));
    const businesses = latest.listingIds.flatMap((id, at) => {
      const listing = listings.get(id);
      if (!listing) return [];
      const reason = reasonOf[at];
      return [{
        ...listingRowOf(listing),
        place: at + 1,
        reason: reason === undefined ? null : latest.reasons[reason] ?? null,
        you: id === office._id,
        watched: watched.has(id),
      }];
    });
    const place = latest.listingIds.indexOf(office._id) + 1;
    const previous = before ? before.listingIds.indexOf(office._id) + 1 : null;
    const box = businesses.slice(0, 3);
    const [volumes, positions] = await Promise.all([
      searchVolumesOf(ctx, site, [args.keyword]),
      googlePositions(ctx, site.website._id, site.place, [args.keyword]),
    ]);
    const search = {
      office: { listingId: office._id, name: office.name, town: office.town ?? null },
      keyword: args.keyword,
      day: latest.day,
      volume: volumes.get(args.keyword) ?? null,
      place,
      change: previous !== null && previous > 0 && place > 0 ? previous - place : null,
      googlePosition: positions.get(args.keyword) ?? null,
      boxRating: averageOf(box.map((business) => business.rating)),
      boxReviews: averageOf(box.map((business) => business.reviews)),
      you: listingRowOf(office as Doc<"listings">),
      businesses,
    };
    return { ...search, seen: mapSearchSees(search) };
  },
});
