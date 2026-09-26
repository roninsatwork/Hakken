/**
 * How many rows a Sites table shows a page (docs/plans/active/
 * sites-table-pages-plan.md, T2–T4): 25, 50, 75 or 100 — never more than the
 * 100 the server hands over at once (`SITE_PAGE_MAX` in
 * `convex/siteAccess.ts`) — opening at 25, and remembered per page in this
 * browser. Anthony, 2026-09-25: "The limits will be 25, 50, 75 and 100 rows
 * for the user selection"; of 25, "Yes this is the default"; of sharing one
 * choice across Sites, "One per page".
 *
 * A preference rather than data, so it lives in the browser instead of costing
 * a database write per change, as the composer's thinking level does
 * (`src/lib/composerPreferences.ts`). The read is defensive for the same
 * reasons: storage can be unavailable, and can hold a value another build
 * wrote. Anything unrecognised reads as no memory at all.
 */

export const SITE_ROW_CHOICES = [25, 50, 75, 100] as const;
export type SiteRows = (typeof SITE_ROW_CHOICES)[number];

export const SITE_DEFAULT_ROWS: SiteRows = 25;

export function isSiteRows(value: unknown): value is SiteRows {
  return typeof value === "number" && (SITE_ROW_CHOICES as readonly number[]).includes(value);
}

/** A choice as the address or storage spells it, or null when it is not one of the choices. */
export function siteRowsFromText(text: string | null | undefined): SiteRows | null {
  if (!text) return null;
  const value = Number(text);
  return isSiteRows(value) ? value : null;
}

/**
 * Which page a remembered choice belongs to: the path under the site —
 * "keywords/pages", "audit/problem" — so every site's All keywords shares one
 * memory, or "list" for the Sites list itself.
 */
export function siteRowsPageKey(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  const at = parts.indexOf("sites");
  if (at < 0) return parts.join("/");
  if (parts.length <= at + 1) return "list";
  return parts.slice(at + 2).join("/") || "overview";
}

const storageKey = (pageKey: string) => `hakken.sites.rows.${pageKey}`;

export function readRememberedRows(pageKey: string): SiteRows | null {
  if (typeof window === "undefined") return null;
  try {
    return siteRowsFromText(window.localStorage.getItem(storageKey(pageKey)));
  } catch {
    return null;
  }
}

export function rememberRows(pageKey: string, rows: SiteRows) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(pageKey), String(rows));
  } catch {
    // A browser that refuses storage still pages at the chosen size for this
    // visit; only the memory across visits is lost.
  }
}

/**
 * The page that keeps the first row being read on screen when the rows per
 * page change: rows 51–75 at 25 a page are page 3, and page 2 at 50.
 */
export function pageKeepingPlace(page: number, from: number, to: number): number {
  const firstRow = (Math.max(1, page) - 1) * from;
  return Math.floor(firstRow / to) + 1;
}
