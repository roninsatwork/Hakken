"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { Split } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { Change } from "@/src/ui/components/screens/Change";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { HakkenSees } from "@/src/ui/components/screens/HakkenSees";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { CHART_SERIES_ORANGE, CHART_SERIES_SLATE } from "@/src/ui/components/charts/chartPalette";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { SiteBarChart } from "../../sites/_components/SiteCharts";
import { formatDay, formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { ListDownload } from "../../sites/_components/SiteDownloads";
import { useSitePager } from "../../sites/_components/useSitePagedTable";
import { useSiteSearch } from "../../sites/_components/useSiteParam";
import { useInsightsHref, useInsightsSite } from "../_components/useInsights";

/**
 * Keyword cannibalisation (docs/plans/active/insights-intelligence-plan.md
 * phase 3; Anthony, 12 October 2026: "a specific keyword cannibalisation
 * section … under Findings"): every group of the website's pages that Google
 * shows for the same searches, biggest first — the searches they share and
 * split, times shown against clicks, the enquiries they bring, the page that
 * should own the searches and how sure Hakken is. A group opens its own page.
 */
export default function InsightsCannibalisationPage() {
  const t = usePlatformTranslations("insights.cannibalisation");
  const router = useRouter();
  const href = useInsightsHref();
  const site = useInsightsSite();
  const data = useQuery(api.insightCompeting.insightsCannibalisation, site ? { siteId: site } : {});
  const [search, setSearch, term] = useSiteSearch();
  const matches = wordStartMatcher(term.toLowerCase());
  const rows = data?.groups.filter((row) => !matches || matches(row.group.name) || row.group.pages.some((page) => matches(page.path)));
  const pager = useSitePager(data ? rows : undefined, { isLoading: data === undefined });
  const open = (key: string) => {
    const base = href("cannibalisation/group");
    return `${base}${base.includes("?") ? "&" : "?"}key=${encodeURIComponent(key)}`;
  };
  const header = <PageHeader icon={<Split className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />;
  if (data === undefined) return <>{header}<div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" /></>;
  if (!data || data.groups.length === 0) return <>{header}<HakkenEmptyState icon={Split} title={t("emptyTitle")} description={t("emptyDescription")} /></>;

  const groups = data.groups.map((row) => row.group);
  const first = data.groups[0];
  const span = { from: formatDay(first.from), to: formatDay(first.to) };
  const sum = (field: "shared" | "split" | "shown" | "clicks") => groups.reduce((total, group) => total + group[field], 0);
  const pages = groups.reduce((total, group) => total + group.pages.length, 0);
  const biggest = groups[0];
  const says = [
    t("sees.groups", { groups: groups.length, pages, shown: formatNumber(sum("shown")), clicks: formatNumber(sum("clicks")), ...span }),
    t("sees.biggest", { name: biggest.name, pages: biggest.pages.length, shared: formatNumber(biggest.shared), shown: formatNumber(biggest.shown), clicks: formatNumber(biggest.clicks) }),
  ];
  const steps = [{ words: t("do", { owner: biggest.owner, name: biggest.name }), link: t("seeGroup"), href: open(biggest.key) }];
  const shownBars = groups.map((group) => ({ label: group.name, shown: group.shown }));
  const clickBars = groups.map((group) => ({ label: group.name, clicks: group.clicks }));
  const mono = (value: number | null) => <span className="font-mono text-[12px] text-foreground">{value === null ? "–" : formatNumber(value)}</span>;

  return (
    <>
      {header}
      <HakkenSees says={says} steps={steps} />
      <FigureRow>
        <Figure label={t("figures.groups")} value={formatNumber(groups.length)} detail={<span className="text-secondary">{t("figures.pages", { count: pages })}</span>} />
        <Figure label={t("figures.split")} value={formatNumber(sum("split"))} detail={<span className="text-secondary">{t("figures.shared", { count: formatNumber(sum("shared")) })}</span>} />
        <Figure label={t("figures.shown")} value={formatNumber(sum("shown"))} detail={<span className="text-secondary">{t("figures.span", span)}</span>} />
        <Figure label={t("figures.clicks")} value={formatNumber(sum("clicks"))} detail={<span className="text-secondary">{t("figures.span", span)}</span>} />
      </FigureRow>
      <ChartCard title={t("charts.shown")} hint={t("charts.shownHint", span)} exportName={`${data.host}-cannibalisation-shown`} csv={() => toCsv([t("columns.group"), t("columns.shown")], shownBars.map((row) => [row.label, row.shown]))} enoughData={shownBars.length > 0}>
        <SiteBarChart horizontal data={shownBars} series={[{ key: "shown", name: t("columns.shown"), colour: CHART_SERIES_SLATE }]} labels={(value) => formatNumber(value)} />
      </ChartCard>
      <ChartCard title={t("charts.clicks")} hint={t("charts.clicksHint", span)} exportName={`${data.host}-cannibalisation-clicks`} csv={() => toCsv([t("columns.group"), t("columns.clicks")], clickBars.map((row) => [row.label, row.clicks]))} enoughData={clickBars.length > 0}>
        <SiteBarChart horizontal data={clickBars} series={[{ key: "clicks", name: t("columns.clicks"), colour: CHART_SERIES_ORANGE }]} labels={(value) => formatNumber(value)} />
      </ChartCard>
      <DataTable
        rows={pager.pageRows}
        rowKey={(row) => row.group.key}
        onRowClick={(row) => router.push(open(row.group.key))}
        search={{ value: search, onChange: setSearch, placeholder: t("search") }}
        cardHeader={<TableBar footer={pager.footer} noun="results" title={t("tableTitle")} actions={<ListDownload label={t("download")} fileName={`${data.host}-cannibalisation`} rows={rows} columns={[
          { header: t("columns.group"), value: (row) => row.group.name },
          { header: t("columns.pages"), value: (row) => row.group.pages.length },
          { header: t("columns.shared"), value: (row) => row.group.shared },
          { header: t("columns.split"), value: (row) => row.group.split },
          { header: t("columns.shown"), value: (row) => row.group.shown },
          { header: t("columns.clicks"), value: (row) => row.group.clicks },
          { header: t("columns.enquiries"), value: (row) => row.group.enquiries },
          { header: t("columns.owner"), value: (row) => row.group.owner },
          { header: t("columns.sure"), value: (row) => t(`sure.${row.group.sure}`) },
        ]} />} />}
        empty={{ icon: <Split className="h-8 w-8 text-muted/30" />, label: t("noMatch") }}
        footer={pager.footer}
        columns={[
          { key: "group", header: t("columns.group"), cell: (row) => <span className="flex flex-col"><span className="text-[13px] text-foreground">{row.group.name}</span><span className="text-[12px] text-secondary">{t("pagesCount", { count: row.group.pages.length })}</span></span> },
          { key: "shared", header: t("columns.shared"), align: "right", cell: (row) => mono(row.group.shared) },
          { key: "split", header: t("columns.split"), align: "right", cell: (row) => mono(row.group.split) },
          { key: "shown", header: t("columns.shown"), align: "right", cell: (row) => mono(row.group.shown) },
          { key: "clicks", header: t("columns.clicks"), align: "right", cell: (row) => mono(row.group.clicks) },
          { key: "enquiries", header: t("columns.enquiries"), align: "right", cell: (row) => mono(row.group.enquiries) },
          { key: "recent", header: t("columns.recent"), align: "right", cell: (row) => <span className="inline-flex items-center gap-2">{mono(row.group.recent)}{row.group.recentBefore === null ? null : <Change by={row.group.recent - row.group.recentBefore} format={(value) => formatNumber(value)} />}</span> },
          { key: "owner", header: t("columns.owner"), cell: (row) => <span className="text-[13px] text-info">{row.group.owner}</span> },
          { key: "sure", header: t("columns.sure"), cell: (row) => <StatusLabel tone={row.group.sure === "LIKELY" ? "info" : "neutral"}>{t(`sure.${row.group.sure}`)}</StatusLabel> },
        ]}
      />
    </>
  );
}
