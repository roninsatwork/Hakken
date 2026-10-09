"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { Change } from "@/src/ui/components/screens/Change";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteLineChart } from "../../../_components/SiteCharts";
import { RecordLinkCell, TrendCell } from "../../../_components/SiteCells";
import { formatMonth, formatNumber, toCsv } from "../../../_components/siteFormat";
import { ListDownload } from "../../../_components/SiteDownloads";
import { useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSitePager } from "../../../_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../_components/useSiteSort";
import { FigureCell } from "../../local/_components/LocalParts";

type Row = { keyword: string; from: "SEARCH" | "FAN_OUT" | "KEYWORD"; ai: number | null; aiMonths: number[]; google: number | null; googleMonths: number[] };

const FROM = ["SEARCH", "FAN_OUT", "KEYWORD"] as const;
const shareOf = (row: Row) => (row.ai !== null && row.google !== null && row.ai + row.google > 0 ? row.ai / (row.ai + row.google) : null);
const SORTS: SiteSortColumns<Row, "search" | "ai" | "trend" | "volume" | "share"> = {
  search: { value: (row) => row.keyword, first: "asc" },
  ai: { value: (row) => row.ai, first: "desc" },
  trend: { value: (row) => (row.aiMonths.length >= 4 && row.aiMonths.at(-4)! > 0 ? row.aiMonths.at(-1)! / row.aiMonths.at(-4)! : null), first: "desc" },
  volume: { value: (row) => row.google, first: "desc" },
  share: { value: shareOf, first: "desc" },
};
const keywordOf = (row: Row) => row.keyword;
/** Up a third or more in three months: rising. */
const RISING = 4 / 3;
/** A month counted from the newest, 0 the newest: series of different lengths line up by their newest month. */
const fromEnd = (series: number[], back: number) => series[series.length - 1 - back] ?? 0;
const sumBack = (rows: readonly Row[], pick: (row: Row) => number[], back: number) => rows.reduce((sum, row) => sum + fromEnd(pick(row), back), 0);
/** A year's change only over the searches with a whole year of figures. */
const YEAR = 11;
const percentChange = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);

/**
 * Discovery → AI answers → AI demand (docs/plans/active/discovery-local-
 * reputation-ai-plan.md, step 3, D18; drawn as "AI answers · AI demand"): how
 * often the website's searches are asked of AI tools a month, beside how often
 * they are searched on Google — an estimate, built from Google's "People also
 * ask", so a local search is often too few to count.
 */
export default function AiDemandPage() {
  const t = useTranslations("sites.aiApps.demand");
  const siteId = useSiteId();
  const site = useSite();
  const recordHref = useSiteRecordHref(siteId);
  const data = useQuery(api.siteAiDemand.aiDemand, { siteId });
  const [search, setSearch, term] = useSiteSearch();
  const [from, setFrom] = useSiteParam<(typeof FROM)[number] | "">("from", "", FROM);

  const matches = wordStartMatcher(term);
  const rows = data?.rows.filter((row) => (!from || row.from === from) && (!matches || matches(row.keyword))) as Row[] | undefined;
  const { rows: sorted, tableSort } = useSiteSortedList(rows, SORTS, { opening: "ai", name: keywordOf });
  const pager = useSitePager(sorted, { isLoading: data === undefined });
  const all = (data?.rows ?? []) as Row[];
  const tracked = all.filter((row) => row.from !== "KEYWORD");
  const aiNow = sumBack(all, (row) => row.aiMonths, 0);
  const googleNow = sumBack(all, (row) => row.googleMonths, 0);
  const aiYear = all.filter((row) => row.aiMonths.length > YEAR);
  const googleYear = all.filter((row) => row.googleMonths.length > YEAR);
  const aiChange = [sumBack(aiYear, (row) => row.aiMonths, 0), sumBack(aiYear, (row) => row.aiMonths, YEAR)] as const;
  const googleChange = [sumBack(googleYear, (row) => row.googleMonths, 0), sumBack(googleYear, (row) => row.googleMonths, YEAR)] as const;
  const rising = all.filter((row) => row.aiMonths.length >= 4 && row.aiMonths.at(-4)! > 0 && row.aiMonths.at(-1)! / row.aiMonths.at(-4)! >= RISING).length;
  const most = [...all].sort((left, right) => (right.ai ?? 0) - (left.ai ?? 0))[0];
  const months = Array.from({ length: 12 }, (_, at) => {
    if (!data?.month) return "";
    const [year, month] = data.month.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1 - (11 - at), 1));
    return date.toISOString().slice(0, 7);
  });
  const chartRows = months.map((month, at) => ({ label: month ? formatMonth(month) : "", ai: sumBack(tracked, (row) => row.aiMonths, 11 - at), google: sumBack(tracked, (row) => row.googleMonths, 11 - at) }));
  const fromWords = (row: Row) => t(`from.${row.from}`);
  const fileBase = `${site?.host ?? "site"}-ai-demand`;
  const change = (now: number, before: number) => {
    const by = percentChange(now, before);
    return by === null ? <span className="text-secondary">{t("figures.noYearBefore")}</span> : <><Change by={by} arrow={by >= 0 ? "up" : "down"} format={(value) => `${value}%`} /> <span className="text-secondary">{t("figures.yearBefore")}</span></>;
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Sparkles className="h-6 w-6 text-brand" />} title={t("title")} description={t("description")} />

      {data ? (
        <FigureRow>
          <Figure label={t("figures.ai")} emphasis value={data.month ? formatNumber(aiNow) : "–"} detail={data.month ? change(...aiChange) : <span className="text-secondary">{t("figures.notYet")}</span>} />
          <Figure label={t("figures.google")} value={formatNumber(googleNow)} detail={change(...googleChange)} />
          <Figure label={t("figures.rising")} value={rising} detail={<span className="text-secondary">{t("figures.risingDetail")}</span>} />
          <Figure label={t("figures.most")} value={most?.ai ? formatNumber(most.ai) : "–"} detail={<span className="text-secondary">{most?.ai ? most.keyword : t("figures.notYet")}</span>} />
        </FigureRow>
      ) : null}

      <SiteChartCard
        dated={false}
        title={t("chartTitle")}
        hint={t("chartHint", { count: tracked.length })}
        exportName={`${fileBase}-a-month`}
        csv={() => toCsv([t("chartMonth"), t("chartAi"), t("chartGoogle")], chartRows.map((row) => [row.label, row.ai, row.google]))}
        enoughData={Boolean(data?.month) && chartRows.some((row) => row.ai > 0 || row.google > 0)}
      >
        <SiteLineChart
          data={chartRows}
          series={[
            { key: "ai", name: t("chartAi"), colour: SITE_SERIES_COLOURS[0] },
            { key: "google", name: t("chartGoogle"), colour: SITE_SERIES_COLOURS[1] },
          ]}
        />
      </SiteChartCard>

      <DataTable
        rows={pager.pageRows}
        rowKey={(row) => row.keyword}
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <Select chip={{ label: t("fromFilter"), choice: from ? t(`fromFilters.${from}`) : null }} value={from} onChange={(value) => setFrom(value as (typeof FROM)[number] | "")}>
            <option value="">{t("everyList")}</option>
            {FROM.map((entry) => <option key={entry} value={entry}>{t(`fromFilters.${entry}`)}</option>)}
          </Select>
        }
        cardHeader={<TableBar footer={pager.footer} noun="searches" actions={<ListDownload fileName={fileBase} rows={sorted ?? []} columns={[{ header: t("columns.search"), value: (row) => row.keyword }, { header: t("columns.ai"), value: (row) => row.ai }, { header: t("columns.volume"), value: (row) => row.google }, { header: t("columns.share"), value: (row) => (shareOf(row) === null ? null : Math.round(shareOf(row)! * 100)) }, { header: t("columns.from"), value: fromWords }]} />} />}
        empty={{ icon: <Sparkles className="h-8 w-8 text-muted/30" />, label: term || from ? t("noMatch") : t("empty") }}
        footer={pager.footer}
        sort={tableSort}
        columns={[
          { key: "search", header: t("columns.search"), sortable: true, cell: (row) => <RecordLinkCell href={recordHref({ kind: "keyword", keyword: row.keyword })}>{row.keyword}</RecordLinkCell> },
          { key: "ai", header: t("columns.ai"), align: "right", sortable: true, cell: (row) => (row.ai === 0 ? <span className="text-[12px] text-muted">{t("tooFew")}</span> : <FigureCell value={row.ai} />) },
          { key: "trend", header: t("columns.trend"), sortable: true, cell: (row) => <TrendCell trend={row.aiMonths} label={t("trendLabel", { keyword: row.keyword })} /> },
          { key: "volume", header: t("columns.volume"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.google} /> },
          { key: "share", header: t("columns.share"), align: "right", sortable: true, cell: (row) => <FigureCell value={shareOf(row)} text={shareOf(row) === null ? undefined : `${Math.round(shareOf(row)! * 100)}%`} /> },
          { key: "from", header: t("columns.from"), cell: (row) => <TagLabel>{fromWords(row)}</TagLabel> },
        ]}
      />
    </div>
  );
}
