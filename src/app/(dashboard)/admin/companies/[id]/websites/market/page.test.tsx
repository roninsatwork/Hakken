import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import { answerQueries } from "@/src/test/siteViewFixtures";
import AllWebsitesMarketPage from "./page";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("next/navigation", async () => ({
  ...(await import("@/src/test/screenMocks")).nextNavigation({ id: "company_1" }),
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

const choices = [
  { companyWebsiteId: "hold_1", host: "kordatackle.com", relationship: "OWNED", againstCompanyWebsiteId: null, againstHost: null, iconUrl: null },
  { companyWebsiteId: "hold_2", host: "nashtackle.co.uk", relationship: "TRACKED", againstCompanyWebsiteId: "hold_1", againstHost: "kordatackle.com", iconUrl: null },
  { companyWebsiteId: "hold_3", host: "fox.com", relationship: "TRACKED", againstCompanyWebsiteId: null, againstHost: null, iconUrl: null },
  { companyWebsiteId: "hold_4", host: "newshop.com", relationship: "OWNED", againstCompanyWebsiteId: null, againstHost: null, iconUrl: null },
];

const rows = [
  { _id: "hold_1", relationship: "OWNED", searchConsoleCountries: ["gbr", "irl"], locationCode: 1006925, locationLabel: "Leeds, England" },
  { _id: "hold_2", relationship: "TRACKED" },
  { _id: "hold_3", relationship: "TRACKED", locationCode: 1006886, locationLabel: "London, England" },
  { _id: "hold_4", relationship: "OWNED" },
];

const T = "admin.siteView.market.all";

/**
 * Market with All websites chosen (search-console-plan.md §16): what each
 * website has set — where it trades and where it is watched from — and a row
 * opening its own Market page. Never what came back.
 */
describe("Market for All websites", () => {
  beforeEach(() => {
    push.mockClear();
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "websites:listWebsiteChoices": choices,
      "websites:listCompanyWebsiteRows": { rows, cut: false },
    }));
  });

  it("lists every website with its countries and where it is watched from", () => {
    renderWithProviders(<AllWebsitesMarketPage />);

    const row = (host: string) => screen.getByText(host).closest("tr") as HTMLElement;
    expect(within(row("kordatackle.com")).getByText("United Kingdom, Ireland")).toBeInTheDocument();
    expect(within(row("kordatackle.com")).getByText("Leeds, England")).toBeInTheDocument();
    // A competitor has no Search Console; paired, it is watched from its pair's place.
    expect(within(row("nashtackle.co.uk")).getByText(`${T}.notForCompetitor`)).toBeInTheDocument();
    expect(within(row("nashtackle.co.uk")).getByText(`${T}.asPair`)).toBeInTheDocument();
    expect(within(row("fox.com")).getByText("London, England")).toBeInTheDocument();
    // Nothing set: no countries yet, watched from the default.
    expect(within(row("newshop.com")).getByText(`${T}.none`)).toBeInTheDocument();
    expect(within(row("newshop.com")).getByText("United Kingdom")).toBeInTheDocument();
  });

  it("opens a website's own Market page from its row", () => {
    renderWithProviders(<AllWebsitesMarketPage />);

    fireEvent.click(screen.getByText("nashtackle.co.uk"));
    expect(push).toHaveBeenCalledWith("/admin/companies/company_1/websites/site/hold_2/market");
  });
});
