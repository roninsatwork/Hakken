import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import YourReviewsPage from "./page";
import ReviewsAgainstRivalsPage from "./rivals/page";
import WhatCustomersSayPage from "./say/page";

/**
 * Discovery's Reviews screens hold to the looks Anthony approved on the canvas
 * "Discovery — local, reviews, AI apps and mentions" (docs/plans/active/
 * discovery-local-reputation-ai-plan.md, D18; design-drift-plan D4): each
 * screen, rendered with sample rows in English, reads as the outline saved
 * beside its board in docs/plans/assets/discovery-local-reputation-ai/look/.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/sites/site_1/reviews", search: "" }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

const PLAN = "discovery-local-reputation-ai";
const SITE = { host: "ronins.co.uk", placeLabel: "United Kingdom", counts: {} };
const OFFICES = [{ listingId: "office_1", name: "Ronins", town: "Guildford" }, { listingId: "office_2", name: "Ronins Group", town: "London" }];
const MONTHS = ["2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];

const review = (id: string, day: string, stars: number, text: string, extra: Record<string, unknown> = {}) => ({
  listingId: "office_1", id, day, stars, text, name: "Sarah K.", guide: false, replyDay: null, replyRough: false, ...extra,
});

const YOURS = {
  offices: OFFICES,
  listings: [
    { listingId: "office_1", source: "GOOGLE", town: "Guildford", rating: 4.9 },
    { listingId: "office_2", source: "GOOGLE", town: "London", rating: 4.8 },
    { listingId: "tp_1", source: "TRUSTPILOT", town: null, rating: 4.6 },
  ],
  figures: { googleRating: 4.8, otherRatings: [{ source: "TRUSTPILOT", rating: 4.6 }], newIn30: 8, newBefore: 6, waiting: 37, oldestWaitingDays: 41, daysToAnswer: 3 },
  months: MONTHS.map((month, at) => ({ month, reviews: 4 + (at % 5), stars: 4.5 + (at % 3) / 10 })),
  rows: [
    review("r1", "2026-10-08", 5, "Ronins rebuilt our website in six weeks and enquiries have doubled since.", { guide: true }),
    review("r2", "2026-10-01", 4, "Good result in the end. The project ran two weeks over the date we agreed.", { listingId: "tp_1", name: "J. Patel", replyDay: "2026-10-03" }),
    // Past a page, as drawn: 37 reviews.
    ...Array.from({ length: 35 }, (_, at) => review(`older${at}`, "2026-08-01", 5, `An older review ${at}.`)),
  ],
};

const business = (listingId: string, name: string, extra: Record<string, unknown> = {}) => ({
  listingId, name, source: "GOOGLE", you: false, rating: 4.8, reviews: 127, newIn30: 6, answered: 0.71, daysToAnswer: 3, ...extra,
});
const RIVALS = {
  offices: OFFICES,
  office: OFFICES[0],
  rows: [
    business("b1", "Brightside Digital", { rating: 4.9, reviews: 212, newIn30: 11, answered: 0.96, daysToAnswer: 1 }),
    business("office_1", "Ronins", { you: true }),
    business("b1_tp", "Brightside Digital", { source: "TRUSTPILOT", reviews: 64 }),
  ],
  months: MONTHS,
  lines: [
    { listingId: "office_1", name: "Ronins", you: true, counts: MONTHS.map((_, at) => 100 + at * 2) },
    { listingId: "b1", name: "Brightside Digital", you: false, counts: MONTHS.map((_, at) => 160 + at * 4) },
  ],
};

const SAY = {
  offices: OFFICES,
  read: 189,
  unread: 0,
  topics: [
    { topic: "website design", praise: 31, complaints: 1, complaintsThisYear: 0, rivalsPraised: 40, topRival: { name: "Brightside Digital", reviews: 22 } },
    { topic: "speed", praise: 6, complaints: 7, complaintsThisYear: 4, rivalsPraised: 41, topRival: { name: "Brightside Digital", reviews: 41 } },
  ],
  stars: [
    { listingId: "office_1", name: "Ronins", you: true, counts: [3, 2, 3, 12, 107], rating: 4.8 },
    { listingId: "b1", name: "Brightside Digital", you: false, counts: [2, 2, 4, 14, 190], rating: 4.9 },
  ],
  waiting: 37,
  drafts: [
    {
      listingId: "office_2", reviewId: "r3", source: "GOOGLE", town: "London", day: "2026-09-24", stars: 2, name: "Mark T.",
      text: "Slow to reply to emails once the site was live.", reply: "Hi Mark, thank you for telling us, and we're sorry you had to chase.",
    },
    {
      listingId: "tp_1", reviewId: "r2", source: "TRUSTPILOT", town: null, day: "2026-10-01", stars: 4, name: "J. Patel",
      text: "Good result in the end.", reply: "Thank you, we're glad you're happy with the result.",
    },
  ],
  perReplyUsd: 0.001,
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

describe("Discovery → Reviews' approved looks", () => {
  it("Your reviews", async () => {
    at("/app/sites/site_1/reviews");
    answer({ "siteReviews:yourReviews": YOURS });
    const { container } = render(<YourReviewsPage />);
    await screen.findByText("J. Patel");
    await expectApprovedLook(container, PLAN, "Reviews", "Discovery → Reviews → Your reviews");
  });

  it("Against rivals", async () => {
    at("/app/sites/site_1/reviews/rivals");
    answer({ "siteReviews:reviewsAgainstRivals": RIVALS });
    const { container } = render(<ReviewsAgainstRivalsPage />);
    await screen.findByText("Ronins · you");
    await expectApprovedLook(container, PLAN, "ReviewsRivals", "Discovery → Reviews → Against rivals");
  });

  it("What customers say", async () => {
    at("/app/sites/site_1/reviews/say");
    answer({ "siteReviews:whatCustomersSay": SAY });
    const { container } = render(<WhatCustomersSayPage />);
    await screen.findByText("Hi Mark, thank you for telling us, and we're sorry you had to chase.");
    await expectApprovedLook(container, PLAN, "ReviewsSay", "Discovery → Reviews → What customers say");
  });
});
