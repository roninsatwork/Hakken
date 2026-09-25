import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import { SiteMenu, type MenuCounts } from "./SiteMenu";

const { pathname, search } = vi.hoisted(() => ({ pathname: { current: "/app/sites/site_1/keywords" }, search: { current: "" } }));

vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("next/navigation", async () => ({
  ...(await import("@/src/test/screenMocks")).nextNavigation({ siteId: "site_1" }),
  usePathname: () => pathname.current,
  useSearchParams: () => new URLSearchParams(search.current),
}));

const counts: MenuCounts = {
  keywords: 2545, pages: 529, top3: 18, referringDomains: 505, brokenBacklinks: 2, aiNamed: 1, aiAsked: 4,
  trackedSearches: 5, rankedUp: 0, rankedDown: 0, suggestions: 0, citedPages: 1,
};

const menu = () => screen.getByRole("navigation", { name: "sites.menu.label" });
const group = (name: string) => screen.getByRole("button", { name: `sites.menu.groups.${name}` });
const page = (id: string) => screen.queryByRole("link", { name: new RegExp(`sites\\.menu\\.pages\\.${id}`) });

/**
 * The side menu's groups fold away (Anthony, 2026-09-24: "too many options on
 * the screen"): only Site, and the group of the page being read, start open.
 */
describe("the Sites side menu", () => {
  it("opens Site and the group of the page being read, and nothing else", () => {
    pathname.current = "/app/sites/site_1/keywords";
    renderWithProviders(<SiteMenu siteId="site_1" counts={counts} />);

    expect(menu()).toBeInTheDocument();
    expect(group("site")).toHaveAttribute("aria-expanded", "true");
    expect(group("keywords")).toHaveAttribute("aria-expanded", "true");
    expect(group("ai")).toHaveAttribute("aria-expanded", "false");
    expect(page("overview")).toBeInTheDocument();
    expect(page("keywordsAll")).toHaveAttribute("aria-current", "page");
    expect(page("aiMentions")).not.toBeInTheDocument();
  });

  it("opens and closes a group when its heading is pressed", () => {
    renderWithProviders(<SiteMenu siteId="site_1" counts={counts} />);

    fireEvent.click(group("ai"));
    expect(page("aiMentions")).toBeInTheDocument();
    fireEvent.click(group("ai"));
    expect(page("aiMentions")).not.toBeInTheDocument();
    fireEvent.click(group("site"));
    expect(page("overview")).not.toBeInTheDocument();
  });

  it("keeps lit the page a record's screen was opened from", () => {
    pathname.current = "/app/sites/site_1/keywords/keyword";
    search.current = `keyword=korda&back=${encodeURIComponent("/app/sites/site_1/google/moves?direction=UP")}`;
    renderWithProviders(<SiteMenu siteId="site_1" counts={counts} />);

    expect(page("googleMoves")).toHaveAttribute("aria-current", "page");
    expect(group("google")).toHaveAttribute("aria-expanded", "true");
    search.current = "";
  });

  it("lights the page a record belongs to when it was opened from a bookmark", () => {
    pathname.current = "/app/sites/site_1/keywords/pages/page";
    search.current = "path=%2F";
    renderWithProviders(<SiteMenu siteId="site_1" counts={counts} />);

    expect(page("keywordsPages")).toHaveAttribute("aria-current", "page");
    search.current = "";
  });

  // Anthony, 2026-09-25, of a "Not set up" pill on a group: "not on a menu never".
  it("puts no marks on the menu, whatever is set up", () => {
    pathname.current = "/app/sites/site_1/keywords";
    renderWithProviders(<SiteMenu siteId="site_1" counts={counts} />);

    expect(menu()).not.toHaveTextContent("sites.menu.notSetUp");
    expect(group("ai")).toBeInTheDocument();
  });

  it("shows every match while a page is being looked for, open or not", () => {
    renderWithProviders(<SiteMenu siteId="site_1" counts={counts} />);

    fireEvent.change(screen.getByLabelText("sites.menu.jumpLabel"), { target: { value: "sites.menu.pages.aiMentions" } });
    expect(page("aiMentions")).toBeInTheDocument();
  });
});
