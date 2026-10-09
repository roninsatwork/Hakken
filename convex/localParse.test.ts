import { describe, expect, test } from "vitest";
import {
  hostOfWebsite,
  mapPointOf,
  metresBetween,
  parseBusinessList,
  parseBusinessProfile,
  parseMapCheck,
  parsePosts,
  parseTripadvisorSearch,
  parseTrustpilotSearch,
  totalOf,
} from "./localParse";

/**
 * The Local readers against answers shaped as the ones bought on 2026-10-09
 * (discovery-local-reputation-ai-plan.md §6A), cut to the fields read.
 */

const profileItem = {
  type: "google_business_info",
  title: "Ronins",
  description: "We help ambitious businesses find better ways to grow.",
  category: "Web Designer",
  category_ids: ["website_designer", "branding_agency"],
  additional_categories: ["Branding agency"],
  cid: "17195342752822652591",
  address: "Parallel House, 32 London Rd, Guildford GU1 2AB",
  address_info: { city: "Guildford", zip: "GU1 2AB", country_code: "GB" },
  phone: "+441483000000",
  url: "https://www.ronins.co.uk/",
  domain: "www.ronins.co.uk",
  book_online_url: null,
  total_photos: 5,
  latitude: 51.238755499999996,
  longitude: -0.5647509,
  is_claimed: true,
  attributes: { available_attributes: { service_options: ["offers_online_appointments"] }, unavailable_attributes: null },
  place_topics: { team: 3, creativity: 4 },
  rating: { rating_type: "Max5", value: 4.9, votes_count: 15 },
  rating_distribution: { 1: 0, 2: 0, 3: 0, 4: 2, 5: 13 },
  people_also_search: [{ cid: "604265913201481435", title: "Orangery", rating: { value: 5, votes_count: 12 } }],
  work_time: { work_hours: { timetable: {
    monday: [{ open: { hour: 9, minute: 0 }, close: { hour: 18, minute: 0 } }],
    tuesday: [{ open: { hour: 9, minute: 0 }, close: { hour: 18, minute: 0 } }],
    wednesday: [{ open: { hour: 9, minute: 0 }, close: { hour: 18, minute: 0 } }],
    thursday: [{ open: { hour: 9, minute: 0 }, close: { hour: 18, minute: 0 } }],
    friday: [{ open: { hour: 9, minute: 0 }, close: { hour: 17, minute: 30 } }],
    saturday: null,
    sunday: null,
  } } },
  services: [{ category: "Web Designer", title: "Website design", snippet: null, price: null }],
};

describe("a Google business", () => {
  test("a profile read whole keeps what the profile screens compare", () => {
    const listing = parseBusinessProfile([{ items: [profileItem] }])!;
    expect(listing).toMatchObject({
      source: "GOOGLE",
      key: "17195342752822652591",
      name: "Ronins",
      town: "Guildford",
      point: "51.23876,-0.56475",
      category: "Web Designer",
      categoryIds: ["website_designer", "branding_agency"],
      websiteHost: "ronins.co.uk",
      claimed: true,
      rating: 4.9,
      reviews: 15,
      photos: 5,
    });
    expect(listing.profile).toEqual({
      description: "We help ambitious businesses find better ways to grow.",
      categories: ["Branding agency"],
      hours: ["09:00–18:00", "09:00–18:00", "09:00–18:00", "09:00–18:00", "09:00–17:30", "Closed", "Closed"],
      services: [{ name: "Website design" }],
      attributes: ["offers_online_appointments"],
      topics: [{ topic: "creativity", reviews: 4 }, { topic: "team", reviews: 3 }],
      alsoSearched: [{ key: "604265913201481435", name: "Orangery", rating: 5, reviews: 12 }],
      starCounts: [0, 0, 0, 2, 13],
    });
  });

  test("a found list keeps each business's profile, and says how many the supplier holds", () => {
    const result = [{ total_count: 165, items: [{ ...profileItem, type: "business_listing" }, { type: "business_listing", title: "No number" }] }];
    expect(parseBusinessList(result).map((listing) => listing.key)).toEqual(["17195342752822652591"]);
    expect(totalOf(result)).toBe(165);
  });

  test("a map check keeps Google's order and its reason under each business", () => {
    const check = parseMapCheck([{ items: [
      { type: "maps_search", title: "Up There Digital", cid: "1", domain: "www.uptheredigital.com", rating: { value: 5, votes_count: 13 }, local_justifications: [{ type: "user_review", text: "\"A great team\"" }] },
      { type: "maps_paid_item", title: "An advert", cid: "9" },
      { type: "maps_search", title: "Ronins", cid: "17195342752822652591" },
    ] }]);
    expect(check.businesses.map((business) => business.name)).toEqual(["Up There Digital", "Ronins"]);
    expect(check.reasons).toEqual(["\"A great team\"", undefined]);
    expect(check.businesses[0].profile).toBeUndefined();
  });
});

test("posts come newest first, each kind named and its words cut short", () => {
  const posts = parsePosts([{ items: [
    { type: "google_business_post", post_text: "Older post", timestamp: "2025-02-17 00:00:00 +00:00" },
    { type: "google_business_offer", post_text: "x".repeat(400), timestamp: "2026-10-01 00:00:00 +00:00" },
    { type: "google_business_post", post_text: "No date" },
  ] }]);
  expect(posts.map((post) => [post.kind, post.day])).toEqual([["OFFER", "2026-10-01"], ["POST", "2025-02-17"]]);
  expect(posts[0].text).toHaveLength(300);
});

test("Trustpilot and Tripadvisor pages are found by their website and their path", () => {
  expect(parseTrustpilotSearch([{ items: [{ title: "Rains", domain: "www.rains.com", rating: { value: 4 }, reviews_count: 3087 }] }]))
    .toEqual([{ source: "TRUSTPILOT", key: "www.rains.com", name: "Rains", websiteHost: "rains.com", rating: 4, reviews: 3087 }]);
  expect(parseTripadvisorSearch([{ items: [{ title: "The Ivy Castle View", url_path: "/Restaurant_Review-g186390-d13958195.html", rating: { value: 4, votes_count: 1491 }, reviews_count: 1491 }] }]))
    .toEqual([{ source: "TRIPADVISOR", key: "/Restaurant_Review-g186390-d13958195.html", name: "The Ivy Castle View", rating: 4, reviews: 1491 }]);
});

test("points, hosts and distances", () => {
  expect(mapPointOf(51.2387555, -0.5647509)).toBe("51.23876,-0.56475");
  expect(hostOfWebsite("https://WWW.Ronins.co.uk/contact?x=1")).toBe("ronins.co.uk");
  expect(hostOfWebsite(undefined)).toBeUndefined();
  // Guildford to London, about 43 km.
  expect(Math.round(metresBetween({ latitude: 51.2362, longitude: -0.5704 }, { latitude: 51.5072, longitude: -0.1276 }) / 1000)).toBe(43);
});
