import { fireEvent, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";

import { answerQueries, convexPath } from "@/src/test/siteViewFixtures";
import SiteBandMovePage from "./keywords/bands/moved/page";
import SiteStructurePage from "./keywords/structure/page";

/**
 * The Keywords screens redesigned with Anthony on 2026-09-27: a square of
 * Position bands' grid opens a screen of its own, and Site structure maps its
 * folders above the table.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/sites/site_1", search: "", replace: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
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
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

const SITE = { siteId: "site_1", host: "a.com", relationship: "OWNED", holds: [], rivals: [], checkDays: ["2026-09-23"], counts: {} };

let pageNumber = 0;
function openAt(pathname: string, search: string, answers: Record<string, unknown>) {
  pageNumber += 1;
  nav.pathname = `${pathname}-${pageNumber}`;
  nav.search = search;
  nav.replace.mockClear();
  vi.mocked(useQuery).mockImplementation(answerQueries({ "sites:getMySite": SITE, ...answers }));
}

const askedFor = (name: string) =>
  vi.mocked(useQuery).mock.calls.filter(([reference, args]) => args !== "skip" && convexPath(reference) === name).map(([, args]) => args);

describe("a square of Position bands' grid", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    window.localStorage.clear();
  });

  it("opens the searches that made that move, with a way back to the grid", () => {
    openAt("/app/sites/site_1/keywords/bands/moved", `move=p04_10.p01_03&back=${encodeURIComponent("/app/sites/site_1/keywords/bands")}`, {
      "siteBands:listBandMoves": {
        rows: [{ keyword: "carp rods", was: 5, now: 2, from: "p04_10", to: "p01_03", volume: 900, page: "/rods" }],
        cut: null,
        day: "2026-09-23",
      },
    });
    render(<SiteBandMovePage />);

    expect(screen.getByText("sites.bands.cell.title sites.overview.bands.p04_10 sites.overview.bands.p01_03")).toBeInTheDocument();
    expect(askedFor("siteBands:listBandMoves").at(-1)).toMatchObject({ from: "p04_10", to: "p01_03" });
    expect(screen.getByRole("link", { name: "carp rods" }).getAttribute("href")).toContain("/keywords/keyword?");
    expect(screen.getByRole("link", { name: /sites.record.backTo/ }).getAttribute("href")).toBe("/app/sites/site_1/keywords/bands");
  });

  it("says an address naming no move is not one, and asks for nothing", () => {
    openAt("/app/sites/site_1/keywords/bands/moved", "move=p01_03.p01_03", {});
    render(<SiteBandMovePage />);

    expect(screen.getByText("sites.bands.cell.missingTitle")).toBeInTheDocument();
    expect(askedFor("siteBands:listBandMoves")).toEqual([]);
  });
});

describe("Site structure", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    window.localStorage.clear();
  });

  const section = (name: string, pages: number, keywords: number, top3: number, traffic: number | null) =>
    ({ section: name, pages, keywords, top3, traffic, day: "2026-09-23" });
  const SECTIONS = { rows: [section("/blog/", 40, 300, 10, 20), section("/", 1, 120, 30, 400), section("/services/", 8, 80, 20, 250)], cut: null };

  it("sizes its map by visits until asked otherwise, and lists the folders the most visited first", () => {
    openAt("/app/sites/site_1/keywords/structure", "", { "siteKeywords:listSections": SECTIONS });
    render(<SiteStructurePage />);

    expect(screen.getByText("sites.structure.mapTitle sites.structure.measures.traffic")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "sites.structure.columns.traffic" })).toHaveAttribute("aria-sort", "descending");
    const folders = screen.getAllByRole("row").slice(1).map((row) => row.querySelector("a")?.textContent);
    expect(folders).toEqual(["sites.structure.home", "/services/", "/blog/"]);
    // Each folder's share of the searches beside its share of the visits: the blog holds most searches and few visits.
    expect(screen.getAllByRole("row")[3].getAttribute("title") ?? screen.getAllByRole("row")[3].innerHTML).toContain("60%");

    fireEvent.click(screen.getByRole("radio", { name: "sites.structure.switch.keywords" }));
    expect(String(nav.replace.mock.calls.at(-1)?.[0])).toContain("size=keywords");
  });

  it("names the folders in the summary under its title", () => {
    openAt("/app/sites/site_1/keywords/structure", "", { "siteKeywords:listSections": SECTIONS });
    render(<SiteStructurePage />);

    expect(screen.getByText("sites.structure.summary 3 49 500 670")).toBeInTheDocument();
  });
});
