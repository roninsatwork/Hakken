import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import CompanySiteLayout from "./layout";
import { answerQueries, ownedHeader, trackedHeader } from "@/src/test/siteViewFixtures";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("next/navigation", async () =>
  (await import("@/src/test/screenMocks")).nextNavigation({ id: "company_1", companyWebsiteId: "companyWebsite_1" }));

/**
 * The frame every tab of a site sits in.
 *
 * An owned site has Overview, Competitors and Results; a tracked one has only what it
 * can use — its overview and its rankings — and a paired one has no settings
 * button at all, because its day and place are its pair's.
 */
describe("the site's frame", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockImplementation(answerQueries({ "websiteClientView:getSiteHeader": ownedHeader }));
  });

  it("gives an owned site its three tabs and its settings", async () => {
    renderWithProviders(<CompanySiteLayout><p>tab body</p></CompanySiteLayout>);

    const base = "/admin/companies/company_1/websites/site/companyWebsite_1";
    expect(await screen.findByRole("link", { name: /admin.siteView.tabs.overview/ })).toHaveAttribute("href", base);
    expect(screen.getByRole("link", { name: /admin.siteView.tabs.competitors/ })).toHaveAttribute("href", `${base}/competitors`);
    expect(screen.getByRole("link", { name: /admin.siteView.tabs.results/ })).toHaveAttribute("href", `${base}/searches`);
    expect(screen.getByRole("button", { name: /admin.siteView.settings/ })).toBeInTheDocument();
    // The website's own lists are edited on its record, not here.
    expect(screen.getByRole("link", { name: /admin.siteView.recordEdit/ })).toHaveAttribute("href", "/admin/websites/website_9");
    expect(screen.getByText("tab body")).toBeInTheDocument();
  });

  it("gives a paired tracked site no settings of its own", async () => {
    vi.mocked(useQuery).mockImplementation(answerQueries({ "websiteClientView:getSiteHeader": trackedHeader }));
    renderWithProviders(<CompanySiteLayout><p>tab body</p></CompanySiteLayout>);

    expect(await screen.findByRole("link", { name: /admin.siteView.tabs.overview/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /admin.siteView.tabs.rankings/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /admin.siteView.tabs.competitors/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /admin.siteView.settings/ })).not.toBeInTheDocument();
    expect(screen.getByText("admin.siteView.collectedWith")).toBeInTheDocument();
  });

  it("says so plainly when the website is gone", async () => {
    vi.mocked(useQuery).mockImplementation(answerQueries({ "websiteClientView:getSiteHeader": null }));
    renderWithProviders(<CompanySiteLayout><p>tab body</p></CompanySiteLayout>);

    expect(await screen.findByText("admin.siteView.notFound")).toBeInTheDocument();
    expect(screen.queryByText("tab body")).not.toBeInTheDocument();
  });
});
