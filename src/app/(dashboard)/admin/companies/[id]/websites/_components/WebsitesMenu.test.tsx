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
    // Twelve since Schedule and limits became Schedules and Limits (2026-09-28).
    expect(within(menu).getAllByRole("link")).toHaveLength(12);
    expect(within(menu).getByRole("link", { name: "admin.websitesSection.pages.limits" }))
      .toHaveAttribute("href", `${base}/limits`);
    expect(within(menu).getByRole("link", { name: "admin.websitesSection.pages.questions" }))
      .toHaveAttribute("aria-current", "page");
    expect(within(menu).getByRole("link", { name: "admin.websitesSection.pages.searches" }))
      .toHaveAttribute("href", `${base}/ai-searches/searches`);
    expect(screen.getByLabelText("admin.websitesSection.chooser.label")).toHaveValue("");
  });

  it("narrows every page to the website chosen, keeping the page open", () => {
    renderWithProviders(<WebsitesMenu companyId={"company_1" as never} />);

    fireEvent.change(screen.getByLabelText("admin.websitesSection.chooser.label"), { target: { value: "hold_1" } });
    expect(push).toHaveBeenCalledWith(`${base}/site/hold_1/questions`);
  });

  it("offers a competitor only what a competitor has", () => {
    vi.mocked(usePathname).mockReturnValue(`${base}/site/hold_2/keywords`);
    renderWithProviders(<WebsitesMenu companyId={"company_1" as never} />);

    const menu = screen.getByRole("navigation", { name: "admin.websitesSection.label" });
    expect(within(menu).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "admin.websitesSection.pages.websites",
      "admin.websitesSection.pages.names",
      "admin.websitesSection.pages.rankings",
      "admin.websitesSection.pages.schedules",
      "admin.websitesSection.pages.limits",
      "admin.websitesSection.pages.runs",
    ]);
    expect(within(menu).getByRole("link", { name: "admin.websitesSection.pages.schedules" }))
      .toHaveAttribute("href", `${base}/site/hold_2/schedules`);
    expect(within(menu).getByRole("link", { name: "admin.websitesSection.pages.limits" }))
      .toHaveAttribute("href", `${base}/site/hold_2/limits`);
    expect(screen.getByLabelText("admin.websitesSection.chooser.label")).toHaveValue("hold_2");
  });
});
