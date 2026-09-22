import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import CompanySiteTrackingPage from "./page";
import { answerQueries, ownedHeader } from "@/src/test/siteViewFixtures";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());

let search = "";
vi.mock("next/navigation", async () => {
  const mocks = (await import("@/src/test/screenMocks")).nextNavigation({ id: "company_1", companyWebsiteId: "companyWebsite_1" });
  return { ...mocks, useSearchParams: () => new URLSearchParams(search) };
});

/**
 * Tracking: three lists behind one switch, each with its count and its cost
 * side by side, because they share an economics and the trade-off is the point.
 */
describe("the Tracking tab", () => {
  beforeEach(() => {
    search = "";
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "websiteClientView:getSiteHeader": ownedHeader,
      "websiteClientView:listTrackedSearches": { data: [], totalCount: 0, totalPages: 1 },
      "websiteClientView:listTrackedQuestions": { data: [], totalCount: 0, totalPages: 1 },
      "websiteClientView:listTrackedCompetitors": { rivals: [], untrackedNamed: [] },
      "seoDiscoveredCompetitors:listDiscoveredCompetitors": { data: [], totalCount: 0, totalPages: 1 },
      "websiteCanonical:listEngines": [],
    }));
  });

  it("opens on the searches, and marks where it is", async () => {
    renderWithProviders(<CompanySiteTrackingPage />);

    expect(await screen.findByText("admin.siteView.searches.title")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /admin.siteView.lists.searches/ })).toHaveAttribute("aria-current", "page");
    // Each list's count and price, side by side in the switch.
    expect(screen.getByRole("link", { name: /admin.siteView.lists.searches/ })).toHaveTextContent("3");
  });

  it("each list has an address of its own", async () => {
    search = "list=competitors";
    renderWithProviders(<CompanySiteTrackingPage />);

    expect(await screen.findByText("admin.siteView.competitors.title")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /admin.siteView.lists.questions/ }))
      .toHaveAttribute("href", "/admin/companies/company_1/websites/site/companyWebsite_1/tracking?list=questions");
  });

  it("an address it does not know opens the searches rather than nothing", async () => {
    search = "list=nonsense";
    renderWithProviders(<CompanySiteTrackingPage />);

    expect(await screen.findByText("admin.siteView.searches.title")).toBeInTheDocument();
  });
});
