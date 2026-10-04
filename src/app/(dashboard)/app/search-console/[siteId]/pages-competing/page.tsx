"use client";

import { Split } from "lucide-react";
import { useTranslations } from "next-intl";
import { RecordLinkCell } from "../../../sites/_components/SiteCells";
import { Figure } from "@/src/ui/components/screens/Figure";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { SearchConsoleListScreen } from "../../_components/SearchConsoleListTable";
import { formatRate } from "../../_components/searchConsoleFormat";
import { pageLabel, useRecordHref } from "../../_components/searchConsoleRecords";
import { figureColumns, useSearchConsoleList, type ChipId } from "../../_components/SearchConsoleTables";

const CHIPS: readonly ChipId[] = ["intent", "band"];

/**
 * Pages competing (search-console-plan.md §13.3, drawn as "12 · Pages
 * competing"): keywords Google showed two or more of the website's pages
 * for, so they split the clicks — the two with the most clicks and each one's
 * share.
 */
export default function SearchConsoleCompetingPage() {
  const t = useTranslations("searchConsole");
  const list = useSearchConsoleList({ dimension: "query", view: "competing", chips: CHIPS });
  const recordHref = useRecordHref(list.siteId);
  const host = list.status?.host ?? "";
  const summary = list.summary;
  const days = list.range.days;
  const page = (value: string | null) => <span className="block truncate text-[12px] text-secondary">{value === null ? "–" : pageLabel(value, host)}</span>;
  return (
    <SearchConsoleListScreen
      icon={<Split className="h-5 w-5 text-brand" />}
      title={t("competing.title")}
      description={t("competing.description")}
      heroes={
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Figure label={t("competing.split")} value={summary ? formatNumber(summary.rows) : "…"} detail={<span className="text-secondary">{t("competing.ofShown", { count: formatNumber(summary?.of ?? 0) })}</span>} />
          <Figure label={t("competing.clicks")} value={summary ? formatNumber(summary.clicks) : "…"} detail={<span className="text-secondary">{t("common.inLast", { days })}</span>} />
          <Figure
            label={t("competing.pages")}
            value={summary?.pagesInvolved === null || summary === null ? "…" : formatNumber(summary.pagesInvolved)}
            detail={<span className="text-secondary">{t("competing.ofShown", { count: formatNumber(summary?.pagesShown ?? 0) })}</span>}
          />
        </div>
      }
      table={{
        list,
        chips: CHIPS,
        noun: "keywords",
        searchPlaceholder: t("keywords.searchPlaceholder"),
        rowHref: (row) => recordHref("keywords/keyword", row.key),
        emptyIcon: <Split className="h-8 w-8 text-muted/30" />,
        download: [
          { header: t("table.keyword"), field: "key" },
          { header: t("table.pages"), field: "count" },
          { header: t("table.clicks"), field: "clicks" },
          { header: t("table.topPage"), field: "top" },
          { header: `${t("table.share")} (%)`, field: "topShare" },
          { header: t("table.nextPage"), field: "next" },
          { header: `${t("table.share")} (%)`, field: "nextShare" },
        ],
        columns: [
          {
            key: "key",
            header: t("table.keyword"),
            sortable: true,
            className: "w-[24%] max-w-0",
            cell: (row) => <RecordLinkCell cut href={recordHref("keywords/keyword", row.key)}>{row.key}</RecordLinkCell>,
          },
          { key: "count", header: t("table.pages"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.count === null ? "–" : formatNumber(row.count)}</span> },
          ...figureColumns(t, ["clicks"]),
          { key: "top", header: t("table.topPage"), sortable: true, className: "w-[20%] max-w-0", cell: (row) => page(row.top) },
          { key: "topShare", header: t("record.share"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatRate(row.topShare)}</span> },
          { key: "next", header: t("table.nextPage"), sortable: true, className: "w-[20%] max-w-0", cell: (row) => page(row.next) },
          { key: "nextShare", header: t("record.share"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatRate(row.nextShare)}</span> },
        ],
      }}
    />
  );
}
