"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, type OptionalRestArgsOrSkip } from "convex/react";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { PagedFooterSpec } from "@/src/ui/components/screens/DataTable";
import { formatNumber } from "./siteFormat";
import { SITE_ROW_CHOICES } from "./siteTableRows";
import { useSiteTablePaging } from "./useSiteParam";

/**
 * The count under a Sites table, its numbers written as the rest of the page
 * writes them — "of 2,545", not "of 2545". For a list held to a limit (T11)
 * the total is of what could be read, and the footer says the whole list is
 * longer rather than passing that total off as everything.
 */
function useCountLabels(cut: number | null | undefined): NonNullable<PagedFooterSpec["labels"]> {
  const t = useTranslations("ui.table");
  return {
    showing: (start, end, total) =>
      t(cut ? "showingRangeCut" : "showingRange", { start: formatNumber(start), end: formatNumber(end), total: formatNumber(total) }),
  };
}

/**
 * A list the screen already holds whole — every Sites list the server caps
 * and sends at once — paged in the browser, with the numbered footer and the
 * rows choice (docs/plans/active/sites-table-pages-plan.md §2). The total is
 * the list's own length, so it is exact and any page opens at once.
 *
 * The page and the rows are kept in the address (`useSiteTablePaging`): Back
 * from a record's screen opens the page that was left, and a search or filter
 * kept in the address starts again at page one. `isLoading` is for a screen
 * whose list reads as empty while its query is still out.
 */
export function useSitePager<Row>(
  list: readonly Row[] | undefined,
  options: { isLoading?: boolean; cut?: number | null } = {},
): { pageRows: Row[] | undefined; footer: PagedFooterSpec } {
  const { page, setPage, rows, setRows } = useSiteTablePaging();
  const labels = useCountLabels(options.cut);
  const isLoading = options.isLoading ?? list === undefined;
  const total = list?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / rows));
  const shownPage = Math.min(page, totalPages);

  return {
    pageRows: isLoading ? undefined : (list ?? []).slice((shownPage - 1) * rows, shownPage * rows),
    footer: {
      mode: "paged",
      page: shownPage,
      totalPages,
      totalCount: total,
      pageSize: rows,
      isLoading,
      onPageChange: setPage,
      numbered: true,
      rowsChoice: { choices: SITE_ROW_CHOICES, value: rows, onChange: setRows },
      labels,
    },
  };
}

/** What every exact-page Sites query answers (`listPageResult` in `convex/siteListPages.ts`). */
type ListPage = { rows: unknown[]; total: number; page: number; pages: number; size: number; cut: number | null; preparing: boolean };
type ListPageQuery = FunctionReference<"query", "public", { page: number; rows: number }, ListPage>;

/** A compact copy a list is counted from, to be built if a table finds it missing (`ensureSiteListCopy`). */
export type CopyNeeded = {
  siteId: Id<"companyWebsites">;
  list: "keywords" | "pages" | "links" | "gap";
  /** For a competitor's shared searches: its keywords. */
  rivalId?: Id<"companyWebsites">;
};

/**
 * A Sites list the server pages and counts exactly: one request answers the
 * page, the list's total and its page count (docs/plans/active/
 * sites-table-pages-plan.md §5.3), so the footer shows the last page and
 * opens any page straight away. The page and rows come from the address, as
 * for `useSitePager`.
 *
 * While another page of the same list is on its way, the rows already on
 * screen stay, rather than the table flashing its loading row between pages;
 * a different search, filter or sort is a different list, and waits as a new
 * one does.
 *
 * A list counted from a compact copy (§5.2) answers `preparing` until its
 * copy exists — a site added since, or a copy in an older layout — and the
 * table asks for the copies in `copies` to be built, once, and shows its
 * loading row meanwhile.
 */
export function useSiteListPage<Query extends ListPageQuery>(
  query: Query,
  args: Omit<FunctionArgs<Query>, "page" | "rows"> | "skip",
  copies: readonly CopyNeeded[] = [],
): {
  pageRows: FunctionReturnType<Query>["rows"] | undefined;
  footer: PagedFooterSpec;
  result: FunctionReturnType<Query> | undefined;
} {
  const { page, setPage, rows, setRows } = useSiteTablePaging();
  const listKey = args === "skip" ? "skip" : JSON.stringify(args);
  // The args are the query's own plus the page and rows, which `Omit` cannot
  // prove to the compiler; the shape is checked by the query's validator.
  const answer = useQuery(query, ...((args === "skip" ? ["skip"] : [{ ...args, page, rows }]) as unknown as OptionalRestArgsOrSkip<Query>)) as
    FunctionReturnType<Query> | undefined;
  const preparing = answer?.preparing === true;
  const fresh = preparing ? undefined : answer;
  const [held, setHeld] = useState<{ listKey: string; result: FunctionReturnType<Query> } | null>(null);
  // Adjusted during render, as React recommends, so the held page never
  // trails the answer by a frame.
  if (fresh !== undefined && (held?.result !== fresh || held.listKey !== listKey)) setHeld({ listKey, result: fresh });
  const shown = fresh ?? (held?.listKey === listKey ? held.result : undefined);
  const labels = useCountLabels(shown?.cut);

  const ensure = useMutation(api.siteListCopyBuilders.ensureSiteListCopy);
  const copiesKey = JSON.stringify(copies);
  useEffect(() => {
    if (!preparing) return;
    for (const copy of JSON.parse(copiesKey) as CopyNeeded[]) {
      // A failure leaves the loading row; the next visit to the page asks again.
      void ensure(copy).catch(() => undefined);
    }
  }, [preparing, copiesKey, ensure]);

  return {
    pageRows: shown?.rows,
    result: shown,
    footer: {
      mode: "paged",
      page: shown?.page ?? page,
      totalPages: shown?.pages ?? 1,
      totalCount: shown?.total ?? 0,
      pageSize: shown?.size ?? rows,
      isLoading: shown === undefined,
      onPageChange: setPage,
      numbered: true,
      rowsChoice: { choices: SITE_ROW_CHOICES, value: rows, onChange: setRows },
      labels,
    },
  };
}
