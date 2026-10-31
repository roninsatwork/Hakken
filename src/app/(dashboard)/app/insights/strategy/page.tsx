"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { useRouter } from "next/navigation";
import { Compass } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { ChangeLine } from "@/src/ui/components/screens/Change";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { HakkenSees } from "@/src/ui/components/screens/HakkenSees";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { CHART_SERIES_ORANGE, CHART_SERIES_SLATE } from "@/src/ui/components/charts/chartPalette";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import type { Verdict } from "@/convex/utils/insightStrategy";
import { SiteBarChart } from "../../sites/_components/SiteCharts";
import { formatDay, formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { ListDownload } from "../../sites/_components/SiteDownloads";
import { useSitePager } from "../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../sites/_components/useSiteParam";
import { useInsightsBox, useInsightsHref, useInsightsSite } from "../_components/useInsights";
import { boxedSays } from "../_components/insightBoxSays";
import { percentMoved, useServiceHref, useServiceName } from "../_components/strategyWords";

const TONE: Record<Verdict, "success" | "neutral" | "warning" | "info"> = { GROW: "success", STEADY: "neutral", BUYERS_WORDS: "warning", YOUR_CALL: "warning", READERS: "info" };
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"] as const;

/**
 * Strategy (docs/plans/active/insights-analyst-plan.md §4.1, drawn as the
 * Strategy board): the quarter's plan — which of the business's services to
 * grow, keep steady or change, judged on which pages bring enquiries against
 * a year before and how often Google shows them — and the roadmap: the three
 * findings most at stake, what to expect and how we'll know. A service opens
 * its own page.
 */
export default function InsightsStrategyPage() {
  const t = usePlatformTranslations("insights.strategy");
  // The box as its specialist wrote it this week (insights-one-voice-plan.md phase 4), else the screen's own sentences.
  const box = useInsightsBox("STRATEGY");
  const tBox = usePlatformTranslations("insights.box");
  const router = useRouter();
  const href = useInsightsHref();
  const site = useInsightsSite();
  const name = useServiceName();
  const serviceHref = useServiceHref();
  const data = useQuery(api.insightsReads.insightsStrategy, site ? { siteId: site } : {});
  // The eye's page figures (sees-every-page-plan-2026-10-31.md): one object while its answers stay the same, so it is not handed over again on every render.
  const seesData = useMemo(() => ({ strategy: data, box }), [data, box]);
  const [search, setSearch, term] = useSiteSearch();
  const [call, setCall] = useSiteParam<string>("call", "");
  const services = data?.services;
  const matches = wordStartMatcher(term.toLowerCase());
  const shown = services?.filter((service) => (!call || service.verdict === call) && (!matches || matches(name(service))));
  const pages = useSitePager(data ? shown : undefined, { isLoading: data === undefined });
  const roadmap = useSitePager(data ? data.roadmap : undefined, { isLoading: data === undefined, table: "roadmap" });
  const quarter = (() => {
    const day = data?.week ?? new Date().toISOString().slice(0, 10);
    const first = Math.floor((Number(day.slice(5, 7)) - 1) / 3) * 3;
    return t("quarter", { from: t(`months.${MONTHS[first]}`), to: t(`months.${MONTHS[first + 2]}`), year: day.slice(0, 4) });
  })();
  const header = <PageHeader icon={<Compass className="h-5 w-5 text-brand" />} title={t("title", { quarter })} description={t("description")} />;
  if (data === undefined) return <>{header}<div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" /></>;
  if (data === null || data.services.length === 0) return <>{header}<HakkenEmptyState icon={Compass} title={t("emptyTitle")} description={t("emptyDescription")} /></>;

  const grow = data.services.filter((service) => service.verdict === "GROW");
  const change = data.services.filter((service) => service.verdict === "BUYERS_WORDS" || service.verdict === "YOUR_CALL");
  const says = [
    t("sees.grow", { count: grow.length, services: grow.slice(0, 3).map(name).join(", ") }),
    change.length > 0 ? t("sees.change", { count: change.length, services: change.slice(0, 3).map(name).join(", ") }) : t("sees.noChange"),
  ];
  // Who made the calls (insights-one-voice-plan.md phase 3): the Head of Strategy, or the rule — said under the box either way.
  const called = t("sees.called", { agent: data.services.filter((service) => service.decidedBy === "AGENT").length });
  const steps = [...grow.slice(0, 2), ...change.slice(0, 1)].map((service) => ({ words: t(`do.${service.verdict}`, { service: name(service) }), link: t("seeService"), href: serviceHref(service) }));
  const bars = data.services.filter((service) => service.kind !== "GUIDES").slice(0, 8).map((service) => ({ label: name(service), before: service.enquiriesBefore ?? 0, now: service.enquiries }));
  const csv = () => toCsv([t("columns.service"), t("chart.before"), t("chart.now")], bars.map((row) => [row.label, row.before, row.now]));

  return (
    <>
      {header}
      <HakkenSees says={[...boxedSays(box, says, tBox), called]} steps={steps} page={{ screen: "insights.strategy", siteId: site, data: seesData }} />
      <ChartCard title={t("chart.title")} hint={t("chart.hint")} exportName={`${data.host}-services`} csv={csv} enoughData={bars.length > 0}>
        <SiteBarChart data={bars} series={[{ key: "before", name: t("chart.before"), colour: CHART_SERIES_SLATE }, { key: "now", name: t("chart.now"), colour: CHART_SERIES_ORANGE }]} horizontal labels={(value) => formatNumber(value)} />
      </ChartCard>
      <DataTable
        rows={pages.pageRows}
        rowKey={(row) => row.page}
        onRowClick={(row) => router.push(serviceHref(row))}
        search={{ value: search, onChange: setSearch, placeholder: t("search") }}
        filters={
          <Select chip={{ label: t("call"), choice: call ? t(`verdicts.${call}`) : null }} value={call} onChange={setCall} aria-label={t("call")}>
            <option value="">{t("everyCall")}</option>
            {(["GROW", "STEADY", "BUYERS_WORDS", "YOUR_CALL", "READERS"] as const).map((value) => <option key={value} value={value}>{t(`verdicts.${value}`)}</option>)}
          </Select>
        }
        cardHeader={<TableBar footer={pages.footer} noun="results" title={t("servicesTitle")} actions={<ListDownload label={t("download")} fileName={`${data.host}-strategy`} rows={shown} columns={[{ header: t("columns.service"), value: name }, { header: t("columns.enquiries"), value: (row) => row.enquiries }, { header: t("columns.before"), value: (row) => row.enquiriesBefore ?? "" }, { header: t("columns.call"), value: (row) => t(`verdicts.${row.verdict}`) }]} />} />}
        empty={{ icon: <Compass className="h-8 w-8 text-muted/30" />, label: term || call ? t("noMatch") : t("emptyTitle") }}
        footer={pages.footer}
        columns={[
          { key: "service", header: t("columns.service"), cell: (row) => <span className="flex min-w-0 flex-col"><span className="truncate text-[13px] text-foreground">{name(row)}</span><span className="truncate text-[12px] text-secondary">{row.kind === "GUIDES" ? t("guidesDetail") : row.page}</span></span> },
          { key: "enquiries", header: t("columns.enquiries"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.enquiries)}</span> },
          {
            key: "change",
            header: t("columns.change"),
            align: "right",
            cell: (row) => {
              const moved = percentMoved(row.enquiries, row.enquiriesBefore);
              if (row.enquiriesBefore === 0 && row.enquiries > 0) return <span className="text-[12px] text-info">{t("new")}</span>;
              return moved === null ? <span className="text-[12px] text-muted">–</span> : <ChangeLine by={moved}>{`${Math.abs(moved)}%`}</ChangeLine>;
            },
          },
          {
            key: "interest",
            header: t("columns.interest"),
            align: "right",
            cell: (row) => {
              const moved = percentMoved(row.impressions, row.impressionsBefore);
              return moved === null ? <span className="font-mono text-[12px] text-secondary">{formatNumber(row.impressions)}</span> : <ChangeLine by={moved}>{`${Math.abs(moved)}%`}</ChangeLine>;
            },
          },
          { key: "call", header: t("columns.call"), cell: (row) => <span className="flex flex-col gap-1"><StatusLabel tone={TONE[row.verdict]}>{t(`verdicts.${row.verdict}`)}</StatusLabel>{row.why ? <span className="text-[12px] text-secondary">{row.why}</span> : null}</span> },
        ]}
      />
      <DataTable
        rows={roadmap.pageRows}
        rowKey={(row) => row.findingId}
        onRowClick={(row) => router.push(href(`findings/${row.findingId}`))}
        cardHeader={<TableBar footer={roadmap.footer} noun="results" title={t("roadmapTitle")} actions={<ListDownload label={t("download")} fileName={`${data.host}-roadmap`} rows={data.roadmap} columns={[{ header: t("roadmap.what"), value: (row) => row.action }, { header: t("roadmap.expect"), value: (row) => row.expect }, { header: t("roadmap.know"), value: (row) => row.howWeKnow }, { header: t("roadmap.by"), value: (row) => row.checkOn ?? "" }]} />} />}
        empty={{ icon: <Compass className="h-8 w-8 text-muted/30" />, label: t("roadmapEmpty") }}
        footer={roadmap.footer}
        columns={[
          { key: "what", header: t("roadmap.what"), cell: (row) => <span className="text-[13px] text-foreground">{row.action}</span> },
          { key: "expect", header: t("roadmap.expect"), cell: (row) => <span className="text-[12px] text-secondary">{row.expect}</span> },
          { key: "know", header: t("roadmap.know"), cell: (row) => <span className="text-[12px] text-secondary">{row.howWeKnow}</span> },
          { key: "by", header: t("roadmap.by"), cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.checkOn ? formatDay(row.checkOn) : "–"}</span> },
        ]}
      />
    </>
  );
}
