import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import OneWebsitePage from "./radar/sources/website/page";
import OneQuestionPage from "./radar/question/page";
import OnePagePage from "./ai/read/page/page";
import OneBusinessPage from "./local/market/business/page";

/**
 * Discovery's detail screens hold to the looks Anthony approved on the canvas
 * "Discovery — local, reviews, AI apps and mentions", page Detail screens
 * (docs/plans/active/discovery-detail-and-hakken-sees-plan.md §2, approved
 * 2026-10-10): each screen, and each view of its one table, rendered with
 * sample rows in English, reads as the outline saved beside its board in
 * docs/plans/assets/discovery-detail-screens/look/.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/sites/site_1", search: "" }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

const PLAN = "discovery-detail-screens";
const SITE = { host: "ronins.co.uk", placeLabel: "United Kingdom", counts: {} };
const many = <T,>(count: number, make: (at: number) => T) => Array.from({ length: count }, (_, at) => make(at));

const WEBSITE = {
  host: "clutch.co",
  kind: "DIRECTORY",
  times: 86,
  besideYou: 12,
  besideRivals: 61,
  rivals: 4,
  linksTo: ["brightsidedigital.co.uk", "kestrelcreative.co.uk", "surreyweb.co"],
  strength: 712,
  asks: 8400,
  namesYou: 0,
  questions: many(19, (at) => ({ question: at === 0 ? "how much does a website cost in the uk" : `question ${at}`, volume: 2900 - at * 100, named: [{ host: "brightsidedigital.co.uk", you: false }], page: "https://clutch.co/pricing/web-design" })),
  pages: many(4, (at) => ({ url: `https://clutch.co/uk/page-${at}`, times: 19 - at, besideYou: at, besideRivals: 15 - at })),
  businesses: [
    { host: "ronins.co.uk", you: true, on: "NOT_LINKED", quotedBeside: 12 },
    { host: "brightsidedigital.co.uk", you: false, on: "LINKS", quotedBeside: 34 },
    { host: "kestrelcreative.co.uk", you: false, on: "LINKS", quotedBeside: 18 },
  ],
  seen: {
    says: [{ code: "mostlyRivals", text: "clutch.co", a: 86, b: 61, c: 12 }, { code: "linksToRivals", a: 3, more: "brightsidedigital.co.uk, kestrelcreative.co.uk, surreyweb.co" }],
    steps: [{ code: "getListed", text: "clutch.co", link: "visit", to: { url: "https://clutch.co" } }],
  },
};

const QUESTION = {
  question: "how much does a website cost in the uk",
  found: true,
  volume: 2900,
  month: "2026-10",
  tracked: false,
  named: [
    { host: "brightsidedigital.co.uk", you: false, place: 1, page: "https://brightsidedigital.co.uk/website-cost-guide/" },
    { host: "northlanestudio.com", you: false, place: 2, page: null },
    { host: "ronins.co.uk", you: true, place: null, page: null },
  ],
  pages: many(7, (at) => ({ url: `https://site${at}.co.uk/cost/`, host: at === 0 ? "brightsidedigital.co.uk" : `site${at}.co.uk`, kind: at === 0 ? "RIVAL" : "DIRECTORY" })),
  seen: {
    says: [{ code: "namesOther", a: 2900, text: "brightsidedigital.co.uk" }, { code: "noPage" }],
    steps: [{ code: "answerOnPage", link: "yourPages", to: { segment: "your-pages" } }],
  },
};

const PAGE = {
  url: "https://www.ronins.co.uk/web-design-surrey/",
  host: "ronins.co.uk",
  path: "/web-design-surrey/",
  whose: "YOURS",
  read: 11,
  cited: 1,
  answers: many(11, (at) => ({ question: at === 0 ? "Who is the best web design agency in Guildford?" : `question ${at}`, day: "2026-10-08", answerId: `answer_${at}`, cited: at === 1 })),
  instead: [
    { url: "https://clutch.co/uk/web-designers/surrey", host: "clutch.co", whose: "OTHER", times: 8, wins: 0.83 },
    { url: "https://brightsidedigital.co.uk/", host: "brightsidedigital.co.uk", whose: "RIVAL", times: 6, wins: 0.6 },
  ],
  questions: [{ question: "best web design agency in surrey", volume: 1300, you: 2 }],
  seen: {
    says: [{ code: "readCitedSome", a: 11, b: 1 }, { code: "citedInstead", text: "clutch.co/uk/web-designers/surrey", a: 8 }],
    steps: [{ code: "firstLines", link: "seePage", to: { record: "page", key: "/web-design-surrey/" } }],
  },
};

const BUSINESS = {
  found: true,
  name: "Brightside Digital",
  host: "brightsidedigital.co.uk",
  category: "Website designer",
  town: "Guildford",
  km: 1.2,
  profileUrl: "https://www.google.com/maps?cid=123",
  rivalId: "rival_1",
  watched: true,
  figures: { named: 121, namedYou: 64, shown: 8, shownYou: 3, answers: 9, rating: 4.9, reviews: 212, ratingYou: 4.8, reviewsYou: 127, mentions: 41, mentionsYou: 23, daysToAnswer: 1, daysToAnswerYou: 3 },
  questions: many(38, (at) => ({ question: at === 0 ? "how much does a website cost in the uk" : `question ${at}`, volume: 2900 - at * 50, it: 1, you: at % 2 ? 2 : null, page: at === 0 ? "https://brightsidedigital.co.uk/website-cost-guide/" : null })),
  answers: many(8, (at) => ({ question: at === 0 ? "Who is the best web design agency in Guildford?" : `answer ${at}`, answerId: `answer_${at}`, day: "2026-10-08", it: 1, you: at === 0 ? 3 : null })),
  map: many(9, (at) => ({ search: at === 0 ? "web design guildford" : `search ${at}`, volume: 590 - at * 10, it: 1, you: at === 0 ? 2 : null })),
  mentions: many(41, (at) => ({ url: `https://news${at}.co.uk/best`, host: `news${at}.co.uk`, title: at === 0 ? "The 10 best web design agencies in Surrey for 2026" : `Story ${at}`, day: "2026-10-07", kind: 1, tone: 1, linked: at % 2 })),
  posts: many(6, (at) => ({ day: "2026-10-06", kind: at === 0 ? "OFFER" : "POST", text: at === 0 ? "Free website check for Surrey businesses" : `Post ${at}`, from: null, to: null })),
  seen: {
    says: [{ code: "aheadInAi", text: "Brightside Digital", a: 121, b: 64 }, { code: "biggestLead", text: "how much does a website cost in the uk", a: 2900 }],
    steps: [{ code: "answerQuestion", text: "how much does a website cost in the uk", link: "seeQuestion", to: { record: "question", key: "how much does a website cost in the uk" } }],
  },
};

function answer(queries: Record<string, unknown>) {
  vi.mocked(useQuery).mockImplementation(answerQueries({ "sites:getMySite": SITE, "users:getMe": { role: "SUPER_ADMIN" }, ...queries }));
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

describe("Discovery's detail screens' approved looks", () => {
  for (const [view, board, row] of [["", "DetailWebsite", "how much does a website cost in the uk"], ["pages", "DetailWebsite-pages", "clutch.co/uk/page-0"], ["who", "DetailWebsite-who", "brightsidedigital.co.uk"]] as const) {
    it(`One website${view ? `, ${view}` : ""}`, async () => {
      at("/app/sites/site_1/radar/sources/website", `website=clutch.co${view ? `&view=${view}` : ""}`);
      answer({ "siteRadarDetails:websiteDetail": WEBSITE });
      const { container } = render(<OneWebsitePage />);
      await screen.findByText(row);
      await expectApprovedLook(container, PLAN, board, `Discovery → One website${view ? ` (${view})` : ""}`);
    });
  }

  for (const [view, board, row] of [
    ["", "DetailBusiness", "how much does a website cost in the uk"],
    ["chatgpt", "DetailBusiness-chatgpt", "Who is the best web design agency in Guildford?"],
    ["map", "DetailBusiness-map", "web design guildford"],
    ["pages", "DetailBusiness-pages", "The 10 best web design agencies in Surrey for 2026"],
    ["posts", "DetailBusiness-posts", "\"Free website check for Surrey businesses\""],
  ] as const) {
    it(`One business${view ? `, ${view}` : ""}`, async () => {
      at("/app/sites/site_1/local/market/business", `business=brightsidedigital.co.uk${view ? `&view=${view}` : ""}`);
      answer({ "siteBusinessDetail:businessDetail": BUSINESS });
      const { container } = render(<OneBusinessPage />);
      await screen.findAllByText(row);
      await expectApprovedLook(container, PLAN, board, `Discovery → One business${view ? ` (${view})` : ""}`);
    });
  }

  for (const [view, board, row] of [["", "DetailPage", "Who is the best web design agency in Guildford?"], ["instead", "DetailPage-instead", "clutch.co/uk/web-designers/surrey"], ["google", "DetailPage-google", "best web design agency in surrey"]] as const) {
    it(`One page${view ? `, ${view}` : ""}`, async () => {
      at("/app/sites/site_1/ai/read/page", `url=https%3A%2F%2Fwww.ronins.co.uk%2Fweb-design-surrey%2F${view ? `&view=${view}` : ""}`);
      answer({ "siteAiPageDetail:aiPageDetail": PAGE });
      const { container } = render(<OnePagePage />);
      await screen.findAllByText(row);
      await expectApprovedLook(container, PLAN, board, `Discovery → One page${view ? ` (${view})` : ""}`);
    });
  }

  for (const [view, board, row] of [["", "DetailQuestion", "brightsidedigital.co.uk"], ["pages", "DetailQuestion-pages", "site1.co.uk/cost/"]] as const) {
    it(`One question${view ? `, ${view}` : ""}`, async () => {
      at("/app/sites/site_1/radar/question", `question=how+much+does+a+website+cost+in+the+uk${view ? `&view=${view}` : ""}`);
      answer({ "siteRadarDetails:questionDetail": QUESTION });
      const { container } = render(<OneQuestionPage />);
      await screen.findAllByText(row);
      await expectApprovedLook(container, PLAN, board, `Discovery → One question${view ? ` (${view})` : ""}`);
    });
  }
});
