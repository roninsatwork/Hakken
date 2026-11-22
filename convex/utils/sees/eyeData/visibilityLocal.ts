/**
 * What Local's screens hand the eye (visibility-16-eyes, 22 November 2026): Business profile, Google Maps, Rivals'
 * activity, Listings, Local market and one business. Built here once, so each screen, a chat app's question
 * (`chatAppEyes/visibility.ts`) and the every-period test (`convex/utils/sees/visibilityRestPeriods.test.ts`) hand the
 * rules (`own/visibilityLocal.ts`) the same figures. Every name is the reader's own: a business's, a search's, or words
 * from the screen's translations (English from `messages/en.json` on the server). Each screen but Rivals' activity shows
 * the newest check, whatever the dates, so its figures are yours beside your rivals', never a span against the one before.
 */

type Said = { code: string; a?: number; b?: number; c?: number; text?: string };
type Box = { says?: ReadonlyArray<Said> } | null | undefined;
type Span = { from: string; to: string };

const said = (box: Box, code: string) => box?.says?.find((one) => one.code === code);
const inSpan = (day: string, span: Span) => day >= span.from && day <= span.to;
const DAY_MS = 86_400_000;
const daysBetween = (from: string, to: string) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS));
/** The day a year before another, as a span's start: 2026-10-31 → 2025-11-01. */
function yearBefore(day: string): string {
  const at = new Date(`${day}T00:00:00Z`);
  at.setUTCFullYear(at.getUTCFullYear() - 1);
  at.setUTCDate(at.getUTCDate() + 1);
  return at.toISOString().slice(0, 10);
}
/** What a business posts on its Google profile: a post, an offer, an event. */
const POSTED = new Set(["POST", "OFFER", "EVENT"]);

// --- Business profile (`local`) ---

type ProfileDetail = { detail: string; verdict: string; count: number | null; of: number | null; average: number | null };
type ProfileAnswer = {
  office: {
    row: { name: string; rating: number | null; reviews: number | null; photos: number | null };
    details: readonly ProfileDetail[];
    figures: { mapBox: { inBox: number; of: number } | null; reviewsGained: number | null; rivalsPhotos: number | null; rivalsRating: number | null };
    topics: ReadonlyArray<{ topic: string; reviews: number; stars: number | null }>;
    alsoLookAt: ReadonlyArray<{ name: string; you: boolean; rating: number | null; reviews: number | null; photos: number | null; mapBox: number | null }>;
  } | null;
};

/**
 * Business profile: your office's rating, reviews and photos beside your rivals' averages, the map box searches, the
 * reviews answered, the details to put right by name, what reviews talk about, and the businesses people also look at.
 */
export function profileSees(answer: ProfileAnswer | null | undefined, detailName: (detail: string) => string, names: { searchesChecked: string; rivalsAverage: string; reviewsAnswered: string; detailsToFix: string }) {
  const office = answer?.office;
  if (!office) return undefined;
  const replies = office.details.find((one) => one.detail === "REPLIES");
  const toFix = office.details.filter((one) => one.verdict === "FIX");
  return {
    office: {
      name: office.row.name,
      rating: office.row.rating, reviews: office.row.reviews, photos: office.row.photos,
      inMapBox: office.figures.mapBox?.inBox ?? null, searchesChecked: office.figures.mapBox?.of ?? null,
      rivalsRating: office.figures.rivalsRating, rivalsPhotos: office.figures.rivalsPhotos,
      answered: replies?.count ?? null, answerable: replies?.of ?? null,
      toFix: toFix.length, details: office.details.length,
      newReviews: office.figures.reviewsGained,
    },
    toFix: toFix.map((one) => ({ name: detailName(one.detail) })),
    topics: office.topics.map((one) => ({ name: one.topic, reviews: one.reviews, rating: one.stars === null ? null : Math.round(one.stars * 10) / 10 })),
    alsoLookAt: office.alsoLookAt.filter((one) => !one.you).map((one) => ({ name: one.name, rating: one.rating, reviews: one.reviews, photos: one.photos, inMapBox: one.mapBox ?? 0 })),
    names,
  };
}

// --- Google Maps (`local/maps`) ---

type MapsAnswer = {
  depth: number;
  figures: { inBox: number; inBoxChange: number | null; notOnMap: number; of: number; onMap: number; averagePlace: number | null; topMost: { first: number; name: string; you: boolean } | null } | null;
  office: { name: string } | null;
  rows: ReadonlyArray<{ keyword: string; volume: number | null; place: number | null; googlePosition: number | null; top: string | null; topIsYou: boolean; change: number | null }>;
};

/**
 * Google Maps: your office in the map box, below it or off the map for the searches checked, each search with its place
 * on the map and on Google's results, and the businesses topping the map, by how many searches each tops.
 */
export function mapsSees(answer: MapsAnswer | null | undefined, names: { searchesChecked: string }) {
  if (!answer?.figures || !answer.office) return undefined;
  const leaders = new Map<string, number>();
  for (const row of answer.rows) if (row.top && !row.topIsYou) leaders.set(row.top, (leaders.get(row.top) ?? 0) + 1);
  return {
    map: {
      office: answer.office.name,
      inMapBox: answer.figures.inBox, onMapBelow: answer.figures.onMap, offMap: answer.figures.notOnMap, searchesChecked: answer.figures.of,
      depth: answer.depth, inMapBoxChange: answer.figures.inBoxChange, averagePlace: answer.figures.averagePlace,
    },
    searches: [...answer.rows]
      .sort((left, right) => (right.volume ?? 0) - (left.volume ?? 0))
      .map((row) => ({ name: row.keyword, volume: row.volume, placeOnMap: row.place && row.place > 0 ? row.place : null, placeOnGoogle: row.googlePosition, topOfMap: row.top, youTop: row.topIsYou ? 1 : 0 })),
    leaders: [...leaders.entries()].map(([name, mapFirsts]) => ({ name, mapFirsts })).sort((left, right) => right.mapFirsts - left.mapFirsts),
    names,
  };
}

// --- Rivals' activity (`local/activity`) ---

type ActivityAnswer = {
  rivals: ReadonlyArray<{ listingId: string; name: string }>;
  figures: { rivalPosts: number; yourPosts: number; offers: number; profileChanges: number; openQuestions: number };
  lines: ReadonlyArray<{ day: string; listingId: string; name: string; kind: string; from: number | null; to: number | null }>;
  span?: Span;
  before?: Span;
};

/**
 * Rivals' activity, the one Local screen whose figures follow the dates: your rivals' posts and yours in them, theirs in
 * the same span before, each rival's posts in them, before them and in the 12 months to their end, the days since each
 * last posted, and the photos and ratings that changed in them.
 */
export function activitySees(answer: ActivityAnswer | null | undefined, names: { yourRivals: string; you: string }) {
  if (!answer?.span || !answer.before) return undefined;
  const span = answer.span;
  const before = answer.before;
  const year = { from: yearBefore(span.to), to: span.to };
  const rivals = answer.rivals.map((rival) => {
    const posted = answer.lines.filter((line) => line.listingId === rival.listingId && POSTED.has(line.kind) && line.day <= span.to);
    const last = posted.reduce<string | null>((newest, line) => (newest === null || line.day > newest ? line.day : newest), null);
    return {
      name: rival.name,
      posts: posted.filter((line) => inSpan(line.day, span)).length,
      postsBefore: posted.filter((line) => inSpan(line.day, before)).length,
      postsInAYear: posted.filter((line) => inSpan(line.day, year)).length,
      daysSincePost: last === null ? null : daysBetween(last, span.to),
      lastPost: last,
    };
  });
  const changed = answer.lines.filter((line) => inSpan(line.day, span) && (line.kind === "PHOTOS_ADDED" || line.kind === "RATING_CHANGE") && line.from !== null && line.to !== null);
  return {
    posts: {
      rivals: answer.figures.rivalPosts, you: answer.figures.yourPosts,
      rivalsBefore: rivals.reduce((sum, rival) => sum + rival.postsBefore, 0),
      offers: answer.figures.offers, profileChanges: answer.figures.profileChanges, openQuestions: answer.figures.openQuestions,
      from: span.from, to: span.to, beforeFrom: before.from, beforeTo: before.to, yearFrom: year.from,
    },
    rivals: rivals.sort((left, right) => right.posts - left.posts || right.postsInAYear - left.postsInAYear),
    changes: changed.map((line) => (line.kind === "PHOTOS_ADDED"
      ? { name: line.name, day: line.day, photos: line.to, photosBefore: line.from }
      : { name: line.name, day: line.day, rating: line.to, ratingBefore: line.from })),
    names,
  };
}

// --- Listings (`local/listings`) ---

type Listing = { name: string; town?: string | null; rating: number | null; reviews: number | null; photos: number | null };

/** Listings: your offices and the rivals you watch, each with its rating, reviews and photos, and your offices summed. */
export function listingsSees(answer: { offices: readonly Listing[]; rivals: readonly Listing[] } | null | undefined, names: { yourOffices: string; rivalsAhead: string }) {
  if (!answer || answer.offices.length === 0) return undefined;
  // Two offices of one name are told apart by their towns, as the screen's rows show them.
  const shared = new Set(answer.offices.map((office) => office.name).filter((name, at, all) => all.indexOf(name) !== at));
  const officeName = (office: Listing) => (shared.has(office.name) && office.town ? `${office.name}, ${office.town}` : office.name);
  return {
    offices: answer.offices.map((office) => ({ name: officeName(office), rating: office.rating, reviews: office.reviews, photos: office.photos })),
    rivals: answer.rivals.map((rival) => ({ name: rival.name, rating: rival.rating, reviews: rival.reviews, photos: rival.photos })),
    yours: { name: names.yourOffices, offices: answer.offices.length, reviews: answer.offices.reduce((sum, office) => sum + (office.reviews ?? 0), 0) },
    names,
  };
}

// --- Local market (`local/market`) ---

type MarketRow = { name: string; you: boolean; watched: boolean; mapBox: number | null; metres: number | null; rating: number | null; reviews: number | null; photos: number | null };

/**
 * Local market: the businesses of your kind nearby and how many have more reviews than you (the box's counts, over them
 * all), your own figures, those in the map box, those with the most reviews, and the nearest few.
 */
export function nearbySees(answer: { km: number; total: number | null; rows: readonly MarketRow[]; seen?: Box } | null | undefined, names: { moreReviewsNearby: string }) {
  if (!answer) return undefined;
  const you = answer.rows.find((row) => row.you);
  if (!you) return undefined;
  const others = answer.rows.filter((row) => !row.you);
  const row = (one: MarketRow) => ({ name: one.name, metres: one.metres, reviews: one.reviews, rating: one.rating, photos: one.photos, inMapBox: one.mapBox && one.mapBox > 0 ? 1 : 0, watched: one.watched ? 1 : 0 });
  return {
    market: {
      businessesNearby: said(answer.seen, "businesses")?.a ?? answer.total ?? answer.rows.length, km: answer.km,
      moreReviews: said(answer.seen, "outReview")?.a ?? others.filter((one) => (one.reviews ?? 0) > (you.reviews ?? 0)).length,
    },
    you: { name: you.name, reviews: you.reviews, rating: you.rating, photos: you.photos, inMapBox: you.mapBox && you.mapBox > 0 ? 1 : 0 },
    inMapBox: others.filter((one) => (one.mapBox ?? 0) > 0).sort((left, right) => (left.metres ?? Infinity) - (right.metres ?? Infinity)).map(row),
    mostReviewed: [...others].sort((left, right) => (right.reviews ?? 0) - (left.reviews ?? 0)).slice(0, 5).map(row),
    nearest: others.slice(0, 10).map(row),
    names,
  };
}

// --- One business (`local/market/business`) ---

type BusinessAnswer = {
  found: boolean; name: string; km: number | null;
  figures: { reviews: number | null; reviewsYou: number | null; rating: number | null; ratingYou: number | null; named: number | null; namedYou: number | null; daysToAnswer: number | null; daysToAnswerYou: number | null };
  map: ReadonlyArray<{ search: string; volume: number | null; it: number | null; you: number | null }>;
  posts: ReadonlyArray<{ day: string; kind: string; from: number | null; to: number | null }>;
};

/** Days a business's posts are counted over, to today, and the same span before: its screen has no date menu. */
const POSTS_SPAN_DAYS = 30;
const dayBefore = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) - days * DAY_MS).toISOString().slice(0, 10);

/**
 * One business: its reviews, rating, AI answers and days to answer beside yours, the map searches with its place and
 * yours, its posts in the last 30 days to `today`, the 30 before and in all, and its newest change of photos or rating.
 * Its screen has no date menu, so its posts are counted to today, never over dates chosen elsewhere.
 */
export function businessSees(answer: BusinessAnswer | null | undefined, today: string, names: { you: string }) {
  if (!answer?.found) return undefined;
  const dates = { from: dayBefore(today, POSTS_SPAN_DAYS - 1), to: today, before: { from: dayBefore(today, 2 * POSTS_SPAN_DAYS - 1), to: dayBefore(today, POSTS_SPAN_DAYS) } };
  const posted = answer.posts.filter((post) => POSTED.has(post.kind));
  const newest = (kind: string) => answer.posts.filter((post) => post.kind === kind && post.from !== null && post.to !== null).sort((left, right) => right.day.localeCompare(left.day))[0];
  const photos = newest("PHOTOS_ADDED");
  const rating = newest("RATING_CHANGE");
  return {
    business: {
      name: answer.name, you: names.you, km: answer.km,
      reviews: answer.figures.reviews, reviewsYou: answer.figures.reviewsYou,
      rating: answer.figures.rating, ratingYou: answer.figures.ratingYou,
      named: answer.figures.named, namedYou: answer.figures.namedYou,
      daysToAnswer: answer.figures.daysToAnswer, daysToAnswerYou: answer.figures.daysToAnswerYou,
    },
    map: [...answer.map].sort((left, right) => (right.volume ?? 0) - (left.volume ?? 0)).map((row) => ({ name: row.search, volume: row.volume, itsPlace: row.it, yourPlace: row.you })),
    posts: {
      inDates: posted.filter((post) => inSpan(post.day, dates)).length,
      before: posted.filter((post) => inSpan(post.day, dates.before)).length,
      held: posted.length,
      from: dates.from, to: dates.to,
      ...(posted[0] ? { first: posted.reduce((first, post) => (post.day < first ? post.day : first), posted[0].day) } : {}),
    },
    ...(photos ? { photos: { day: photos.day, photos: photos.to, photosBefore: photos.from } } : {}),
    ...(rating ? { ratingChange: { day: rating.day, rating: rating.to, ratingBefore: rating.from } } : {}),
  };
}
