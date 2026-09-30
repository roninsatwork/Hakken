import { fireEvent, renderWithProviders as render, screen, within } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import SiteContentGapPage from "./page";

const nav = vi.hoisted(() => ({ pathname: "/app/sites/site_1/competitors/gap", search: "", replace: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
// The shared mock, with the values a wording is given written after its key.
vi.mock("next-intl", async () => {
  const base = (await import("@/src/test/screenMocks")).nextIntl();
  return {
    ...base,
    useTranslations: (namespace: string) => {
      const t = (key: string, values?: Record<string, unknown>) => [`${namespace}.${key}`, ...Object.values(values ?? {})].join(" ");
      return Object.assign(t, { rich: t, has: () => false });
    },
  };
});
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: nav.replace, push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());

const SITE = {
  host: "ronins.co.uk",
  siteId: "site_1",
  holds: [],
  checkDays: ["2026-09-29"],
  counts: {},
  rivals: [
    { siteId: "hold_chilli", host: "chilliapple.co.uk", relationship: "TRACKED", ofHost: "ronins.co.uk" },
    { siteId: "hold_pixel", host: "pixelfield.co.uk", relationship: "TRACKED", ofHost: "ronins.co.uk" },
  ],
};

/** ronins.co.uk's first two gaps, as dev held them on 2026-09-30. */
const GAP = {
  rows: [
    {
      _id: "gap_1", keyword: "single page app", volume: 165000, intent: "RESEARCHING", difficulty: 32, rivalsRanking: 2, day: "2026-09-29",
      rivals: [
        { websiteId: "web_chilli", host: "chilliapple.co.uk", position: 22, traffic: 0.741 },
        { websiteId: "web_pixel", host: "pixelfield.co.uk", position: 27, traffic: 0.502 },
      ],
    },
    {
      _id: "gap_2", keyword: "mvp meaning", volume: 14800, intent: "RESEARCHING", difficulty: null, rivalsRanking: 1, day: "2026-09-29",
      rivals: [{ websiteId: "web_pixel", host: "pixelfield.co.uk", position: 35, traffic: 9.66 }],
    },
  ],
  total: 2, page: 1, pages: 1, size: 25, cut: null, preparing: false,
  competitors: [
    { siteId: "hold_chilli", websiteId: "web_chilli", host: "chilliapple.co.uk" },
    { siteId: "hold_pixel", websiteId: "web_pixel", host: "pixelfield.co.uk" },
  ],
};

function openAt(search: string) {
  nav.search = search;
  nav.replace.mockClear();
  vi.mocked(useQuery).mockImplementation(answerQueries({ "sites:getMySite": SITE, "siteCompetitors:listContentGap": GAP }));
}

/** The body row for a search. */
const rowOf = (keyword: string) => screen.getByRole("link", { name: keyword }).closest("tr") as HTMLElement;

/**
 * Content gap laid out as Ahrefs lays out its content gap, organic search only
 * (Anthony, 2026-09-30; docs/plans/active/content-gap-ahrefs-layout-plan.md):
 * what each search is like, then a Position and Traffic pair per competitor,
 * each named above its pair, each sorting the whole list.
 */
describe("Content gap", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    window.localStorage.clear();
  });

  it("names each competitor over its Position and Traffic, after what the search is like", () => {
    openAt("");
    render(<SiteContentGapPage />);

    const headings = screen.getAllByRole("columnheader").map((cell) => cell.textContent);
    expect(headings).toEqual([
      "chilliapple.co.uk", "pixelfield.co.uk",
      "sites.gap.columns.keyword", "sites.gap.columns.intent", "sites.gap.columns.volume", "sites.gap.columns.kd",
      "sites.gap.columns.position", "sites.gap.columns.traffic", "sites.gap.columns.position", "sites.gap.columns.traffic",
    ]);
    // No paid search: no advert position, no advert traffic, no cost per click;
    // nor what else is on the search's page (Anthony, 2026-09-30: "remove it please").
    expect(screen.queryByText(/paid|cpc|features/i)).not.toBeInTheDocument();
  });

  it("shows each competitor's position, tinted where it ranks, and its visits", () => {
    openAt("");
    render(<SiteContentGapPage />);

    const cells = within(rowOf("single page app")).getAllByRole("cell").map((cell) => cell.textContent);
    // How often it is searched, and how hard.
    expect(cells.slice(2, 4)).toEqual(["165,000", "32"]);
    // chilliapple 22 and pixelfield 27, each under a visit a month.
    expect(cells.slice(4)).toEqual(["22", "<1", "27", "<1"]);

    const mvp = within(rowOf("mvp meaning")).getAllByRole("cell");
    // Not on chilliapple's: a dash, and no tint; on pixelfield's, tinted.
    expect(mvp.slice(4).map((cell) => cell.textContent)).toEqual(["–", "–", "35", "10"]);
    expect(mvp[4].className).not.toContain("bg-info/10");
    expect(mvp[6].className).toContain("bg-info/10");
    // A difficulty not known yet shows a dash, not a nought.
    expect(mvp[3].textContent).toBe("–");
  });

  it("keeps the keyword in place as the table scrolls sideways", () => {
    openAt("");
    render(<SiteContentGapPage />);

    expect(screen.getByRole("columnheader", { name: "sites.gap.columns.keyword" }).className).toContain("sticky");
    expect(screen.getByRole("link", { name: "single page app" }).closest("td")?.className).toContain("sticky");
  });

  it("sorts by a competitor's own column, asking the server for that competitor's order", () => {
    openAt("");
    render(<SiteContentGapPage />);

    const [, pixelPosition] = screen.getAllByRole("button", { name: "sites.gap.columns.position" });
    fireEvent.click(pixelPosition);
    const address = new URLSearchParams(String(nav.replace.mock.calls.at(-1)?.[0] ?? "").split("?")[1] ?? "");
    expect(address.get("sort")).toBe("position:hold_pixel");

    // Opened at that order, the list is asked for pixelfield's positions, the top first.
    vi.mocked(useQuery).mockClear();
    openAt("?sort=position:hold_pixel");
    render(<SiteContentGapPage />);
    const asked = vi.mocked(useQuery).mock.calls.map(([, args]) => args).filter((args): args is Record<string, unknown> => typeof args === "object" && args !== null && "sort" in args);
    expect(asked.at(-1)).toMatchObject({ sort: "position", rivalId: "hold_pixel", direction: "asc" });
  });
});
