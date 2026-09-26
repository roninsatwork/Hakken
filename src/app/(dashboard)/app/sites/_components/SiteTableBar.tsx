"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { PagedFooterSpec } from "@/src/ui/components/screens/DataTable";

/** What a table's rows are, for its count: "807 keywords", "531 linking websites". */
export type SiteTableNoun =
  | "keywords" | "searches" | "pages" | "websites" | "linkingWebsites" | "links" | "anchors" | "addresses"
  | "results" | "answers" | "queries" | "problems" | "sections" | "checks" | "weeks" | "groups" | "adverts"
  | "questionsAndSearches";

/**
 * The bar across the top of every Sites table, inside its card (`DataTable`'s
 * `cardHeader`): how many rows the list holds after its search and filters —
 * the footer's own exact total — then anything the list is compared with,
 * and its download on the right. The row above the card holds only the search
 * box and the filters, on one line (Anthony, 2026-09-26, showing Ahrefs'
 * Organic keywords; then "yes please to both" for every Sites table).
 *
 * A table inside a record's screen keeps its title here, with the count
 * beside it. The page's own header is above the card either way.
 */
export function SiteTableBar({
  footer,
  noun,
  title,
  description,
  children,
  actions,
}: {
  /** The table's footer: its total, and whether the list is still on its way. */
  footer: Pick<PagedFooterSpec, "isLoading" | "totalCount">;
  noun: SiteTableNoun;
  /** A table on a record's screen: what it lists. */
  title?: ReactNode;
  description?: ReactNode;
  /** Beside the count: what the list is compared with. */
  children?: ReactNode;
  /** On the right: the download. */
  actions?: ReactNode;
}) {
  const t = useTranslations("sites.tableCounts");
  const count = footer.isLoading ? "…" : t(noun, { count: footer.totalCount });
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-dim/50 bg-background/50 px-4 py-3">
      {title ? (
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h3 className="text-[14px] font-medium tracking-wide text-foreground">{title}</h3>
            {/* Read out when a filter changes it. */}
            <span aria-live="polite" className="text-[12px] text-secondary">{count}</span>
          </div>
          {description ? <p className="mt-0.5 text-[12px] text-secondary">{description}</p> : null}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span aria-live="polite" className="text-[13px] font-medium text-foreground">{count}</span>
          {children}
        </div>
      )}
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
