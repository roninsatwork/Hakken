import { fireEvent, screen, waitFor } from "@testing-library/react";
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
          row("hold_2", "nashtackle.co.uk", { relationship: "TRACKED", againstHost: "kordatackle.com", againstWebsiteId: "website_hold_1", scheduleSource: "PAIR" }),
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

  it("finds a competitor by its address, under the site it is watched against", async () => {
    renderWithProviders(<CompanyWebsitesPage />);

    fireEvent.change(await screen.findByPlaceholderText("admin.companyWebsites.searchPlaceholder"), { target: { value: "nash" } });
    expect(screen.getByText("kordatackle.com")).toBeInTheDocument();
    expect(screen.getByText("nashtackle.co.uk")).toBeInTheDocument();
  });

  it("folds a site's competitors from the arrow at the end of its row, without opening the site", async () => {
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "websites:listCompanyWebsiteRows": {
        rows: [
          row("hold_1", "kordatackle.com", { relationship: "OWNED", competitorCount: 1 }),
          row("hold_3", "kordacarp.example", { relationship: "OWNED", competitorCount: 0, _creationTime: 2 }),
          row("hold_2", "nashtackle.co.uk", { relationship: "TRACKED", againstHost: "kordatackle.com", againstWebsiteId: "website_hold_1", scheduleSource: "PAIR" }),
        ],
        cut: false,
      },
    }));
    renderWithProviders(<CompanyWebsitesPage />);

    // Two sites of its own: each folded until asked.
    expect(await screen.findByText("kordacarp.example")).toBeInTheDocument();
    expect(screen.queryByText("nashtackle.co.uk")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "admin.companyWebsites.showCompetitors" }));
    expect(screen.getByText("nashtackle.co.uk")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("stays on the list once a website is added, rather than opening it", async () => {
    renderWithProviders(<CompanyWebsitesPage />);

    fireEvent.click(await screen.findByRole("button", { name: /admin\.companyWebsites\.addWebsite/ }));
    const address = await screen.findByLabelText("admin.companyWebsites.urlLabel");
    fireEvent.change(address, { target: { value: "https://tackleguru.com" } });
    fireEvent.submit(address.closest("form") as HTMLFormElement);

    await waitFor(() => expect(screen.queryByLabelText("admin.companyWebsites.urlLabel")).not.toBeInTheDocument());
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByText("kordatackle.com")).toBeInTheDocument();
  });
});
