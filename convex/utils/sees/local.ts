import { seen, toPage, toRecord, type Seen, type SeenPhrase, type SeenStep, type SeenTarget } from "../hakkenSees";

/**
 * What Hakken sees on the Local and Reviews screens (docs/plans/active/
 * discovery-detail-and-hakken-sees-plan.md §6, "Local" and "Reviews"): fixed
 * rules over each screen's own result, most important first.
 */

type Maybe<T> = T | null;

/** Google's map box: the top three on Maps. */
const MAP_BOX = 3;

/** Where a business's own screen opens: by its website, or by its Google profile. */
const businessOf = (host: string | null, listingId: string): SeenTarget =>
  toRecord("business", host ? host.toLowerCase().replace(/^www\./, "") : `listing:${listingId}`);

/** Where a profile's details are put right: the owner's side of Google's profiles. */
const PROFILE_MANAGER: SeenTarget = { url: "https://business.google.com/" };

type Listing = { listingId: string; name: string; websiteHost: string | null; rating: number | null; reviews: number | null; photos: number | null; category: string | null };

/** Local → Business profile: the map box, the rating against rivals, and the profile's details to put right. */
export function businessProfileSees(result: {
  office: null | {
    row: { rating: number | null };
    figures: { rivalsRating: number | null; mapBox: { inBox: number; of: number } };
    details: ReadonlyArray<{ detail: string; verdict: string }>;
  };
}): Seen {
  const office = result.office;
  if (!office) return seen([{ code: "noOffice" }], [{ code: "linkOffice", link: "yourListings", to: toPage("local/listings") }]);
  const fixes = office.details.filter((row) => row.verdict === "FIX");
  const { rating } = office.row;
  const { rivalsRating, mapBox } = office.figures;
  const says: Array<Maybe<SeenPhrase>> = [
    mapBox.of > 0 ? { code: "mapBox", a: mapBox.inBox, b: mapBox.of } : { code: "mapNotChecked" },
    rating !== null && rivalsRating !== null ? { code: rating < rivalsRating ? "ratingBehind" : "ratingAhead", a: rating, b: rivalsRating } : null,
    fixes.length > 0 ? { code: "toFix", a: fixes.length } : { code: "nothingToFix" },
  ];
  const steps: Array<Maybe<SeenStep>> = [
    // Each detail says what to put right in its own words.
    fixes[0] ? { code: `fix.${fixes[0].detail}`, link: "profileManager", to: PROFILE_MANAGER } : null,
    mapBox.of > 0 && mapBox.inBox < mapBox.of ? { code: "seeMap", link: "mapRankings", to: toPage("local/maps") } : null,
  ];
  return seen(says, steps);
}

/** Local → Every office: the map box across offices, the office furthest behind, and the one with most to put right. */
export function everyOfficeSees(result: {
  offices: ReadonlyArray<{ listingId: string; name: string; town: string | null; mapBox: { inBox: number; of: number }; toFix: number }>;
}): Seen {
  if (result.offices.length === 0) return seen([{ code: "noOffices" }], [{ code: "linkOffice", link: "yourListings", to: toPage("local/listings") }]);
  const inBox = result.offices.reduce((sum, office) => sum + office.mapBox.inBox, 0);
  const of = result.offices.reduce((sum, office) => sum + office.mapBox.of, 0);
  const named = (office: (typeof result.offices)[number]) => (office.town ? `${office.name}, ${office.town}` : office.name);
  const checked = result.offices.filter((office) => office.mapBox.of > 0).sort((left, right) => left.mapBox.inBox / left.mapBox.of - right.mapBox.inBox / right.mapBox.of);
  const behind = result.offices.length > 1 && checked.length > 1 && checked[0].mapBox.inBox / checked[0].mapBox.of < checked.at(-1)!.mapBox.inBox / checked.at(-1)!.mapBox.of ? checked[0] : null;
  const mostToFix = [...result.offices].sort((left, right) => right.toFix - left.toFix)[0];
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "offices", a: result.offices.length, b: inBox, c: of },
    behind ? { code: "furthestBehind", text: named(behind), a: behind.mapBox.inBox, b: behind.mapBox.of } : null,
    mostToFix.toFix > 0 ? { code: "mostToFix", text: named(mostToFix), a: mostToFix.toFix } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    behind ? { code: "seeOffice", text: named(behind), link: "seeOffice", to: toPage("local", { office: behind.listingId }) } : null,
    mostToFix.toFix > 0 && mostToFix !== behind ? { code: "fixOffice", text: named(mostToFix), link: "seeOffice", to: toPage("local", { office: mostToFix.listingId }) } : null,
  ];
  return seen(says, steps);
}

/** Local → Map rankings: searches in the map box, the biggest one below it, and who tops the map most. */
export function mapRankingsSees(result: {
  office: { listingId: string } | null;
  figures: { inBox: number; of: number; inBoxChange: number | null; topMost: { name: string; first: number; you: boolean } | null };
  rows: ReadonlyArray<{ keyword: string; volume: number | null; place: number | null }>;
}): Seen {
  if (!result.office) return seen([{ code: "noOffice" }], [{ code: "linkOffice", link: "yourListings", to: toPage("local/listings") }]);
  if (result.figures.of === 0) return seen([{ code: "notChecked" }]);
  const below = result.rows.filter((row) => row.place !== null && (row.place === 0 || row.place > MAP_BOX)).sort((left, right) => (right.volume ?? 0) - (left.volume ?? 0));
  const { topMost, inBoxChange } = result.figures;
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "inBox", a: result.figures.inBox, b: result.figures.of },
    below[0] ? { code: "belowBox", a: below.length, text: below[0].keyword } : null,
    topMost && !topMost.you ? { code: "topMost", text: topMost.name, a: topMost.first } : null,
    inBoxChange ? { code: inBoxChange > 0 ? "upCheck" : "downCheck", a: Math.abs(inBoxChange) } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    below[0] ? { code: "seeSearch", text: below[0].keyword, link: "seeMapSearch", to: toPage("local/maps/search", { keyword: below[0].keyword, office: result.office.listingId }) } : null,
  ];
  return seen(says, steps);
}

/** Local → one search on the map: your place, who is first, and what it has that you lack. */
export function mapSearchSees(result: {
  keyword: string;
  place: number;
  you: Listing | null;
  businesses: ReadonlyArray<Listing & { place: number; you: boolean }>;
}): Seen {
  const first = result.businesses.find((business) => business.place === 1 && !business.you) ?? null;
  const you = result.you;
  const lacks: Maybe<SeenPhrase> = !first ? null
    : (first.reviews ?? 0) > (you?.reviews ?? 0) ? { code: "moreReviews", text: first.name, a: first.reviews ?? 0, b: you?.reviews ?? 0 }
    : (first.photos ?? 0) > (you?.photos ?? 0) ? { code: "morePhotos", text: first.name, a: first.photos ?? 0, b: you?.photos ?? 0 }
    : first.category && you?.category && first.category !== you.category ? { code: "otherCategory", text: first.name, more: first.category }
    : null;
  const says: Array<Maybe<SeenPhrase>> = [
    result.place === 0 ? { code: "notOnMap" } : result.place <= MAP_BOX ? { code: "inBox", a: result.place } : { code: "belowBox", a: result.place },
    first ? { code: "firstIs", text: first.name } : null,
    lacks,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    first ? { code: "seeFirst", text: first.name, link: "seeBusiness", to: businessOf(first.websiteHost, first.listingId) } : null,
    lacks?.code === "otherCategory" ? { code: "checkCategory", more: lacks.more, link: "profileManager", to: PROFILE_MANAGER } : null,
  ];
  return seen(says, steps);
}

/** Local → Local market: businesses of your kind, how many out-review you, those in your map box you do not watch. */
export function localMarketSees(result: {
  km: number;
  day: string | null;
  total: number | null;
  rows: ReadonlyArray<Listing & { mapBox: number; you: boolean; watched: boolean }>;
}): Seen {
  if (result.day === null || result.rows.length === 0) return seen([{ code: "notRead" }]);
  const you = result.rows.find((row) => row.you) ?? null;
  const others = result.rows.filter((row) => !row.you);
  const outReview = others.filter((row) => (row.reviews ?? 0) > (you?.reviews ?? 0)).length;
  const unwatched = others.filter((row) => !row.watched && row.mapBox > 0).sort((left, right) => right.mapBox - left.mapBox || (right.reviews ?? 0) - (left.reviews ?? 0));
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "businesses", a: result.total ?? result.rows.length, b: result.km },
    outReview > 0 ? { code: "outReview", a: outReview } : { code: "mostReviews" },
    unwatched[0] ? { code: "unwatched", a: unwatched.length, text: unwatched[0].name } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    unwatched[0] ? { code: "lookAt", text: unwatched[0].name, link: "seeBusiness", to: businessOf(unwatched[0].websiteHost, unwatched[0].listingId) } : null,
  ];
  return seen(says, steps);
}

/** Local → Rival activity: rivals' posts against yours, offers running, and questions waiting on your profile. */
export function rivalActivitySees(result: {
  rivals: readonly unknown[];
  figures: { rivalPosts: number; yourPosts: number; offers: number; offerNames: readonly string[] };
  questions: ReadonlyArray<{ text: string; yours: boolean; answeredDay: string | null }>;
}): Seen {
  if (result.rivals.length === 0) return seen([{ code: "noRivals" }], [{ code: "findRivals", link: "localMarket", to: toPage("local/market") }]);
  const { rivalPosts, yourPosts, offers, offerNames } = result.figures;
  const waiting = result.questions.filter((question) => question.yours && question.answeredDay === null);
  const says: Array<Maybe<SeenPhrase>> = [
    waiting[0] ? { code: "questionsWaiting", a: waiting.length, text: waiting[0].text } : null,
    { code: "posts", a: rivalPosts, b: yourPosts },
    offers > 0 ? { code: "offers", a: offers, text: offerNames[0] ?? "" } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    waiting[0] ? { code: "answerQuestion", text: waiting[0].text, link: "profileManager", to: PROFILE_MANAGER } : null,
    rivalPosts > yourPosts ? { code: "postMore", link: "profileManager", to: PROFILE_MANAGER } : null,
  ];
  return seen(says, steps);
}

/** Local → Your listings: the profiles linked, and reviews elsewhere not counted until linked. */
export function localListingsSees(result: {
  on: boolean;
  ownSite: boolean;
  offices: ReadonlyArray<{ source: string }>;
  rivals: ReadonlyArray<{ listingId: string; websiteHost: string | null }>;
}): Seen {
  if (!result.ownSite) return seen([{ code: "notOwnSite" }]);
  if (!result.on) return seen([{ code: "off" }]);
  if (result.offices.length === 0) return seen([{ code: "noOffice" }]);
  // A rival business is one row however many of its profiles are linked, joined by its website.
  const rivals = new Set(result.rivals.map((row) => row.websiteHost ?? row.listingId)).size;
  const elsewhere = result.offices.some((office) => office.source !== "GOOGLE");
  return seen([
    { code: "linked", a: result.offices.filter((office) => office.source === "GOOGLE").length, b: rivals },
    elsewhere ? null : { code: "onlyGoogle" },
  ], [
    { code: "seeReviews", link: "yourReviews", to: toPage("reviews") },
  ]);
}

/** Reviews → Your reviews: those waiting and the oldest wait, the month's new reviews, and the days to answer. */
export function yourReviewsSees(result: {
  listings: readonly unknown[];
  figures: { newIn30: number; newBefore: number; waiting: number; oldestWaitingDays: number | null; daysToAnswer: number | null };
}): Seen {
  if (result.listings.length === 0) return seen([{ code: "noProfile" }], [{ code: "linkOffice", link: "yourListings", to: toPage("local/listings") }]);
  const { newIn30, newBefore, waiting, oldestWaitingDays, daysToAnswer } = result.figures;
  const says: Array<Maybe<SeenPhrase>> = [
    waiting > 0 ? { code: "waiting", a: waiting, b: oldestWaitingDays ?? 0 } : { code: "allAnswered" },
    newIn30 === 0 && newBefore === 0 ? { code: "noNewReviews" } : { code: "newReviews", a: newIn30, b: newBefore },
    daysToAnswer !== null ? { code: "daysToAnswer", a: daysToAnswer } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    waiting > 0 ? { code: "answerWaiting", a: waiting, link: "waitingReviews", to: toPage("reviews", { answered: "waiting" }) } : null,
    newIn30 < newBefore ? { code: "askForReviews", link: "againstRivals", to: toPage("reviews/rivals") } : null,
  ];
  return seen(says, steps);
}

/** Reviews → What customers say: the most praised and most complained about, and what rivals are praised for. */
export function customersSaySees(result: {
  read: number;
  topics: ReadonlyArray<{ topic: string; praise: number; complaints: number; rivalsPraised: number; topRival: { name: string } | null }>;
  drafts: readonly unknown[];
}): Seen {
  if (result.read === 0 || result.topics.length === 0) return seen([{ code: "notRead" }]);
  const praised = [...result.topics].sort((left, right) => right.praise - left.praise)[0];
  const complained = [...result.topics].filter((row) => row.complaints > 0).sort((left, right) => right.complaints - left.complaints)[0] ?? null;
  // Where rivals are praised and you are not, the widest gap first.
  const rivalsWin = [...result.topics].filter((row) => row.rivalsPraised > row.praise).sort((left, right) => right.rivalsPraised - right.praise - (left.rivalsPraised - left.praise))[0] ?? null;
  const says: Array<Maybe<SeenPhrase>> = [
    complained ? { code: "complaints", text: complained.topic, a: complained.complaints } : null,
    praised.praise > 0 ? { code: "praised", text: praised.topic, a: praised.praise } : null,
    rivalsWin ? { code: "rivalsPraised", text: rivalsWin.topic, a: rivalsWin.rivalsPraised } : null,
    result.drafts.length > 0 ? { code: "draftsReady", a: result.drafts.length } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    complained ? { code: "readComplaints", text: complained.topic, link: "seeReviews", to: toPage("reviews", { q: complained.topic }) } : null,
    rivalsWin?.topRival ? { code: "seeRival", text: rivalsWin.topRival.name, more: rivalsWin.topic, link: "againstRivals", to: toPage("reviews/rivals") } : null,
  ];
  return seen(says, steps);
}

/** Reviews → Against rivals: your place by reviews, the gap to the leader, and who answers faster. */
export function reviewsRivalsSees(result: {
  rows: ReadonlyArray<{ listingId: string; name: string; you: boolean; reviews: number | null; daysToAnswer: number | null }>;
}): Seen {
  const you = result.rows.find((row) => row.you);
  if (!you) return seen([{ code: "noProfile" }], [{ code: "linkOffice", link: "yourListings", to: toPage("local/listings") }]);
  const byReviews = [...result.rows].sort((left, right) => (right.reviews ?? 0) - (left.reviews ?? 0) || Number(right.you) - Number(left.you));
  const place = byReviews.indexOf(you) + 1;
  const leader = byReviews[0];
  const faster = result.rows
    .filter((row) => !row.you && row.daysToAnswer !== null && (you.daysToAnswer === null || row.daysToAnswer < you.daysToAnswer))
    .sort((left, right) => left.daysToAnswer! - right.daysToAnswer!)[0] ?? null;
  const says: Array<Maybe<SeenPhrase>> = [
    place === 1 ? { code: "lead", a: result.rows.length } : { code: "place", a: place, b: result.rows.length },
    leader.you ? null : { code: "gap", text: leader.name, a: (leader.reviews ?? 0) - (you.reviews ?? 0) },
    faster ? { code: "faster", text: faster.name, a: faster.daysToAnswer!, b: you.daysToAnswer ?? 0 } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    leader.you ? null : { code: "seeLeader", text: leader.name, link: "seeBusiness", to: businessOf(null, leader.listingId) },
    faster ? { code: "answerFaster", link: "waitingReviews", to: toPage("reviews", { answered: "waiting" }) } : null,
  ];
  return seen(says, steps);
}
