import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import LocalProfilePage from "./page";
import LocalOfficesPage from "./offices/page";
import LocalMapsPage from "./maps/page";
import LocalMapSearchPage from "./maps/search/page";
import LocalMarketPage from "./market/page";
import LocalActivityPage from "./activity/page";
import LocalListingsPage from "./listings/page";

/**
 * Discovery's Local screens hold to the looks Anthony approved on the canvas
 * "Discovery — local, reviews, AI apps and mentions" (docs/plans/active/
 * discovery-local-reputation-ai-plan.md, D18; design-drift-plan D4): each
 * screen, rendered with sample rows in English, reads as the outline saved
 * beside its board in docs/plans/assets/discovery-local-reputation-ai/look/.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/sites/site_1/local", search: "" }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());

const PLAN = "discovery-local-reputation-ai";
const SITE = { host: "ronins.co.uk", placeLabel: "United Kingdom", counts: {} };

const row = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  listingId: id, source: "GOOGLE", name, address: "Parallel House, 32 London Rd, Guildford GU1 2AB", town: "Guildford",
  category: "Web Designer", websiteHost: `${id}.co.uk`, rating: 4.8, reviews: 127, photos: 34, claimed: true,
  url: `https://www.google.com/maps?cid=${id}`, ...extra,
});
const OFFICES = [{ listingId: "office_1", name: "Ronins", town: "Guildford" }, { listingId: "office_2", name: "Ronins Group", town: "London" }];
const DETAIL = (detail: string, verdict: string, text: string | null = null) => ({ detail, verdict, text, other: null, count: null, of: null, average: null, days: null });

const PROFILE = {
  offices: OFFICES,
  office: {
    row: row("office_1", "Ronins"),
    readAt: Date.UTC(2026, 9, 8),
    figures: { rivalsRating: 4.6, reviewsGained: 6, mapBox: { inBox: 4, of: 12 }, rivalsPhotos: 61 },
    details: [DETAIL("CLAIMED", "GOOD"), DETAIL("CATEGORY", "GOOD", "Web Designer"), DETAIL("PHOTOS", "FIX")],
    alsoLookAt: [
      { key: "office_1", listingId: "office_1", name: "Ronins", websiteHost: "ronins.co.uk", category: "Web Designer", rating: 4.8, reviews: 127, photos: 34, booking: false, mapBox: 4, you: true, watched: false },
      { key: "b1", listingId: "b1", name: "Brightside Digital", websiteHost: "brightside.co.uk", category: "Web Designer", rating: 4.9, reviews: 212, photos: 96, booking: true, mapBox: 9, you: false, watched: true },
    ],
    topics: [{ topic: "website design", reviews: 31 }, { topic: "communication", reviews: 18 }],
  },
};

const EVERY_OFFICE = {
  offices: [
    { ...row("office_1", "Ronins"), mapBox: { inBox: 4, of: 12 }, toFix: 3, reviewsGained: 6 },
    { ...row("office_2", "Ronins Group", { town: "London" }), mapBox: { inBox: 2, of: 9 }, toFix: 2, reviewsGained: 2 },
  ],
  searches: [
    { keyword: "web design agency london", volume: 1_900, places: [null, 9], top: ["Studio Eleven"] },
    { keyword: "seo agency", volume: 140, places: [6, 14], top: ["Kestrel Creative", "Studio Eleven"] },
  ],
};

const MAPS = {
  offices: OFFICES,
  office: OFFICES[0],
  depth: 20,
  figures: { inBox: 4, of: 12, inBoxChange: 1, averagePlace: 5.2, onMap: 10, notOnMap: 2, topMost: { name: "Brightside Digital", first: 5, you: false } },
  rows: [
    { keyword: "web design agency surrey", volume: 210, place: 1, change: 1, googlePosition: 2, top: "Ronins", topIsYou: true, checkedDay: "2026-10-08" },
    { keyword: "web design woking", volume: 90, place: 0, change: null, googlePosition: 18, top: "Woking Web Studio", topIsYou: false, checkedDay: "2026-10-08" },
  ],
};

const MAP_SEARCH = {
  office: OFFICES[0],
  keyword: "web design guildford",
  day: "2026-10-08",
  volume: 110,
  place: 2,
  change: 1,
  googlePosition: 3,
  boxRating: 4.8,
  boxReviews: 145,
  you: row("office_1", "Ronins"),
  businesses: [
    { ...row("b1", "Brightside Digital"), place: 1, reason: "Their website mentions \"web design guildford\"", you: false, watched: true },
    { ...row("office_1", "Ronins"), place: 2, reason: "31 reviews mention \"website design\"", you: true, watched: false },
  ],
};

const MARKET = {
  offices: OFFICES,
  km: 10,
  day: "2026-10-01",
  total: 64,
  rows: [
    { ...row("b1", "Brightside Digital"), metres: 1_200, mapBox: 9, you: false, watched: true },
    { ...row("b2", "Hilltop Websites", { websiteHost: null, claimed: false, reviews: 9 }), metres: 2_200, mapBox: 0, you: false, watched: false },
  ],
};

const ACTIVITY = {
  rivals: [{ listingId: "b1", name: "Brightside Digital" }],
  figures: { rivalPosts: 14, yourPosts: 1, offers: 3, offerNames: ["Brightside Digital"], openQuestions: 2, profileChanges: 5 },
  lines: [
    { day: "2026-10-07", listingId: "b1", name: "Brightside Digital", kind: "OFFER", text: "Free website check for Surrey businesses.", from: null, to: null },
    { day: "2026-09-28", listingId: "b1", name: "Brightside Digital", kind: "RATING_CHANGE", text: null, from: 4.7, to: 4.6 },
  ],
  questions: [
    { text: "Do you build Shopify stores?", listingId: "office_1", name: "Ronins", town: "Guildford", yours: true, day: "2026-09-12", answeredDay: null },
  ],
};

const LISTINGS = {
  on: true,
  ownSite: true,
  offices: [{ ...row("office_1", "Ronins"), linkedAt: Date.UTC(2026, 9, 1) }],
  rivals: [{ ...row("b1", "Brightside Digital"), againstTown: "Guildford", againstName: "Ronins", matched: false, linkedAt: Date.UTC(2026, 9, 1) }],
  finds: [{ source: "GOOGLE", name: "Ronins Guildford", looking: false, failed: false, total: null, rows: [{ ...row("b9", "Ronins Martial Arts"), linkedAs: null }] }],
  limits: { offices: 5, rivalsPerOffice: 5 },
};

function answer(queries: Record<string, unknown>) {
  vi.mocked(useQuery).mockImplementation(answerQueries({ "sites:getMySite": SITE, ...queries }));
  vi.mocked(useMutation).mockImplementation((() => vi.fn(async () => null)) as never);
  vi.mocked(useAction).mockImplementation((() => vi.fn(() => new Promise(() => undefined))) as never);
}

function at(path: string, search = "") {
  nav.pathname = path;
  nav.search = search;
}

beforeEach(() => {
  vi.mocked(useQuery).mockReset();
  vi.mocked(useMutation).mockReset();
  vi.mocked(useAction).mockReset();
});
afterEach(cleanup);

describe("Discovery → Local's approved looks", () => {
  it("Business profile", async () => {
    at("/app/sites/site_1/local");
    answer({ "siteLocalProfile:businessProfile": PROFILE });
    const { container } = render(<LocalProfilePage />);
    await screen.findByText("Brightside Digital");
    await expectApprovedLook(container, PLAN, "Main", "Discovery → Local → Business profile");
  });

  it("Business profile, every office", async () => {
    at("/app/sites/site_1/local/offices");
    answer({ "siteLocalProfile:everyOffice": EVERY_OFFICE, "siteLocalProfile:businessProfile": PROFILE });
    const { container } = render(<LocalOfficesPage />);
    await screen.findByText("seo agency");
    await expectApprovedLook(container, PLAN, "ProfileOffices", "Discovery → Local → Business profile, every office");
  });

  it("Map rankings", async () => {
    at("/app/sites/site_1/local/maps");
    answer({ "siteLocalMaps:mapRankings": MAPS });
    const { container } = render(<LocalMapsPage />);
    await screen.findByText("web design woking");
    await expectApprovedLook(container, PLAN, "MapRankings", "Discovery → Local → Map rankings");
  });

  it("One search on the map", async () => {
    at("/app/sites/site_1/local/maps/search", "keyword=web+design+guildford&office=office_1");
    answer({ "siteLocalMaps:mapSearch": MAP_SEARCH });
    const { container } = render(<LocalMapSearchPage />);
    await screen.findByText("Brightside Digital");
    await expectApprovedLook(container, PLAN, "MapSearch", "Discovery → Local → One search on the map");
  });

  it("Local market", async () => {
    at("/app/sites/site_1/local/market");
    answer({ "siteLocalMarket:localMarket": MARKET });
    const { container } = render(<LocalMarketPage />);
    await screen.findByText("Hilltop Websites");
    await expectApprovedLook(container, PLAN, "LocalMarket", "Discovery → Local → Local market");
  });

  it("Rival activity", async () => {
    at("/app/sites/site_1/local/activity");
    answer({ "siteLocalMarket:rivalActivity": ACTIVITY });
    const { container } = render(<LocalActivityPage />);
    await screen.findByText("\"Do you build Shopify stores?\"");
    await expectApprovedLook(container, PLAN, "RivalActivity", "Discovery → Local → Rival activity");
  });

  it("Your listings", async () => {
    at("/app/sites/site_1/local/listings");
    answer({ "siteLocalListings:localListings": LISTINGS });
    const { container } = render(<LocalListingsPage />);
    await screen.findByText("Ronins Martial Arts");
    await expectApprovedLook(container, PLAN, "Listings", "Discovery → Local → Your listings");
  });
});
