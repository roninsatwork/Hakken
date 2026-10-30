import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";
import { fireEvent } from "@testing-library/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import { STATUS, statusWith } from "@/src/test/googleAnalyticsFixtures";
import AnalyticsSiteLayout from "./[siteId]/layout";

/**
 * A website's header in Google Analytics is the standard website header
 * Anthony decided on 2026-10-30 on the Conversions canvas (board "Main" of
 * docs/plans/assets/conversions-page/; the compact header of 2026-10-15,
 * docs/plans/active/ga-header-plan.md, before it): the website's name is the
 * switch, on its own row; "Updated …" and the filters share the row under it;
 * no property line and no "figures to" line.
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
  it("is the standard website header: the name opens the company's websites, the status and the filters share the row under it", async () => {
    nav.search = "device=mobile";
    answer(TWO_SITES);
    const { container } = render(<AnalyticsSiteLayout><p>The page</p></AnalyticsSiteLayout>);
    const status = await screen.findByText("Collecting its first 92 days");
    await expectApprovedLook(container, "ga-header", "Compact", "Google Analytics → a website's header");

    // The name has its row to itself; the status and the filters share the row under it; no property line, no figures-to line.
    const heading = screen.getByRole("heading", { name: /acme-shop.test/ });
    expect(heading.parentElement).not.toContainElement(status);
    expect(status.closest('[data-part="page-header"]')).not.toBeNull();
    expect(status.parentElement!.parentElement).toContainElement(screen.getByLabelText("Device"));
    expect(screen.queryByText(/Analytics' figures to/)).toBeNull();
    expect(screen.queryByText(/Google Analytics property/)).toBeNull();

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
