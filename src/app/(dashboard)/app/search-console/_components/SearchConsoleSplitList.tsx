"use client";

import { useTranslations } from "next-intl";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { formatNumber } from "../../sites/_components/siteFormat";

export type Split = { key: string; clicks: number; share: number };

/**
 * One of "Where the clicks came from"'s two short lists, beside a keyword's
 * or a page's chart: its clicks and its share of them. A `CompactList` inside
 * the panel, not a table — the whole list, every country, sorts on its own
 * screen (`SearchConsolePlacesScreen`).
 */
export function SearchConsoleSplitList({ heading, rows, name }: { heading: string; rows: Split[] | undefined; name: (key: string) => string }) {
  const t = useTranslations("searchConsole");
  return (
    <CompactList
      rows={rows}
      density="tight"
      rowKey={(row) => row.key}
      empty={t("record.noClicks")}
      loading={<span className="block h-16 animate-pulse rounded-lg bg-sidebar/30" aria-busy="true" />}
      columns={[
        // The name takes what the numbers leave, and a long one is cut rather than widening the panel.
        { key: "name", header: heading, className: "w-full max-w-0", cell: (row) => <span className="block truncate text-[13px] text-foreground">{name(row.key)}</span> },
        { key: "clicks", header: t("table.clicks"), align: "right", className: "whitespace-nowrap", cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.clicks)}</span> },
        { key: "share", header: t("record.share"), align: "right", className: "whitespace-nowrap", cell: (row) => <span className="font-mono text-[12px] text-secondary">{Math.round(row.share * 100)}%</span> },
      ]}
    />
  );
}
