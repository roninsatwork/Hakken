import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Discovery's Local pages (docs/plans/active/discovery-local-reputation-ai-plan.md,
 * step 1): a business's Google profiles, one per office, where each sits on
 * Google Maps, the businesses of its kind around it and what its rivals do.
 *
 * Built the way the core data normalisation plan built the core: a business
 * is one `listings` record on the whole platform, whoever watches it; which
 * listings are a company's offices and rivals is the company's own
 * (`holdListings`, read only through its hold); every list and every series
 * is one packed record, never a row a thing.
 */

/** A column of whole numbers packed as text (`utils/packedColumns.ts`), or a list where one is not whole. */
const packedColumnValidator = v.union(v.string(), v.array(v.union(v.number(), v.null())));
/** A column of days packed as text, or the days as written (`packDays`). */
const packedDaysValidator = v.union(v.string(), v.array(v.union(v.string(), v.null())));

export const LISTING_SOURCES = ["GOOGLE", "TRUSTPILOT", "TRIPADVISOR"] as const;
export type ListingSource = (typeof LISTING_SOURCES)[number];
export const listingSourceValidator = v.union(v.literal("GOOGLE"), v.literal("TRUSTPILOT"), v.literal("TRIPADVISOR"));

/** One of the businesses Google shows beside a profile under "People also search for". */
export const alsoSearchedValidator = v.object({
  /** Google's place number. */
  key: v.string(),
  name: v.string(),
  rating: v.optional(v.number()),
  reviews: v.optional(v.number()),
});

/**
 * The rest of a Google profile, read weekly for the businesses a company
 * watches (`google_business_profile`) and as it comes in a found list. Kept
 * whole on the listing, latest only: what changed is worked out when it is
 * filed (`listingActivityParts`) and from the weeks (`listingWeeks`).
 */
export const listingProfileValidator = v.object({
  description: v.optional(v.string()),
  /** The categories after the main one, by name. */
  categories: v.array(v.string()),
  /** Monday to Sunday, each "09:00–18:00" (two spans joined by ", "), "Closed", or null where Google gives none. */
  hours: v.optional(v.array(v.union(v.string(), v.null()))),
  services: v.array(v.object({ name: v.string(), price: v.optional(v.string()) })),
  /** Google's attributes the business has: "offers_online_appointments". */
  attributes: v.array(v.string()),
  bookingUrl: v.optional(v.string()),
  /** The words Google picks out of its reviews, each with how many reviews use it, most first. */
  topics: v.array(v.object({ topic: v.string(), reviews: v.number() })),
  alsoSearched: v.array(alsoSearchedValidator),
  /** Reviews of one star to five, in that order. */
  starCounts: v.optional(v.array(v.number())),
});

export const holdListingRoleValidator = v.union(
  /** One of the company's own offices (or its own page on Trustpilot). */
  v.literal("OWN"),
  /** A rival's profile the company watches. */
  v.literal("RIVAL"),
);

/** What a rival's activity line says happened (`listingActivityParts`). */
export const ACTIVITY_KINDS = [
  "POST", "OFFER", "EVENT", "CATEGORY_ADDED", "CATEGORY_REMOVED", "HOURS_CHANGED", "NAME_CHANGED", "WEBSITE_CHANGED", "QUESTION",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const localTables = {
  /**
   * One business on Google, Trustpilot or Tripadvisor, once on the platform:
   * found by its own number there, whoever watches it. A business seen only in a list (a
   * map check, the local market) has what that list said of it; one a
   * company watches is read whole each week.
   */
  listings: defineTable({
    source: listingSourceValidator,
    /** Google's place number (cid); the website a Trustpilot page is for; a Tripadvisor page's path. */
    key: v.string(),
    name: v.string(),
    address: v.optional(v.string()),
    town: v.optional(v.string()),
    /** Its map point, "51.23876,-0.56475" (`mapPointOf`): where an office's map checks are made from. */
    point: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    /** Its main category as Google names it: "Web Designer". */
    category: v.optional(v.string()),
    /** Google's own ids for its categories, the main one first: what Local market searches by. */
    categoryIds: v.optional(v.array(v.string())),
    /** The website it names, host only and without "www.". */
    websiteHost: v.optional(v.string()),
    phone: v.optional(v.string()),
    claimed: v.optional(v.boolean()),
    rating: v.optional(v.number()),
    reviews: v.optional(v.number()),
    photos: v.optional(v.number()),
    profile: v.optional(listingProfileValidator),
    /** When its whole profile was last read; absent for a business only seen in a list. */
    profileReadAt: v.optional(v.number()),
    /** When anything about it was last filed. */
    seenAt: v.number(),
    /** Its reviews held (`listingReviewParts`), and how many of the newest to read again so a late reply shows: the planner's light reading. */
    reviewsHeld: v.optional(v.number()),
    reviewsRecheck: v.optional(v.number()),
    /** Of the reviews held, how many the owner answered: Every office's and Business profile's "answered". */
    reviewsAnswered: v.optional(v.number()),
  })
    .index("by_source_key", ["source", "key"])
    .index("by_point", ["point"])
    .index("by_seen", ["seenAt"]),

  /**
   * A listing's rating, reviews, photos and whether it is claimed, each week
   * it was read, as one packed record (`listingWeeks.ts`) — rewritten once per
   * reading, a later reading in a week replacing the earlier.
   */
  listingWeeks: defineTable({
    listingId: v.id("listings"),
    /** Each week's Monday. */
    days: packedDaysValidator,
    /** The rating times ten: 48 for 4.8. */
    rating: packedColumnValidator,
    reviews: packedColumnValidator,
    photos: packedColumnValidator,
    /** 1 claimed, 0 not. */
    claimed: packedColumnValidator,
    updatedAt: v.number(),
  }).index("by_listing", ["listingId"]),

  /**
   * Which listings a company calls its own offices, and which rivals it
   * watches, on one of its websites — the company's own, read only through
   * its hold (`websiteTenancyGuard.test.ts`).
   */
  holdListings: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    companyId: v.id("companies"),
    listingId: v.id("listings"),
    role: holdListingRoleValidator,
    /** A rival's office it is watched against; absent, every office. */
    againstListingId: v.optional(v.id("listings")),
    /** Linked by a person, or matched to one of the tracked competitor websites. */
    addedFrom: v.union(v.literal("HAND"), v.literal("MATCHED")),
    createdAt: v.number(),
    createdBy: v.optional(v.id("users")),
  })
    .index("by_hold", ["companyWebsiteId"])
    .index("by_hold_listing", ["companyWebsiteId", "listingId"])
    .index("by_listing", ["listingId"]),

  /**
   * A company's last Find on Your listings: what it typed, and the listings
   * found, in the supplier's order. One a website and place to look, the
   * newest kept.
   */
  listingFinds: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    companyId: v.id("companies"),
    source: listingSourceValidator,
    /** What was typed: a business's name and town. */
    name: v.string(),
    pullId: v.id("seoDataPulls"),
    found: v.array(v.id("listings")),
    /** How many the supplier holds by that name, past the ones read. */
    total: v.optional(v.number()),
    /** Set once the answer is filed; absent while looking (a purchase that failed says so on its pull). */
    filedAt: v.optional(v.number()),
    createdAt: v.number(),
    createdBy: v.optional(v.id("users")),
  })
    .index("by_hold_source", ["companyWebsiteId", "source"])
    .index("by_pull", ["pullId"]),

  /**
   * One search on Google Maps from one map point on one day: the businesses in
   * Google's order, and Google's own reason under each ("Their website
   * mentions …"), each wording kept once. Shared, like a results page; kept
   * 90 days, as `siteSerpPages` are.
   */
  mapChecks: defineTable({
    keyword: v.string(),
    point: v.string(),
    day: v.string(),
    listingIds: v.array(v.id("listings")),
    /** Each wording once; `reasonOf` is each business's place among them, missing where Google gave none. */
    reasons: v.array(v.string()),
    reasonOf: packedColumnValidator,
    pullId: v.id("seoDataPulls"),
  })
    .index("by_point_keyword_day", ["point", "keyword", "day"]),

  /**
   * An office's place on Google Maps for one search, every check, as one
   * packed record — 0 where it was not among the businesses read. A fact
   * about the listing, kept for good: Map rankings' change and trend.
   */
  mapPositionWeeks: defineTable({
    listingId: v.id("listings"),
    keyword: v.string(),
    days: packedDaysValidator,
    places: packedColumnValidator,
    updatedAt: v.number(),
  }).index("by_listing_keyword", ["listingId", "keyword"]),

  /**
   * Every business of one kind within a distance of a map point — an office's
   * local market — as listings with their distance, latest only.
   */
  localMarketParts: defineTable({
    category: v.string(),
    point: v.string(),
    km: v.number(),
    listingIds: v.array(v.id("listings")),
    /** Metres from the point, in step with `listingIds`. */
    metres: packedColumnValidator,
    /** How many the supplier holds there, past the ones read. */
    total: v.number(),
    day: v.string(),
    pullId: v.id("seoDataPulls"),
  }).index("by_market", ["category", "point", "km"]),

  /**
   * What a listing did that its weeks cannot say: its posts and offers, and
   * the changes to its profile seen as each reading was filed. One packed
   * record a listing, the newest kept.
   */
  listingActivityParts: defineTable({
    listingId: v.id("listings"),
    /** Each line's kind, as its place in `ACTIVITY_KINDS`. */
    kinds: packedColumnValidator,
    days: packedDaysValidator,
    /** A post's words, cut short; a change's detail ("E-commerce service"); a question asked on the profile. */
    texts: v.array(v.string()),
    /** A question's first answer, in step with the lines; missing for every other line and an unanswered question. */
    answeredDays: v.optional(packedDaysValidator),
    updatedAt: v.number(),
  }).index("by_listing", ["listingId"]),

  /**
   * A listing's reviews, a thousand a record, newest first (plan step 2, D4):
   * each review's own number (what files it once), day, stars, the owner's
   * reply day, and whether a Google Local Guide wrote it. The words and the
   * reviewer's name are kept only where a company calls the listing its own,
   * with the topics its AI read in them; a rival's reviews keep the figures.
   */
  listingReviewParts: defineTable({
    listingId: v.id("listings"),
    /** The record's place among the listing's, 0 the newest. */
    part: v.number(),
    ids: v.array(v.string()),
    days: packedDaysValidator,
    stars: packedColumnValidator,
    /** Missing where the owner has not replied. */
    replyDays: packedDaysValidator,
    /** 1 a Google Local Guide, missing otherwise. */
    guides: packedColumnValidator,
    /** 1 where the reply's day is known only to the month or year (`reviewParse.ts`); absent when none is. */
    replyRough: v.optional(packedColumnValidator),
    /** Own listings only (D4); null where a review has no words. */
    texts: v.optional(v.array(v.union(v.string(), v.null()))),
    names: v.optional(v.array(v.union(v.string(), v.null()))),
    /**
     * What the company's AI read in each review, own listings only: the
     * topics it praises and complains about, "website design+|speed-"; ""
     * where it names none, null where not read yet (`reviewJudging.ts`).
     */
    topics: v.optional(v.array(v.union(v.string(), v.null()))),
    updatedAt: v.number(),
  }).index("by_listing_part", ["listingId", "part"]),

  /**
   * A reply drafted in a company's own voice for one of its reviews still
   * waiting (plan step 2): the company's alone, gone once the review is
   * answered. Read through its hold.
   */
  reviewReplyDrafts: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    listingId: v.id("listings"),
    reviewId: v.string(),
    text: v.string(),
    draftedAt: v.number(),
  })
    .index("by_hold", ["companyWebsiteId"])
    .index("by_hold_review", ["companyWebsiteId", "reviewId"]),

  /**
   * Which of the new kinds of data a company buys on its schedule
   * (discovery-local-reputation-ai-plan.md, D16; Anthony, 2026-10-09: "hold
   * until I say", per company, per part). Each is off until switched on, on
   * the company's Collection schedule screen; a part that is off is not
   * planned for it on any run, and its own buttons (Find) say so.
   */
  collectionParts: defineTable({
    companyId: v.id("companies"),
    local: v.optional(v.boolean()),
    reviews: v.optional(v.boolean()),
    aiApps: v.optional(v.boolean()),
    aiDemand: v.optional(v.boolean()),
    brandRadar: v.optional(v.boolean()),
    webMentions: v.optional(v.boolean()),
    updatedAt: v.number(),
  }).index("by_company", ["companyId"]),

  /**
   * The numbers beside Local's pages in a website's menu, worked out after
   * each filing for the companies watching what was filed: one record a hold.
   */
  localSummaries: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    ownListings: v.number(),
    mapSearches: v.number(),
    marketBusinesses: v.number(),
    rivalPosts: v.number(),
    /** Reviews held on the company's own listings: Your reviews' count (step 2); absent before Reviews. */
    ownReviews: v.optional(v.number()),
    /** When a rebuild is booked; absent once it has run (`localSummaries.ts`). */
    rebuildAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_hold", ["companyWebsiteId"]),
};
