import type { FindingFact } from "../findings";
import { isNumber, isRow, named, partWithFacts, rowsOf, withRowNames, type OwnFound, type Row } from "./shared";
import { vsBeside, vsMoved } from "./visibilityMarket";

// ===========================================================================================================================
// Local (visibility-16-eyes, 22 November 2026; Anthony: "Yes, build them"): Business profile, Google Maps, Rivals'
// activity, Listings, Local market and one business. Every screen but Rivals' activity shows the newest check whatever
// the dates, so its rules set your office beside your rivals and parts against their whole. Rivals' activity counts the
// dates: its posts against the same span before, each rival's in the 12 months to the dates' end, and the days since each
// last posted, so a quiet week still says who posts and who has gone quiet. What each screen hands its eye is built in
// `eyeData/visibilityLocal.ts`; every rule runs on every period in `visibilityRestPeriods.test.ts`.
// ===========================================================================================================================

const partOf = (data: Row, name: string): Row => (isRow(data[name]) ? (data[name] as Row) : {});
const numberIn = (row: Row | undefined, field: string): number | null => (row && isNumber(row[field]) ? (row[field] as number) : null);
function nameIn(data: Row, key: string, fallback: string): string {
  const names = partOf(data, "names");
  return typeof names[key] === "string" && (names[key] as string).trim() ? (names[key] as string).trim() : fallback;
}
const mostFirst = (rows: readonly Row[], field: string) => rows.filter((row) => named(row) && isNumber(row[field])).sort((left, right) => (right[field] as number) - (left[field] as number));
const fewestFirst = (rows: readonly Row[], field: string) => [...mostFirst(rows, field)].reverse();
/** One figure beside another's, with more facts the writer needs beside it: how far away, which search. */
function besideWith(list: string, name: string, measure: string, value: number, mean: number, other: string, score: number, extra: FindingFact[] = []): OwnFound {
  const one = vsBeside(list, name, measure, value, mean, other, score);
  return { ...one, facts: [...one.facts, ...extra] };
}
/** Two figures far enough apart to say: a fifth of the larger. */
const farApart = (value: number, other: number) => Math.max(value, other) > 0 && Math.abs(value - other) / Math.max(value, other) >= 0.2;
const gapScore = (base: number, value: number, other: number) => base + Math.min(0.5, Math.max(value, other) > 0 ? Math.abs(value - other) / Math.max(value, other) / 2 : 0);
/**
 * A profile's photos or rating that changed on a day, beside what it was before that day: "Air Social: photos 103, against
 * 95 before 2026-11-02". Said with its own day, never "the span before", as a change is one day's, in the dates or not.
 */
function changedOn(list: string, name: string, measure: "photos" | "rating", now: number, before: number, day: string | null, score: number): OwnFound {
  const earlier = day ? `${name}, before ${day}` : `${name}, before`;
  return besideWith(list, name, measure, now, before, earlier, score);
}
const metresFact = (row: Row): FindingFact[] => (isNumber(row.metres) ? [{ key: "metres", value: row.metres as number, unit: "count", label: `${named(row)}: metres from your office` }] : []);

// ---------------------------------------------------------------------------------------------------------------------------
// Business profile (`local`).
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * Your office in the map box for the searches checked (the headline); its photos and rating beside your rivals'
 * averages; the reviews answered; the details to put right, by name; what reviews talk about most; and a business people
 * also look at with far more reviews.
 */
function profileFindings(data: Row): OwnFound[] {
  const office = partOf(data, "office");
  const name = named(office);
  if (!name) return [];
  const found: OwnFound[] = [];
  const inBox = numberIn(office, "inMapBox");
  const checked = numberIn(office, "searchesChecked");
  if (inBox !== null && checked !== null && checked > 0) found.push(vsBeside("mapBox", name, "localPacks", inBox, checked, nameIn(data, "searchesChecked", "The searches checked"), 2));
  const average = nameIn(data, "rivalsAverage", "Your rivals, on average");
  const photos = numberIn(office, "photos");
  const rivalsPhotos = numberIn(office, "rivalsPhotos");
  if (photos !== null && rivalsPhotos !== null && farApart(photos, rivalsPhotos)) found.push(vsBeside("photos", name, "photos", photos, rivalsPhotos, average, gapScore(1.2, photos, rivalsPhotos)));
  const answered = numberIn(office, "answered");
  const answerable = numberIn(office, "answerable");
  if (answered !== null && answerable !== null && answerable >= 3) found.push(partWithFacts("answered", nameIn(data, "reviewsAnswered", "Reviews you answered"), "reviews", answered, answerable, 1.1 + Math.min(0.5, 1 - answered / answerable)));
  const rating = numberIn(office, "rating");
  const rivalsRating = numberIn(office, "rivalsRating");
  if (rating !== null && rivalsRating !== null && Math.abs(rating - rivalsRating) >= 0.05) found.push(vsBeside("rating", name, "rating", rating, rivalsRating, average, 1 + Math.min(0.5, Math.abs(rating - rivalsRating))));
  const toFix = rowsOf(data.toFix).filter((row) => named(row));
  const details = numberIn(office, "details");
  // Named "Details to fix", with the details themselves beside it, so the panel says they need fixing (the fresh reader).
  if (toFix.length > 0 && details !== null && details > 0) found.push(withRowNames(partWithFacts("toFix", nameIn(data, "detailsToFix", "Details to fix"), "profileDetails", toFix.length, details, 1.2, { of: `the ${details} details on the profile` }), toFix.map((row) => named(row)!)));
  const reviews = numberIn(office, "reviews");
  const topic = mostFirst(rowsOf(data.topics), "reviews")[0];
  if (topic && reviews !== null && reviews > 0 && (topic.reviews as number) >= 2) {
    found.push(partWithFacts("topic", named(topic)!, "reviews", topic.reviews as number, reviews, 0.9, { extra: isNumber(topic.rating) ? [{ key: "rating", value: topic.rating as number, unit: "score", label: `${named(topic)}: star rating of the reviews about it` }] : [] }));
  }
  const looked = mostFirst(rowsOf(data.alsoLookAt), "reviews")[0];
  if (looked && reviews !== null && farApart(looked.reviews as number, reviews)) found.push(vsBeside("alsoLookAt", named(looked)!, "reviews", looked.reviews as number, reviews, name, gapScore(1, looked.reviews as number, reviews)));
  return found;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Google Maps (`local/maps`).
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * Your office in the map box for the searches checked (the headline), and how that moved since the check before; the
 * most searched searches where you aren't in the box, each with your place on Google's own results; and the businesses
 * topping the map, by the searches each tops.
 */
function mapsFindings(data: Row): OwnFound[] {
  const map = partOf(data, "map");
  const office = typeof map.office === "string" ? map.office : null;
  if (!office) return [];
  const found: OwnFound[] = [];
  const inBox = numberIn(map, "inMapBox");
  const checked = numberIn(map, "searchesChecked");
  if (inBox !== null && checked !== null && checked > 0) found.push(vsBeside("mapBox", office, "localPacks", inBox, checked, nameIn(data, "searchesChecked", "The searches checked"), 2));
  const change = numberIn(map, "inMapBoxChange");
  if (inBox !== null && change !== null && change !== 0 && inBox - change > 0) found.push(vsMoved("moved", office, "localPacks", inBox, inBox - change, 1.6));
  const searches = rowsOf(data.searches).filter((row) => named(row));
  const volume = searches.reduce((sum, row) => sum + (numberIn(row, "volume") ?? 0), 0);
  const depth = numberIn(map, "depth");
  // Not in the box: off the map, or on it below the top three.
  const outside = mostFirst(searches.filter((row) => row.youTop !== 1 && (numberIn(row, "placeOnMap") ?? Infinity) > 3), "volume");
  outside.slice(0, 2).forEach((row, at) => {
    const extra: FindingFact[] = [
      ...(isNumber(row.placeOnMap) ? [{ key: "placeOnMap", value: row.placeOnMap as number, unit: "score" as const, label: `${office}: place on Google Maps for ${named(row)}` }] : depth !== null ? [{ key: "depth", value: depth, unit: "count" as const, label: `${office}: not in the first places on Google Maps for ${named(row)}, as far as the map is read` }] : []),
      ...(isNumber(row.placeOnGoogle) ? [{ key: "placeOnGoogle", value: row.placeOnGoogle as number, unit: "score" as const, label: `${office}: place on Google's results for ${named(row)}` }] : []),
    ];
    if (volume > 0) found.push(partWithFacts(`outside:${at}`, named(row)!, "checkedVolume", row.volume as number, volume, 1.5 - at * 0.3, { of: `the monthly searches of the ${searches.length} searches you track on Google Maps`, extra }));
  });
  mostFirst(rowsOf(data.leaders), "mapFirsts").slice(0, 3).forEach((row, at) => {
    if (checked !== null && checked > 0) found.push(partWithFacts(`leader:${at}`, named(row)!, "mapFirsts", row.mapFirsts as number, checked, 1.3 - at * 0.1, { of: `the ${checked} top spots on the map, one for each search checked` }));
  });
  return found;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Rivals' activity (`local/activity`).
// ---------------------------------------------------------------------------------------------------------------------------

/** A span this long or longer is a year already: its 12 months' posts say nothing more. */
const A_YEAR = 360;
const DAY_MS = 86_400_000;

/**
 * Your rivals' posts in the dates beside yours (the headline); the rival posting most; their posts against the same
 * span before; the rival posting most in the 12 months to the dates' end, beside the next; the rivals gone quiet, by the
 * days since they last posted; and the photos and ratings that changed in the dates.
 */
function activityFindings(data: Row): OwnFound[] {
  const posts = partOf(data, "posts");
  const rivalPosts = numberIn(posts, "rivals");
  const yourPosts = numberIn(posts, "you");
  if (rivalPosts === null || yourPosts === null) return [];
  const yourRivals = nameIn(data, "yourRivals", "Your rivals");
  const you = nameIn(data, "you", "You");
  const found: OwnFound[] = [vsBeside("posts", yourRivals, "posts", rivalPosts, yourPosts, you, 2)];
  const rivals = rowsOf(data.rivals).filter((row) => named(row));
  const busiest = mostFirst(rivals, "posts")[0];
  if (busiest && rivalPosts > 0 && (busiest.posts as number) > 0) found.push(partWithFacts("busiest", named(busiest)!, "rivalPosts", busiest.posts as number, rivalPosts, 1.5, { of: `the ${rivalPosts} posts by your rivals in these dates` }));
  const before = numberIn(posts, "rivalsBefore");
  if (before !== null && before > 0 && Math.abs(rivalPosts - before) >= 2) found.push(vsMoved("before", yourRivals, "posts", rivalPosts, before, 1.3));
  const from = typeof posts.from === "string" ? posts.from : null;
  const to = typeof posts.to === "string" ? posts.to : null;
  const days = from && to ? (Date.parse(to) - Date.parse(from)) / DAY_MS : A_YEAR;
  const byYear = mostFirst(rivals, "postsInAYear");
  if (days < A_YEAR && byYear[0] && (byYear[0].postsInAYear as number) >= 2) {
    const next = byYear[1];
    found.push(vsBeside("year", named(byYear[0])!, "postsInAYear", byYear[0].postsInAYear as number, next ? (next.postsInAYear as number) : 0, next ? named(next)! : yourRivals, 1.2));
  }
  // The rivals gone quiet: no post in the dates and none for a season, beside the one posting most recently.
  const recent = fewestFirst(rivals, "daysSincePost")[0];
  for (const quiet of mostFirst(rivals.filter((row) => row.posts === 0 && (numberIn(row, "daysSincePost") ?? 0) >= 90), "daysSincePost").slice(0, 2)) {
    if (recent && named(recent) !== named(quiet)) found.push(vsBeside("quiet", named(quiet)!, "daysSincePost", quiet.daysSincePost as number, recent.daysSincePost as number, named(recent)!, 1 + Math.min(0.3, (quiet.daysSincePost as number) / 3650)));
  }
  for (const changed of rowsOf(data.changes).filter((row) => named(row))) {
    const day = typeof changed.day === "string" ? changed.day : null;
    if (isNumber(changed.photos) && isNumber(changed.photosBefore)) found.push(changedOn(`photos:${named(changed)}`, named(changed)!, "photos", changed.photos as number, changed.photosBefore as number, day, 1.1));
    if (isNumber(changed.rating) && isNumber(changed.ratingBefore)) found.push(changedOn(`rating:${named(changed)}`, named(changed)!, "rating", changed.rating as number, changed.ratingBefore as number, day, 1.15));
  }
  return found;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Listings (`local/listings`).
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * Your offices' reviews together beside the rival with the most (the headline); your office with the fewest photos beside
 * the rival with the most; your lowest-rated office beside the best-rated rival; and the rivals with more reviews than all
 * your offices together.
 */
function listingsFindings(data: Row): OwnFound[] {
  const yours = partOf(data, "yours");
  const offices = rowsOf(data.offices).filter((row) => named(row));
  const rivals = rowsOf(data.rivals).filter((row) => named(row));
  const reviews = numberIn(yours, "reviews");
  if (offices.length === 0 || rivals.length === 0 || reviews === null) return [];
  const found: OwnFound[] = [];
  const yourName = named(yours) ?? nameIn(data, "yourOffices", "Your offices");
  const mostReviews = mostFirst(rivals, "reviews")[0];
  if (mostReviews) found.push(vsBeside("reviews", yourName, "reviews", reviews, mostReviews.reviews as number, named(mostReviews)!, 2));
  const fewestPhotos = fewestFirst(offices, "photos")[0];
  const mostPhotos = mostFirst(rivals, "photos")[0];
  if (fewestPhotos && mostPhotos && farApart(fewestPhotos.photos as number, mostPhotos.photos as number)) found.push(vsBeside("photos", named(fewestPhotos)!, "photos", fewestPhotos.photos as number, mostPhotos.photos as number, named(mostPhotos)!, gapScore(1.2, fewestPhotos.photos as number, mostPhotos.photos as number)));
  const lowest = fewestFirst(offices, "rating")[0];
  const best = mostFirst(rivals, "rating")[0];
  if (lowest && best && (best.rating as number) - (lowest.rating as number) >= 0.1) found.push(vsBeside("rating", named(lowest)!, "rating", lowest.rating as number, best.rating as number, named(best)!, 1.1 + Math.min(0.5, (best.rating as number) - (lowest.rating as number))));
  const ahead = rivals.filter((row) => isNumber(row.reviews) && (row.reviews as number) > reviews);
  if (ahead.length > 0) found.push(withRowNames(partWithFacts("ahead", nameIn(data, "rivalsAhead", "Rivals with more reviews than all your offices"), "rivalsWatched", ahead.length, rivals.length, 1 + ahead.length / rivals.length / 2), ahead.map((row) => named(row)!)));
  return found;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Local market (`local/market`).
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * The businesses nearby with more reviews than you, of every business of your kind nearby (the headline); the nearest
 * business in the map box beside you; the business with the most reviews nearby beside you; and the business in the
 * map box with the most photos beside you.
 */
function nearbyFindings(data: Row): OwnFound[] {
  const market = partOf(data, "market");
  const you = partOf(data, "you");
  const yourName = named(you);
  if (!yourName) return [];
  const found: OwnFound[] = [];
  const nearby = numberIn(market, "businessesNearby");
  const more = numberIn(market, "moreReviews");
  const km = numberIn(market, "km");
  if (nearby !== null && more !== null && nearby > 0) found.push(partWithFacts("moreReviews", nameIn(data, "moreReviewsNearby", "Businesses near you with more reviews"), "businessesNearby", more, nearby, 2, { extra: km !== null ? [{ key: "km", value: km, unit: "count", label: "kilometres the market is read across" }] : [] }));
  const reviews = numberIn(you, "reviews") ?? 0;
  const photos = numberIn(you, "photos") ?? 0;
  const inBox = rowsOf(data.inMapBox).filter((row) => named(row));
  const closest = inBox[0];
  if (closest && isNumber(closest.reviews)) found.push(besideWith("closestInBox", named(closest)!, "reviews", closest.reviews as number, reviews, yourName, 1.5, metresFact(closest)));
  const most = mostFirst(rowsOf(data.mostReviewed), "reviews")[0];
  if (most && named(most) !== (closest ? named(closest) : null) && farApart(most.reviews as number, reviews)) found.push(besideWith("mostReviews", named(most)!, "reviews", most.reviews as number, reviews, yourName, gapScore(1.1, most.reviews as number, reviews), metresFact(most)));
  const photoed = mostFirst(inBox, "photos")[0];
  if (photoed && farApart(photoed.photos as number, photos)) found.push(besideWith("photosInBox", named(photoed)!, "photos", photoed.photos as number, photos, yourName, gapScore(1, photoed.photos as number, photos)));
  return found;
}

// ---------------------------------------------------------------------------------------------------------------------------
// One business (`local/market/business`).
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * Its reviews beside yours (the headline); the most searched map search where it places above you, with both places;
 * its rating, AI answers naming it and days to answer a review beside yours; its posts in the dates against the span
 * before; and its newest change of photos or rating.
 */
function businessFindings(data: Row): OwnFound[] {
  const business = partOf(data, "business");
  const name = named(business);
  if (!name) return [];
  const you = typeof business.you === "string" && business.you.trim() ? business.you.trim() : "You";
  const found: OwnFound[] = [];
  const pair = (field: string): [number, number] | null => {
    const its = numberIn(business, field);
    const yours = numberIn(business, `${field}You`);
    return its !== null && yours !== null ? [its, yours] : null;
  };
  const reviews = pair("reviews");
  if (reviews) found.push(vsBeside("reviews", name, "reviews", reviews[0], reviews[1], you, 2));
  // Out of every search you track on the map, as its words say ("what you track on Google Maps"), not only those it shows for.
  const tracked = rowsOf(data.map).filter((row) => named(row));
  const volume = tracked.reduce((sum, row) => sum + (numberIn(row, "volume") ?? 0), 0);
  const placed = tracked.filter((row) => isNumber(row.itsPlace));
  const ahead = mostFirst(placed.filter((row) => !isNumber(row.yourPlace) || (row.yourPlace as number) > (row.itsPlace as number)), "volume")[0];
  if (ahead && volume > 0) {
    found.push(partWithFacts("mapLead", named(ahead)!, "checkedVolume", ahead.volume as number, volume, 1.5, {
      of: `the monthly searches of the ${tracked.length} searches you track on Google Maps`,
      extra: [
        { key: "itsPlace", value: ahead.itsPlace as number, unit: "score", label: `${name}: place on Google Maps for ${named(ahead)}` },
        ...(isNumber(ahead.yourPlace) ? [{ key: "yourPlace", value: ahead.yourPlace as number, unit: "score" as const, label: `${you}: place on Google Maps for ${named(ahead)}` }] : []),
      ],
    }));
  }
  const rating = pair("rating");
  if (rating && Math.abs(rating[0] - rating[1]) >= 0.05) found.push(vsBeside("rating", name, "rating", rating[0], rating[1], you, 1.1 + Math.min(0.5, Math.abs(rating[0] - rating[1]))));
  const inAi = pair("named");
  if (inAi && farApart(inAi[0], inAi[1])) found.push(vsBeside("named", name, "named", inAi[0], inAi[1], you, gapScore(1.3, inAi[0], inAi[1])));
  const days = pair("daysToAnswer");
  if (days && Math.abs(days[0] - days[1]) >= 2) found.push(vsBeside("reply", name, "daysToAnswer", days[0], days[1], you, 1.1));
  const posts = partOf(data, "posts");
  const inDates = numberIn(posts, "inDates") ?? 0;
  const before = numberIn(posts, "before") ?? 0;
  // Its posts in the last 30 days against the 30 before, said in a measure that names the 30 days.
  if (before > 0 && Math.abs(inDates - before) >= 2) found.push(vsMoved("posts", name, "postsLast30Days", inDates, before, 1.2));
  const photos = partOf(data, "photos");
  if (isNumber(photos.photos) && isNumber(photos.photosBefore)) found.push(changedOn("photos", name, "photos", photos.photos as number, photos.photosBefore as number, typeof photos.day === "string" ? photos.day : null, 1));
  const changed = partOf(data, "ratingChange");
  if (isNumber(changed.rating) && isNumber(changed.ratingBefore)) found.push(changedOn("ratingChange", name, "rating", changed.rating as number, changed.ratingBefore as number, typeof changed.day === "string" ? changed.day : null, 1.05));
  return found;
}

/** Joined into `VISIBILITY_OWN` (`own/visibility.ts`). */
export const VISIBILITY_LOCAL_OWN: Readonly<Record<string, { general: boolean; find: (data: Row) => OwnFound[] }>> = {
  "visibility.localProfile": { general: false, find: profileFindings },
  "visibility.localMaps": { general: false, find: mapsFindings },
  "visibility.localActivity": { general: false, find: activityFindings },
  "visibility.localListings": { general: false, find: listingsFindings },
  "visibility.localMarket": { general: false, find: nearbyFindings },
  "visibility.business": { general: false, find: businessFindings },
};
