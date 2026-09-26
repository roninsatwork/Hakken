import { cleanup, fireEvent, renderWithProviders as render, screen, within } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";

import { answerQueries, convexPath } from "@/src/test/siteViewFixtures";
import SiteKeywordsPage from "./page";

const nav = vi.hoisted(() => ({ pathname: "/app/sites/site_1/keywords", search: "", replace: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
// The shared mock, with the values a wording is given written after its key.
vi.mock("next-intl", async () => {
  const base = (await import("@/src/test/screenMocks")).nextIntl();
  return {
    ...base,
    useTranslations: (namespace: string) => {
      const t = (key: string, values?: Record<string, unknown>) => [`${namespace}.${key}`, ...Object.values(values ?? {})].join(" ");
      return Object.assign(t, { rich: t });
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

/** A row of the list as the server sends it: ronins.co.uk's, as dev held them on 2026-09-26. */
function keywordRow(keyword: string, fields: { volume: number; cpc: number | null; traffic: number; page: string }) {
  return {
    _id: `rank_${keyword}`, keyword, position: 1, previousPosition: 1, change: 0, status: "SAME", band: "p01_03",
    url: null, previousPage: null, intent: "BUYING", day: "2026-09-26", firstSeenDay: "2026-09-01",
    difficulty: 20, trend: [], trafficValue: null, serpFeatures: [], ...fields,
  };
}

const LIST = {
  rows: [
    keywordRow("ai agency london", { volume: 110, cpc: 11.82, traffic: 38, page: "/ai-agency/" }),
    keywordRow("brand identity prism kapferer", { volume: 880, cpc: null, traffic: 0, page: "/hub/kapferer-brand-identity-prism/" }),
  ],
  total: 807, page: 1, pages: 33, size: 25, cut: null, preparing: false,
};

const SITE = { host: "ronins.co.uk", checkDays: ["2026-09-26", "2026-09-24"], counts: { keywords: 807, keywordsStored: 807 } };

/** Each test its own page, so the address writes of one never reach the next. */
let pageNumber = 0;
function openAt(search = "") {
  pageNumber += 1;
  nav.pathname = `/app/sites/site_1/keywords-${pageNumber}`;
  nav.search = search;
  nav.replace.mockClear();
  vi.mocked(useQuery).mockImplementation(answerQueries({ "sites:getMySite": SITE, "siteKeywords:listKeywords": LIST, "siteCharts:siteSeries": [] }));
  return render(<SiteKeywordsPage />);
}

/** The address the last write asked for. */
function lastWrite(): URLSearchParams {
  return new URLSearchParams(String(nav.replace.mock.calls.at(-1)?.[0] ?? "").split("?")[1] ?? "");
}

/** What the page last asked the server for. */
function lastListArgs(): Record<string, unknown> {
  const call = vi.mocked(useQuery).mock.calls.filter(([reference]) => convexPath(reference).endsWith("listKeywords")).at(-1);
  return (call?.[1] ?? {}) as Record<string, unknown>;
}

/**
 * The Keywords page laid out like Ahrefs' Organic keywords (Anthony,
 * 2026-09-26): the filters as compact chips on the search box's row, the
 * count, comparison and download in the table's own top bar, the order chosen
 * by pressing a heading, and what a click costs.
 */
describe("the Keywords page", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    window.localStorage.clear();
  });

  it("puts the search box and four compact filters on one row, and no sort dropdown", () => {
    openAt();

    const row = screen.getByPlaceholderText("sites.keywords.searchPlaceholder").closest("div.flex-wrap") as HTMLElement;
    for (const name of ["sites.keywords.bandFilter", "sites.common.intentFilter", "sites.keywords.statusFilter", "sites.keywords.kdFilter"]) {
      expect(within(row).getByRole("combobox", { name })).toBeInTheDocument();
    }
    expect(within(row).queryByRole("combobox", { name: "sites.keywords.sortLabel" })).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /sites\.downloads/ })).not.toBeInTheDocument();
  });

  it("shows a chosen filter's choice on its chip", () => {
    openAt("band=p01_03&intent=BUYING");

    expect(screen.getByText("sites.keywords.bandFilter: sites.overview.bands.p01_03")).toBeInTheDocument();
    expect(screen.getByText("sites.common.intentFilter: sites.common.intents.BUYING")).toBeInTheDocument();
    expect(screen.getByText("sites.keywords.statusFilter")).toBeInTheDocument();
    expect(lastListArgs()).toMatchObject({ band: "p01_03", intent: "BUYING" });
  });

  it("puts the count, the comparison and the download in the table's own top bar", () => {
    openAt();

    const card = screen.getByRole("table").parentElement?.parentElement as HTMLElement;
    expect(within(card).getByText("sites.tableCounts.keywords 807")).toBeInTheDocument();
    expect(within(card).getByRole("combobox", { name: "sites.compare.label" })).toBeInTheDocument();
    expect(within(card).getByText("sites.compare.chipPrevious")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "sites.downloads.all" })).toBeInTheDocument();
  });

  it("opens on the best position first, and a heading orders the list its best first", () => {
    openAt("p=3");

    expect(lastListArgs()).toMatchObject({ sort: "position", direction: "asc" });
    expect(screen.getByRole("columnheader", { name: "sites.keywords.columns.position" })).toHaveAttribute("aria-sort", "ascending");

    fireEvent.click(screen.getByRole("button", { name: "sites.keywords.columns.volume" }));

    // Most searched first, which needs no direction in the address; back to page one.
    expect(lastWrite().get("sort")).toBe("volume");
    expect(lastWrite().has("dir")).toBe(false);
    expect(lastWrite().has("p")).toBe(false);
  });

  it("turns the order round when its heading is pressed again", () => {
    openAt("sort=volume");

    expect(lastListArgs()).toMatchObject({ sort: "volume", direction: "desc" });
    expect(screen.getByRole("columnheader", { name: "sites.keywords.columns.volume" })).toHaveAttribute("aria-sort", "descending");

    fireEvent.click(screen.getByRole("button", { name: "sites.keywords.columns.volume" }));

    expect(lastWrite().get("sort")).toBe("volume");
    expect(lastWrite().get("dir")).toBe("asc");
  });

  it("reads the direction from the address, and drops it for another heading", () => {
    openAt("sort=volume&dir=asc");

    expect(lastListArgs()).toMatchObject({ sort: "volume", direction: "asc" });

    fireEvent.click(screen.getByRole("button", { name: "sites.keywords.columns.cpc" }));

    expect(lastWrite().get("sort")).toBe("cpc");
    expect(lastWrite().has("dir")).toBe(false);
  });

  it("sorts by the keyword and its change too, but not by a compared day's position", () => {
    openAt();
    expect(screen.getByRole("button", { name: "sites.keywords.columns.keyword" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "sites.keywords.columns.change" })).toBeInTheDocument();
    cleanup();

    // "On {day}" is fetched for the rows on screen only, so cannot order the whole list.
    openAt("compare=2026-09-24");
    expect(screen.queryByRole("button", { name: /sites\.keywords\.columns\.compared/ })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /sites\.keywords\.columns\.compared/ })).not.toHaveAttribute("aria-sort");
  });

  it("shows what a click costs, in dollars, and a dash where there is no price", () => {
    openAt();

    const column = screen.getAllByRole("columnheader").findIndex((cell) => cell.textContent === "sites.keywords.columns.cpc");
    const [first, second] = screen.getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell")[column]);
    expect(first).toHaveTextContent("$11.82");
    expect(second).toHaveTextContent("–");
  });
});
