"use client";

import { MousePointerClick } from "lucide-react";
import { useTranslations } from "next-intl";
import { CUT_COLUMN, RecordLinkCell } from "../../../sites/_components/SiteCells";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { SearchConsoleListScreen } from "../../_components/SearchConsoleListTable";
import { formatRate } from "../../_components/searchConsoleFormat";
import { pageLabel, useRecordHref } from "../../_components/searchConsoleRecords";
import { figureColumns, useSearchConsoleList, type ChipId } from "../../_components/SearchConsoleTables";

const CHIPS: readonly ChipId[] = ["pageType", "band", "device"];

/**
 * Shown but not clicked (search-console-plan.md §13.3, drawn as "10 · Shown
 * but not clicked"): pages Google shows often that people rarely click for
 * where they sit — clicked less than the website's own click rate at their
 * position (Click rate by position) would bring, the most shown first.
 */
export default function SearchConsoleLowCtrPage() {
  const t = useTranslations("searchConsole");
  const list = useSearchConsoleList({ dimension: "page", view: "lowCtr", opening: "impressions", chips: CHIPS });
  const recordHref = useRecordHref(list.siteId);
  const host = list.status?.host ?? "";
  const summary = list.summary;
  const days = list.range.days;
  return (
    <SearchConsoleListScreen
      icon={<MousePointerClick className="h-5 w-5 text-brand" />}
      title={t("lowCtr.title")}
      description={t("lowCtr.description")}
      heroes={
        <FigureRow>
          <Figure label={t("lowCtr.below")} value={summary ? formatNumber(summary.rows) : "…"} detail={<span className="text-secondary">{t("lowCtr.ofShown", { count: formatNumber(summary?.of ?? 0) })}</span>} />
          <Figure label={t("lowCtr.impressions")} value={summary ? formatNumber(summary.impressions) : "…"} detail={<span className="text-secondary">{t("common.inLast", { days })}</span>} />
          <Figure label={t("lowCtr.clicks")} value={summary ? formatNumber(summary.clicks) : "…"} detail={<span className="text-secondary">{t("common.inLast", { days })}</span>} />
          <Figure label={t("lowCtr.atUsual")} value={summary ? formatNumber(summary.expected) : "…"} detail={<span className="text-secondary">{t("lowCtr.wouldHave")}</span>} />
        </FigureRow>
      }
      table={{
        list,
        chips: CHIPS,
        noun: "pages",
        searchPlaceholder: t("pages.searchPlaceholder"),
        rowHref: (row) => recordHref("pages/page", row.key),
        emptyIcon: <MousePointerClick className="h-8 w-8 text-muted/30" />,
        download: [
          { header: t("table.page"), field: "key" },
          { header: t("table.impressions"), field: "impressions" },
          { header: t("table.position"), field: "position" },
          { header: `${t("table.ctr")} (%)`, field: "ctr" },
          { header: `${t("table.usualCtr")} (%)`, field: "usualCtr" },
          { header: t("table.clicks"), field: "clicks" },
          { header: t("table.expected"), field: "expected" },
        ],
        columns: [
          {
            key: "key",
            header: t("table.page"),
            sortable: true,
            className: CUT_COLUMN.first,
            cell: (row) => <RecordLinkCell cut href={recordHref("pages/page", row.key)}>{pageLabel(row.key, host)}</RecordLinkCell>,
          },
          ...figureColumns(t, ["impressions", "position", "ctr"]),
          { key: "usualCtr", header: t("table.usualCtr"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatRate(row.usualCtr)}</span> },
          ...figureColumns(t, ["clicks"]),
          { key: "expected", header: t("table.expected"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.expected === null ? "–" : formatNumber(row.expected)}</span> },
        ],
      }}
    />
  );
}
