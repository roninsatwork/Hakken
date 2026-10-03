import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import { answerQueries, convexPath, ownedHeader, trackedHeader } from "@/src/test/siteViewFixtures";
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
/** The website's own settings, as its schedule card reads them: following the company, watched from Leeds. */
const ownWebsite = {
  _id: "companyWebsite_1",
  _creationTime: 0,
  companyId: "company_1",
  websiteId: "website_9",
  host: "ourshop.com",
  displayHost: "ourshop.com",
  companyName: "Test Agency",
  locationCode: 1006925,
  locationLabel: "Leeds, England",
  pairedWith: null,
  companyIntervalStr: null,
  companyScheduleActive: false,
  effective: { active: false, intervalStr: null, source: "COMPANY", nextRunAt: null },
};

describe("a website's Schedules", () => {
  const setSchedule = vi.fn();
  const setLocation = vi.fn();

  beforeEach(() => {
    setSchedule.mockReset().mockResolvedValue(null);
    setLocation.mockReset().mockResolvedValue(null);
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "websiteClientView:getSiteHeader": ownedHeader,
    }));
    vi.mocked(useMutation).mockImplementation(((reference: unknown) => {
      const name = convexPath(reference);
      if (name.endsWith("setCompanyWebsiteSchedule")) return setSchedule;
      if (name.endsWith("setCompanyWebsiteLocation")) return setLocation;
      return vi.fn();
    }) as never);
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

  it("leaves where it is watched from to its Market page, and saves only its schedule", async () => {
    // Moved to Market on 2026-10-03 (search-console-plan.md §16), so nothing is set in two places.
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "websiteClientView:getSiteHeader": ownedHeader,
      "websites:getCompanyWebsiteById": ownWebsite,
    }));
    renderWithProviders(<CompanySiteSchedulesPage />);

    expect((await screen.findByText("admin.companyWebsiteDetail.placeOnMarket")).closest("a"))
      .toHaveAttribute("href", "/admin/companies/company_1/websites/site/companyWebsite_1/market");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText(/Leeds, England/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /common\.save/ }));
    await waitFor(() => expect(setSchedule).toHaveBeenCalledWith({
      id: "companyWebsite_1",
      refreshIntervalStr: undefined,
      collectionEnabled: undefined,
    }));
    expect(setLocation).not.toHaveBeenCalled();
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
