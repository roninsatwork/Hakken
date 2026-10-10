import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { tenantQuery } from "./tenantFunctions";
import { myRivals, requireMySite } from "./siteAccess";
import { holdBrandNames } from "./holdProfiles";
import { appAnswers, normalName, sameHost } from "./siteAiApps";
import { questionsOf, readings } from "./siteBrandRadar";
import { shownMentionsOf } from "./siteWebMentions";
import { listingsById, localSetup, officeChecks, officeSearches, searchVolumesOf } from "./localReads";
import { listingAddress, readListingActivity, readListingWeeks } from "./localListings";
import { readReviews } from "./localReviews";
import { reviewFiguresOf } from "./siteReviews";
import { activityKindValidator, weekLines } from "./siteLocalMarket";
import { siteKindOf } from "./utils/siteKinds";
import { unpackColumn } from "./utils/packedColumns";
import { hostOfUrl, isOnHost } from "./utils/urlParts";
import { seen, seenValidator, toPage, toRecord, type SeenPhrase, type SeenStep } from "./utils/hakkenSees";
import type { Site } from "./websiteSiteRows";

/**
 * Discovery → One business (docs/plans/active/discovery-detail-and-hakken-
 * sees-plan.md §3, DS2–DS3; drawn as "Detail · One business"): a business the
 * website is up against — where Google's AI names it, where ChatGPT shows it,
 * where it sits on Google Maps for the website's searches, the pages naming
 * it and what it posts — each beside the website's own figure, read from what
 * Local, AI answers, Brand radar and Web mentions already keep.
 *
 * A business is found by its website (`host`) or by its Google profile
 * (`listing:<id>`). Two records are the same business only when their
 * websites match, or a ChatGPT card with no website names the profile exactly
 * in its town — never by name alone (§3). What is not read for it (Brand
 * radar and Web mentions read the rivals watched) is left out.
 */

type Reader = { db: QueryCtx["db"] };
const DAY_MS = 86_400_000;

/** A business as a screen opens it: its website, else its Google profile. */
async function findBusiness(ctx: Reader, site: Site, key: string) {
  const setup = await localSetup(ctx, site);
  const rivals = await myRivals(ctx, site);
  let listing: Doc<"listings"> | null = null;
  let host: string | null = null;
  if (key.startsWith("listing:")) {
    const id = ctx.db.normalizeId("listings", key.slice("listing:".length));
    listing = id ? await ctx.db.get(id) : null;
    host = listing?.websiteHost ?? null;
  } else {
    host = key.trim().replace(/^www\./, "").toLowerCase();
    // Its Google profile: a rival watched, else one in the office's market or on its map.
    const office = setup.offices[0] ?? null;
    const near: Array<Id<"listings">> = setup.rivals.map((rival) => rival._id);
    if (office?.point) {
      const category = office.categoryIds?.[0];
      const market = category
        ? await ctx.db.query("localMarketParts").withIndex("by_market", (q) => q.eq("category", category).eq("point", office.point!).eq("km", setup.limits?.localMarketKm ?? 10)).first()
        : null;
      if (market) near.push(...market.listingIds);
      for (const check of (await officeChecks(ctx, office, await officeSearches(ctx, site, office, setup.offices), false)).values()) near.push(...check.latest.listingIds);
    }
    const listings = await listingsById(ctx, near);
    listing = [...listings.values()].find((entry) => entry.websiteHost && sameHost(entry.websiteHost, host!)) ?? null;
  }
  const rival = host ? rivals.find((entry) => sameHost(entry.website.host, host!) || sameHost(host!, entry.website.host)) ?? null : null;
  return { setup, listing, host, rival };
}

const placeOf = (named: ReadonlyArray<{ key: string; at: number }>, key: string) => {
  const order = [...named].sort((left, right) => left.at - right.at);
  const at = order.findIndex((entry) => entry.key === key);
  return at >= 0 ? at + 1 : null;
};

export const businessDetail = tenantQuery({
  args: { siteId: v.id("companyWebsites"), business: v.string() },
  returns: v.object({
    found: v.boolean(),
    name: v.string(),
    host: v.union(v.string(), v.null()),
    category: v.union(v.string(), v.null()),
    town: v.union(v.string(), v.null()),
    km: v.union(v.number(), v.null()),
    profileUrl: v.union(v.string(), v.null()),
    /** A rival the company watches, by its own hold: its Google rankings beside yours are on Competitors. */
    rivalId: v.union(v.id("companyWebsites"), v.null()),
    /** Watched as a competitor website or as a rival's Google profile. */
    watched: v.boolean(),
    figures: v.object({
      named: v.union(v.number(), v.null()),
      namedYou: v.union(v.number(), v.null()),
      shown: v.number(),
      shownYou: v.number(),
      answers: v.number(),
      rating: v.union(v.number(), v.null()),
      reviews: v.union(v.number(), v.null()),
      ratingYou: v.union(v.number(), v.null()),
      reviewsYou: v.union(v.number(), v.null()),
      mentions: v.union(v.number(), v.null()),
      mentionsYou: v.union(v.number(), v.null()),
      daysToAnswer: v.union(v.number(), v.null()),
      daysToAnswerYou: v.union(v.number(), v.null()),
    }),
    questions: v.array(v.object({ question: v.string(), volume: v.number(), it: v.union(v.number(), v.null()), you: v.union(v.number(), v.null()), page: v.union(v.string(), v.null()) })),
    answers: v.array(v.object({ question: v.string(), answerId: v.id("aiAnswerTexts"), day: v.string(), it: v.number(), you: v.union(v.number(), v.null()) })),
    map: v.array(v.object({ search: v.string(), volume: v.union(v.number(), v.null()), it: v.union(v.number(), v.null()), you: v.union(v.number(), v.null()) })),
    mentions: v.array(v.object({ url: v.string(), host: v.string(), title: v.union(v.string(), v.null()), day: v.string(), kind: v.number(), tone: v.number(), linked: v.number() })),
    posts: v.array(v.object({ day: v.string(), kind: activityKindValidator, text: v.union(v.string(), v.null()), from: v.union(v.number(), v.null()), to: v.union(v.number(), v.null()) })),
    seen: seenValidator,
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const { setup, listing, host, rival } = await findBusiness(ctx, site, args.business);
    const now = Date.now();
    const since30 = new Date(now - 30 * DAY_MS).toISOString().slice(0, 10);
    const own = site.website.host;
    const office = setup.offices[0] ?? null;
    const name = listing?.name ?? rival?.website.displayHost ?? host ?? args.business;

    // Google's AI (Brand radar): the questions naming it, where it came and where you did.
    const { readings: all } = await readings(ctx, site);
    const its = host ? all.find((reading) => !reading.you && sameHost(reading.website.host, host)) : undefined;
    const mine = all.find((reading) => reading.you);
    const lastMentions = (reading: typeof its) => {
      if (!reading?.months) return null;
      const mentions = unpackColumn(reading.months.mentions);
      return mentions.at(-1) ?? null;
    };
    const named = new Map<string, Array<{ key: string; at: number }>>();
    for (const reading of all) {
      if (!reading.part) continue;
      for (const entry of questionsOf(reading.part)) {
        if (entry.firstAt === null) continue;
        const list = named.get(entry.question.toLowerCase()) ?? [];
        list.push({ key: reading.website.host, at: entry.firstAt });
        named.set(entry.question.toLowerCase(), list);
      }
    }
    const questions = its?.part ? questionsOf(its.part).filter((entry) => entry.firstAt !== null).map((entry) => {
      const order = named.get(entry.question.toLowerCase()) ?? [];
      return {
        question: entry.question,
        volume: entry.volume,
        it: placeOf(order, its.website.host),
        you: mine ? placeOf(order, mine.website.host) : null,
        page: entry.pages.find((url) => isOnHost(hostOfUrl(url), its.website.host)) ?? null,
      };
    }) : [];

    // ChatGPT's app: each question's newest answer that showed it, where, and where you came.
    const brandNames = (await holdBrandNames(ctx, site.hold._id)).map((entry) => normalName(entry.name)).filter((entry) => entry.length > 2);
    const isYou = (card: { name: string; host?: string }) => sameHost(card.host, own) || brandNames.some((brand) => normalName(card.name).includes(brand));
    const isIt = (card: { name: string; host?: string; address?: string }) => (card.host
      ? Boolean(host && sameHost(card.host, host))
      : Boolean(listing && normalName(card.name) === normalName(listing.name) && listing.town && (card.address ?? "").toLowerCase().includes(listing.town.toLowerCase())));
    const answers = [];
    let latest = 0;
    let shownYou = 0;
    for (const list of (await appAnswers(ctx, site)).values()) {
      const answer = list[0];
      if (!answer) continue;
      latest += 1;
      const cards = answer.extras.businesses;
      const at = cards.findIndex(isIt);
      const you = cards.findIndex(isYou);
      if (you >= 0) shownYou += 1;
      if (at >= 0) answers.push({ question: answer.prompt, answerId: answer.textId, day: answer.day, it: at + 1, you: you >= 0 ? you + 1 : null });
    }

    // Google Maps: its place and yours on the office's searches.
    const map = [];
    if (office && listing) {
      const searches = await officeSearches(ctx, site, office, setup.offices);
      const checks = await officeChecks(ctx, office, searches, false);
      const volumes = await searchVolumesOf(ctx, site, [...checks.keys()]);
      for (const [search, check] of checks) {
        const it = check.latest.listingIds.indexOf(listing._id) + 1;
        map.push({ search, volume: volumes.get(search) ?? null, it: it > 0 ? it : null, you: check.place > 0 ? check.place : null });
      }
    }

    // Reviews: its Google profile's figures beside your first office's.
    const reviewFigures = listing ? reviewFiguresOf(await readReviews(ctx, listing._id), now) : null;
    const yourFigures = office ? reviewFiguresOf(await readReviews(ctx, office._id), now) : null;

    // Pages naming it (Web mentions reads the rivals watched) and yours, the last 30 days.
    const mentionRows = rival ? (await shownMentionsOf(ctx, rival.website._id)) ?? [] : [];
    const yourMentions = await shownMentionsOf(ctx, site.website._id);

    // What it posted and changed on its profile.
    const posts = listing ? [
      ...(await readListingActivity(ctx, listing._id)).filter((line) => line.kind !== "QUESTION").map((line) => ({ day: line.day, kind: line.kind as typeof activityKindValidator.type, text: line.text, from: null, to: null })),
      ...weekLines(await readListingWeeks(ctx, listing._id)).map((line) => ({ day: line.day, kind: line.kind, text: null, from: line.from, to: line.to })),
    ].sort((left, right) => right.day.localeCompare(left.day)) : [];

    const km = listing?.latitude !== undefined && listing.longitude !== undefined && office?.latitude !== undefined && office.longitude !== undefined
      ? distanceKm(office.latitude, office.longitude, listing.latitude, listing.longitude)
      : null;
    const figures = {
      named: lastMentions(its),
      namedYou: lastMentions(mine),
      shown: answers.length,
      shownYou,
      answers: latest,
      rating: listing?.rating ?? null,
      reviews: listing?.reviews ?? null,
      ratingYou: office?.rating ?? null,
      reviewsYou: office?.reviews ?? null,
      mentions: rival ? mentionRows.filter((row) => row.day >= since30).length : null,
      mentionsYou: yourMentions ? yourMentions.filter((row) => row.day >= since30).length : null,
      daysToAnswer: reviewFigures?.daysToAnswer ?? null,
      daysToAnswerYou: yourFigures?.daysToAnswer ?? null,
    };

    // What Hakken sees: where it is ahead of you, its biggest lead, and what to do first.
    const lead = questions.filter((row) => row.you === null).sort((left, right) => right.volume - left.volume)[0];
    const yourPages = new Set((mine?.part?.pages ?? []).map(hostOfUrl));
    const place = its?.part ? [...new Set(its.part.pages.map(hostOfUrl))].find((page) => ["DIRECTORY", "REVIEWS"].includes(siteKindOf(page)) && !yourPages.has(page)) : undefined;
    const answersFaster = figures.daysToAnswer !== null && figures.daysToAnswerYou !== null && figures.daysToAnswer + 1 <= figures.daysToAnswerYou;
    const moreReviews = figures.reviews !== null && figures.reviewsYou !== null && figures.reviews >= figures.reviewsYou * 1.5 && figures.reviews - figures.reviewsYou >= 10;
    const watchedListing = Boolean(listing && setup.rivals.some((entry) => entry._id === listing._id));
    const says: Array<SeenPhrase | null> = [
      figures.named !== null && figures.namedYou !== null
        ? { code: figures.named > figures.namedYou ? "aheadInAi" : "behindInAi", text: name, a: figures.named, b: figures.namedYou }
        : null,
      lead ? { code: "biggestLead", text: lead.question, a: lead.volume } : null,
      latest > 0 && figures.shown > figures.shownYou ? { code: "chatgptAhead", a: figures.shown, b: figures.shownYou, c: latest } : null,
      moreReviews ? { code: "moreReviews", a: figures.reviews!, b: figures.reviewsYou!, c: Math.round((figures.rating ?? 0) * 10) } : null,
      answersFaster ? { code: "answersFaster", a: Math.round(figures.daysToAnswer!), b: Math.round(figures.daysToAnswerYou!) } : null,
      !rival && !listing ? { code: "nothingKnown", text: name } : null,
      !rival && watchedListing ? { code: "mapOnly", text: name } : null,
      !rival && listing && !watchedListing ? { code: "notWatched", text: name } : null,
    ];
    const steps: Array<SeenStep | null> = [
      lead ? { code: "answerQuestion", text: lead.question, link: "seeQuestion", to: toRecord("question", lead.question) } : null,
      place ? { code: "getListedOn", text: place, link: "seeWebsite", to: toRecord("website", place) } : null,
      moreReviews ? { code: "askForReviews", a: figures.reviews! - figures.reviewsYou!, link: "yourReviews", to: toPage("reviews") } : null,
      answersFaster ? { code: "answerReviews", link: "yourReviews", to: toPage("reviews") } : null,
    ];

    return {
      found: Boolean(listing || rival || its),
      name,
      host,
      category: listing?.category ?? null,
      town: listing?.town ?? null,
      km,
      profileUrl: listing ? listingAddress(listing) : null,
      rivalId: rival?.hold._id ?? null,
      watched: Boolean(rival) || watchedListing,
      figures,
      questions,
      answers,
      map,
      mentions: mentionRows.map(({ about: _about, strength: _strength, ...row }) => row),
      posts,
      seen: seen(says, steps),
    };
  },
});

/** The distance between two points on the map, in kilometres. */
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}
