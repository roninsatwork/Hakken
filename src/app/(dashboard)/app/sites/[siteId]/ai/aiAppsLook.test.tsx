import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import { ENGINE_SCREEN_ORDER } from "@/src/ui/components/seo/engineLabel";
import SiteAnswerPage from "./answers/answer/page";
import BusinessesRecommendedPage from "./businesses/page";
import ReadNotCitedPage from "./read/page";
import AiDemandPage from "./demand/page";
import AiOverviewGapsPage from "../radar/gaps/page";

/**
 * Discovery's AI app screens hold to the looks Anthony approved on the canvas
 * "Discovery — local, reviews, AI apps and mentions" (docs/plans/active/
 * discovery-local-reputation-ai-plan.md, D18; design-drift-plan D4): each
 * screen, rendered with sample rows in English, reads as the outline saved
 * beside its board in docs/plans/assets/discovery-local-reputation-ai/look/.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/sites/site_1/ai/businesses", search: "" }));

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
const ANSWER_ID = "a".repeat(32);
const PROMPT = "Who is the best web design agency in Guildford?";
const MONTHS = (start: number) => Array.from({ length: 12 }, (_, at) => start + at * 10);
const many = <T,>(count: number, make: (at: number) => T) => Array.from({ length: count }, (_, at) => make(at));

const RECORD = {
  prompt: PROMPT,
  engine: "chatgpt",
  day: "2026-10-09",
  text: "Guildford has a strong set of web design agencies. **Ronins** — clear communication.",
  sources: [{ url: "https://clutch.co/uk/web-designers/surrey", page: null }, { url: "https://ronins.co.uk/case-studies/", page: "/case-studies/" }],
  stance: "RECOMMENDED",
  names: ["Ronins"],
  searches: [],
};
const SHOWN = {
  askedAs: "APP",
  others: [
    { engine: "chatgpt", answerId: ANSWER_ID, askedAs: "APP" },
    { engine: ENGINE_SCREEN_ORDER[1], answerId: "b".repeat(32), askedAs: "APP" },
    { engine: "ai_mode", answerId: "c".repeat(32), askedAs: "PAGE" },
    { engine: "claude", answerId: "d".repeat(32), askedAs: "MODEL" },
    { engine: "perplexity", answerId: "e".repeat(32), askedAs: "MODEL" },
  ],
  named: { place: 3, of: 5 },
  businesses: [
    { name: "Brightside Digital", host: "brightsidedigital.co.uk", rating: 4.9, reviews: 212, you: false },
    { name: "Ronins", host: "ronins.co.uk", rating: 4.8, reviews: 127, you: true },
  ],
  read: [
    { url: "https://clutch.co/uk/web-designers/surrey", host: "clutch.co", yours: false, cited: true },
    { url: "https://ronins.co.uk/web-design-surrey/", host: "ronins.co.uk", yours: true, cited: false },
  ],
  searches: [{ query: "best web design agency guildford reviews", text: "best web design agency guildford reviews", position: 4, tracked: true }],
};

const BUSINESSES = {
  questions: [PROMPT],
  answers: 12,
  showingBusinesses: 9,
  showingYou: 3,
  showingYouBefore: 2,
  inBoxSkipped: 2,
  town: "Guildford",
  rows: many(30, (at) => ({
    name: at === 0 ? "Brightside Digital" : `Business ${at}`,
    host: at % 5 === 4 ? null : `business${at}.co.uk`,
    you: at === 2,
    prompts: at < 9 ? [PROMPT] : [],
    usualPlace: 1 + (at % 4),
    rating: 4.8,
    reviews: 100 + at,
    map: at % 3 === 0 ? "BOX" : at % 3 === 1 ? "BELOW" : "OFF",
    boxSearches: at % 3 === 0 ? 3 : 0,
  })),
};

const READ = {
  questions: 12,
  beatsYou: { host: "clutch.co", answers: 10 },
  rows: many(58, (at) => ({
    page: at === 0 ? "clutch.co/uk/web-designers/surrey" : `example${at}.co.uk/page/`,
    url: at === 0 ? "https://clutch.co/uk/web-designers/surrey" : `https://example${at}.co.uk/page/`,
    whose: at % 3 === 0 ? "YOURS" : at % 3 === 1 ? "RIVAL" : "OTHER",
    host: at === 0 ? "clutch.co" : `example${at}.co.uk`,
    read: 12 - (at % 10),
    cited: at % 4,
  })),
};

const DEMAND = {
  month: "2026-09",
  rows: many(48, (at) => ({
    keyword: at === 0 ? "how much does a website cost uk" : `search ${at}`,
    from: at % 3 === 0 ? "SEARCH" : at % 3 === 1 ? "FAN_OUT" : "KEYWORD",
    ai: 100 + at,
    aiMonths: MONTHS(50 + at),
    google: 1_000 + at,
    googleMonths: MONTHS(900 + at),
  })),
};

const GAPS = {
  searches: 40,
  quotedBefore: 7,
  rows: many(38, (at) => ({
    keyword: at === 0 ? "how much does a website cost uk" : `search ${at}`,
    volume: 2_900 - at,
    position: 1 + (at % 12),
    overview: true,
    quotesYou: at % 4 === 0,
    quotes: ["brightsidedigital.co.uk", "clutch.co"],
    yourPage: "/pricing/",
  })),
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

describe("Discovery → AI answers' approved looks", () => {
  it("One answer, five ways", async () => {
    at("/app/sites/site_1/ai/answers/answer", `answer=${ANSWER_ID}`);
    answer({ "siteAnswers:answerRecord": RECORD, "siteAnswerShown:answerShown": SHOWN });
    const { container } = render(<SiteAnswerPage />);
    await screen.findByText("Brightside Digital");
    await expectApprovedLook(container, PLAN, "AiAnswerApp", "Discovery → AI answers → One answer, five ways");
  });

  it("Businesses recommended", async () => {
    at("/app/sites/site_1/ai/businesses");
    answer({ "siteAiApps:businessesRecommended": BUSINESSES });
    const { container } = render(<BusinessesRecommendedPage />);
    await screen.findByText("Business 3");
    await expectApprovedLook(container, PLAN, "AiBusinesses", "Discovery → AI answers → Businesses recommended");
  });

  it("Read but not cited", async () => {
    at("/app/sites/site_1/ai/read");
    answer({ "siteAiApps:readNotCited": READ });
    const { container } = render(<ReadNotCitedPage />);
    await screen.findByText("clutch.co/uk/web-designers/surrey");
    await expectApprovedLook(container, PLAN, "AiReadNotCited", "Discovery → AI answers → Read but not cited");
  });

  it("AI demand", async () => {
    at("/app/sites/site_1/ai/demand");
    answer({ "siteAiDemand:aiDemand": DEMAND });
    const { container } = render(<AiDemandPage />);
    await screen.findByText("search 47", { selector: "a" });
    await expectApprovedLook(container, PLAN, "AiDemand", "Discovery → AI answers → AI demand");
  });

  it("AI Overview gaps", async () => {
    at("/app/sites/site_1/radar/gaps");
    answer({ "siteAiOverviewGaps:overviewGaps": GAPS });
    const { container } = render(<AiOverviewGapsPage />);
    await screen.findByText("how much does a website cost uk", { selector: "a" });
    await expectApprovedLook(container, PLAN, "AiOverviewGaps", "Discovery → Brand radar → AI Overview gaps");
  });
});
