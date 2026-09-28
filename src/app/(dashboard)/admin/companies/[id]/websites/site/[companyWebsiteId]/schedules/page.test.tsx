import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import { answerQueries, ownedHeader, trackedHeader } from "@/src/test/siteViewFixtures";
import CompanySiteSchedulesPage from "./page";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("next/navigation", async () =>
  (await import("@/src/test/screenMocks")).nextNavigation({ id: "company_1", companyWebsiteId: "companyWebsite_1" }));

/**
 * One website's Schedules (docs/plans/active/websites-section-menu-plan.md):
 * how often and from where, and the pairing of a competitor. How much of it is
 * kept moved to its own Limits page on 2026-09-28
 * (docs/plans/active/platform-limits-plan.md; Anthony: "This should be two
 * screens / Schedules / Limits").
 */
describe("a website's Schedules", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "websiteClientView:getSiteHeader": ownedHeader,
    }));
  });

  it("holds a company's own site's schedule and its shared record, and no limits", async () => {
    renderWithProviders(<CompanySiteSchedulesPage />);

    expect(await screen.findByText("admin.companyWebsiteDetail.settingsTitle")).toBeInTheDocument();
    expect(screen.getByText(/admin.siteView.schedulesPage.record/).closest("a")).toHaveAttribute("href", "/admin/websites/website_9");
    // How much is kept is the Limits page's.
    expect(screen.queryByText(/admin.limits/)).not.toBeInTheDocument();
    // A competitor's pairing is not a thing an own site has.
    expect(screen.queryByText(/admin.siteView.paired.compare/)).not.toBeInTheDocument();
  });

  it("gives a paired competitor its pairing and where to compare it, and no schedule of its own", async () => {
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "websiteClientView:getSiteHeader": trackedHeader,
      "websiteAttachments:listCompanyOwnedWebsites": [],
    }));
    renderWithProviders(<CompanySiteSchedulesPage />);

    expect((await screen.findByText("admin.siteView.paired.compare")).closest("a"))
      .toHaveAttribute("href", "/admin/companies/company_1/websites/site/companyWebsite_1/competitors");
    // Its day and place are its pair's.
    expect(screen.queryByText("admin.companyWebsiteDetail.settingsTitle")).not.toBeInTheDocument();
  });
});
