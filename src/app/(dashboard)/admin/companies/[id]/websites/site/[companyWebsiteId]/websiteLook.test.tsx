import { cleanup, fireEvent, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";

import { answerQueries, convexPath, ownedHeader } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import CompanySiteMarketPage from "./market/page";
import PageClassificationPage from "./classification/page";
import NewClassificationPage from "./classification/new/page";

/**
 * One website's admin screens hold to the looks Anthony approved on the
 * "Search Console — keywords and pages" canvas (design-drift-plan D4): each
 * screen, rendered with sample rows in English, reads as the outline saved
 * beside its board in docs/plans/assets/search-console-redesign/look/.
 */

const nav = vi.hoisted(() => ({ search: "" }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/companies/company_1/websites/site/companyWebsite_1",
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ id: "company_1", companyWebsiteId: "companyWebsite_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());

const PLAN = "search-console-redesign";

/** The website's own settings, as Market's place card reads them: watched from the default, the United Kingdom. */
const OWN_WEBSITE = {
  _id: "companyWebsite_1",
  _creationTime: 0,
  companyId: "company_1",
  websiteId: "website_9",
  host: "ourshop.com",
  displayHost: "ourshop.com",
  companyName: "Test Agency",
  pairedWith: null,
  companyIntervalStr: null,
  companyScheduleActive: false,
  effective: { active: false, intervalStr: null, source: "COMPANY", nextRunAt: null },
};

const CLASSIFICATIONS = [
  { _id: "class_hub", name: "Content hub", type: "INFORMATIONAL" },
  { _id: "class_company", name: "Company", type: "COMPANY" },
];

const CLASSIFICATION_SUMMARY = {
  pages: 175, sorted: 157, notSorted: 18, cut: false, pagesRead: 10_000,
  classifications: 2, lines: 2, picks: 2, limits: { classifications: 25, lines: 100, picks: 1_000 },
};

/** Page classification's Pages view: a page caught by a line, one set by hand over it, one not sorted. */
const CLASSIFICATION_PAGES = {
  rows: [
    { page: "/hub/kapferer/", clicks: 414, sitemapFile: "content-hub-sitemap.xml", classificationId: "class_hub", how: "BY_LINE", line: { kind: "STARTS_WITH", value: "/hub/" }, underneath: null },
    { page: "/hub/brand-audit/", clicks: 27, sitemapFile: "content-hub-sitemap.xml", classificationId: "class_company", how: "BY_HAND", line: null, underneath: "class_hub" },
    { page: "/author/anthony/", clicks: 15, sitemapFile: null, classificationId: null, how: "NONE", line: null, underneath: null },
  ],
  page: 1,
  totalPages: 12,
  total: 175,
  classifications: CLASSIFICATIONS,
  summary: CLASSIFICATION_SUMMARY,
};

type Line = { kind: string; value: string };

/** What the server says of a classification's lines as edited: each catches two pages. */
const previewOf = (lines: Line[]) => ({
  rows: [
    { page: "/hub/kapferer/", clicks: 414, how: "BY_LINE", line: { kind: "STARTS_WITH", value: "/hub/" } },
    { page: "/hub/brand-audit/", clicks: 27, how: "BY_LINE", line: { kind: "STARTS_WITH", value: "/hub/" } },
  ],
  total: 2,
  byHand: 0,
  lines: lines.map(() => ({ catches: 2, problem: null, on: null })),
  cut: false,
});

function answer(queries: Record<string, unknown>) {
  const byName = answerQueries(queries) as (reference: unknown, args: unknown) => unknown;
  vi.mocked(useQuery).mockImplementation(((reference: unknown, args: unknown) => {
    if (args !== "skip" && convexPath(reference).endsWith("pageClassificationPreview")) {
      return previewOf((args as { lines: Line[] }).lines);
    }
    return byName(reference, args);
  }) as never);
  vi.mocked(useMutation).mockImplementation((() => vi.fn()) as never);
  vi.mocked(useAction).mockImplementation((() => vi.fn(() => new Promise(() => undefined))) as never);
}

beforeEach(() => {
  nav.search = "";
  vi.mocked(useQuery).mockReset();
  vi.mocked(useMutation).mockReset();
  vi.mocked(useAction).mockReset();
});
afterEach(cleanup);

describe("a website's approved admin looks", () => {
  it("18 · Market", async () => {
    answer({
      "websiteClientView:getSiteHeader": ownedHeader,
      "searchConsoleCountries:searchConsoleMarket": { owned: true, countries: ["gbr", "irl"], limit: 3 },
      "websites:getCompanyWebsiteById": OWN_WEBSITE,
    });
    const { container } = render(<CompanySiteMarketPage />);
    await screen.findByText("Ireland");
    await expectApprovedLook(container, PLAN, "Market", "Admin → Websites → Market");
  });

  it("22 · Page classification", async () => {
    answer({
      "websiteClientView:getSiteHeader": ownedHeader,
      "pageClassifications:pageClassificationPages": CLASSIFICATION_PAGES,
    });
    const { container } = render(<PageClassificationPage />);
    await screen.findByText("/hub/kapferer/");
    await expectApprovedLook(container, PLAN, "PageGroups", "Admin → Websites → Page classification");
  });

  it("22b · A classification's own page (new)", async () => {
    answer({ "websiteClientView:getSiteHeader": ownedHeader });
    const { container } = render(<NewClassificationPage />);
    // A new classification starts with no lines: add one, as an admin would, so its lines and pages are on screen.
    fireEvent.change(await screen.findByLabelText("What the address has"), { target: { value: "/hub/" } });
    fireEvent.click(screen.getByRole("button", { name: "Add line" }));
    await screen.findByText("/hub/kapferer/");
    await expectApprovedLook(container, PLAN, "ClassificationEdit", "Admin → Websites → Page classification → a classification's own page");
  });
});
