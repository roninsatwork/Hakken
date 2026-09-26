"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useDebounce from "@/src/hooks/useDebounce";
import {
  SITE_DEFAULT_ROWS,
  isSiteRows,
  pageKeepingPlace,
  readRememberedRows,
  rememberRows,
  siteRowsFromText,
  siteRowsPageKey,
  type SiteRows,
} from "./siteTableRows";

/**
 * A table's search, filters and sort, kept in the address (D14: "Search and
 * filters stay in the URL, so a filtered view can be bookmarked and shared").
 *
 * Each key belongs to the page that sets it. The side menu, the site switcher
 * and the way back carry only the keys every page shares — the dates, the
 * step and "compare with" (`sharedSiteQuery`) — so one page's filters never
 * turn up on the next. Writes replace the history entry rather than adding
 * one, so Back leaves the page instead of undoing a filter.
 */

/** The keys every Sites page shares; everything else is one page's own. */
export const SITE_SHARED_KEYS = ["from", "to", "step", "range", "compare"] as const;

/**
 * The table's page, kept in the address with the filters so that Back from a
 * record's screen returns to the same page of the table (docs/plans/active/
 * sites-ux-updates-plan.md §3). Any other change to the address — a filter, a
 * search, the dates — is a different list, so it starts again at page one.
 */
export const TABLE_PAGE_KEY = "p";

/** The shared part of a query string, with a leading "?" when there is any. */
export function sharedSiteQuery(params: URLSearchParams): string {
  const shared = new URLSearchParams();
  for (const key of SITE_SHARED_KEYS) {
    const value = params.get(key);
    if (value) shared.set(key, value);
  }
  const text = shared.toString();
  return text ? `?${text}` : "";
}

/**
 * The addresses this page wrote in the last moments, newest last. A write
 * takes a round trip to land, so for a moment the address the page rendered
 * is behind what it asked for: a second write built on it would drop the
 * first (a filter changed just as a search settles), and a search box that
 * saw its own term arrive as news would throw away what was typed since.
 * Shared by every writer on the page. Writes replace the history entry, so
 * only another page or a shared link moves the address from outside.
 */
let recentWrites: Array<{ pathname: string; query: string; at: number }> = [];

/** Long enough for a write to land. */
const WRITE_LANDS_MS = 2_000;

/** Whether this page wrote this value for this key in its last moments: its own write arriving, not news. */
function wroteRecently(pathname: string, key: string, value: string): boolean {
  return recentWrites.some((entry) => entry.pathname === pathname && (new URLSearchParams(entry.query).get(key) ?? "") === value);
}

/** Set some keys in the address and leave the rest as they are. Empty removes a key. */
export function useSetSiteParams(): (changes: Record<string, string | null>) => void {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  return useCallback((changes: Record<string, string | null>) => {
    const now = Date.now();
    recentWrites = recentWrites.filter((entry) => now - entry.at < WRITE_LANDS_MS);
    const newest = recentWrites.filter((entry) => entry.pathname === pathname).at(-1);
    const next = new URLSearchParams(newest ? newest.query : params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!(TABLE_PAGE_KEY in changes)) next.delete(TABLE_PAGE_KEY);
    const text = next.toString();
    recentWrites.push({ pathname, query: text, at: now });
    router.replace(`${pathname}${text ? `?${text}` : ""}`, { scroll: false });
  }, [params, router, pathname]);
}

/**
 * One filter or sort in the address: its value, or the fallback, and a
 * setter. With `allowed`, a value the page does not offer — a stale bookmark,
 * a link edited by hand — reads as the fallback, rather than reaching a query
 * that would refuse it and take the page down.
 */
export function useSiteParam<Value extends string>(
  key: string,
  fallback: Value,
  allowed?: readonly Value[],
): [Value, (next: Value) => void] {
  const params = useSearchParams();
  const set = useSetSiteParams();
  const raw = params.get(key);
  const value = raw !== null && (!allowed || (allowed as readonly string[]).includes(raw)) ? (raw as Value) : fallback;
  const update = useCallback((next: Value) => set({ [key]: next === fallback ? null : next }), [set, key, fallback]);
  return [value, update];
}

/**
 * A search box kept in the address: typed into freely, written to the
 * address once typing pauses. Returns the box's text, its setter, and the
 * settled term a query should use.
 */
export function useSiteSearch(key = "q"): [string, (next: string) => void, string] {
  const params = useSearchParams();
  const pathname = usePathname();
  const set = useSetSiteParams();
  const inAddress = params.get(key) ?? "";
  const [text, setText] = useState(inAddress);
  const settled = useDebounce(text, 400).trim();

  // Another page or a shared link changed the address: show what it says.
  // The box's own term arriving is not that — by the time it lands the
  // reader may have typed on, and resetting the box would drop what they
  // typed. Adjusted during render, as React recommends, not in an effect.
  const [seen, setSeen] = useState(inAddress);
  if (seen !== inAddress) {
    setSeen(inAddress);
    if (inAddress !== text.trim() && inAddress !== settled && !wroteRecently(pathname, key, inAddress)) setText(inAddress);
  }

  // Write only when the typing settles — not when the address moves under
  // it, or a stale term would be written back over what the address says.
  const addressRef = useRef(inAddress);
  const setRef = useRef(set);
  useEffect(() => {
    addressRef.current = inAddress;
    setRef.current = set;
  }, [inAddress, set]);
  useEffect(() => {
    if (settled === addressRef.current) return;
    setRef.current({ [key]: settled || null });
  }, [settled, key]);

  return [text, setText, settled];
}

/** The table's page from the address — 1 when there is none — and a setter that writes it there. */
export function useSiteTablePage(): [number, (next: number) => void] {
  const params = useSearchParams();
  const set = useSetSiteParams();
  const raw = Number(params.get(TABLE_PAGE_KEY));
  const page = Number.isInteger(raw) && raw > 1 ? raw : 1;
  const setPage = useCallback((next: number) => set({ [TABLE_PAGE_KEY]: next > 1 ? String(next) : null }), [set]);
  return [page, setPage];
}

/** The table's rows per page, in the address beside its page (docs/plans/active/sites-table-pages-plan.md, T4). */
export const TABLE_ROWS_KEY = "rows";

/**
 * A Sites table's page and rows per page. Both live in the address, so Back
 * from a record's screen opens the same page at the same size; the rows are
 * also remembered for this page in this browser, so it opens as it was left
 * (T4, "One per page"). What the address says wins over what the browser
 * remembers, so a shared or bookmarked link shows what it says.
 *
 * The rows are not one of the shared keys: the side menu carries only the
 * dates and "compare with" (`sharedSiteQuery`), so each page keeps its own.
 * Changing them keeps the first row being read on screen.
 */
export function useSiteTablePaging(): {
  page: number;
  setPage: (next: number) => void;
  rows: SiteRows;
  setRows: (next: number) => void;
} {
  const params = useSearchParams();
  const pathname = usePathname();
  const set = useSetSiteParams();
  const [page, setPage] = useSiteTablePage();
  const pageKey = siteRowsPageKey(pathname);

  // Restored after mount so the server and the first client render agree,
  // as the composer restores its thinking level.
  const [remembered, setRemembered] = useState<{ pageKey: string; rows: SiteRows | null }>({ pageKey, rows: null });
  useEffect(() => {
    const restore = setTimeout(() => setRemembered({ pageKey, rows: readRememberedRows(pageKey) }), 0);
    return () => clearTimeout(restore);
  }, [pageKey]);

  const rows = siteRowsFromText(params.get(TABLE_ROWS_KEY))
    ?? (remembered.pageKey === pageKey ? remembered.rows : null)
    ?? SITE_DEFAULT_ROWS;

  const setRows = useCallback((next: number) => {
    if (!isSiteRows(next) || next === rows) return;
    rememberRows(pageKey, next);
    setRemembered({ pageKey, rows: next });
    const nextPage = pageKeepingPlace(page, rows, next);
    set({
      [TABLE_ROWS_KEY]: next === SITE_DEFAULT_ROWS ? null : String(next),
      [TABLE_PAGE_KEY]: nextPage > 1 ? String(nextPage) : null,
    });
  }, [page, pageKey, rows, set]);

  return { page, setPage, rows, setRows };
}
