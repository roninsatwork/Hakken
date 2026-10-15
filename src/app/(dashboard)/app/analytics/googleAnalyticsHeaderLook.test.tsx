import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";
import { fireEvent } from "@testing-library/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import { STATUS, statusWith } from "@/src/test/googleAnalyticsFixtures";
import AnalyticsSiteLayout from "./[siteId]/layout";

/**
 * A website's header in Google Analytics holds to the compact one Anthony
 * chose on 2026-10-15 (docs/plans/active/ga-header-plan.md; the picture is
 * docs/plans/assets/ga-header/Compact.png): the website's name is the switch,
 * the filters share its row, and how fresh the figures are ends the line
 * under it, never at the top of the page.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/analytics/site_1", search: "", push: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: nav.push, back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));

const TWO_SITES = {
  ...statusWith({ historyDone: false }),
  ownSites: [{ siteId: "site_1", host: "acme-shop.test" }, { siteId: "site_2", host: "acme-trade.test" }],
};

function answer(status: unknown) {
  vi.mocked(useQuery).mockImplementation(answerQueries({
    "googleAnalyticsConnect:googleAnalyticsStatus": status,
    "searchConsoleCountries:searchConsoleCountryChoices": { main: "gb", ready: ["ie"] },
  }));
  vi.mocked(useMutation).mockImplementation((() => vi.fn()) as never);
  vi.mocked(useAction).mockImplementation((() => vi.fn(() => new Promise(() => undefined))) as never);
}

beforeEach(() => {
  nav.pathname = "/app/analytics/site_1";
  nav.search = "";
  nav.push.mockReset();
  vi.mocked(useQuery).mockReset();
  vi.mocked(useMutation).mockReset();
  vi.mocked(useAction).mockReset();
});
afterEach(cleanup);

describe("Google Analytics → a website's header", () => {
  it("is the compact header: the name opens the company's websites, the filters share its row", async () => {
    nav.search = "device=mobile";
    answer(TWO_SITES);
    const { container } = render(<AnalyticsSiteLayout><p>The page</p></AnalyticsSiteLayout>);
    await screen.findByText("Collecting its first 90 days");
    await expectApprovedLook(container, "ga-header", "Compact", "Google Analytics → a website's header");

    // How fresh the figures are ends the line under the title, not the top of the page.
    const note = screen.getByText(/Analytics' figures to 8 Oct 2026/);
    expect(note.closest('[data-part="page-header"]')).not.toBeNull();

    // Choosing another website from the title opens it, keeping the filters.
    fireEvent.change(screen.getByLabelText("Choose a website"), { target: { value: "site_2" } });
    expect(nav.push).toHaveBeenCalledWith("/app/analytics/site_2?device=mobile");
  });

  it("is a plain title when the company has one website", async () => {
    answer(STATUS);
    render(<AnalyticsSiteLayout><p>The page</p></AnalyticsSiteLayout>);
    await screen.findByRole("heading", { name: "acme-shop.test" });
    expect(screen.queryByLabelText("Choose a website")).toBeNull();
  });
});
