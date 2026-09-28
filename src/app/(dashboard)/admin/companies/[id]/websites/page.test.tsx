import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import { answerQueries } from "@/src/test/siteViewFixtures";
import CompanyWebsitesPage from "./page";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("next/navigation", async () => ({
  ...(await import("@/src/test/screenMocks")).nextNavigation({ id: "company_1" }),
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

const row = (id: string, host: string, extra: Record<string, unknown>) => ({
  _id: id, _creationTime: 1, companyId: "company_1", websiteId: `website_${id}`, createdAt: 1,
  host, displayHost: host, againstHost: null, competitorCount: 0, competitorCountIsCapped: false, movesWaiting: 0,
  collecting: true, scheduleSource: "COMPANY", nextRunAt: Date.parse("2026-10-01T00:10:00Z"),
  limits: { keywordsPerSite: 1000, backlinksPerSite: 100, everydayKeywords: 1000, keywordsOwn: false, backlinksOwn: false },
  ...extra,
});

/**
 * All websites (docs/plans/active/websites-section-menu-plan.md): the
 * company's own sites first, each followed by its competitors — the order the
 * server sends — searched here, fifteen to a page, each opening where a site
 * of its kind starts.
 */
describe("All websites", () => {
  beforeEach(() => {
    push.mockClear();
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "websites:listCompanyWebsiteRows": {
        rows: [
          row("hold_1", "kordatackle.com", { relationship: "OWNED", competitorCount: 1, movesWaiting: 3 }),
          row("hold_2", "nashtackle.co.uk", { relationship: "TRACKED", againstHost: "kordatackle.com", scheduleSource: "PAIR" }),
        ],
        cut: false,
      },
    }));
  });

  it("lists the company's own site first, its competitor under it, and no Added column", async () => {
    renderWithProviders(<CompanyWebsitesPage />);

    const own = await screen.findByText("kordatackle.com");
    const rival = screen.getByText("nashtackle.co.uk");
    expect(own.compareDocumentPosition(rival) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText("admin.companyWebsites.addedColumn")).not.toBeInTheDocument();
  });

  it("opens a company's own site on its to-do list, and a competitor on its rankings", async () => {
    renderWithProviders(<CompanyWebsitesPage />);

    fireEvent.click(await screen.findByText("kordatackle.com"));
    expect(push).toHaveBeenLastCalledWith("/admin/companies/company_1/websites/site/hold_1");
    fireEvent.click(screen.getByText("nashtackle.co.uk"));
    expect(push).toHaveBeenLastCalledWith("/admin/companies/company_1/websites/site/hold_2/keywords");
  });

  it("finds a website by its address", async () => {
    renderWithProviders(<CompanyWebsitesPage />);

    fireEvent.change(await screen.findByPlaceholderText("admin.companyWebsites.searchPlaceholder"), { target: { value: "nash" } });
    expect(screen.queryByText("kordatackle.com")).not.toBeInTheDocument();
    expect(screen.getByText("nashtackle.co.uk")).toBeInTheDocument();
  });
});
