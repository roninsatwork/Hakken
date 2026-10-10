import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import OneWebsitePage from "./radar/sources/website/page";
import OneQuestionPage from "./radar/question/page";

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
