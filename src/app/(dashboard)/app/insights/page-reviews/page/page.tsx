"use client";

import { useQuery } from "convex/react";
import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { useRouter, useSearchParams } from "next/navigation";
import { ScanSearch } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { HakkenSees } from "@/src/ui/components/screens/HakkenSees";
import { DetailHeader, PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { perEnquiry } from "@/convex/utils/insightConversion";
import { formatNumber, toCsv } from "../../../sites/_components/siteFormat";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { SiteBarChart } from "../../../sites/_components/SiteCharts";
import { CHART_SERIES_ORANGE } from "@/src/ui/components/charts/chartPalette";
import { formatPosition } from "../../../search-console/_components/searchConsoleFormat";
import { ListDownload } from "../../../sites/_components/SiteDownloads";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useSiteSearch } from "../../../sites/_components/useSiteParam";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { useInsightsHref, useInsightsSite } from "../../_components/useInsights";

const moved = (now: number | null, before: number | null) => (now !== null && before ? Math.round(((now - before) / before) * 100) : null);

/**
 * A page's review (docs/plans/active/insights-analyst-plan.md §4.1, phase 14,
 * drawn as the PageDetail board): how many visitors it takes to win one
 * enquiry against a year before, the Conversion specialist's verdict and
 * first steps — what the page should do, never its words (I22) — and the
 * searches that bring people to it, with the best rival on each.
 */
export default function InsightsPageReviewPage() {
  const t = usePlatformTranslations("insights.pageReview");
  const tVerdict = usePlatformTranslations("insights.verdicts");
  const router = useRouter();
  const href = useInsightsHref();
  const site = useInsightsSite();
  const path = useSearchParams().get("page") ?? "/";
  const data = useQuery(api.insightsConversion.insightsConversion, site ? { siteId: site } : {});
  const service = useQuery(api.insightsReads.insightsService, data ? { siteId: data.siteId, page: path } : "skip");
  const [search, setSearch, term] = useSiteSearch("q", "searches");
  const matches = wordStartMatcher(term.toLowerCase());
  const searchRows = service?.searches.filter((row) => !matches || matches(row.keyword));
  const searches = useSitePager(service ? searchRows : undefined, { isLoading: service === undefined, table: "searches" });
  const back = { href: href("page-reviews"), label: t("back") };
  if (data === undefined) return <div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />;
  const review = data?.pages.find((row) => row.page === path);
  if (!data || !review) return <HakkenEmptyState icon={ScanSearch} title={t("emptyTitle")} description={t("emptyDescription")} />;

  const now = perEnquiry(review.visits, review.enquiries), before = review.visitsBefore !== null ? perEnquiry(review.visitsBefore, review.enquiriesBefore) : null;
  const says = [
    t("sees.figures", { enquiries: formatNumber(review.enquiries), before: review.enquiriesBefore === null ? "–" : formatNumber(review.enquiriesBefore), now: formatNumber(now), then: formatNumber(before) }),
    ...(review.reason ? [review.reason] : []),
  ];
  // Visitors for one enquiry: the year before, the last 12 months, and the last 90 days — lower is better.
  const recent = review.visits90 !== undefined && review.visits90 !== null ? perEnquiry(review.visits90, review.enquiries90 ?? null) : null;
  const bars = [
    { label: t("chart.yearBefore"), value: before },
    { label: t("chart.lastYear"), value: now },
    { label: t("chart.last90"), value: recent },
  ];
  const csv = () => toCsv([t("chart.span"), t("chart.series")], bars.map((bar) => [bar.label, bar.value ?? ""]));
  const toTasks = () => router.push(`/app/assistant?ask=${encodeURIComponent(t("taskAsk", { host: data.host, page: review.page, steps: review.steps.join(" ") || tVerdict(review.verdict) }))}`);

  return (
    <>
      <DetailHeader
        back={back}
        icon={<ScanSearch className="h-6 w-6 text-brand" />}
        title={review.page}
        description={t("description", { host: data.host, title: review.title?.split("|")[0].trim() ?? review.page })}
        pills={<TagLabel className="text-foreground">{tVerdict(review.verdict)}</TagLabel>}
        action={<PagePrimaryAction variant="brand" onClick={toTasks}>{t("toTasks")}</PagePrimaryAction>}
      />
      <HakkenSees says={says} steps={review.steps.map((step) => ({ words: step, link: t("seeExperiments"), href: href("experiments") }))} />
      <FigureRow>
        <Figure label={t("figures.perEnquiry")} value={formatNumber(now)} detail={<span className="text-secondary">{t("figures.yearBefore", { value: formatNumber(before) })}</span>} />
        <Figure label={t("figures.enquiries")} value={formatNumber(review.enquiries)} detail={<span className="text-secondary">{moved(review.enquiries, review.enquiriesBefore) === null ? t("figures.twelveMonths") : t("figures.against", { by: formatNumber(moved(review.enquiries, review.enquiriesBefore)), before: formatNumber(review.enquiriesBefore) })}</span>} />
        <Figure label={t("figures.visits")} value={formatNumber(review.visits)} detail={<span className="text-secondary">{moved(review.visits, review.visitsBefore) === null ? t("figures.twelveMonths") : t("figures.against", { by: formatNumber(moved(review.visits, review.visitsBefore)), before: formatNumber(review.visitsBefore) })}</span>} />
        <Figure label={t("figures.clicks")} value={formatNumber(service?.service.clicks ?? null)} detail={<span className="text-secondary">{t("figures.clicksDetail")}</span>} />
      </FigureRow>
      <ChartCard title={t("chart.title")} hint={t("chart.hint")} exportName={`${data.host}-visitors-per-enquiry`} csv={csv} enoughData={bars.some((bar) => bar.value !== null)}>
        <SiteBarChart data={bars.map((bar) => ({ label: bar.label, value: bar.value ?? 0 }))} series={[{ key: "value", name: t("chart.series"), colour: CHART_SERIES_ORANGE }]} />
      </ChartCard>
      <DataTable
        rows={searches.pageRows}
        rowKey={(row) => row.keyword}
        search={{ value: search, onChange: setSearch, placeholder: t("search") }}
        cardHeader={<TableBar footer={searches.footer} noun="results" title={t("searchesTitle", { count: service?.searches.length ?? 0 })} actions={<ListDownload label={t("download")} fileName={`${data.host}-page-searches`} rows={service?.searches} columns={[{ header: t("columns.search"), value: (row) => row.keyword }, { header: t("columns.volume"), value: (row) => row.volume }, { header: t("columns.place"), value: (row) => row.position ?? "" }, { header: t("columns.rival"), value: (row) => row.rival ?? "" }]} />} />}
        empty={{ icon: <ScanSearch className="h-8 w-8 text-muted/30" />, label: t("noSearches") }}
        footer={searches.footer}
        columns={[
          { key: "search", header: t("columns.search"), cell: (row) => <span className="text-[13px] text-foreground">{row.keyword}</span> },
          { key: "volume", header: t("columns.volume"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.volume)}</span> },
          { key: "place", header: t("columns.place"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-foreground">{row.position === null ? "–" : formatPosition(row.position)}</span> },
          { key: "rival", header: t("columns.rival"), cell: (row) => <span className="text-[12px] text-secondary">{row.rival ? `${row.rival} (${formatPosition(row.rivalPosition)})` : "–"}</span> },
        ]}
      />
    </>
  );
}
