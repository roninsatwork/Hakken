"use client";

import { useQuery } from "convex/react";
import { useSearchParams } from "next/navigation";
import { Inbox } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { HakkenSees } from "@/src/ui/components/screens/HakkenSees";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { CHART_SERIES_BLUE, CHART_SERIES_ORANGE } from "@/src/ui/components/charts/chartPalette";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { SiteBarChart } from "../../../sites/_components/SiteCharts";
import { monthRow } from "../../../sites/_components/datedRows";
import { formatNumber, toCsv } from "../../../sites/_components/siteFormat";
import { ListDownload } from "../../../sites/_components/SiteDownloads";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useSiteSearch } from "../../../sites/_components/useSiteParam";
import { monthsWords, periodWords, sourceWords } from "../../_components/insightPeriodWords";
import { useInsightsHref, useInsightsPeriodChoice, useInsightsSite } from "../../_components/useInsights";

const rate = (enquiries: number, visits: number) => (visits > 0 ? Math.round((enquiries * 1000) / visits) / 10 : null);

/**
 * One source's enquiries (insights-intelligence-plan.md phase 2; Anthony,
 * 2026-10-12: "show which assistant or Google brought those enquiries … a
 * detail click-through page"): the visits and enquiries it sent month by
 * month, against the period before and a year ago, and the pages and kinds of
 * page it sent people to.
 */
export default function InsightsEnquirySourcePage() {
  const t = usePlatformTranslations("insights.enquiries.sourcePage");
  const tEnquiries = usePlatformTranslations("insights.enquiries");
  const tPeriod = usePlatformTranslations("insights.period");
  const tWhy = usePlatformTranslations("insights.why");
  const href = useInsightsHref();
  const site = useInsightsSite();
  const period = useInsightsPeriodChoice();
  const name = useSearchParams().get("name") ?? "";
  const data = useQuery(api.insightsPeriod.insightsEnquirySource, { name, ...(site ? { siteId: site } : {}), ...(period ? { period } : {}) });
  const [search, setSearch, term] = useSiteSearch("q", "pages");
  const matches = wordStartMatcher(term.toLowerCase());
  // The source's figures, when it sent anyone in the months held.
  const full = data?.chosen ? data : null;
  const pages = full?.pages.filter((row) => !matches || matches(row.path) || matches(row.kind ?? ""));
  const pager = useSitePager(data === undefined ? undefined : pages ?? [], { isLoading: data === undefined });
  const shown = sourceWords(name, full?.group ?? "", { typed: tWhy("groups.TYPED"), unknown: tEnquiries("unknownSource") });
  const header = <DetailHeader back={{ href: href("enquiries"), label: t("back") }} icon={<Inbox className="h-5 w-5 text-brand" />} title={t("title", { name: shown })} description={t("description")} />;
  if (data === undefined) return <>{header}<div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" /></>;
  if (!full) return <>{header}<HakkenEmptyState icon={Inbox} title={t("emptyTitle")} description={t("emptyDescription")} /></>;

  const chosen = full.chosen;
  const nowWords = periodWords(chosen.id, tPeriod);
  const compare = chosen.yearAgo ?? chosen.before;
  const compareWords = compare ? monthsWords(compare, tPeriod) : "";
  const then = (trio: { before: number | null; yearAgo: number | null }) => (chosen.yearAgo ? trio.yearAgo : trio.before);
  const rows = full.months.map((month) => monthRow(month.month, { visits: month.visits, enquiries: month.enquiries }));
  const mono = (value: number | null, suffix = "") => <span className="font-mono text-[12px] text-foreground">{value === null ? "–" : `${formatNumber(value)}${suffix}`}</span>;

  return (
    <>
      {header}
      <HakkenSees says={[]} steps={[]} page={{ screen: "insights.enquiriesSource", siteId: site, data }} />
      <FigureRow>
        <Figure label={t("visits", { period: nowWords })} value={formatNumber(full.figures.visits.now)} detail={<span className="text-secondary">{tEnquiries("figures.against", { then: formatNumber(then(full.figures.visits) ?? 0), period: compareWords })}</span>} />
        <Figure label={t("enquiries", { period: nowWords })} value={formatNumber(full.figures.enquiries.now)} detail={<span className="text-secondary">{tEnquiries("figures.against", { then: formatNumber(then(full.figures.enquiries) ?? 0), period: compareWords })}</span>} />
        <Figure label={t("rate")} value={rate(full.figures.enquiries.now, full.figures.visits.now) === null ? "–" : `${rate(full.figures.enquiries.now, full.figures.visits.now)}%`} detail={<TagLabel>{tWhy(`groups.${full.group}`)}</TagLabel>} />
      </FigureRow>
      <ChartCard title={t("monthly", { name: shown })} hint={t("monthlyHint")} exportName={`insights-source-${name}`} csv={() => toCsv([tEnquiries("month"), t("visitsSeries"), t("enquiriesSeries")], rows.map((row) => [String(row.month), Number(row.visits), Number(row.enquiries)]))} enoughData={rows.length > 1}>
        <SiteBarChart data={rows} series={[{ key: "visits", name: t("visitsSeries"), colour: CHART_SERIES_BLUE }, { key: "enquiries", name: t("enquiriesSeries"), colour: CHART_SERIES_ORANGE }]} labels={(value) => (value > 0 ? formatNumber(value) : null)} />
      </ChartCard>
      <ChartCard title={t("kinds", { name: shown })} hint={t("kindsHint")} exportName={`insights-source-${name}-kinds`} csv={() => toCsv([tEnquiries("kind"), t("visitsSeries"), t("enquiriesSeries")], full.kinds.map((row) => [row.name ?? tEnquiries("notSorted"), row.visits, row.enquiries]))} enoughData={full.kinds.length > 0}>
        <SiteBarChart horizontal data={full.kinds.map((row) => ({ label: row.name ?? tEnquiries("notSorted"), visits: row.visits, enquiries: row.enquiries }))} series={[{ key: "visits", name: t("visitsSeries"), colour: CHART_SERIES_BLUE }, { key: "enquiries", name: t("enquiriesSeries"), colour: CHART_SERIES_ORANGE }]} labels={(value) => formatNumber(value)} />
      </ChartCard>
      <DataTable
        rows={pager.pageRows}
        rowKey={(row) => row.path}
        search={{ value: search, onChange: setSearch, placeholder: tEnquiries("behind.pageSearch") }}
        cardHeader={<TableBar footer={pager.footer} noun="results" title={t("pages", { name: shown })} actions={<ListDownload label={tEnquiries("download")} fileName={`insights-source-${name}-pages`} rows={pages} columns={[{ header: tEnquiries("columns.page"), value: (row) => row.path }, { header: tEnquiries("columns.visits"), value: (row) => row.visits }, { header: tEnquiries("columns.enquiries"), value: (row) => row.enquiries }]} />} />}
        empty={{ icon: <Inbox className="h-8 w-8 text-muted/30" />, label: tEnquiries("noMatch") }}
        footer={pager.footer}
        columns={[
          { key: "page", header: tEnquiries("columns.page"), cell: (row) => <span className="text-[13px] text-info">{row.path}</span> },
          { key: "kind", header: tEnquiries("kind"), cell: (row) => <TagLabel>{row.kind ?? tEnquiries("notSorted")}</TagLabel> },
          { key: "visits", header: tEnquiries("columns.visits"), align: "right", cell: (row) => mono(row.visits) },
          { key: "enquiries", header: tEnquiries("columns.enquiries"), align: "right", cell: (row) => mono(row.enquiries) },
          { key: "rate", header: tEnquiries("columns.rate"), align: "right", cell: (row) => mono(rate(row.enquiries, row.visits), "%") },
        ]}
      />
    </>
  );
}
