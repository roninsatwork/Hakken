import { fireEvent, renderWithProviders as render, screen, waitFor, within } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAction, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import SiteSourcesPage from "./ai/sources/page";
import SiteLinksComparedPage from "./backlinks/compared/page";
import SiteNewLostPage from "./keywords/new-lost/page";

const nav = vi.hoisted(() => ({ pathname: "/app/sites/site_1/table", search: "", replace: vi.fn() }));

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
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

const SITE = { host: "ronins.co.uk", siteId: "site_1", holds: [], checkDays: ["2026-09-26"], counts: {} };

/** Each test its own page, so the address writes of one never reach the next. */
let pageNumber = 0;
function openAt(search: string, answers: Record<string, unknown>) {
  pageNumber += 1;
  nav.pathname = `/app/sites/site_1/table-${pageNumber}`;
  nav.search = search;
  nav.replace.mockClear();
  vi.mocked(useQuery).mockImplementation(answerQueries({ "sites:getMySite": SITE, ...answers }));
}

/** The address the last write asked for. */
function lastWrite(): URLSearchParams {
  return new URLSearchParams(String(nav.replace.mock.calls.at(-1)?.[0] ?? "").split("?")[1] ?? "");
}

/** The table's rows, by their first cell's words — a website's mark is decoration, hidden from them. */
function firstCells(): string[] {
  return screen.getAllByRole("row").slice(1).map((row) => {
    const cell = within(row).getAllByRole("cell")[0].cloneNode(true) as HTMLElement;
    cell.querySelectorAll("[aria-hidden='true']").forEach((mark) => mark.remove());
    return cell.textContent ?? "";
  });
}

/**
 * The Sites tables that hold their whole list sort like the server's
 * (docs/plans/active/sites-table-sorting-plan.md §8): a list sent whole, a
 * day-by-day table, and a comparison table with this site among the others.
 */
describe("a Sites table sent whole", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    window.localStorage.clear();
  });

  const CITED = {
    rows: [
      { url: "https://ronins.co.uk/ai-agency/", page: "/ai-agency/", engines: ["chatgpt"], times: 4, firstDay: "2026-09-01", lastDay: "2026-09-20" },
      { url: "https://ronins.co.uk/", page: "/", engines: ["chatgpt", "perplexity"], times: 9, firstDay: "2026-09-02", lastDay: "2026-09-10" },
      { url: "https://ronins.co.uk/hub/", page: "/hub/", engines: ["perplexity"], times: 1, firstDay: "2026-09-03", lastDay: "2026-09-25" },
    ],
    cut: null,
  };

  it("opens on its own order, shown by the heading's arrow", () => {
    openAt("", { "siteAi:listCitedPages": CITED });
    render(<SiteSourcesPage />);

    expect(screen.getByRole("columnheader", { name: "sites.aiSources.columns.times" })).toHaveAttribute("aria-sort", "descending");
    expect(firstCells()).toEqual(["/", "/ai-agency/", "/hub/"]);
  });

  it("orders every row it holds by the heading in the address, either way round", () => {
    openAt("sort=last&dir=asc", { "siteAi:listCitedPages": CITED });
    render(<SiteSourcesPage />);

    expect(firstCells()).toEqual(["/", "/ai-agency/", "/hub/"]);
    fireEvent.click(screen.getByRole("button", { name: "sites.aiSources.columns.lastCited" }));
    // Back to the newest first, the column's own first press: the address drops it.
    expect(lastWrite().get("sort")).toBe("last");
    expect(lastWrite().has("dir")).toBe(false);
  });

  it("puts its count and its download in the table's own top bar", () => {
    openAt("", { "siteAi:listCitedPages": CITED });
    render(<SiteSourcesPage />);

    const card = screen.getByRole("table").parentElement?.parentElement as HTMLElement;
    expect(within(card).getByText("ui.tableBar.pages 3")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "sites.downloads.all" })).toBeInTheDocument();
  });

  it("asks for the download in the order on screen", async () => {
    openAt("sort=engines", { "siteAi:listCitedPages": CITED });
    const exportTable = vi.fn(async () => ({ fileName: "cited.csv", csv: "page", rows: 3, complete: true }));
    vi.mocked(useAction).mockReturnValue(exportTable as never);
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:cited"), revokeObjectURL: vi.fn() });
    render(<SiteSourcesPage />);

    expect(firstCells()).toEqual(["/", "/ai-agency/", "/hub/"]);
    fireEvent.click(screen.getByRole("button", { name: "sites.downloads.all" }));
    await waitFor(() => expect(exportTable).toHaveBeenCalledWith({ siteId: "site_1", kind: "cited", sort: "engines", direction: "desc" }));
  });
});

describe("a day-by-day table", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
  });

  // New and lost keywords' checks, the page's second table: it keeps its
  // order under keys of its own (`checks.sort`), apart from the moves above it.
  const step = (day: string, fresh: number) => ({
    day, lastDay: day, checks: 1, start: null, kind: "WHOLE", checked: 500, held: 500,
    rankedNew: fresh, rankedUp: 1, rankedDown: 1, rankedLost: 1,
  });
  const CHECKS = { steps: [step("2026-09-01", 5), step("2026-09-23", 7), step("2026-09-12", 9)], newest: null };

  it("opens on the newest day, and sorts by any figure", () => {
    openAt("", { "siteChecks:siteChecks": CHECKS });
    const { unmount } = render(<SiteNewLostPage />);
    expect(screen.getByRole("columnheader", { name: "sites.newLost.checks.columns.day" })).toHaveAttribute("aria-sort", "descending");
    const days = () => screen.getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell")[0].textContent);
    const opening = days();
    unmount();

    openAt("checks.sort=new", { "siteChecks:siteChecks": CHECKS });
    render(<SiteNewLostPage />);
    // The most new first: 12 Sept's 9, then 23 Sept's 7, then 1 Sept's 5.
    expect(days()).toEqual([opening[1], opening[0], opening[2]]);

    // A heading pressed writes the table's own keys, and leaves the first table's alone.
    fireEvent.click(within(screen.getByRole("columnheader", { name: "sites.newLost.checks.columns.up" })).getByRole("button"));
    expect(lastWrite().get("checks.sort")).toBe("up");
    expect(lastWrite().get("sort")).toBeNull();
  });
});

describe("a comparison table", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
  });

  const WEBSITES = [
    { websiteId: "web_you", host: "ronins.co.uk", isYou: true, domainRank: 300, backlinks: 900, referringDomains: 90, day: "2026-09-23" },
    { websiteId: "web_chilli", host: "chilliapple.co.uk", isYou: false, domainRank: 420, backlinks: 2000, referringDomains: 150, day: "2026-09-23" },
    { websiteId: "web_pixel", host: "pixelfield.co.uk", isYou: false, domainRank: 200, backlinks: 300, referringDomains: 40, day: "2026-09-23" },
  ];

  it("sorts this site in with the others, still marked", () => {
    openAt("", { "siteCharts:siteAndRivals": WEBSITES });
    render(<SiteLinksComparedPage />);

    expect(screen.getByRole("columnheader", { name: "sites.backlinksCompared.columns.referringDomains" })).toHaveAttribute("aria-sort", "descending");
    expect(firstCells()).toEqual(["chilliapple.co.uk", "sites.common.you ronins.co.uk", "pixelfield.co.uk"]);
  });
});
