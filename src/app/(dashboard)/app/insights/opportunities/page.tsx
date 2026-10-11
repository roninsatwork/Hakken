"use client";

import { useQuery } from "convex/react";
import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { Target } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { HakkenSees, type HakkenSeesStep } from "@/src/ui/components/screens/HakkenSees";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { CHART_SERIES_ORANGE, CHART_SERIES_SLATE } from "@/src/ui/components/charts/chartPalette";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import type { Opportunity } from "@/convex/utils/insightPlan";
import { SiteScatterChart } from "../../sites/_components/SiteCharts";
import { formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { formatPosition } from "../../search-console/_components/searchConsoleFormat";
import { ListDownload } from "../../sites/_components/SiteDownloads";
import { useSitePager } from "../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../sites/_components/useSiteParam";
import { useInsightsHref, useInsightsSite } from "../_components/useInsights";

/** The places a search can be filtered to, each "from-to". */
const PLACES = ["4-30", "4-10", "11-20", "21-30"] as const;

/**
 * Opportunities (docs/plans/active/insights-analyst-plan.md §4.1, phase 9,
 * drawn as the Opportunities board): the searches the website nearly wins —
 * 4th to 30th on Google — ranked by what winning them is worth: how often
 * each is made, where the website stands and how well the page it lands on
 * turns visitors into enquiries. Search Console, Visibility and Analytics
 * together, as the newest run worked them out.
 */
export default function InsightsOpportunitiesPage() {
  const t = usePlatformTranslations("insights.opportunities");
  const tPlace = usePlatformTranslations("insights.place");
  const href = useInsightsHref();
  const site = useInsightsSite();
  const data = useQuery(api.insightsReads.insightsPlan, site ? { siteId: site } : {});
  const [search, setSearch, term] = useSiteSearch();
  const [service, setService] = useSiteParam<string>("service", "");
  const [places, setPlaces] = useSiteParam<string>("place", "4-30");
  const [from, to] = places.split("-").map(Number);
  const rows = data?.plan?.opportunities;
  const matches = wordStartMatcher(term.toLowerCase());
  const shown = rows?.filter((row) => (!service || row.service === service) && row.place >= (from || 4) - 0.5 && row.place <= (to || 30) + 0.5 && (!matches || matches(`${row.search} ${row.page ?? ""}`)));
  const pages = useSitePager(data ? shown : undefined, { isLoading: data === undefined });
  const header = <PageHeader icon={<Target className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />;
  if (data === undefined) return <>{header}<div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" /></>;
  if (!data?.plan || !rows || rows.length === 0) return <>{header}<HakkenEmptyState icon={Target} title={t("emptyTitle")} description={t("emptyDescription")} /></>;

  // A place to one decimal in the table, as Search Console averages it; in words, its nearest ordinal.
  const place = (value: number) => formatPosition(value);
  const ordinal = (value: number) => tPlace("ordinal", { place: Math.max(1, Math.round(value)) });
  const [best, next] = rows;
  const says = [
    best.volume !== null
      ? t("sees.best", { search: best.search, volume: formatNumber(best.volume), rate: formatPosition(best.rate), known: best.rate !== null ? "yes" : "no", place: ordinal(best.place) })
      : t("sees.bestShown", { search: best.search, shown: formatNumber(best.shown ?? 0), rate: formatPosition(best.rate), known: best.rate !== null ? "yes" : "no", place: ordinal(best.place) }),
    ...(next ? [t("sees.next", { search: next.search, place: ordinal(next.place) })] : []),
  ];
  const steps: HakkenSeesStep[] = rows.filter((row) => row.page).slice(0, 1).map((row) => ({ words: t("do", { page: row.page!, search: row.search }), link: t("seePlan"), href: href("page-plan") }));
  const services = [...new Set(rows.map((row) => row.service).filter((value): value is string => Boolean(value)))].sort();
  const rate = data.plan.siteRate;
  const dots = rows.filter((row) => row.shown !== null && row.shown > 0);
  const point = (row: Opportunity) => ({ x: row.place, y: row.shown!, label: row.search });
  const groups = [
    { key: "better", name: t("chart.better"), colour: CHART_SERIES_ORANGE, points: dots.filter((row) => rate !== null && row.rate !== null && row.rate >= rate).map(point) },
    { key: "rest", name: t("chart.rest"), colour: CHART_SERIES_SLATE, points: dots.filter((row) => !(rate !== null && row.rate !== null && row.rate >= rate)).map(point) },
  ];
  const csv = () => toCsv([t("columns.search"), t("columns.place"), t("columns.shown")], dots.map((row) => [row.search, row.place, row.shown ?? ""]));

  return (
    <>
      {header}
      <HakkenSees says={says} steps={steps} />
      <ChartCard title={t("chart.title")} hint={t("chart.hint", { rate: formatPosition(rate) })} exportName={`${data.host}-opportunities`} csv={csv} enoughData={dots.length > 1}>
        <SiteScatterChart groups={groups} xLabel={t("chart.x")} yLabel={t("chart.y")} readout={{ x: t("columns.place"), y: t("columns.shown") }} />
      </ChartCard>
      <DataTable
        rows={pages.pageRows}
        rowKey={(row) => row.search}
        search={{ value: search, onChange: setSearch, placeholder: t("search") }}
        filters={
          <>
            <Select chip={{ label: t("service"), choice: service || null }} value={service} onChange={setService} aria-label={t("service")}>
              <option value="">{t("everyService")}</option>
              {services.map((value) => <option key={value} value={value}>{value}</option>)}
            </Select>
            <Select chip={{ label: t("place"), choice: t(`places.${places}`) }} value={places} onChange={setPlaces} aria-label={t("place")}>
              {PLACES.map((value) => <option key={value} value={value}>{t(`places.${value}`)}</option>)}
            </Select>
          </>
        }
        cardHeader={<TableBar footer={pages.footer} noun="results" title={t("tableTitle", { count: shown?.length ?? 0 })} actions={<ListDownload label={t("download")} fileName={`${data.host}-opportunities`} rows={shown} columns={[{ header: t("columns.search"), value: (row) => row.search }, { header: t("columns.place"), value: (row) => row.place }, { header: t("columns.volume"), value: (row) => row.volume ?? "" }, { header: t("columns.shown"), value: (row) => row.shown ?? "" }, { header: t("columns.page"), value: (row) => row.page ?? "" }, { header: t("columns.converts"), value: (row) => (row.rate === null ? "" : `${row.rate}%`) }]} />} />}
        empty={{ icon: <Target className="h-8 w-8 text-muted/30" />, label: t("noMatch") }}
        footer={pages.footer}
        columns={[
          { key: "search", header: t("columns.search"), cell: (row) => <span className="text-[13px] text-foreground">{row.search}</span> },
          { key: "place", header: t("columns.place"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-foreground">{place(row.place)}</span> },
          { key: "volume", header: t("columns.volume"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.volume === null ? "–" : formatNumber(row.volume)}</span> },
          { key: "shown", header: t("columns.shown"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.shown === null ? "–" : formatNumber(row.shown)}</span> },
          { key: "page", header: t("columns.page"), cell: (row) => <span className="truncate text-[12px] text-secondary">{row.page ?? "–"}</span> },
          { key: "converts", header: t("columns.converts"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-foreground">{row.rate === null ? "–" : `${formatPosition(row.rate)}%`}</span> },
        ]}
      />
    </>
  );
}
