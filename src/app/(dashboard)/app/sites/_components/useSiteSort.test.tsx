import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSiteSort, useSiteSortedList, type SiteSortColumns } from "./useSiteSort";

const nav = vi.hoisted(() => ({ pathname: "/app/sites/site_1/sorted", search: "", replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: nav.replace, push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

/** Each test its own page, so the address writes of one never reach the next. */
let pageNumber = 0;
function freshPage(search = "") {
  pageNumber += 1;
  nav.pathname = `/app/sites/site_1/sorted-${pageNumber}`;
  nav.search = search;
  nav.replace.mockClear();
}

/** The address the last write asked for. */
function lastWrite(): URLSearchParams {
  return new URLSearchParams(String(nav.replace.mock.calls.at(-1)?.[0] ?? "").split("?")[1] ?? "");
}

const FIRSTS = { keyword: "asc", position: "asc", volume: "desc" } as const;

/**
 * A Sites table's order in the address (docs/plans/active/
 * sites-table-sorting-plan.md): a heading pressed once runs its best first,
 * again the other way; the address keeps only what differs from the opening
 * order, and a change starts at page one.
 */
describe("useSiteSort", () => {
  beforeEach(() => freshPage());

  it("opens on the table's own order", () => {
    const { result } = renderHook(() => useSiteSort(FIRSTS, "position"));
    expect(result.current.key).toBe("position");
    expect(result.current.direction).toBe("asc");
    expect(result.current.tableSort).toMatchObject({ key: "position", direction: "asc" });
  });

  it("asks for a column its own way first, and back to page one", () => {
    freshPage("p=4");
    const { result } = renderHook(() => useSiteSort(FIRSTS, "position"));
    act(() => result.current.tableSort.onSort("volume"));
    expect(lastWrite().get("sort")).toBe("volume");
    expect(lastWrite().has("dir")).toBe(false);
    expect(lastWrite().has("p")).toBe(false);
  });

  it("turns the order round when its heading is pressed again", () => {
    freshPage("sort=volume");
    const { result } = renderHook(() => useSiteSort(FIRSTS, "position"));
    expect(result.current.direction).toBe("desc");
    act(() => result.current.tableSort.onSort("volume"));
    expect(lastWrite().get("sort")).toBe("volume");
    expect(lastWrite().get("dir")).toBe("asc");
  });

  it("keeps the opening order out of the address", () => {
    freshPage("sort=volume&dir=asc");
    const { result } = renderHook(() => useSiteSort(FIRSTS, "position"));
    act(() => result.current.tableSort.onSort("position"));
    expect(lastWrite().has("sort")).toBe(false);
    expect(lastWrite().has("dir")).toBe(false);
  });

  it("opens on the table's own order when the address asks for one it does not offer", () => {
    freshPage("sort=newest&dir=sideways");
    const { result } = renderHook(() => useSiteSort(FIRSTS, "position"));
    expect(result.current.key).toBe("position");
    expect(result.current.direction).toBe("asc");
  });

  it("opens a column the other way from its first press when the table says so", () => {
    const firsts = { added: "desc", traffic: "desc" } as const;
    const { result } = renderHook(() => useSiteSort(firsts, "added", "asc"));
    expect(result.current.direction).toBe("asc");
    act(() => result.current.tableSort.onSort("added"));
    expect(lastWrite().get("dir")).toBe("desc");
  });
});

type Site = { host: string; traffic: number | null; paused?: boolean };
const SITES: Site[] = [
  { host: "pixelfield.co.uk", traffic: 1145 },
  { host: "ronins.co.uk", traffic: 1937 },
  { host: "plugandplaydesign.co.uk", traffic: null },
  { host: "chilliapple.co.uk", traffic: 3044, paused: true },
];
const COLUMNS: SiteSortColumns<Site, "host" | "traffic"> = {
  host: { value: (row) => row.host, first: "asc" },
  traffic: { value: (row) => row.traffic, first: "desc" },
};
const hostOf = (row: Site) => row.host;
const pausedLast = (row: Site) => (row.paused ? 1 : 0);

describe("useSiteSortedList", () => {
  beforeEach(() => freshPage());

  it("sorts the whole list it holds, blanks last", () => {
    const { result } = renderHook(() => useSiteSortedList(SITES, COLUMNS, { opening: "traffic", name: hostOf }));
    expect(result.current.rows?.map(hostOf)).toEqual(["chilliapple.co.uk", "ronins.co.uk", "pixelfield.co.uk", "plugandplaydesign.co.uk"]);
  });

  it("follows the address, either way round", () => {
    freshPage("sort=traffic&dir=asc");
    const { result } = renderHook(() => useSiteSortedList(SITES, COLUMNS, { opening: "host", name: hostOf }));
    expect(result.current.rows?.map(hostOf)).toEqual(["pixelfield.co.uk", "ronins.co.uk", "chilliapple.co.uk", "plugandplaydesign.co.uk"]);
  });

  it("keeps a group after the others whatever the order", () => {
    const { result } = renderHook(() => useSiteSortedList(SITES, COLUMNS, { opening: "traffic", name: hostOf, group: pausedLast }));
    expect(result.current.rows?.map(hostOf)).toEqual(["ronins.co.uk", "pixelfield.co.uk", "plugandplaydesign.co.uk", "chilliapple.co.uk"]);
  });

  it("waits for a list still loading", () => {
    const { result } = renderHook(() => useSiteSortedList<Site, "host" | "traffic">(undefined, COLUMNS, { opening: "host", name: hostOf }));
    expect(result.current.rows).toBeUndefined();
  });
});
