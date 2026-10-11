"use client";

import { useQuery } from "convex/react";
import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { useRouter } from "next/navigation";
import { ScanSearch } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { HakkenSees } from "@/src/ui/components/screens/HakkenSees";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { CHART_SERIES_ORANGE, CHART_SERIES_SLATE } from "@/src/ui/components/charts/chartPalette";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { VERDICTS, perEnquiry } from "@/convex/utils/insightConversion";
import { SiteBarChart } from "../../sites/_components/SiteCharts";
import { formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { ListDownload } from "../../sites/_components/SiteDownloads";
import { useSitePager } from "../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../sites/_components/useSiteParam";
import { useInsightsHref, useInsightsSite } from "../_components/useInsights";

/**
 * Page reviews (docs/plans/active/insights-analyst-plan.md §4.1, phase 14,
 * drawn as the Page reviews board): each page that brings enquiries, how many
 * visitors it takes to win one against a year before, and the Conversion
 * specialist's verdict. A page opens its own review.
 */
export default function InsightsPageReviewsPage() {
  const t = usePlatformTranslations("insights.pageReviews");
  const tVerdict = usePlatformTranslations("insights.verdicts");
  const router = useRouter();
  const href = useInsightsHref();
  const site = useInsightsSite();
  const data = useQuery(api.insightsConversion.insightsConversion, site ? { siteId: site } : {});
  const [search, setSearch, term] = useSiteSearch();
  const [verdict, setVerdict] = useSiteParam<string>("verdict", "");
  const matches = wordStartMatcher(term.toLowerCase());
  const rows = data?.pages.filter((row) => (!verdict || row.verdict === verdict) && (!matches || matches(`${row.page} ${row.title ?? ""}`)));
  const pages = useSitePager(data ? rows : undefined, { isLoading: data === undefined });
  const open = (page: string) => {
    const base = href("page-reviews/page");
    return `${base}${base.includes("?") ? "&" : "?"}page=${encodeURIComponent(page)}`;
  };
  const header = <PageHeader icon={<ScanSearch className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />;
  if (data === undefined) return <>{header}<div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" /></>;
  if (!data || data.pages.length === 0) return <>{header}<HakkenEmptyState icon={ScanSearch} title={t("emptyTitle")} description={t("emptyDescription")} /></>;

  const reviewed = data.pages.map((row) => ({ ...row, now: perEnquiry(row.visits, row.enquiries), before: row.visitsBefore !== null ? perEnquiry(row.visitsBefore, row.enquiriesBefore) : null }));
  const harder = reviewed.filter((row) => row.now !== null && row.before !== null && row.now > row.before);
  const best = reviewed.filter((row) => row.now !== null && row.enquiries >= 3).sort((a, b) => a.now! - b.now!)[0];
  const worst = [...harder].sort((a, b) => b.now! / b.before! - a.now! / a.before!)[0];
  const says = [
    worst ? t("sees.harder", { count: harder.length, all: reviewed.length, page: worst.page, now: formatNumber(worst.now), before: formatNumber(worst.before) }) : t("sees.noneHarder"),
    ...(best ? [t("sees.best", { page: best.page, now: formatNumber(best.now) })] : []),
  ];
  const first = reviewed.find((row) => row.verdict !== "KEEP");
  const steps = first ? [{ words: t("do", { page: first.page, verdict: tVerdict(first.verdict) }), link: t("seePage"), href: open(first.page) }] : [];
  const bars = reviewed.filter((row) => row.now !== null).slice(0, 8).map((row) => ({ label: row.page, before: row.before ?? 0, now: row.now ?? 0 }));
  const csv = () => toCsv([t("columns.page"), t("chart.before"), t("chart.now")], bars.map((row) => [row.label, row.before, row.now]));

  return (
    <>
      {header}
      <HakkenSees says={says} steps={steps} />
      <ChartCard title={t("chart.title")} hint={t("chart.hint")} exportName={`${data.host}-visitors-per-enquiry`} csv={csv} enoughData={bars.length > 0}>
        <SiteBarChart data={bars} series={[{ key: "before", name: t("chart.before"), colour: CHART_SERIES_SLATE }, { key: "now", name: t("chart.now"), colour: CHART_SERIES_ORANGE }]} horizontal />
      </ChartCard>
      <DataTable
        rows={pages.pageRows}
        rowKey={(row) => row.page}
        onRowClick={(row) => router.push(open(row.page))}
        search={{ value: search, onChange: setSearch, placeholder: t("search") }}
        filters={
          <Select chip={{ label: t("verdict"), choice: verdict ? tVerdict(verdict) : null }} value={verdict} onChange={setVerdict} aria-label={t("verdict")}>
            <option value="">{t("everyVerdict")}</option>
            {VERDICTS.map((value) => <option key={value} value={value}>{tVerdict(value)}</option>)}
          </Select>
        }
        cardHeader={<TableBar footer={pages.footer} noun="results" title={t("tableTitle", { count: rows?.length ?? 0 })} actions={<ListDownload label={t("download")} fileName={`${data.host}-page-reviews`} rows={rows} columns={[{ header: t("columns.page"), value: (row) => row.page }, { header: t("columns.visits"), value: (row) => row.visits }, { header: t("columns.perEnquiry"), value: (row) => perEnquiry(row.visits, row.enquiries) ?? "" }, { header: t("columns.before"), value: (row) => (row.visitsBefore !== null ? perEnquiry(row.visitsBefore, row.enquiriesBefore) ?? "" : "") }, { header: t("columns.verdict"), value: (row) => tVerdict(row.verdict) }]} />} />}
        empty={{ icon: <ScanSearch className="h-8 w-8 text-muted/30" />, label: t("noMatch") }}
        footer={pages.footer}
        columns={[
          { key: "page", header: t("columns.page"), cell: (row) => <span className="flex min-w-0 flex-col"><span className="truncate text-[13px] text-foreground">{row.page}</span>{row.title ? <span className="truncate text-[12px] text-secondary">{row.title.split("|")[0].trim()}</span> : null}</span> },
          { key: "visits", header: t("columns.visits"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.visits)}</span> },
          { key: "perEnquiry", header: t("columns.perEnquiry"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(perEnquiry(row.visits, row.enquiries))}</span> },
          { key: "before", header: t("columns.before"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.visitsBefore === null ? "–" : formatNumber(perEnquiry(row.visitsBefore, row.enquiriesBefore))}</span> },
          { key: "verdict", header: t("columns.verdict"), cell: (row) => <TagLabel className="text-foreground">{tVerdict(row.verdict)}</TagLabel> },
        ]}
      />
    </>
  );
}
