import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import CompanySiteOverviewPage from "./page";
import { answerQueries, ownedHeader, trackedHeader } from "@/src/test/siteViewFixtures";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("next/navigation", async () =>
  (await import("@/src/test/screenMocks")).nextNavigation({ id: "company_1", companyWebsiteId: "companyWebsite_1" }));

const base = "/admin/companies/company_1/websites/site/companyWebsite_1";

/**
 * The Overview: how the site is doing, and what to do next.
 *
 * What it holds is that **every card opens the results behind it**, that the
 * shared lists are edited in one place — the website record — and that no
 * price appears on it. A tracked site gets its pairing instead. Both keep
 * limits of their own on how much is collected about them.
 */
describe("the Overview", () => {
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

    expect((await screen.findByText("admin.siteView.overview.searches")).closest("a"))
      .toHaveAttribute("href", `${base}/searches`);
    expect(screen.getByText("admin.siteView.overview.questions").closest("a"))
      .toHaveAttribute("href", `${base}/citations`);
    expect(screen.getByText("admin.siteView.overview.rivals").closest("a"))
      .toHaveAttribute("href", `${base}/competitors`);
  });

  it("sends editing of the shared lists to the website record", async () => {
    renderWithProviders(<CompanySiteOverviewPage />);

    expect((await screen.findByText("admin.siteView.overview.editLists")).closest("a"))
      .toHaveAttribute("href", "/admin/websites/website_9");
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

  it("shows a tracked site its pairing, and where to compare it", async () => {
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "websiteClientView:getSiteHeader": trackedHeader,
      "websiteAttachments:listCompanyOwnedWebsites": [],
    }));
    renderWithProviders(<CompanySiteOverviewPage />);

    expect(await screen.findByText("admin.siteView.paired.title")).toBeInTheDocument();
    expect(screen.getByText("admin.siteView.paired.compare").closest("a"))
      .toHaveAttribute("href", `${base}/competitors`);
    expect(screen.queryByText("admin.siteView.overview.searches")).not.toBeInTheDocument();
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
    // Questions are the website's, so rewording one happens on its record.
    expect(screen.getByText("admin.siteView.moves.dead.rewrite").closest("a"))
      .toHaveAttribute("href", "/admin/websites/website_9/questions");

    fireEvent.click(screen.getByRole("button", { name: "admin.siteView.moves.rival.take" }));
    expect(actOnMove).toHaveBeenCalledWith({ moveId: "move_1", action: "TAKE" });
  });

  it("keeps limits of its own on a competitor, following the company until one is chosen", async () => {
    const saveLimits = vi.fn(async () => null);
    vi.mocked(useMutation).mockImplementation(() => saveLimits as never);
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "websiteClientView:getSiteHeader": trackedHeader,
      "websiteAttachments:listCompanyOwnedWebsites": [],
      "companyDataLimits:getSiteDataLimits": {
        own: { keywordsPerSite: null, backlinksPerSite: 5000 },
        company: { keywordsPerSite: 10000, backlinksPerSite: 1000 },
        choices: [100, 1000, 2000, 5000, 10000],
      },
    }));
    renderWithProviders(<CompanySiteOverviewPage />);

    const keywords = await screen.findByRole("combobox", { name: "admin.companyWebsiteDetail.limits.keywordsLabel" });
    expect(keywords).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "admin.companyWebsiteDetail.limits.backlinksLabel" })).toHaveValue("5000");

    fireEvent.change(keywords, { target: { value: "2000" } });
    fireEvent.click(screen.getByRole("button", { name: "admin.companyWebsiteDetail.limits.save" }));
    await waitFor(() => expect(saveLimits).toHaveBeenCalledWith({
      companyWebsiteId: "companyWebsite_1",
      keywordsPerSite: 2000,
      backlinksPerSite: 5000,
    }));
  });

  it("puts the same limits on the company's own site", async () => {
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "websiteClientView:getSiteHeader": ownedHeader,
      "websiteClientView:getSitePortfolio": { searches: {}, questions: {}, rivals: {}, untrackedNamed: 0 },
      "companyDataLimits:getSiteDataLimits": {
        own: { keywordsPerSite: null, backlinksPerSite: null },
        company: { keywordsPerSite: 1000, backlinksPerSite: 1000 },
        choices: [100, 1000, 2000, 5000, 10000],
      },
    }));
    renderWithProviders(<CompanySiteOverviewPage />);

    expect(await screen.findByText("admin.companyWebsiteDetail.limits.title")).toBeInTheDocument();
    // Nothing chosen yet, so there is nothing to save.
    expect(screen.getByRole("button", { name: "admin.companyWebsiteDetail.limits.save" })).toBeDisabled();
  });
});
