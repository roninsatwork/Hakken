import { cleanup, fireEvent, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import { STARTING_CONSOLE_LIMITS } from "@/src/test/searchConsoleLimits";
import SearchConsoleSiteLayout from "./[siteId]/layout";

/**
 * A website's header in Search Console holds to the compact one Anthony
 * approved for it on 2026-10-15, as Google Analytics' (docs/plans/active/ga-header-plan.md;
 * the picture is docs/plans/assets/ga-header/SearchConsole.png): the
 * website's name is the switch, the country and dates share its row, and how
 * fresh Google's figures are ends the line under it, never at the top of the
 * page.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/search-console/site_1/pages", search: "", push: vi.fn() }));

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

const STATUS = {
  configured: true,
  owned: true,
  canManage: true,
  host: "acme-shop.test",
  iconUrl: null,
  ownSites: [{ siteId: "site_1", host: "acme-shop.test" }],
  historyFrom: "2025-05-26",
  limits: STARTING_CONSOLE_LIMITS,
  connection: {
    status: "CONNECTED", signingIn: false, googleAccount: "owner@acme-shop.test", property: "sc-domain:acme-shop.test",
    permission: "siteOwner", choices: [], connectedAt: Date.parse("2026-09-27T10:00:00Z"), disconnectedAt: null,
    newestDay: "2026-09-26", oldestDay: "2025-05-26", countriesNewest: [], historyDone: true, clearing: false,
    lastCollectedAt: Date.parse("2026-09-27T10:02:00Z"), problem: null, attempt: null,
  },
};
const TWO_SITES = { ...STATUS, ownSites: [...STATUS.ownSites, { siteId: "site_2", host: "acme-trade.test" }] };

function answer(status: unknown) {
  vi.mocked(useQuery).mockImplementation(answerQueries({
    "searchConsoleConnect:searchConsoleStatus": status,
    "searchConsoleCountries:searchConsoleCountryChoices": { main: "gbr", ready: ["irl"] },
    "searchConsoleTracking:searchConsoleTracking": { keywords: { count: 0, limit: 200 }, pages: { count: 0, limit: 100 } },
  }));
  vi.mocked(useMutation).mockImplementation((() => vi.fn()) as never);
  vi.mocked(useAction).mockImplementation((() => vi.fn(() => new Promise(() => undefined))) as never);
}

beforeEach(() => {
  nav.search = "";
  nav.push.mockReset();
  vi.mocked(useQuery).mockReset();
  vi.mocked(useMutation).mockReset();
  vi.mocked(useAction).mockReset();
});
afterEach(cleanup);

describe("Search Console → a website's header", () => {
  // The standard website header (2026-10-30, the Conversions canvas): the name on its own row, the status and the filters under it.
  it("is the standard website header: the name opens the company's websites, the country and dates share the row under it", async () => {
    nav.search = "country=irl";
    answer(TWO_SITES);
    const { container } = render(<SearchConsoleSiteLayout><p>The page</p></SearchConsoleSiteLayout>);
    const sw = await screen.findByLabelText("Choose a website");
    await expectApprovedLook(container, "ga-header", "SearchConsole", "Search Console → a website's header");

    // No "figures to" line and no property line any more: the row under the name holds the status and the filters.
    expect(screen.queryByText(/Google's figures to/)).toBeNull();
    expect(screen.queryByText(/Search Console property/)).toBeNull();
    expect(sw.closest("h1")!.parentElement).not.toContainElement(screen.getByLabelText("Country"));

    // Choosing another website from the title opens it, keeping the country.
    fireEvent.change(screen.getByLabelText("Choose a website"), { target: { value: "site_2" } });
    expect(nav.push).toHaveBeenCalledWith("/app/search-console/site_2?country=irl");
  });

  it("is a plain title when the company has one website", async () => {
    answer(STATUS);
    render(<SearchConsoleSiteLayout><p>The page</p></SearchConsoleSiteLayout>);
    await screen.findByRole("heading", { name: "acme-shop.test" });
    expect(screen.queryByLabelText("Choose a website")).toBeNull();
  });
});
