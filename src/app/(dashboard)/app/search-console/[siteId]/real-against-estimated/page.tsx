"use client";

import { Scale } from "lucide-react";
import { useTranslations } from "next-intl";
import { CUT_COLUMN, RecordLinkCell } from "../../../sites/_components/SiteCells";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { SearchConsoleListScreen } from "../../_components/SearchConsoleListTable";
import { pageLabel, useRecordHref } from "../../_components/searchConsoleRecords";
import { KindText, figureColumns, useSearchConsoleList, type ChipId, type ListRow } from "../../_components/SearchConsoleTables";

const CHIPS: readonly ChipId[] = ["verdict", "pageType"];

/**
 * Real against estimated (search-console-plan.md §13.3, drawn as "17 · Real
 * against estimated"): each page's clicks as Google counted them beside the
 * visits Sites estimated for it — too high or too low when more than a
 * quarter off Google's clicks, the furthest over first. Where they differ a
 * lot, Google's are the ones to trust.
 */
export default function SearchConsoleEstimatesPage() {
  const t = useTranslations("searchConsole");
  const tc = useTranslations("sites.common");
  const list = useSearchConsoleList({ dimension: "page", view: "estimates", opening: "gap", chips: CHIPS });
  // Once the website has classifications of its own, the Type column is the page's classification.
  const typeHeader = list.pageKinds.classified ? tc("classification") : t("table.type");
  const recordHref = useRecordHref(list.siteId);
  const host = list.status?.host ?? "";
  const summary = list.summary;
  const days = list.range.days;
  return (
    <SearchConsoleListScreen
      icon={<Scale className="h-5 w-5 text-brand" />}
      title={t("estimates.title")}
      description={t("estimates.description", { days })}
      heroes={
        <FigureRow>
          <Figure label={t("estimates.sites")} value={summary ? formatNumber(summary.estimate) : "…"} detail={<span className="text-secondary">{t("estimates.visitsIn", { days })}</span>} />
          <Figure label={t("estimates.google")} value={summary ? formatNumber(summary.clicks) : "…"} detail={<span className="text-secondary">{t("common.inLast", { days })}</span>} />
          <Figure label={t("estimates.high")} value={summary ? formatNumber(summary.high) : "…"} detail={<span className="text-secondary">{t("estimates.byAQuarter")}</span>} />
          <Figure label={t("estimates.low")} value={summary ? formatNumber(summary.low) : "…"} detail={<span className="text-secondary">{t("estimates.byAQuarter")}</span>} />
        </FigureRow>
      }
      table={{
        list,
        chips: CHIPS,
        noun: "pages",
        searchPlaceholder: t("pages.searchPlaceholder"),
        rowHref: (row) => recordHref("pages/page", row.key),
        emptyIcon: <Scale className="h-8 w-8 text-muted/30" />,
        download: [
          { header: t("table.page"), field: "key" },
          { header: typeHeader, field: "kind" },
          { header: t("table.clicks"), field: "clicks" },
          { header: t("table.estimate"), field: "estimate" },
          { header: t("table.difference"), field: "gap" },
          { header: t("filters.verdict"), field: "verdict" },
        ],
        columns: [
          {
            key: "key",
            header: t("table.page"),
            sortable: true,
            className: CUT_COLUMN.first,
            cell: (row) => <RecordLinkCell cut href={recordHref("pages/page", row.key)}>{pageLabel(row.key, host)}</RecordLinkCell>,
          },
          { key: "kind", header: typeHeader, sortable: true, cell: (row) => <KindText kind={row.kind} of="pageType" kinds={list.pageKinds} /> },
          ...figureColumns(t, ["clicks"]),
          { key: "estimate", header: t("table.estimate"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.estimate === null ? "–" : formatNumber(row.estimate)}</span> },
          { key: "gap", header: t("table.difference"), sortable: true, cell: (row) => <Difference row={row} /> },
        ],
      }}
    />
  );
}

/** An estimate against Google's clicks, in words: too high by so many, too low, or about right. */
function Difference({ row }: { row: ListRow }) {
  const t = useTranslations("searchConsole");
  if (row.verdict === null || row.gap === null) return <span className="text-muted">–</span>;
  if (row.verdict === "close") return <span className="whitespace-nowrap text-[13px] text-secondary">{t("estimates.aboutRight")}</span>;
  return row.verdict === "high"
    ? <span className="whitespace-nowrap text-[13px] text-warning">{t("estimates.tooHigh", { count: formatNumber(row.gap) })}</span>
    : <span className="whitespace-nowrap text-[13px] text-info">{t("estimates.tooLow", { count: formatNumber(-row.gap) })}</span>;
}
