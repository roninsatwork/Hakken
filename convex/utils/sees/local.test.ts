import { describe, expect, test } from "vitest";
import { expectWords } from "@/src/test/seenWords";
import {
  businessProfileSees, customersSaySees, everyOfficeSees, localListingsSees, localMarketSees, mapRankingsSees, mapSearchSees,
  reviewsRivalsSees, rivalActivitySees, yourReviewsSees,
} from "./local";

/** What Hakken sees on the Local and Reviews screens (discovery-detail-and-hakken-sees-plan.md §6). */
const LINK_OFFICE = { code: "linkOffice", link: "yourListings", to: { segment: "local/listings" } };
const listing = (listingId: string, name: string, more: Partial<{ websiteHost: string; rating: number; reviews: number; photos: number; category: string }> = {}) =>
  ({ listingId, name, websiteHost: null, rating: null, reviews: null, photos: null, category: null, ...more });

describe("Business profile", () => {
  test("the map box, the rating against rivals, and the first detail to put right", () => {
    const box = businessProfileSees({
      office: {
        row: { rating: 4.6 },
        figures: { rivalsRating: 4.8, mapBox: { inBox: 3, of: 9 } },
        details: [{ detail: "CLAIMED", verdict: "GOOD" }, { detail: "HOURS", verdict: "FIX" }, { detail: "PHOTOS", verdict: "FIX" }],
      },
    });
    expect(box.says).toEqual([{ code: "mapBox", a: 3, b: 9 }, { code: "ratingBehind", a: 4.6, b: 4.8 }, { code: "toFix", a: 2 }]);
    expect(box.steps).toEqual([
      { code: "fix.HOURS", link: "profileManager", to: { url: "https://business.google.com/" } },
      { code: "seeMap", link: "mapRankings", to: { segment: "local/maps" } },
    ]);
    expectWords("localProfile", box);
  });

  test("every detail has its words; nothing to fix; no office", () => {
    for (const detail of ["CLAIMED", "CATEGORY", "OTHER_CATEGORIES", "DESCRIPTION", "ADDRESS", "WEBSITE", "HOURS", "BOOKING", "SERVICES", "PHOTOS", "REPLIES"]) {
      expectWords("localProfile", { says: [], steps: [{ code: `fix.${detail}`, link: "profileManager", to: { url: "https://business.google.com/" } }] });
    }
    const good = businessProfileSees({ office: { row: { rating: 4.9 }, figures: { rivalsRating: 4.5, mapBox: { inBox: 0, of: 0 } }, details: [] } });
    expect(good).toEqual({ says: [{ code: "mapNotChecked" }, { code: "ratingAhead", a: 4.9, b: 4.5 }, { code: "nothingToFix" }], steps: [] });
    expectWords("localProfile", good);
    const none = businessProfileSees({ office: null });
    expect(none).toEqual({ says: [{ code: "noOffice" }], steps: [LINK_OFFICE] });
    expectWords("localProfile", none);
  });
});

describe("Every office", () => {
  test("the map box across offices, the office furthest behind, and the one with most to fix", () => {
    const box = everyOfficeSees({
      offices: [
        { listingId: "a", name: "Ronins", town: "Guildford", mapBox: { inBox: 4, of: 5 }, toFix: 1 },
        { listingId: "b", name: "Ronins", town: "Woking", mapBox: { inBox: 1, of: 5 }, toFix: 0 },
        { listingId: "c", name: "Ronins", town: null, mapBox: { inBox: 2, of: 4 }, toFix: 3 },
      ],
    });
    expect(box.says).toEqual([
      { code: "offices", a: 3, b: 7, c: 14 },
      { code: "furthestBehind", text: "Ronins, Woking", a: 1, b: 5 },
      { code: "mostToFix", text: "Ronins", a: 3 },
    ]);
    expect(box.steps).toEqual([
      { code: "seeOffice", text: "Ronins, Woking", link: "seeOffice", to: { segment: "local", filters: { office: "b" } } },
      { code: "fixOffice", text: "Ronins", link: "seeOffice", to: { segment: "local", filters: { office: "c" } } },
    ]);
    expectWords("localOffices", box);
  });

  test("one office with nothing to fix; none linked", () => {
    const one = everyOfficeSees({ offices: [{ listingId: "a", name: "Ronins", town: null, mapBox: { inBox: 2, of: 3 }, toFix: 0 }] });
    expect(one).toEqual({ says: [{ code: "offices", a: 1, b: 2, c: 3 }], steps: [] });
    expectWords("localOffices", one);
    const none = everyOfficeSees({ offices: [] });
    expect(none.says).toEqual([{ code: "noOffices" }]);
    expectWords("localOffices", none);
  });
});

describe("Map rankings", () => {
  test("in the box, the biggest search below it, who tops the map, and the change", () => {
    const box = mapRankingsSees({
      office: { listingId: "a" },
      figures: { inBox: 2, of: 5, inBoxChange: -1, topMost: { name: "Brightside", first: 3, you: false } },
      rows: [
        { keyword: "web design guildford", volume: 300, place: 2 },
        { keyword: "web designer near me", volume: 900, place: 6 },
        { keyword: "website agency", volume: 400, place: 0 },
        { keyword: "not checked", volume: 5000, place: null },
      ],
    });
    expect(box.says).toEqual([{ code: "inBox", a: 2, b: 5 }, { code: "belowBox", a: 2, text: "web designer near me" }, { code: "topMost", text: "Brightside", a: 3 }]);
    expect(box.steps).toEqual([{ code: "seeSearch", text: "web designer near me", link: "seeMapSearch", to: { segment: "local/maps/search", filters: { keyword: "web designer near me", office: "a" } } }]);
    expectWords("localMaps", box);
  });

  test("top of the map everywhere; not checked; no office", () => {
    const top = mapRankingsSees({ office: { listingId: "a" }, figures: { inBox: 2, of: 2, inBoxChange: 1, topMost: { name: "Ronins", first: 2, you: true } }, rows: [{ keyword: "x", volume: 1, place: 1 }] });
    expect(top).toEqual({ says: [{ code: "inBox", a: 2, b: 2 }, { code: "upCheck", a: 1 }], steps: [] });
    expectWords("localMaps", top);
    expect(mapRankingsSees({ office: { listingId: "a" }, figures: { inBox: 0, of: 0, inBoxChange: null, topMost: null }, rows: [] }).says).toEqual([{ code: "notChecked" }]);
    const none = mapRankingsSees({ office: null, figures: { inBox: 0, of: 0, inBoxChange: null, topMost: null }, rows: [] });
    expect(none).toEqual({ says: [{ code: "noOffice" }], steps: [LINK_OFFICE] });
    expectWords("localMaps", none);
  });
});

describe("One search on the map", () => {
  const you = listing("a", "Ronins", { reviews: 64, photos: 30, category: "Website designer" });

  test("below the box: who is first and what it has that you lack", () => {
    const box = mapSearchSees({
      keyword: "web designer near me",
      place: 5,
      you,
      businesses: [{ ...listing("b", "Brightside", { websiteHost: "www.brightside.co.uk", reviews: 212 }), place: 1, you: false }, { ...you, place: 5, you: true }],
    });
    expect(box.says).toEqual([{ code: "belowBox", a: 5 }, { code: "firstIs", text: "Brightside" }, { code: "moreReviews", text: "Brightside", a: 212, b: 64 }]);
    expect(box.steps).toEqual([{ code: "seeFirst", text: "Brightside", link: "seeBusiness", to: { record: "business", key: "brightside.co.uk" } }]);
    expectWords("localMapSearch", box);
  });

  test("more photos, another category, in the box, off the map", () => {
    const photos = mapSearchSees({ keyword: "k", place: 2, you, businesses: [{ ...listing("b", "Hilltop", { reviews: 10, photos: 80 }), place: 1, you: false }] });
    expect(photos.says).toEqual([{ code: "inBox", a: 2 }, { code: "firstIs", text: "Hilltop" }, { code: "morePhotos", text: "Hilltop", a: 80, b: 30 }]);
    expect(photos.steps).toEqual([{ code: "seeFirst", text: "Hilltop", link: "seeBusiness", to: { record: "business", key: "listing:b" } }]);
    expectWords("localMapSearch", photos);
    const category = mapSearchSees({ keyword: "k", place: 0, you, businesses: [{ ...listing("b", "Hilltop", { reviews: 1, photos: 1, category: "Marketing agency" }), place: 1, you: false }] });
    expect(category.says).toEqual([{ code: "notOnMap" }, { code: "firstIs", text: "Hilltop" }, { code: "otherCategory", text: "Hilltop", more: "Marketing agency" }]);
    expect(category.steps[1]).toEqual({ code: "checkCategory", more: "Marketing agency", link: "profileManager", to: { url: "https://business.google.com/" } });
    expectWords("localMapSearch", category);
    const first = mapSearchSees({ keyword: "k", place: 1, you, businesses: [{ ...you, place: 1, you: true }] });
    expect(first).toEqual({ says: [{ code: "inBox", a: 1 }], steps: [] });
  });
});

describe("Local market", () => {
  const row = (name: string, reviews: number, mapBox: number, you = false, watched = false) => ({ ...listing(name, name, { reviews }), mapBox, you, watched });

  test("businesses of your kind, how many out-review you, those in your map box you do not watch", () => {
    const box = localMarketSees({
      km: 10, day: "2026-10-01", total: 48,
      rows: [row("Ronins", 64, 3, true), row("Brightside", 212, 2, false, true), row("Hilltop", 90, 1), row("Pixel", 20, 2)],
    });
    expect(box.says).toEqual([{ code: "businesses", a: 48, b: 10 }, { code: "outReview", a: 2 }, { code: "unwatched", a: 2, text: "Pixel" }]);
    expect(box.steps).toEqual([{ code: "lookAt", text: "Pixel", link: "seeBusiness", to: { record: "business", key: "listing:Pixel" } }]);
    expectWords("localMarket", box);
  });

  test("the most reviews and every rival watched; not read", () => {
    const box = localMarketSees({ km: 5, day: "2026-10-01", total: null, rows: [row("Ronins", 64, 3, true), row("Brightside", 12, 2, false, true)] });
    expect(box).toEqual({ says: [{ code: "businesses", a: 2, b: 5 }, { code: "mostReviews" }], steps: [] });
    expectWords("localMarket", box);
    expect(localMarketSees({ km: 5, day: null, total: null, rows: [] }).says).toEqual([{ code: "notRead" }]);
  });
});

describe("Rival activity", () => {
  test("questions waiting on your profile, posts against yours, offers running", () => {
    const box = rivalActivitySees({
      rivals: [{}],
      figures: { rivalPosts: 9, yourPosts: 1, offers: 2, offerNames: ["10% off websites"] },
      questions: [{ text: "Do you build Shopify sites?", yours: true, answeredDay: null }, { text: "Theirs", yours: false, answeredDay: null }],
    });
    expect(box.says).toEqual([{ code: "questionsWaiting", a: 1, text: "Do you build Shopify sites?" }, { code: "posts", a: 9, b: 1 }, { code: "offers", a: 2, text: "10% off websites" }]);
    expect(box.steps).toEqual([
      { code: "answerQuestion", text: "Do you build Shopify sites?", link: "profileManager", to: { url: "https://business.google.com/" } },
      { code: "postMore", link: "profileManager", to: { url: "https://business.google.com/" } },
    ]);
    expectWords("localActivity", box);
  });

  test("quiet rivals; no rival watched", () => {
    const quiet = rivalActivitySees({ rivals: [{}], figures: { rivalPosts: 0, yourPosts: 2, offers: 0, offerNames: [] }, questions: [] });
    expect(quiet).toEqual({ says: [{ code: "posts", a: 0, b: 2 }], steps: [] });
    expectWords("localActivity", quiet);
    const none = rivalActivitySees({ rivals: [], figures: { rivalPosts: 0, yourPosts: 0, offers: 0, offerNames: [] }, questions: [] });
    expect(none).toEqual({ says: [{ code: "noRivals" }], steps: [{ code: "findRivals", link: "localMarket", to: { segment: "local/market" } }] });
    expectWords("localActivity", none);
  });
});

describe("Your listings", () => {
  test("the profiles linked, one rival a business, and reviews elsewhere not yet counted", () => {
    const box = localListingsSees({
      on: true, ownSite: true,
      offices: [{ source: "GOOGLE" }, { source: "GOOGLE" }],
      rivals: [{ listingId: "r1", websiteHost: "brightside.co.uk" }, { listingId: "r2", websiteHost: "brightside.co.uk" }, { listingId: "r3", websiteHost: null }],
    });
    expect(box).toEqual({
      says: [{ code: "linked", a: 2, b: 2 }, { code: "onlyGoogle" }],
      steps: [{ code: "seeReviews", link: "yourReviews", to: { segment: "reviews" } }],
    });
    expectWords("localListings", box);
  });

  test("linked elsewhere too; no office; Local off; a competitor's website", () => {
    expect(localListingsSees({ on: true, ownSite: true, offices: [{ source: "GOOGLE" }, { source: "TRUSTPILOT" }], rivals: [] }).says).toEqual([{ code: "linked", a: 1, b: 0 }]);
    for (const [result, code] of [
      [{ on: true, ownSite: true, offices: [], rivals: [] }, "noOffice"],
      [{ on: false, ownSite: true, offices: [], rivals: [] }, "off"],
      [{ on: false, ownSite: false, offices: [], rivals: [] }, "notOwnSite"],
    ] as const) {
      const box = localListingsSees(result);
      expect(box).toEqual({ says: [{ code }], steps: [] });
      expectWords("localListings", box);
    }
  });
});

describe("Your reviews", () => {
  test("waiting and the oldest wait, the month's new reviews, the days to answer", () => {
    const box = yourReviewsSees({ listings: [{}], figures: { newIn30: 3, newBefore: 7, waiting: 4, oldestWaitingDays: 21, daysToAnswer: 6 } });
    expect(box.says).toEqual([{ code: "waiting", a: 4, b: 21 }, { code: "newReviews", a: 3, b: 7 }, { code: "daysToAnswer", a: 6 }]);
    expect(box.steps).toEqual([
      { code: "answerWaiting", a: 4, link: "waitingReviews", to: { segment: "reviews", filters: { answered: "waiting" } } },
      { code: "askForReviews", link: "againstRivals", to: { segment: "reviews/rivals" } },
    ]);
    expectWords("reviews", box);
  });

  test("every review answered; no profile", () => {
    const box = yourReviewsSees({ listings: [{}], figures: { newIn30: 5, newBefore: 2, waiting: 0, oldestWaitingDays: null, daysToAnswer: null } });
    expect(box).toEqual({ says: [{ code: "allAnswered" }, { code: "newReviews", a: 5, b: 2 }], steps: [] });
    expectWords("reviews", box);
    const quiet = yourReviewsSees({ listings: [{}], figures: { newIn30: 0, newBefore: 0, waiting: 0, oldestWaitingDays: null, daysToAnswer: null } });
    expect(quiet.says).toEqual([{ code: "allAnswered" }, { code: "noNewReviews" }]);
    expectWords("reviews", quiet);
    const none = yourReviewsSees({ listings: [], figures: { newIn30: 0, newBefore: 0, waiting: 0, oldestWaitingDays: null, daysToAnswer: null } });
    expect(none).toEqual({ says: [{ code: "noProfile" }], steps: [LINK_OFFICE] });
    expectWords("reviews", none);
  });
});

describe("What customers say", () => {
  test("the most complained about, the most praised, what rivals are praised for, drafts ready", () => {
    const box = customersSaySees({
      read: 120,
      topics: [
        { topic: "communication", praise: 30, complaints: 2, rivalsPraised: 10, topRival: null },
        { topic: "price", praise: 4, complaints: 6, rivalsPraised: 18, topRival: { name: "Brightside" } },
      ],
      drafts: [{}, {}],
    });
    expect(box.says).toEqual([{ code: "complaints", text: "price", a: 6 }, { code: "praised", text: "communication", a: 30 }, { code: "rivalsPraised", text: "price", a: 18 }]);
    expect(box.steps).toEqual([
      { code: "readComplaints", text: "price", link: "seeReviews", to: { segment: "reviews", filters: { q: "price" } } },
      { code: "seeRival", text: "Brightside", more: "price", link: "againstRivals", to: { segment: "reviews/rivals" } },
    ]);
    expectWords("reviewsSay", box);
  });

  test("only praise and drafts; nothing read", () => {
    const box = customersSaySees({ read: 10, topics: [{ topic: "speed", praise: 5, complaints: 0, rivalsPraised: 1, topRival: null }], drafts: [{}] });
    expect(box).toEqual({ says: [{ code: "praised", text: "speed", a: 5 }, { code: "draftsReady", a: 1 }], steps: [] });
    expectWords("reviewsSay", box);
    expect(customersSaySees({ read: 0, topics: [], drafts: [] }).says).toEqual([{ code: "notRead" }]);
  });
});

describe("Against rivals", () => {
  const row = (listingId: string, name: string, reviews: number, daysToAnswer: number | null, you = false) => ({ listingId, name, you, reviews, daysToAnswer });

  test("your place by reviews, the gap to the leader, and who answers faster", () => {
    const box = reviewsRivalsSees({ rows: [row("a", "Ronins", 64, 6, true), row("b", "Brightside", 212, 1), row("c", "Hilltop", 30, 3)] });
    expect(box.says).toEqual([{ code: "place", a: 2, b: 3 }, { code: "gap", text: "Brightside", a: 148 }, { code: "faster", text: "Brightside", a: 1, b: 6 }]);
    expect(box.steps).toEqual([
      { code: "seeLeader", text: "Brightside", link: "seeBusiness", to: { record: "business", key: "listing:b" } },
      { code: "answerFaster", link: "waitingReviews", to: { segment: "reviews", filters: { answered: "waiting" } } },
    ]);
    expectWords("reviewsRivals", box);
  });

  test("leading, level counts as leading; no profile", () => {
    const box = reviewsRivalsSees({ rows: [row("b", "Brightside", 64, 9), row("a", "Ronins", 64, 1, true)] });
    expect(box).toEqual({ says: [{ code: "lead", a: 2 }], steps: [] });
    expectWords("reviewsRivals", box);
    const none = reviewsRivalsSees({ rows: [] });
    expect(none).toEqual({ says: [{ code: "noProfile" }], steps: [LINK_OFFICE] });
    expectWords("reviewsRivals", none);
  });
});
