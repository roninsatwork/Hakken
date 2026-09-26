import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SITE_DEFAULT_ROWS,
  pageKeepingPlace,
  readRememberedRows,
  rememberRows,
  siteRowsFromText,
  siteRowsPageKey,
} from "./siteTableRows";
import { useSitePager } from "./useSitePagedTable";

const nav = vi.hoisted(() => ({ pathname: "/app/sites/site_1/keywords/structure", search: "", replace: vi.fn() }));

// The shared mock, with the values a wording is given written after its key,
// so the footer's numbers can be read back.
vi.mock("next-intl", async () => ({
  ...(await import("@/src/test/screenMocks")).nextIntl(),
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) =>
    [`${namespace}.${key}`, ...Object.values(values ?? {})].join(" "),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: nav.replace, push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

/** Each test its own page, so neither the browser's memory nor the address writes of one reach the next. */
let pageNumber = 0;
function freshPage(search = "") {
  pageNumber += 1;
  nav.pathname = `/app/sites/site_1/test-${pageNumber}`;
  nav.search = search;
  nav.replace.mockClear();
  return siteRowsPageKey(nav.pathname);
}

/** The address the last write asked for, as parameters. */
function lastWrite(): URLSearchParams {
  const href = String(nav.replace.mock.calls.at(-1)?.[0] ?? "");
  return new URLSearchParams(href.split("?")[1] ?? "");
}

const list = (length: number) => Array.from({ length }, (_, index) => index + 1);

describe("rows per page, remembered", () => {
  beforeEach(() => window.localStorage.clear());

  it("reads only the four choices", () => {
    expect(siteRowsFromText("50")).toBe(50);
    expect(siteRowsFromText("100")).toBe(100);
    expect(siteRowsFromText("15")).toBeNull();
    expect(siteRowsFromText("200")).toBeNull();
    expect(siteRowsFromText("fifty")).toBeNull();
    expect(siteRowsFromText(null)).toBeNull();
    expect(SITE_DEFAULT_ROWS).toBe(25);
  });

  it("remembers each page apart: every site's page of the same kind shares one memory", () => {
    expect(siteRowsPageKey("/app/sites")).toBe("list");
    expect(siteRowsPageKey("/app/sites/site_1/keywords/pages")).toBe("keywords/pages");
    expect(siteRowsPageKey("/app/sites/site_2/keywords/pages")).toBe("keywords/pages");
    expect(siteRowsPageKey("/app/sites/site_1/audit/problem")).toBe("audit/problem");

    rememberRows("keywords/pages", 75);
    expect(readRememberedRows("keywords/pages")).toBe(75);
    expect(readRememberedRows("keywords")).toBeNull();
  });

  it("forgets a value it does not offer, and survives a browser that refuses storage", () => {
    window.localStorage.setItem("hakken.sites.rows.keywords", "15");
    expect(readRememberedRows("keywords")).toBeNull();

    const refuse = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const refuseWrite = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(readRememberedRows("keywords")).toBeNull();
    expect(() => rememberRows("keywords", 50)).not.toThrow();
    refuse.mockRestore();
    refuseWrite.mockRestore();
  });

  it("keeps the first row being read on screen when the size changes", () => {
    expect(pageKeepingPlace(3, 25, 50)).toBe(2); // rows 51–75 → rows 51–100
    expect(pageKeepingPlace(2, 50, 25)).toBe(3); // rows 51–100 → rows 51–75
    expect(pageKeepingPlace(1, 25, 100)).toBe(1);
    expect(pageKeepingPlace(5, 100, 25)).toBe(17); // row 401 → rows 401–425
  });
});

describe("useSitePager", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => nav.replace.mockClear());

  it("opens at 25 rows with the numbered footer and an exact total", () => {
    freshPage();
    const { result } = renderHook(() => useSitePager(list(60)));

    expect(result.current.pageRows).toEqual(list(25));
    expect(result.current.footer).toMatchObject({
      mode: "paged", page: 1, totalPages: 3, totalCount: 60, pageSize: 25, isLoading: false, numbered: true,
    });
    expect(result.current.footer.rowsChoice).toMatchObject({ choices: [25, 50, 75, 100], value: 25 });
  });

  it("shows the page and size the address asks for, and never a page past the end", () => {
    freshPage("p=2&rows=50");
    expect(renderHook(() => useSitePager(list(120))).result.current.pageRows).toEqual(list(120).slice(50, 100));

    freshPage("p=9&rows=50");
    const { result } = renderHook(() => useSitePager(list(120)));
    expect(result.current.footer.page).toBe(3);
    expect(result.current.pageRows).toEqual(list(120).slice(100));
  });

  it("opens at the size this page was left at, unless the address says otherwise", async () => {
    const pageKey = freshPage();
    rememberRows(pageKey, 75);
    const { result } = renderHook(() => useSitePager(list(200)));
    await waitFor(() => expect(result.current.footer.pageSize).toBe(75));

    const other = freshPage("rows=50");
    rememberRows(other, 100);
    const shared = renderHook(() => useSitePager(list(200)));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
    expect(shared.result.current.footer.pageSize).toBe(50);
  });

  it("writes a new size to the address and the memory, keeping the reader's place", () => {
    const pageKey = freshPage("p=3");
    const { result } = renderHook(() => useSitePager(list(200)));

    act(() => result.current.footer.rowsChoice?.onChange(50));
    expect(lastWrite().get("rows")).toBe("50");
    expect(lastWrite().get("p")).toBe("2");
    expect(readRememberedRows(pageKey)).toBe(50);
  });

  it("leaves the default size out of the address", () => {
    freshPage("rows=50&p=2");
    const { result } = renderHook(() => useSitePager(list(200)));

    act(() => result.current.footer.rowsChoice?.onChange(25));
    expect(lastWrite().has("rows")).toBe(false);
    expect(lastWrite().get("p")).toBe("3");
  });

  it("says when the list was held to a limit, rather than passing it off as everything", () => {
    freshPage();
    const whole = renderHook(() => useSitePager(list(40)));
    expect(whole.result.current.footer.labels?.showing?.(1, 25, 40)).toBe("ui.table.showingRange 1 25 40");
    const held = renderHook(() => useSitePager(list(40), { cut: 40 }));
    expect(held.result.current.footer.labels?.showing?.(1, 25, 40)).toContain("showingRangeCut");
  });

  it("writes the count's numbers as the page writes them", () => {
    freshPage();
    const { result } = renderHook(() => useSitePager(list(40)));
    const showing = result.current.footer.labels?.showing?.(2_501, 2_525, 12_545) ?? "";
    expect(showing).toContain("2,501");
    expect(showing).toContain("12,545");
  });

  it("waits with the table while the list is still out", () => {
    freshPage();
    const { result } = renderHook(() => useSitePager(undefined));

    expect(result.current.pageRows).toBeUndefined();
    expect(result.current.footer).toMatchObject({ isLoading: true, totalCount: 0, totalPages: 1 });

    const empty = renderHook(() => useSitePager([], { isLoading: true }));
    expect(empty.result.current.pageRows).toBeUndefined();
  });
});
