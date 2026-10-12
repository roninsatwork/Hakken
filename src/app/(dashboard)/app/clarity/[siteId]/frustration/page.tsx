"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Frown } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { HakkenSees } from "@/src/ui/components/screens/HakkenSees";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { CHART_SERIES_ORANGE, CHART_SERIES_SLATE } from "@/src/ui/components/charts/chartPalette";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import type { ClarityRow } from "@/convex/utils/clarityRows";
import { SiteLineChart } from "../../../sites/_components/SiteCharts";
import { datedRow } from "../../../sites/_components/datedRows";
import { formatNumber, toCsv } from "../../../sites/_components/siteFormat";
import { formatPosition } from "../../../search-console/_components/searchConsoleFormat";
import { ListDownload } from "../../../sites/_components/SiteDownloads";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useSiteSearch } from "../../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../sites/_components/useSiteSort";
import { useClarityDays, useClaritySiteId, useClarityStatus } from "../../_components/useClarity";

/** A page's visits with a frustration: a dead click or a rage click, the larger of the two. */
const frustrated = (row: ClarityRow) => Math.max(row.dead ?? 0, row.rage ?? 0);
const SORTS: SiteSortColumns<ClarityRow, "page" | "visits" | "frustrated" | "dead" | "rage" | "excessive" | "quickBack"> = {
  page: { value: (row) => row.key, first: "asc" },
  visits: { value: (row) => row.sessions, first: "desc" },
  frustrated: { value: frustrated, first: "desc" },
  dead: { value: (row) => row.dead, first: "desc" },
  rage: { value: (row) => row.rage, first: "desc" },
  excessive: { value: (row) => row.excessiveScroll, first: "desc" },
  quickBack: { value: (row) => row.quickBack, first: "desc" },
};
const percent = (value: number | null) => (value === null ? "–" : `${formatPosition(value)}%`);
/** A page needs this many visits before its shares say anything. */
const FEW = 20;

/**
 * Clarity's Frustration (docs/plans/active/insights-analyst-plan.md I24,
 * phase 15, in the Clarity boards' menu): where visitors get stuck — clicks
 * on things that do nothing, clicks in anger, scrolling up and down hunting,
 * leaving within seconds — page by page, the most frustrated first, and the
 * share of visits with a frustration day by day.
 */
export default function ClarityFrustrationPage() {
  const t = useTranslations("clarity.frustration");
  const siteId = useClaritySiteId();
  const status = useClarityStatus();
  const days = useClarityDays();
  const data = useQuery(api.clarity.clarityFigures, { siteId, by: "PAGE", days });
  const [search, setSearch, term] = useSiteSearch();
  const matches = wordStartMatcher(term.toLowerCase());
  const matching = data?.rows.filter((row) => row.sessions >= FEW && (!matches || matches(row.key)));
  const { rows, tableSort } = useSiteSortedList(matching, SORTS, { opening: "frustrated", name: (row) => row.key });
  const pages = useSitePager(data ? rows : undefined, { isLoading: data === undefined });
  const worst = [...(data?.rows ?? [])].filter((row) => row.sessions >= FEW).sort((a, b) => frustrated(b) - frustrated(a))[0];
  const says = data && data.rows.length > 0
    ? [worst && frustrated(worst) > 0 ? t("sees.worst", { page: worst.key, share: formatPosition(frustrated(worst)) }) : t("sees.calm")]
    : [t("sees.none")];
  const chart = (data?.byDay ?? []).map((day) => datedRow({ day: day.day }, { dead: day.dead, rage: day.rage }));
  const csv = () => toCsv(["day", t("chart.dead"), t("chart.rage")], (data?.byDay ?? []).map((day) => [day.day, day.dead, day.rage]));
  return (
    <>
      <PageHeader icon={<Frown className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      <HakkenSees says={says} steps={[{ words: t("do"), link: t("seeReviews"), href: "/app/insights/page-reviews" }]} />
      <ChartCard title={t("chart.title")} hint={t("chart.hint")} exportName={`${status?.host ?? "site"}-clarity-frustration-by-day`} csv={csv} enoughData={chart.length > 1}>
        <SiteLineChart data={chart} sharedScale series={[{ key: "dead", name: t("chart.dead"), colour: CHART_SERIES_ORANGE }, { key: "rage", name: t("chart.rage"), colour: CHART_SERIES_SLATE }]} />
      </ChartCard>
      <DataTable
        rows={pages.pageRows}
        rowKey={(row) => row.key}
        search={{ value: search, onChange: setSearch, placeholder: t("search") }}
        cardHeader={<TableBar footer={pages.footer} noun="results" title={t("tableTitle", { count: rows?.length ?? 0, days })} actions={<ListDownload label={t("download")} fileName={`${status?.host ?? "site"}-clarity-frustration`} rows={rows} columns={[{ header: t("columns.page"), value: (row) => row.key }, { header: t("columns.visits"), value: (row) => row.sessions }, { header: t("columns.dead"), value: (row) => row.dead ?? "" }, { header: t("columns.rage"), value: (row) => row.rage ?? "" }, { header: t("columns.excessive"), value: (row) => row.excessiveScroll ?? "" }, { header: t("columns.quickBack"), value: (row) => row.quickBack ?? "" }]} />} />}
        empty={{ icon: <Frown className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : t("empty") }}
        footer={pages.footer}
        sort={tableSort}
        columns={[
          { key: "page", header: t("columns.page"), sortable: true, cell: (row) => <span className="truncate text-[13px] text-foreground">{row.key}</span> },
          { key: "visits", header: t("columns.visits"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.sessions)}</span> },
          { key: "frustrated", header: t("columns.frustrated"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{percent(frustrated(row))}</span> },
          { key: "dead", header: t("columns.dead"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{percent(row.dead)}</span> },
          { key: "rage", header: t("columns.rage"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{percent(row.rage)}</span> },
          { key: "excessive", header: t("columns.excessive"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{percent(row.excessiveScroll)}</span> },
          { key: "quickBack", header: t("columns.quickBack"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{percent(row.quickBack)}</span> },
        ]}
      />
    </>
  );
}
