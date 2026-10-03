import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import CompanySiteOverviewPage from "./page";
import { answerQueries, ownedHeader, trackedHeader } from "@/src/test/siteViewFixtures";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("next/navigation", async () => ({
  ...(await import("@/src/test/screenMocks")).nextNavigation({ id: "company_1", companyWebsiteId: "companyWebsite_1" }),
  useRouter: () => ({ push: vi.fn(), replace, back: vi.fn(), prefetch: vi.fn() }),
}));

const base = "/admin/companies/company_1/websites/site/companyWebsite_1";

/**
 * To do: how the site is doing, and what to do next
 * (docs/plans/active/websites-section-menu-plan.md).
 *
 * What it holds is that **every card opens the results behind it**, that the
 * searches and questions are this company's own and edited under What we
 * track, and that no price appears on it. A competitor has no to-do list: its
 * address opens its rankings. Limits moved to Schedule and limits.
 */
describe("To do", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "websiteClientView:getSiteHeader": ownedHeader,
      "websiteClientView:getSitePortfolio": {
        searches: { TOP_THREE: 1, PAGE_ONE: 1, NEVER_RANKED: 1 },
        questions: { THIN: 1 },
        rivals: { AHEAD: 1 },
        untrackedNamed: 2,
      },
      "websiteMoves:listSiteMoves": { moves: [], openCount: 0 },
    }));
  });

  it("opens the results behind each card", async () => {
    renderWithProviders(<CompanySiteOverviewPage />);

    // Each card is the kit's Figure, which says it opens with an arrow after its label.
    expect((await screen.findByText("admin.siteView.overview.searches →")).closest("a"))
      .toHaveAttribute("href", `${base}/searches`);
    expect(screen.getByText("admin.siteView.overview.questions →").closest("a"))
      .toHaveAttribute("href", `${base}/citations`);
    expect(screen.getByText("admin.siteView.overview.rivals →").closest("a"))
      .toHaveAttribute("href", `${base}/competitors`);
  });

  it("says the lists are this company's own, and edits them here", async () => {
    renderWithProviders(<CompanySiteOverviewPage />);

    // docs/plans/active/private-tracking-lists-plan.md: no other company sees them.
    expect(await screen.findByText(/admin.siteView.overview.ownLists/)).toBeInTheDocument();
    expect(screen.getByText("admin.siteView.overview.editLists").closest("a"))
      .toHaveAttribute("href", "/admin/companies/company_1/websites/site/companyWebsite_1/searches");
  });

  it("says what to add on day one, in the card it would fill", async () => {
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "websiteClientView:getSiteHeader": { ...ownedHeader, counts: { searches: 0, questions: 0, rivals: 0, brandNames: 1 } },
      "websiteClientView:getSitePortfolio": { searches: {}, questions: {}, rivals: {}, untrackedNamed: 0 },
    }));
    renderWithProviders(<CompanySiteOverviewPage />);

    expect(await screen.findByText("admin.siteView.overview.searchesEmpty")).toBeInTheDocument();
    expect(screen.getByText("admin.siteView.overview.questionsEmpty")).toBeInTheDocument();
    expect(screen.getByText("admin.siteView.overview.rivalsEmpty")).toBeInTheDocument();
  });

  it("opens a competitor's rankings instead, since it has no to-do list", async () => {
    vi.mocked(useQuery).mockImplementation(answerQueries({ "websiteClientView:getSiteHeader": trackedHeader }));
    renderWithProviders(<CompanySiteOverviewPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith(`${base}/keywords`));
    expect(screen.queryByText("admin.siteView.overview.searches →")).not.toBeInTheDocument();
  });

  it("lists what to do next, each with the action that answers it", async () => {
    const actOnMove = vi.fn(async () => null);
    vi.mocked(useMutation).mockImplementation(() => actOnMove as never);
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "websiteClientView:getSiteHeader": ownedHeader,
      "websiteClientView:getSitePortfolio": { searches: {}, questions: {}, rivals: {}, untrackedNamed: 1 },
      "websiteMoves:listSiteMoves": {
        openCount: 2,
        moves: [
          { _id: "move_1", kind: "RIVAL", raisedAt: 1, evidence: { websiteId: "website_2", host: "northgate.co.uk", times: 4, lastDay: "2026-09-21" } },
          { _id: "move_2", kind: "DEAD_QUESTION", raisedAt: 1, evidence: { questionId: "q_1", prompt: "who is best", asked: 8, weeks: 9 } },
        ],
      },
    }));
    renderWithProviders(<CompanySiteOverviewPage />);

    expect(await screen.findByText("admin.siteView.moves.rival.title")).toBeInTheDocument();
    // Rewording a question happens on this company's own list.
    expect(screen.getByText("admin.siteView.moves.dead.rewrite").closest("a"))
      .toHaveAttribute("href", "/admin/companies/company_1/websites/site/companyWebsite_1/questions");

    fireEvent.click(screen.getByRole("button", { name: "admin.siteView.moves.rival.take" }));
    expect(actOnMove).toHaveBeenCalledWith({ moveId: "move_1", action: "TAKE" });
  });
});
