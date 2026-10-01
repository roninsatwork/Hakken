import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import { groupHolds } from "./siteGroups";
import { switchHref } from "./sitePages";
import { SiteSwitcher } from "./SiteSwitcher";

const { pathname, search } = vi.hoisted(() => ({ pathname: { current: "/app/sites/korda/paid/keywords" }, search: { current: "from=2026-09-01&to=2026-09-30" } }));

vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("next/navigation", async () => ({
  ...(await import("@/src/test/screenMocks")).nextNavigation({ siteId: "korda" }),
  usePathname: () => pathname.current,
  useSearchParams: () => new URLSearchParams(search.current),
}));

/** Korda's shape: two websites of its own, each with competitors, and one competitor watched against neither. */
const HOLDS = [
  { siteId: "korda", host: "kordatackle.com", relationship: "OWNED" as const, ofSiteId: null },
  { siteId: "second", host: "kordacarp.example", relationship: "OWNED" as const, ofSiteId: null },
  { siteId: "nash", host: "nashtackle.co.uk", relationship: "TRACKED" as const, ofSiteId: "korda" },
  { siteId: "fox", host: "foxint.com", relationship: "TRACKED" as const, ofSiteId: "korda" },
  { siteId: "carpology", host: "carpology.net", relationship: "TRACKED" as const, ofSiteId: "second" },
  { siteId: "loose", host: "anglingdirect.co.uk", relationship: "TRACKED" as const, ofSiteId: null },
];

const open = () => fireEvent.click(screen.getByRole("button", { name: "sites.switcher.open" }));
const link = (host: string) => screen.queryByRole("link", { name: new RegExp(host.replace(/\./g, "\\.")) });

describe("a company's websites, grouped (docs/plans/active/sites-website-switcher-plan.md)", () => {
  it("hangs each competitor under the website it is measured against, and keeps the rest on their own", () => {
    const { groups, alone } = groupHolds(HOLDS);

    expect(groups.map(({ owner, competitors }) => [owner.host, competitors.map((rival) => rival.host)])).toEqual([
      ["kordatackle.com", ["nashtackle.co.uk", "foxint.com"]],
      ["kordacarp.example", ["carpology.net"]],
    ]);
    expect(alone.map((rival) => rival.host)).toEqual(["anglingdirect.co.uk"]);
  });

  it("opens the same page on the next site, and a record's screen opens the page it sits under (W3)", () => {
    expect(switchHref("/app/sites/korda/paid/keywords", "korda", "second", "?from=2026-09-01")).toBe("/app/sites/second/paid/keywords?from=2026-09-01");
    expect(switchHref("/app/sites/korda/keywords/keyword", "korda", "second", "")).toBe("/app/sites/second/keywords");
    expect(switchHref("/app/sites/korda", "korda", "second", "")).toBe("/app/sites/second");
  });
});

describe("the website switcher in a site's header (W2)", () => {
  it("lists the company's websites with the open site's competitors unfolded, each link keeping the page and dates", () => {
    pathname.current = "/app/sites/korda/paid/keywords";
    renderWithProviders(<SiteSwitcher siteId="korda" host="kordatackle.com" holds={HOLDS} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    open();

    expect(screen.getByRole("dialog", { name: "sites.switcher.title" })).toBeInTheDocument();
    expect(link("kordatackle.com")).toHaveAttribute("aria-current", "page");
    expect(link("kordacarp.example")).toHaveAttribute("href", "/app/sites/second/paid/keywords?from=2026-09-01&to=2026-09-30");
    expect(link("nashtackle.co.uk")).toHaveAttribute("href", "/app/sites/nash/paid/keywords?from=2026-09-01&to=2026-09-30");
    // Another website's competitors stay folded until asked for; one watched against none is listed on its own.
    expect(link("carpology.net")).not.toBeInTheDocument();
    expect(link("anglingdirect.co.uk")).toBeInTheDocument();
    expect(link("sites.switcher.yourSites")).toHaveAttribute("href", "/app/sites?from=2026-09-01&to=2026-09-30");
  });

  it("unfolds another website's competitors when asked", () => {
    renderWithProviders(<SiteSwitcher siteId="korda" host="kordatackle.com" holds={HOLDS} />);
    open();

    const toggles = screen.getAllByRole("button", { name: "sites.switcher.showCompetitors" });
    expect(toggles).toHaveLength(1);
    fireEvent.click(toggles[0]);
    expect(link("carpology.net")).toBeInTheDocument();
  });

  it("finds a competitor under its website by typing, and says when nothing matches", () => {
    renderWithProviders(<SiteSwitcher siteId="korda" host="kordatackle.com" holds={HOLDS} />);
    open();

    const find = screen.getByLabelText("sites.switcher.findLabel");
    fireEvent.change(find, { target: { value: "carp" } });
    expect(link("carpology.net")).toBeInTheDocument();
    expect(link("kordacarp.example")).toBeInTheDocument();
    expect(link("nashtackle.co.uk")).not.toBeInTheDocument();
    expect(link("kordatackle.com")).not.toBeInTheDocument();

    fireEvent.change(find, { target: { value: "zzz" } });
    expect(screen.getByText("sites.switcher.noMatch")).toBeInTheDocument();
  });

  it("marks the competitor being read, and closes on Escape", () => {
    pathname.current = "/app/sites/nash";
    renderWithProviders(<SiteSwitcher siteId="nash" host="nashtackle.co.uk" holds={HOLDS} />);
    open();

    expect(link("nashtackle.co.uk")).toHaveAttribute("aria-current", "page");
    expect(link("kordatackle.com")).not.toHaveAttribute("aria-current");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
