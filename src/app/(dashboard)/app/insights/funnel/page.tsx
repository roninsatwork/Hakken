"use client";

import { useQuery } from "convex/react";
import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { Filter } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Change } from "@/src/ui/components/screens/Change";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { HakkenSees } from "@/src/ui/components/screens/HakkenSees";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { CHART_SERIES_ORANGE, CHART_SERIES_SLATE } from "@/src/ui/components/charts/chartPalette";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { SiteBarChart } from "../../sites/_components/SiteCharts";
import { formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { formatPosition } from "../../search-console/_components/searchConsoleFormat";
import { ListDownload } from "../../sites/_components/SiteDownloads";
import { useSitePager } from "../../sites/_components/useSitePagedTable";
import { useSiteSearch } from "../../sites/_components/useSiteParam";
import { useInsightsHref, useInsightsSite } from "../_components/useInsights";

const rate = (top: number | null, bottom: number | null) => (top !== null && bottom ? Math.round((top / bottom) * 1000) / 10 : null);
const moved = (now: number | null, before: number | null) => (now !== null && before ? Math.round(((now - before) / before) * 100) : null);

/**
 * The funnel (docs/plans/active/insights-analyst-plan.md §4.1, phase 14,
 * drawn as the Funnel board): from being shown on Google to enquiring, the
 * last 90 days against the same days a year before, each step from the
 * source that counts it; and each source's enquiry rate over 12 months.
 */
export default function InsightsFunnelPage() {
  const t = usePlatformTranslations("insights.funnel");
  const href = useInsightsHref();
  const site = useInsightsSite();
  const data = useQuery(api.insightsConversion.insightsConversion, site ? { siteId: site } : {});
  const [search, setSearch, term] = useSiteSearch("q", "sources");
  const [stepSearch, setStepSearch, stepTerm] = useSiteSearch("sq", "steps");
  const matches = wordStartMatcher(term.toLowerCase());
  const sources = data?.sources.filter((row) => !matches || matches(row.channel));
  const stepMatch = wordStartMatcher(stepTerm.toLowerCase());
  const stepRows = data?.funnel.filter((row) => !stepMatch || stepMatch(t(`steps.${row.step}`)));
  const steps = useSitePager(data ? stepRows : undefined, { isLoading: data === undefined, table: "steps" });
  const sourcePages = useSitePager(data ? sources : undefined, { isLoading: data === undefined });
  const header = <PageHeader icon={<Filter className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />;
  if (data === undefined) return <>{header}<div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" /></>;
  if (!data || data.funnel.every((step) => step.now === null)) return <>{header}<HakkenEmptyState icon={Filter} title={t("emptyTitle")} description={t("emptyDescription")} /></>;

  const at = (step: string) => data.funnel.find((row) => row.step === step);
  const shown = at("SHOWN"), clicked = at("CLICKED"), visited = at("VISITED"), enquired = at("ENQUIRED");
  // The step-to-step rates: what share go on to the next step, now and a year before.
  const rates = [
    { label: t("rates.click"), now: rate(clicked?.now ?? null, shown?.now ?? null), year: rate(clicked?.year ?? null, shown?.year ?? null) },
    { label: t("rates.visit"), now: rate(visited?.now ?? null, clicked?.now ?? null), year: rate(visited?.year ?? null, clicked?.year ?? null) },
    { label: t("rates.enquire"), now: rate(enquired?.now ?? null, visited?.now ?? null), year: rate(enquired?.year ?? null, visited?.year ?? null) },
  ];
  const weakest = rates.filter((row) => row.now !== null && row.year !== null && row.year > 0).sort((a, b) => (a.now! / a.year!) - (b.now! / b.year!))[0];
  const google = data.sources.find((row) => row.channel === "Organic Search");
  const googleRate = google ? rate(google.enquiries, google.visits) : null;
  const best = data.sources.filter((row) => row.visits >= 50 && row.enquiries > 0).sort((a, b) => b.enquiries / b.visits - a.enquiries / a.visits)[0];
  const says = [
    weakest ? t("sees.weakest", { step: weakest.label, now: formatPosition(weakest.now), year: formatPosition(weakest.year) }) : t("sees.noYear"),
    ...(best && googleRate ? [t("sees.best", { channel: best.channel, rate: formatPosition(rate(best.enquiries, best.visits)), google: formatPosition(googleRate) })] : []),
  ];
  const bars = rates.filter((row) => row.now !== null).map((row) => ({ label: row.label, year: row.year ?? 0, now: row.now ?? 0 }));
  const csv = () => toCsv([t("columns.step"), t("chart.year"), t("chart.now")], bars.map((row) => [row.label, row.year, row.now]));

  return (
    <>
      {header}
      <HakkenSees says={says} steps={[{ words: t("do"), link: t("seeReviews"), href: href("page-reviews") }]} />
      <ChartCard title={t("chart.title")} hint={t("chart.hint")} exportName={`${data.host}-funnel`} csv={csv} enoughData={bars.length > 0}>
        <SiteBarChart data={bars} series={[{ key: "year", name: t("chart.year"), colour: CHART_SERIES_SLATE }, { key: "now", name: t("chart.now"), colour: CHART_SERIES_ORANGE }]} horizontal />
      </ChartCard>
      <DataTable
        rows={steps.pageRows}
        rowKey={(row) => row.step}
        search={{ value: stepSearch, onChange: setStepSearch, placeholder: t("searchSteps") }}
        cardHeader={<TableBar footer={steps.footer} noun="results" title={t("stepsTitle")} actions={<ListDownload label={t("download")} fileName={`${data.host}-funnel`} rows={data.funnel} columns={[{ header: t("columns.step"), value: (row) => t(`steps.${row.step}`) }, { header: t("columns.now"), value: (row) => row.now ?? "" }, { header: t("columns.year"), value: (row) => row.year ?? "" }]} />} />}
        empty={{ icon: <Filter className="h-8 w-8 text-muted/30" />, label: t("emptyTitle") }}
        footer={steps.footer}
        columns={[
          { key: "step", header: t("columns.step"), cell: (row) => <span className="text-[13px] text-foreground">{t(`steps.${row.step}`)}</span> },
          { key: "now", header: t("columns.now"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.now)}</span> },
          { key: "year", header: t("columns.year"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.year)}</span> },
          { key: "change", header: t("columns.change"), align: "right", cell: (row) => <Change by={moved(row.now, row.year)} format={(value) => `${formatNumber(value)}%`} /> },
          { key: "source", header: t("columns.source"), cell: (row) => <TagLabel>{t(`sources.${row.source}`)}</TagLabel> },
        ]}
      />
      <DataTable
        rows={sourcePages.pageRows}
        rowKey={(row) => row.channel}
        search={{ value: search, onChange: setSearch, placeholder: t("search") }}
        cardHeader={<TableBar footer={sourcePages.footer} noun="results" title={t("sourcesTitle", { count: sources?.length ?? 0 })} actions={<ListDownload label={t("download")} fileName={`${data.host}-sources-enquiry-rate`} rows={sources} columns={[{ header: t("columns.channel"), value: (row) => row.channel }, { header: t("columns.visits"), value: (row) => row.visits }, { header: t("columns.enquiries"), value: (row) => row.enquiries }, { header: t("columns.rate"), value: (row) => rate(row.enquiries, row.visits) ?? "" }]} />} />}
        empty={{ icon: <Filter className="h-8 w-8 text-muted/30" />, label: t("noMatch") }}
        footer={sourcePages.footer}
        columns={[
          { key: "channel", header: t("columns.channel"), cell: (row) => <span className="text-[13px] text-foreground">{row.channel}</span> },
          { key: "visits", header: t("columns.visits"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.visits)}</span> },
          { key: "enquiries", header: t("columns.enquiries"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.enquiries)}</span> },
          { key: "rate", header: t("columns.rate"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-foreground">{rate(row.enquiries, row.visits) === null ? "–" : `${formatPosition(rate(row.enquiries, row.visits))}%`}</span> },
          { key: "rateBefore", header: t("columns.rateBefore"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{rate(row.enquiriesBefore, row.visitsBefore) === null ? "–" : `${formatPosition(rate(row.enquiriesBefore, row.visitsBefore))}%`}</span> },
        ]}
      />
    </>
  );
}
