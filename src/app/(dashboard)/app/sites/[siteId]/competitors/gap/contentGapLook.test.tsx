import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import SiteContentGapPage from "./page";

/**
 * Content gap holds to the look Anthony approved on 2026-09-30, laid out as
 * Ahrefs lays out its content gap (docs/plans/active/content-gap-ahrefs-layout-plan.md;
 * design-drift-plan D4): rendered with sample rows in English, it reads as the
 * outline saved in docs/plans/assets/content-gap-ahrefs-layout/look/.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/sites/site_1/competitors/gap", search: "" }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());

const PLAN = "content-gap-ahrefs-layout";

const SITE = {
  host: "acme-shop.test",
  siteId: "site_1",
  holds: [],
  checkDays: ["2026-09-29"],
  counts: {},
  rivals: [
    { siteId: "hold_one", host: "rival-one.test", relationship: "TRACKED", ofHost: "acme-shop.test" },
    { siteId: "hold_two", host: "rival-two.test", relationship: "TRACKED", ofHost: "acme-shop.test" },
  ],
};

const GAP = {
  rows: [
    {
      keyword: "single page app", volume: 165000, intent: "RESEARCHING", difficulty: 32, rivalsRanking: 2, day: "2026-09-29",
      rivals: [
        { websiteId: "web_one", host: "rival-one.test", position: 22, traffic: 0.741 },
        { websiteId: "web_two", host: "rival-two.test", position: 27, traffic: 0.502 },
      ],
    },
    {
      keyword: "mvp meaning", volume: 14800, intent: "RESEARCHING", difficulty: null, rivalsRanking: 1, day: "2026-09-29",
      rivals: [{ websiteId: "web_two", host: "rival-two.test", position: 35, traffic: 9.66 }],
    },
  ],
  // More than a page, so the footer offers its pages and rows per page.
  total: 60, page: 1, pages: 3, size: 25, cut: null, preparing: false,
  competitors: [
    { siteId: "hold_one", websiteId: "web_one", host: "rival-one.test" },
    { siteId: "hold_two", websiteId: "web_two", host: "rival-two.test" },
  ],
};

function answer(queries: Record<string, unknown>) {
  vi.mocked(useQuery).mockImplementation(answerQueries(queries));
  vi.mocked(useMutation).mockImplementation((() => vi.fn(async () => null)) as never);
  vi.mocked(useAction).mockImplementation((() => vi.fn(() => new Promise(() => undefined))) as never);
}

beforeEach(() => {
  vi.mocked(useQuery).mockReset();
  vi.mocked(useMutation).mockReset();
  vi.mocked(useAction).mockReset();
  window.localStorage.clear();
});
afterEach(cleanup);

describe("Content gap's approved look", () => {
  it("Content gap", async () => {
    answer({ "sites:getMySite": SITE, "siteCompetitors:listContentGap": GAP });
    const { container } = render(<SiteContentGapPage />);
    await screen.findByText("single page app");
    await expectApprovedLook(container, PLAN, "ContentGap", "Discovery → Websites → Content gap");
  });
});
