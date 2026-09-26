import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import { answerQueries, ownedHeader } from "@/src/test/siteViewFixtures";
import CompanySiteSearchesPage from "./page";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("next/navigation", async () =>
  (await import("@/src/test/screenMocks")).nextNavigation({ id: "company_1", companyWebsiteId: "companyWebsite_1" }));

/**
 * The company's own Google searches for its website, with how the site does
 * on each (docs/plans/active/private-tracking-lists-plan.md, V4): added,
 * paused and removed here, for this company alone.
 */
describe("Your searches", () => {
  const change = vi.fn(async () => null);

  beforeEach(() => {
    change.mockClear();
    vi.mocked(useMutation).mockImplementation(() => change as never);
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "websiteClientView:getSiteHeader": ownedHeader,
      "websiteClientView:listTrackedSearches": {
        data: [{
          _id: "keyword_1", keyword: "branding agency leeds", isActive: true, verdict: "PAGE_ONE",
          lastPosition: 6, previousPosition: 8, bestPosition: 4, firstCheckedDay: "2026-08-01", lastCheckedDay: "2026-09-20", monthlyUsd: 0.1,
        }],
        totalCount: 1,
        totalPages: 1,
      },
    }));
  });

  it("adds a search to this company's own list", async () => {
    renderWithProviders(<CompanySiteSearchesPage />);

    fireEvent.change(await screen.findByLabelText("admin.siteView.searches.addLabel"), {
      target: { value: "web design leeds" },
    });
    fireEvent.click(screen.getByRole("button", { name: /admin.siteView.searches.add$/ }));

    await waitFor(() => expect(change).toHaveBeenCalledWith({ companyWebsiteId: "companyWebsite_1", keyword: "web design leeds" }));
  });

  it("pauses a search without removing it", async () => {
    renderWithProviders(<CompanySiteSearchesPage />);

    fireEvent.click(await screen.findByRole("button", { name: "admin.siteView.searches.pause" }));

    await waitFor(() => expect(change).toHaveBeenCalledWith({ keywordId: "keyword_1", isActive: false }));
  });
});
