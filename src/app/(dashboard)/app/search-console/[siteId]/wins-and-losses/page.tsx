"use client";

import { ArrowUpDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { CUT_COLUMN, RecordLinkCell } from "../../../sites/_components/SiteCells";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { SearchConsoleListScreen } from "../../_components/SearchConsoleListTable";
import { formatPosition } from "../../_components/searchConsoleFormat";
import { useRecordHref } from "../../_components/searchConsoleRecords";
import { BeforeAfter, figureColumns, useSearchConsoleList, type ChipId } from "../../_components/SearchConsoleTables";

const CHIPS: readonly ChipId[] = ["move", "band", "device"];

/**
 * Wins and losses (search-console-plan.md §13.3, drawn as "7 · Wins and
 * losses"): the keywords whose clicks changed on the same days before, the
 * most gained first — clicks and position read before → now. A keyword
 * whose clicks did not change is not listed.
 */
export default function SearchConsoleWinsPage() {
  const t = useTranslations("searchConsole");
  const list = useSearchConsoleList({ dimension: "query", view: "moves", opening: "change", chips: CHIPS });
  const recordHref = useRecordHref(list.siteId);
  const summary = list.summary;
  const days = list.range.days;
  return (
    <SearchConsoleListScreen
      icon={<ArrowUpDown className="h-5 w-5 text-brand" />}
      title={t("moves.title")}
      description={t("moves.description", { days })}
      heroes={
        <FigureRow>
          <Figure label={t("moves.gaining")} value={summary ? formatNumber(summary.gaining) : "…"} detail={<span className="text-secondary">{t("moves.against", { days })}</span>} />
          <Figure label={t("moves.losing")} value={summary ? formatNumber(summary.losing) : "…"} detail={<span className="text-secondary">{t("moves.against", { days })}</span>} />
          <Figure label={t("moves.gained")} value={summary ? `+${formatNumber(summary.gained)}` : "…"} detail={<span className="text-success">{t("moves.byGaining")}</span>} />
          <Figure label={t("moves.lost")} value={summary ? formatNumber(summary.lost) : "…"} detail={<span className="text-destructive">{t("moves.byLosing")}</span>} />
        </FigureRow>
      }
      table={{
        list,
        chips: CHIPS,
        noun: "keywords",
        searchPlaceholder: t("keywords.searchPlaceholder"),
        rowHref: (row) => recordHref("keywords/keyword", row.key),
        emptyIcon: <ArrowUpDown className="h-8 w-8 text-muted/30" />,
        download: [
          { header: t("table.keyword"), field: "key" },
          { header: t("moves.clicksBefore"), field: "previousClicks" },
          { header: t("table.clicks"), field: "clicks" },
          { header: t("table.change"), field: "change" },
          { header: t("moves.positionBefore"), field: "previousPosition" },
          { header: t("table.position"), field: "position" },
          { header: t("table.moved"), field: "positionChange" },
        ],
        columns: [
          {
            key: "key",
            header: t("table.keyword"),
            sortable: true,
            className: CUT_COLUMN.first,
            cell: (row) => <RecordLinkCell cut href={recordHref("keywords/keyword", row.key)}>{row.key}</RecordLinkCell>,
          },
          { key: "clicks", header: t("table.clicks"), align: "right", sortable: true, cell: (row) => <BeforeAfter before={row.previousClicks ?? 0} now={row.clicks} format={formatNumber} /> },
          ...figureColumns(t, ["change"]),
          { key: "position", header: t("table.position"), align: "right", sortable: true, cell: (row) => <BeforeAfter before={row.previousPosition} now={row.impressions > 0 ? row.position : null} format={formatPosition} /> },
          ...figureColumns(t, ["moved"]),
        ],
      }}
    />
  );
}
