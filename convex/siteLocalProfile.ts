import { v, type Infer } from "convex/values";
import { businessProfileSees, everyOfficeSees } from "./utils/sees/local";
import { seeing, seenValidator } from "./utils/hakkenSees";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";
import { listingRowOf, listingRowValidator, readListingWeeks, type ListingWeek } from "./localListings";
import {
  MAP_BOX,
  type OfficeCheck,
  averageOf,
  listingsById,
  localSetup,
  officeChecks,
  officeSearches,
  openOffice,
  searchesByOffice,
  rivalsOf,
  searchVolumesOf,
} from "./localReads";
import { hostOfWebsite } from "./localParse";
import { readReviews } from "./localReviews";
import { starsByTopic } from "./siteReviews";

/**
 * Discovery → Local → Business profile, and Every office side by side
 * (docs/plans/active/discovery-local-reputation-ai-plan.md, §7; drawn as
 * "Local · Business profile" and "Business profile, every office"): each
 * office's Google profile as people see it, what it is missing against the
 * businesses people also look at, and how it does on the map. Every figure is
 * worked out here from the listing, its weeks and the office's map places.
 */

type Reader = { db: QueryCtx["db"] };

const DAY_MS = 86_400_000;
/** The share of reviews answered past which replies are good: most of them. */
const ANSWERED_ENOUGH = 0.8;
/** Services named in "What Google shows" before the count says the rest. */
const SERVICES_NAMED = 6;

export const DETAILS = [
  "CLAIMED", "CATEGORY", "OTHER_CATEGORIES", "DESCRIPTION", "ADDRESS", "WEBSITE", "HOURS", "BOOKING", "SERVICES", "PHOTOS", "REPLIES",
] as const;
const detailValidator = v.union(...DETAILS.map((detail) => v.literal(detail)));
const verdictValidator = v.union(v.literal("GOOD"), v.literal("FIX"), v.literal("UNKNOWN"));

/** One line of "What your profile shows": the detail, what Google shows, and the check — the screen words it. */
const detailRowValidator = v.object({
  detail: detailValidator,
  verdict: verdictValidator,
  text: v.union(v.string(), v.null()),
  /** A second text: the phone beside the address; the map's top category beside yours. */
  other: v.union(v.string(), v.null()),
  count: v.union(v.number(), v.null()),
  of: v.union(v.number(), v.null()),
  average: v.union(v.number(), v.null()),
  /** Opening hours, Monday to Sunday. */
  days: v.union(v.array(v.union(v.string(), v.null())), v.null()),
});
type DetailRow = Infer<typeof detailRowValidator>;

const mapBoxValidator = v.object({ inBox: v.number(), of: v.number() });

/** The reviews a listing gained in the last thirty days, from its weeks; null without a week that old. */
function reviewsGained(weeks: readonly ListingWeek[], now: number): number | null {
  const latest = [...weeks].reverse().find((week) => week.reviews !== undefined);
  const before = [...weeks].reverse().find((week) => week.reviews !== undefined && Date.parse(week.day) <= now - 30 * DAY_MS);
  return latest && before ? latest.reviews! - before.reviews! : null;
}

/** In Google's map box (the top three on Maps) for how many of the searches the office was checked for. */
function mapBoxOf(checks: Map<string, OfficeCheck>) {
  const places = [...checks.values()].map((check) => check.place);
  return { inBox: places.filter((place) => place > 0 && place <= MAP_BOX).length, of: places.length };
}

/** Who Google puts in its map box on each search's newest check from the office. */
function boxesOf(checks: Map<string, OfficeCheck>): Map<string, Array<Id<"listings">>> {
  return new Map([...checks.entries()].map(([keyword, check]) => [keyword, check.latest.listingIds.slice(0, MAP_BOX)]));
}

/** The lines of "What your profile shows", and how many need fixing. */
function profileDetails(args: {
  office: Doc<"listings">;
  siteHost: string;
  boxCategory: string | null;
  alsoBooking: { withLink: number; known: number };
  rivalPhotos: number | null;
}): DetailRow[] {
  const { office } = args;
  const profile = office.profile;
  const row = (detail: DetailRow["detail"], verdict: DetailRow["verdict"], fields: Partial<Omit<DetailRow, "detail" | "verdict">> = {}): DetailRow => ({
    detail, verdict, text: null, other: null, count: null, of: null, average: null, days: null, ...fields,
  });
  const services = profile?.services ?? [];
  const priced = services.filter((service) => service.price).length;
  return [
    row("CLAIMED", office.claimed === undefined ? "UNKNOWN" : office.claimed ? "GOOD" : "FIX"),
    row("CATEGORY", !office.category ? "FIX" : !args.boxCategory || args.boxCategory === office.category ? "GOOD" : "FIX", {
      text: office.category ?? null, other: args.boxCategory,
    }),
    row("OTHER_CATEGORIES", (profile?.categories.length ?? 0) > 0 ? "GOOD" : "FIX", { text: profile?.categories.join(" · ") || null, count: profile?.categories.length ?? 0 }),
    row("DESCRIPTION", profile?.description ? "GOOD" : "FIX", { text: profile?.description ?? null }),
    row("ADDRESS", office.address && office.phone ? "GOOD" : "FIX", { text: office.address ?? null, other: office.phone ?? null }),
    row("WEBSITE", office.websiteHost && office.websiteHost === hostOfWebsite(args.siteHost) ? "GOOD" : "FIX", { text: office.websiteHost ?? null, other: hostOfWebsite(args.siteHost) ?? null }),
    row("HOURS", profile?.hours?.some((day) => day !== null) ? "GOOD" : "FIX", { days: profile?.hours ?? null }),
    row("BOOKING", profile?.bookingUrl ? "GOOD" : args.alsoBooking.withLink > 0 ? "FIX" : "GOOD", {
      text: profile?.bookingUrl ?? null, count: args.alsoBooking.withLink, of: args.alsoBooking.known,
    }),
    row("SERVICES", services.length > 0 && priced > 0 ? "GOOD" : "FIX", { count: services.length, of: priced, text: services.slice(0, SERVICES_NAMED).map((service) => service.name).join(", ") || null }),
    row("PHOTOS", office.photos === undefined ? "UNKNOWN" : args.rivalPhotos !== null && office.photos < args.rivalPhotos ? "FIX" : "GOOD", {
      count: office.photos ?? null, average: args.rivalPhotos === null ? null : Math.round(args.rivalPhotos),
    }),
    // Counted as the reviews are filed (`localReviews.ts`): answered against held.
    office.reviewsHeld === undefined
      ? row("REPLIES", "UNKNOWN")
      : row("REPLIES", (office.reviewsAnswered ?? 0) >= office.reviewsHeld * ANSWERED_ENOUGH ? "GOOD" : "FIX", { count: office.reviewsAnswered ?? 0, of: office.reviewsHeld }),
  ];
}

/** The category most of the map box's businesses are in, across the office's searches. */
function boxCategoryOf(boxes: Map<string, Array<Id<"listings">>>, listings: Map<Id<"listings">, Doc<"listings">>, officeId: Id<"listings">): string | null {
  const counts = new Map<string, number>();
  for (const ids of boxes.values()) {
    for (const id of ids) {
      if (id === officeId) continue;
      const category = listings.get(id)?.category;
      if (category) counts.set(category, (counts.get(category) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

const officeOptionValidator = v.object({ listingId: v.id("listings"), name: v.string(), town: v.union(v.string(), v.null()) });

const alsoRowValidator = v.object({
  key: v.string(),
  listingId: v.union(v.id("listings"), v.null()),
  name: v.string(),
  websiteHost: v.union(v.string(), v.null()),
  category: v.union(v.string(), v.null()),
  rating: v.union(v.number(), v.null()),
  reviews: v.union(v.number(), v.null()),
  photos: v.union(v.number(), v.null()),
  booking: v.union(v.boolean(), v.null()),
  mapBox: v.number(),
  you: v.boolean(),
  watched: v.boolean(),
});

/** What a profile screen needs of an office's map: its searches, its newest check of each, and the map boxes. */
async function officeMap(ctx: Reader, office: Doc<"listings">, searches: string[]) {
  const checks = await officeChecks(ctx, office, searches, false);
  return { searches, checks, boxes: boxesOf(checks) };
}

export const businessProfile = tenantQuery({
  args: { siteId: v.id("companyWebsites"), officeId: v.optional(v.id("listings")) },
  returns: v.object({
    offices: v.array(officeOptionValidator),
    office: v.union(v.null(), v.object({
      row: listingRowValidator,
      readAt: v.union(v.number(), v.null()),
      figures: v.object({
        rivalsRating: v.union(v.number(), v.null()),
        reviewsGained: v.union(v.number(), v.null()),
        mapBox: mapBoxValidator,
        rivalsPhotos: v.union(v.number(), v.null()),
      }),
      details: v.array(detailRowValidator),
      alsoLookAt: v.array(alsoRowValidator),
      topics: v.array(v.object({ topic: v.string(), reviews: v.number(), stars: v.union(v.number(), v.null()) })),
    })),
    seen: seenValidator,
  }),
  handler: seeing(async (ctx, args: { siteId: Id<"companyWebsites">; officeId?: Id<"listings"> }) => {
    const site = await requireMySite(ctx, args.siteId);
    const { offices, rivals, rivalOffice } = await localSetup(ctx, site);
    const office = openOffice(offices, args.officeId);
    const options = offices.map((entry) => ({ listingId: entry._id, name: entry.name, town: entry.town ?? null }));
    if (!office) return { offices: options, office: null };

    const mine = rivalsOf(office, rivals, rivalOffice);
    const { checks, boxes } = await officeMap(ctx, office, await officeSearches(ctx, site, office, offices));
    const also = office.profile?.alsoSearched ?? [];
    const alsoListings = new Map<string, Doc<"listings">>();
    for (const entry of also) {
      const listing = await ctx.db.query("listings").withIndex("by_source_key", (q) => q.eq("source", "GOOGLE").eq("key", entry.key)).unique();
      if (listing) alsoListings.set(entry.key, listing);
    }
    const boxListings = await listingsById(ctx, [...boxes.values()].flat());
    const inBoxCount = (listingId: Id<"listings"> | undefined) => (listingId ? [...boxes.values()].filter((ids) => ids.includes(listingId)).length : 0);
    const watched = new Set(rivals.map((rival) => rival._id as string));
    const known = [...alsoListings.values()].filter((listing) => listing.profile);
    const rivalPhotos = averageOf(mine.map((rival) => rival.photos));
    const weeks = await readListingWeeks(ctx, office._id);
    // Each topic's average stars, across the office's reviews its AI read (Reviews, `reviewJudging.ts`).
    const topicStars = starsByTopic(await readReviews(ctx, office._id));

    const alsoRows = [
      { listing: office, entry: { key: office.key, name: office.name, rating: office.rating, reviews: office.reviews }, you: true },
      ...also.map((entry) => ({ listing: alsoListings.get(entry.key), entry, you: false })),
    ].map(({ listing, entry, you }) => ({
      key: entry.key,
      listingId: listing?._id ?? null,
      name: listing?.name ?? entry.name,
      websiteHost: listing?.websiteHost ?? null,
      category: listing?.category ?? null,
      rating: listing?.rating ?? entry.rating ?? null,
      reviews: listing?.reviews ?? entry.reviews ?? null,
      photos: listing?.photos ?? null,
      booking: listing?.profile ? Boolean(listing.profile.bookingUrl) : null,
      mapBox: inBoxCount(listing?._id),
      you,
      watched: Boolean(listing && watched.has(listing._id)),
    }));

    return {
      offices: options,
      office: {
        row: listingRowOf(office),
        readAt: office.profileReadAt ?? null,
        figures: {
          rivalsRating: averageOf(mine.map((rival) => rival.rating)),
          reviewsGained: reviewsGained(weeks, Date.now()),
          mapBox: mapBoxOf(checks),
          rivalsPhotos: rivalPhotos === null ? null : Math.round(rivalPhotos),
        },
        details: profileDetails({
          office,
          siteHost: site.website.host,
          boxCategory: boxCategoryOf(boxes, boxListings, office._id),
          alsoBooking: { withLink: known.filter((listing) => listing.profile?.bookingUrl).length, known: known.length },
          rivalPhotos,
        }),
        alsoLookAt: alsoRows,
        topics: (office.profile?.topics ?? []).map((entry) => ({ ...entry, stars: topicStars.get(entry.topic) ?? null })),
      },
    };
  }, businessProfileSees),
});

export const everyOffice = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.object({
    offices: v.array(v.object({
      ...listingRowValidator.fields,
      /** Of its reviews held, the share answered; null before its reviews are read. */
      answered: v.union(v.number(), v.null()),
      mapBox: mapBoxValidator,
      toFix: v.number(),
      reviewsGained: v.union(v.number(), v.null()),
    })),
    searches: v.array(v.object({
      keyword: v.string(),
      volume: v.union(v.number(), v.null()),
      /** In office order: its place, 0 not on the map, null not checked from that office. */
      places: v.array(v.union(v.number(), v.null())),
      /** The business first on the map from each office that checks it, each once. */
      top: v.array(v.string()),
    })),
    seen: seenValidator,
  }),
  handler: seeing(async (ctx, args: { siteId: Id<"companyWebsites"> }) => {
    const site = await requireMySite(ctx, args.siteId);
    const { offices, rivals, rivalOffice } = await localSetup(ctx, site);
    const searchesOf = await searchesByOffice(ctx, site, offices);
    const maps: Array<Awaited<ReturnType<typeof officeMap>>> = [];
    for (const office of offices) maps.push(await officeMap(ctx, office, searchesOf.get(office._id) ?? []));
    // Every business in any office's map box, read once for all of them.
    const boxListings = await listingsById(ctx, maps.flatMap((map) => [...map.boxes.values()].flat()));
    const rows = [];
    for (const [at, office] of offices.entries()) {
      const { checks, boxes } = maps[at];
      const mine = rivalsOf(office, rivals, rivalOffice);
      const details = profileDetails({
        office,
        siteHost: site.website.host,
        boxCategory: boxCategoryOf(boxes, boxListings, office._id),
        alsoBooking: { withLink: 0, known: 0 },
        rivalPhotos: averageOf(mine.map((rival) => rival.photos)),
      });
      rows.push({
        ...listingRowOf(office),
        answered: office.reviewsHeld ? (office.reviewsAnswered ?? 0) / office.reviewsHeld : null,
        mapBox: mapBoxOf(checks),
        toFix: details.filter((detail) => detail.verdict === "FIX").length,
        reviewsGained: reviewsGained(await readListingWeeks(ctx, office._id), Date.now()),
      });
    }
    const keywords = [...new Set(maps.flatMap((map) => map.searches))];
    const volumes = await searchVolumesOf(ctx, site, keywords);
    return {
      offices: rows,
      searches: keywords.map((keyword) => ({
        keyword,
        volume: volumes.get(keyword) ?? null,
        places: maps.map((map) => (map.searches.includes(keyword) ? map.checks.get(keyword)?.place ?? null : null)),
        top: [...new Set(maps.flatMap((map) => {
          const first = map.boxes.get(keyword)?.[0];
          const name = first ? boxListings.get(first)?.name : undefined;
          return name ? [name] : [];
        }))],
      })),
    };
  }, everyOfficeSees),
});
