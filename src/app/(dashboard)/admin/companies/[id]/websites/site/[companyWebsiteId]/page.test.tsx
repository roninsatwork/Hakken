import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import CompanySiteBriefPage from "./page";
import { answerQueries, ownedHeader, trackedHeader } from "@/src/test/siteViewFixtures";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("next/navigation", async () =>
  (await import("@/src/test/screenMocks")).nextNavigation({ id: "company_1", companyWebsiteId: "companyWebsite_1" }));

/**
 * The Brief: how the site is doing, and where to go next.
 *
 * What it holds is that **every card opens the list it counts** and that a
 * price nobody has paid yet says so. A tracked site gets its pairing instead,
 * because it has no lists of its own to summarise.
 */
describe("the Brief", () => {
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

  it("opens each list from the card that counts it", async () => {
    renderWithProviders(<CompanySiteBriefPage />);

    const base = "/admin/companies/company_1/websites/site/companyWebsite_1";
    expect((await screen.findByText("admin.siteView.brief.searches")).closest("a"))
      .toHaveAttribute("href", `${base}/tracking?list=searches`);
    expect(screen.getByText("admin.siteView.brief.questions").closest("a"))
      .toHaveAttribute("href", `${base}/tracking?list=questions`);
    expect(screen.getByText("admin.siteView.brief.rivals").closest("a"))
      .toHaveAttribute("href", `${base}/tracking?list=competitors`);
    // Brand names are the website's, shared, so the card opens the record.
    expect(screen.getByText("admin.siteView.brief.brands").closest("a"))
      .toHaveAttribute("href", "/admin/websites/website_9");
  });

  it("says a price is unknown rather than guessing one", async () => {
    renderWithProviders(<CompanySiteBriefPage />);

    // Questions have never been charged, so their card cannot price itself.
    expect(await screen.findByText("admin.siteView.priceUnknownShort")).toBeInTheDocument();
  });

  it("is the same screen on day one, saying what the first search would do", async () => {
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "websiteClientView:getSiteHeader": { ...ownedHeader, counts: { searches: 0, questions: 0, rivals: 0, brandNames: 1 } },
      "websiteClientView:getSitePortfolio": { searches: {}, questions: {}, rivals: {}, untrackedNamed: 0 },
    }));
    renderWithProviders(<CompanySiteBriefPage />);

    expect(await screen.findByText("admin.siteView.brief.searchesEmpty")).toBeInTheDocument();
    expect(screen.getByText("admin.siteView.brief.questionsEmpty")).toBeInTheDocument();
    expect(screen.getByText("admin.siteView.brief.brandsFew")).toBeInTheDocument();
  });

  it("shows a tracked site its pairing, and where to compare it", async () => {
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "websiteClientView:getSiteHeader": trackedHeader,
      "websiteAttachments:listCompanyOwnedWebsites": [],
    }));
    renderWithProviders(<CompanySiteBriefPage />);

    expect(await screen.findByText("admin.siteView.overview.title")).toBeInTheDocument();
    expect(screen.getByText("admin.siteView.overview.compare").closest("a"))
      .toHaveAttribute("href", "/admin/companies/company_1/websites/site/companyWebsite_1/tracking?list=competitors");
    expect(screen.queryByText("admin.siteView.brief.searches")).not.toBeInTheDocument();
  });

  it("puts the moves first, each with the action that answers it", async () => {
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
    renderWithProviders(<CompanySiteBriefPage />);

    expect(await screen.findByText("admin.siteView.moves.rival.title")).toBeInTheDocument();
    // Rewriting a dead question is done on the Tracking tab; retiring it is one click here.
    expect(screen.getByText("admin.siteView.moves.dead.rewrite").closest("a"))
      .toHaveAttribute("href", "/admin/companies/company_1/websites/site/companyWebsite_1/tracking?list=questions");

    fireEvent.click(screen.getByRole("button", { name: "admin.siteView.moves.rival.take" }));
    expect(actOnMove).toHaveBeenCalledWith({ moveId: "move_1", action: "TAKE" });
  });
});
