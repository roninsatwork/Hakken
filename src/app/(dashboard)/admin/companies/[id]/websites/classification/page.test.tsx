import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import { convexPath } from "@/src/test/siteViewFixtures";
import AllWebsitesClassificationPage from "./page";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("next/navigation", async () => ({
  ...(await import("@/src/test/screenMocks")).nextNavigation({ id: "company_1" }),
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

const choices = [
  { companyWebsiteId: "hold_1", host: "ronins.co.uk", relationship: "OWNED", againstCompanyWebsiteId: null, againstHost: null, iconUrl: null },
  { companyWebsiteId: "hold_2", host: "rival.co.uk", relationship: "TRACKED", againstCompanyWebsiteId: "hold_1", againstHost: "ronins.co.uk", iconUrl: null },
  { companyWebsiteId: "hold_3", host: "newshop.com", relationship: "OWNED", againstCompanyWebsiteId: null, againstHost: null, iconUrl: null },
];

const summaryOf = (classifications: number, notSorted: number, pages: number) => ({
  classifications: [],
  summary: {
    pages, sorted: pages - notSorted, notSorted, cut: false, pagesRead: 10_000,
    classifications, lines: 0, picks: 0, limits: { classifications: 25, lines: 100, picks: 1_000 },
  },
});

/**
 * Page classification with All websites chosen (page-groups-plan.md,
 * decision 6): the company's own websites, each with its classifications and
 * its pages Not sorted, each opening its own page. A competitor has none.
 */
describe("Page classification for All websites", () => {
  beforeEach(() => {
    push.mockClear();
    vi.mocked(useQuery).mockImplementation(((reference: unknown, args: unknown) => {
      const name = convexPath(reference);
      if (name.endsWith("listWebsiteChoices")) return choices;
      if (name.endsWith("pageClassificationList")) {
        const hold = (args as { companyWebsiteId: string }).companyWebsiteId;
        return hold === "hold_1" ? summaryOf(15, 18, 175) : summaryOf(0, 0, 0);
      }
      return undefined;
    }) as never);
  });

  it("lists each of the company's own websites with its counts, and no competitor", () => {
    renderWithProviders(<AllWebsitesClassificationPage />);

    expect(screen.getByText("admin.websitesSection.pages.classification")).toBeInTheDocument();
    expect(screen.queryByText("rival.co.uk")).not.toBeInTheDocument();
    const row = screen.getByText("ronins.co.uk").closest("tr") as HTMLElement;
    expect(within(row).getByText("15")).toBeInTheDocument();
    expect(within(row).getByText("admin.siteView.classification.all.notSortedOf")).toBeInTheDocument();
    expect(within(screen.getByText("newshop.com").closest("tr") as HTMLElement).getByText("0")).toBeInTheDocument();
  });

  it("draws each website's icon beside its name, and its letter where it has none", () => {
    const icon = "data:image/png;base64,AAAA";
    vi.mocked(useQuery).mockImplementation(((reference: unknown) => {
      const name = convexPath(reference);
      if (name.endsWith("listWebsiteChoices")) return choices.map((choice) => (choice.companyWebsiteId === "hold_1" ? { ...choice, iconUrl: icon } : choice));
      if (name.endsWith("pageClassificationList")) return summaryOf(0, 0, 0);
      return undefined;
    }) as never);
    renderWithProviders(<AllWebsitesClassificationPage />);

    const withIcon = screen.getByText("ronins.co.uk").closest("tr") as HTMLElement;
    expect(withIcon.querySelector("img")).toHaveAttribute("src", icon);
    const withoutIcon = screen.getByText("newshop.com").closest("tr") as HTMLElement;
    expect(withoutIcon.querySelector("img")).toBeNull();
    expect(within(withoutIcon).getByText("N")).toBeInTheDocument();
  });

  it("opens a website's own Page classification from its row", () => {
    renderWithProviders(<AllWebsitesClassificationPage />);

    fireEvent.click(screen.getByText("ronins.co.uk"));
    expect(push).toHaveBeenCalledWith("/admin/companies/company_1/websites/site/hold_1/classification");
  });
});
