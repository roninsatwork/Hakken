import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";
import { usePathname } from "next/navigation";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import { answerQueries } from "@/src/test/siteViewFixtures";
import { WebsitesMenu } from "./WebsitesMenu";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("next/navigation", async () => ({
  ...(await import("@/src/test/screenMocks")).nextNavigation({ id: "company_1" }),
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: vi.fn(),
}));

const base = "/admin/companies/company_1/websites";

const choices = [
  { companyWebsiteId: "hold_1", host: "kordatackle.com", relationship: "OWNED", againstCompanyWebsiteId: null, againstHost: null },
  { companyWebsiteId: "hold_2", host: "nashtackle.co.uk", relationship: "TRACKED", againstCompanyWebsiteId: "hold_1", againstHost: "kordatackle.com" },
];

/**
 * The Websites section's menu (docs/plans/active/websites-section-menu-plan.md):
 * a website chooser that narrows every page, and the pages in four groups,
 * names only.
 */
describe("the Websites section's menu", () => {
  beforeEach(() => {
    push.mockClear();
    vi.mocked(usePathname).mockReturnValue(`${base}/ai-searches`);
    vi.mocked(useQuery).mockImplementation(answerQueries({ "websites:listWebsiteChoices": choices }));
  });

  it("offers every page for All websites, at the company's addresses, the one open lit", () => {
    renderWithProviders(<WebsitesMenu companyId={"company_1" as never} />);

    const menu = screen.getByRole("navigation", { name: "admin.websitesSection.label" });
    // Twelve since Schedule and limits became Schedules and Limits (2026-09-28);
    // thirteen with Market (search-console-plan.md §16, 2026-10-03); fourteen
    // with Page classification (page-groups-plan.md, 2026-10-03).
    expect(within(menu).getAllByRole("link")).toHaveLength(14);
    expect(within(menu).getByRole("link", { name: "admin.websitesSection.pages.market" }))
      .toHaveAttribute("href", `${base}/market`);
    expect(within(menu).getByRole("link", { name: "admin.websitesSection.pages.classification" }))
      .toHaveAttribute("href", `${base}/classification`);
    expect(within(menu).getByRole("link", { name: "admin.websitesSection.pages.limits" }))
      .toHaveAttribute("href", `${base}/limits`);
    expect(within(menu).getByRole("link", { name: "admin.websitesSection.pages.questions" }))
      .toHaveAttribute("aria-current", "page");
    expect(within(menu).getByRole("link", { name: "admin.websitesSection.pages.searches" }))
      .toHaveAttribute("href", `${base}/ai-searches/searches`);
    expect(screen.getByLabelText("admin.websitesSection.chooser.label")).toHaveTextContent("admin.websitesSection.chooser.all");
  });

  it("narrows every page to the website chosen, keeping the page open, from the searchable list", () => {
    renderWithProviders(<WebsitesMenu companyId={"company_1" as never} />);

    fireEvent.click(screen.getByLabelText("admin.websitesSection.chooser.label"));
    const list = screen.getByRole("dialog", { name: "sites.switcher.title" });
    expect(within(list).getByRole("link", { name: /kordatackle\.com/ })).toHaveAttribute("href", `${base}/site/hold_1/questions`);
    // Every website is chosen, so none is unfolded: its competitors wait under it.
    expect(within(list).queryByRole("link", { name: /nashtackle\.co\.uk/ })).not.toBeInTheDocument();
    expect(within(list).getByRole("link", { name: /admin\.websitesSection\.chooser\.all/ })).toHaveAttribute("aria-current", "page");
  });

  it("offers a competitor only what a competitor has", () => {
    vi.mocked(usePathname).mockReturnValue(`${base}/site/hold_2/keywords`);
    renderWithProviders(<WebsitesMenu companyId={"company_1" as never} />);

    const menu = screen.getByRole("navigation", { name: "admin.websitesSection.label" });
    expect(within(menu).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "admin.websitesSection.pages.websites",
      "admin.websitesSection.pages.names",
      "admin.websitesSection.pages.market",
      "admin.websitesSection.pages.rankings",
      "admin.websitesSection.pages.schedules",
      "admin.websitesSection.pages.limits",
      "admin.websitesSection.pages.runs",
    ]);
    expect(within(menu).getByRole("link", { name: "admin.websitesSection.pages.schedules" }))
      .toHaveAttribute("href", `${base}/site/hold_2/schedules`);
    expect(within(menu).getByRole("link", { name: "admin.websitesSection.pages.limits" }))
      .toHaveAttribute("href", `${base}/site/hold_2/limits`);
    // A competitor is still watched from somewhere, so it has a Market page.
    expect(within(menu).getByRole("link", { name: "admin.websitesSection.pages.market" }))
      .toHaveAttribute("href", `${base}/site/hold_2/market`);
    expect(screen.getByLabelText("admin.websitesSection.chooser.label")).toHaveTextContent("nashtackle.co.uk");
    // From a competitor's page, its own site opens on the same page.
    fireEvent.click(screen.getByLabelText("admin.websitesSection.chooser.label"));
    expect(screen.getByRole("link", { name: /kordatackle\.com/ })).toHaveAttribute("href", `${base}/site/hold_1/keywords`);
  });
});
