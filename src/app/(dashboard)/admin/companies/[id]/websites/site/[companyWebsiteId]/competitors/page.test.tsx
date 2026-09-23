import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import CompanySiteCompetitorsPage from "./page";
import { answerQueries, ownedHeader, trackedHeader } from "@/src/test/siteViewFixtures";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("next/navigation", async () =>
  (await import("@/src/test/screenMocks")).nextNavigation({ id: "company_1", companyWebsiteId: "companyWebsite_1" }));

const tracked = {
  rivals: [{
    companyWebsiteId: "companyWebsite_3", websiteId: "website_3", displayHost: "northgate.co.uk",
    verdict: "AHEAD", beatsYouOn: 2, comparedOn: 3, namedInAnswers: 0, answersCounted: 0,
    lastSeenDay: "2026-09-21", monthlyUsd: null,
  }],
  untrackedNamed: [{ websiteId: "website_4", displayHost: "southside.co.uk", times: 3, lastDay: "2026-09-20" }],
};

/**
 * Competitors: who this company compares its site with, and one list of
 * suggestions saying in words why each is suggested.
 */
describe("the Competitors tab", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "websiteClientView:getSiteHeader": ownedHeader,
      "websiteClientView:listTrackedCompetitors": tracked,
      "seoDiscoveredCompetitors:listDiscoveredCompetitors": {
        data: [
          // Found both ways: shown once, as the AI mention.
          { _id: "found_1", host: "southside.co.uk", intersections: 4, kind: "COMPETITOR" },
          { _id: "found_2", host: "yell.com", intersections: 2, kind: "DIRECTORY" },
        ],
        totalCount: 2,
        totalPages: 1,
      },
    }));
  });

  it("shows the competitors watched, and every suggestion in one list, once each", async () => {
    renderWithProviders(<CompanySiteCompetitorsPage />);

    expect(await screen.findByText("northgate.co.uk")).toBeInTheDocument();
    expect(screen.getAllByText("southside.co.uk")).toHaveLength(1);
    expect(screen.getByText("admin.siteView.competitors.reasonNamed")).toBeInTheDocument();
    expect(screen.getByText("yell.com")).toBeInTheDocument();
  });

  it("adds a suggestion the way it was found", async () => {
    const mutate = vi.fn(async () => null);
    vi.mocked(useMutation).mockImplementation(() => mutate as never);
    renderWithProviders(<CompanySiteCompetitorsPage />);

    const addButtons = await screen.findAllByRole("button", { name: "admin.siteView.competitors.track" });
    fireEvent.click(addButtons[0]);
    expect(mutate).toHaveBeenCalledWith({ companyWebsiteId: "companyWebsite_1", url: "southside.co.uk" });
    fireEvent.click(addButtons[1]);
    expect(mutate).toHaveBeenCalledWith({ suggestionId: "found_2" });
  });

  it("says a tracked site has no competitors of its own", async () => {
    vi.mocked(useQuery).mockImplementation(answerQueries({ "websiteClientView:getSiteHeader": trackedHeader }));
    renderWithProviders(<CompanySiteCompetitorsPage />);

    expect(await screen.findByText("admin.siteView.competitorsOwnedOnly")).toBeInTheDocument();
  });
});
