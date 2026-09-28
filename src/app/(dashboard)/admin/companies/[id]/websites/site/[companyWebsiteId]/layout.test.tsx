import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import CompanySiteLayout from "./layout";
import { answerQueries, ownedHeader } from "@/src/test/siteViewFixtures";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("next/navigation", async () =>
  (await import("@/src/test/screenMocks")).nextNavigation({ id: "company_1", companyWebsiteId: "companyWebsite_1" }));

/**
 * The frame a website's pages sit in, inside the Websites section
 * (docs/plans/active/websites-section-menu-plan.md): the section's menu names
 * the website and holds its pages, so the frame draws no header and no tabs —
 * until 2026-09-28 it drew both, with a Results switcher under them.
 */
describe("the site's frame", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockImplementation(answerQueries({ "websiteClientView:getSiteHeader": ownedHeader }));
  });

  it("draws the page alone: no header, no tabs, no settings dialog", async () => {
    renderWithProviders(<CompanySiteLayout><p>tab body</p></CompanySiteLayout>);

    expect(await screen.findByText("tab body")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("says so plainly when the website is gone", async () => {
    vi.mocked(useQuery).mockImplementation(answerQueries({ "websiteClientView:getSiteHeader": null }));
    renderWithProviders(<CompanySiteLayout><p>tab body</p></CompanySiteLayout>);

    expect(await screen.findByText("admin.siteView.notFound")).toBeInTheDocument();
    expect(screen.queryByText("tab body")).not.toBeInTheDocument();
  });
});
