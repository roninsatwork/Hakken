"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { Sparkles } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { ChangeLine } from "@/src/ui/components/screens/Change";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { HakkenSees } from "@/src/ui/components/screens/HakkenSees";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { CHART_SERIES_BLUE, CHART_SERIES_ORANGE, CHART_SERIES_ROSE, CHART_SERIES_SLATE, CHART_SERIES_TEAL, CHART_SERIES_VIOLET } from "@/src/ui/components/charts/chartPalette";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { ENGINE_SCREEN_ORDER, useEngineLabel } from "@/src/ui/components/seo/engineLabel";
import { SiteBarChart } from "../../sites/_components/SiteCharts";
import { monthRow } from "../../sites/_components/datedRows";
import { formatDay, formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { ListDownload } from "../../sites/_components/SiteDownloads";
import { useSitePager } from "../../sites/_components/useSitePagedTable";
import { useSiteSearch } from "../../sites/_components/useSiteParam";
import { LABEL } from "../_components/StrategyNote";
import { monthsWords } from "../_components/insightPeriodWords";
import { useInsightsBox, useInsightsSite } from "../_components/useInsights";
import { boxedSays } from "../_components/insightBoxSays";

/** Your own figures in orange; the rivals and assistants away from it, none near your orange (Anthony is colour blind). */
const COLOURS = [CHART_SERIES_ORANGE, CHART_SERIES_BLUE, CHART_SERIES_VIOLET, CHART_SERIES_TEAL, CHART_SERIES_ROSE, CHART_SERIES_SLATE];
const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part * 1000) / whole) / 10 : 0);

/** A section's heading, as the Executive summary draws its own. */
function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 data-part-title="true" className={LABEL}>{title}</h2>
        <p className="max-w-[75ch] text-[13px] leading-[1.6] text-secondary">{hint}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * AI search over time (docs/plans/active/insights-intelligence-plan.md phase
 * 5): "are you growing in AI?" first — the visits and enquiries each
 * assistant sent, month by month, against the three months before and a year
 * ago, and the kinds of page they land on — then how each assistant answers
 * your questions against your rivals, the pages it cites, and where bought,
 * the mentions DataForSEO counts and how often your searches are asked of AI.
 */
export default function InsightsAiSearchPage() {
  const t = usePlatformTranslations("insights.aiSearch");
  // The box as its specialist wrote it this week (insights-one-voice-plan.md phase 4), else the screen's own sentences.
  const box = useInsightsBox("AI_SEARCH");
  const tBox = usePlatformTranslations("insights.box");
  const tPeriod = usePlatformTranslations("insights.period");
  const site = useInsightsSite();
  const engineName = useEngineLabel();
  const data = useQuery(api.insightAiSearch.insightsAiSearch, site ? { siteId: site } : {});
  // The eye's page figures (sees-every-page-plan-2026-10-31.md): one object while its answers stay the same, so it is not handed over again on every render.
  const seesData = useMemo(() => ({ aiSearch: data, box }), [data, box]);
  const [assistantSearch, setAssistantSearch, assistantTerm] = useSiteSearch("aq", "assistants");
  const [engineSearch, setEngineSearch, engineTerm] = useSiteSearch("eq", "engines");
  const [pageSearch, setPageSearch, pageTerm] = useSiteSearch("pq", "cited");
  const [demandSearch, setDemandSearch, demandTerm] = useSiteSearch("dq", "demand");
  const matcher = (term: string) => wordStartMatcher(term.toLowerCase());
  const assistants = data?.assistants.filter((row) => { const m = matcher(assistantTerm); return !m || m(row.name); });
  const own = data?.sites.find((row) => row.own);
  const newest = own?.months.reduce<string | null>((most, row) => (!most || row.month > most ? row.month : most), null) ?? null;
  const engineRows = ENGINE_SCREEN_ORDER.map((engine) => {
    const mine = own?.months.find((row) => row.month === newest && row.engine === engine);
    const rivals = (data?.sites ?? []).filter((row) => !row.own).map((row) => ({ host: row.host, named: row.months.find((entry) => entry.month === newest && entry.engine === engine)?.named ?? 0 }));
    const best = rivals.sort((a, b) => b.named - a.named)[0];
    return { engine, name: engineName(engine), asked: mine?.asked ?? 0, named: mine?.named ?? 0, recommended: mine?.recommended ?? 0, cited: mine?.cited ?? 0, best: best && best.named > 0 ? best : null };
  }).filter((row) => row.asked > 0);
  const engines = engineRows.filter((row) => { const m = matcher(engineTerm); return !m || m(row.name); });
  const cited = data?.citedPages.filter((row) => { const m = matcher(pageTerm); return !m || m(row.path); });
  const demand = data?.demand?.rows.filter((row) => { const m = matcher(demandTerm); return !m || m(row.search); });
  const assistantPager = useSitePager(data ? assistants ?? [] : undefined, { isLoading: data === undefined, table: "assistants" });
  const enginePager = useSitePager(data ? engines : undefined, { isLoading: data === undefined, table: "engines" });
  const citedPager = useSitePager(data ? cited ?? [] : undefined, { isLoading: data === undefined, table: "cited" });
  const demandPager = useSitePager(data ? demand ?? [] : undefined, { isLoading: data === undefined, table: "demand" });
  const header = <PageHeader icon={<Sparkles className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />;
  if (data === undefined) return <>{header}<div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" /></>;
  if (!data || (data.months.length === 0 && data.sites.every((row) => row.months.length === 0))) return <>{header}<HakkenEmptyState icon={Sparkles} title={t("emptyTitle")} description={t("emptyDescription")} /></>;

  const { now, before, yearAgo } = data.windows;
  const nowWords = now ? monthsWords(now.months, tPeriod) : "";
  const top = data.assistants[0];
  const ownNewest = engineRows.reduce((sum, row) => ({ asked: sum.asked + row.asked, named: sum.named + row.named, cited: sum.cited + row.cited }), { asked: 0, named: 0, cited: 0 });
  const bestEngine = [...engineRows].sort((a, b) => percent(b.named, b.asked) - percent(a.named, a.asked))[0];
  const says = [
    ...(now ? [t("sees.growing", { visits: formatNumber(now.visits), enquiries: formatNumber(now.enquiries), period: nowWords, before: before ? formatNumber(before.visits) : "–", yearAgo: yearAgo ? formatNumber(yearAgo.visits) : "–" })] : []),
    ...(top ? [t("sees.top", { name: top.name, visits: formatNumber(top.now), yearAgo: top.yearAgo === null ? "–" : formatNumber(top.yearAgo) })] : []),
    ...(bestEngine ? [t("sees.named", { engine: bestEngine.name, share: percent(bestEngine.named, bestEngine.asked), rival: bestEngine.best?.host ?? "", rivalShare: bestEngine.best ? percent(bestEngine.best.named, bestEngine.asked) : 0, hasRival: bestEngine.best ? "yes" : "no" })] : []),
    ...(data.since ? [t("sees.since", { day: formatDay(data.since) })] : []),
  ];

  // Visits from each assistant, month by month: the five that sent the most, the rest as one.
  const names = data.assistants.slice(0, 5).map((row) => row.name);
  const visitSeries = [...names.map((name, at) => ({ key: `a${at}`, name, colour: COLOURS[at] })), { key: "rest", name: t("others"), colour: CHART_SERIES_SLATE }];
  const visitRows = data.months.map((month) => monthRow(month.month, Object.fromEntries([
    ...names.map((name, at) => [`a${at}`, month.assistants.find((row) => row.name === name)?.visits ?? 0]),
    ["rest", month.assistants.filter((row) => !names.includes(row.name)).reduce((sum, row) => sum + row.visits, 0)],
  ])));
  const compareWords = yearAgo ? monthsWords(yearAgo.months, tPeriod) : before ? monthsWords(before.months, tPeriod) : "";
  const thenVisits = yearAgo?.visits ?? before?.visits ?? null;
  const thenEnquiries = yearAgo?.enquiries ?? before?.enquiries ?? null;
  const assistantBars = data.assistants.slice(0, 8).map((row) => ({ label: row.name, then: (yearAgo ? row.yearAgo : row.before) ?? 0, now: row.now }));
  const kindBars = data.kinds.slice(0, 8).map((row) => ({ label: row.name ?? t("notSorted"), visits: row.visits, enquiries: row.enquiries }));
  // Each assistant's newest month: the share of answers naming you, and each rival.
  const sites = data.sites;
  const shareRows = (field: "named" | "recommended") => engineRows.map((row) => ({
    label: row.name,
    ...Object.fromEntries(sites.map((entry, at) => [`s${at}`, percent(entry.months.find((month) => month.month === newest && month.engine === row.engine)?.[field] ?? 0, row.asked)])),
  }));
  const siteSeries = sites.map((entry, at) => ({ key: `s${at}`, name: entry.own ? t("you", { host: entry.host }) : entry.host, colour: COLOURS[at % COLOURS.length] }));
  const ownMonths = [...new Set(own?.months.map((row) => row.month) ?? [])].sort();
  const citedRows = ownMonths.map((month) => monthRow(month, Object.fromEntries(ENGINE_SCREEN_ORDER.map((engine) => [engine, own?.months.find((row) => row.month === month && row.engine === engine)?.cited ?? 0]))));
  const citedSeries = ENGINE_SCREEN_ORDER.map((engine, at) => ({ key: engine, name: engineName(engine), colour: COLOURS[(at + 1) % COLOURS.length] }));
  // Mentions a month, each website: Google's AI and ChatGPT's alike.
  type Mentions = NonNullable<typeof data.radar>;
  const mentionsChart = (list: Mentions) => {
    const months = [...new Set(list.flatMap((row) => row.months.map((entry) => entry.month)))].sort();
    return {
      rows: months.map((month) => monthRow(month, Object.fromEntries(list.map((row, at) => [`r${at}`, row.months.find((entry) => entry.month === month)?.mentions ?? 0])))),
      series: list.map((row, at) => ({ key: `r${at}`, name: row.own ? t("you", { host: row.host }) : row.host, colour: COLOURS[at % COLOURS.length] })),
    };
  };
  const radar = mentionsChart(data.radar ?? []);
  const chatgpt = mentionsChart(data.chatgpt ?? []);
  const mono = (value: number | null, suffix = "") => <span className="font-mono text-[12px] text-foreground">{value === null ? "–" : `${formatNumber(value)}${suffix}`}</span>;
  const pairSeries = [{ key: "then", name: compareWords, colour: CHART_SERIES_SLATE }, { key: "now", name: nowWords, colour: CHART_SERIES_ORANGE }];

  return (
    <>
      {header}
      <HakkenSees says={boxedSays(box, says, tBox)} steps={[]} page={{ screen: "insights.aiSearch", siteId: site, data: seesData }} />
      <FigureRow>
        <Figure label={t("figures.visits", { period: nowWords })} value={formatNumber(now?.visits ?? 0)} detail={<ChangeLine by={thenVisits === null ? null : (now?.visits ?? 0) - thenVisits}>{t("figures.against", { then: thenVisits === null ? "–" : formatNumber(thenVisits), period: compareWords })}</ChangeLine>} />
        <Figure label={t("figures.enquiries", { period: nowWords })} value={formatNumber(now?.enquiries ?? 0)} detail={<ChangeLine by={thenEnquiries === null ? null : (now?.enquiries ?? 0) - thenEnquiries}>{t("figures.against", { then: thenEnquiries === null ? "–" : formatNumber(thenEnquiries), period: compareWords })}</ChangeLine>} />
        <Figure label={t("figures.named")} value={`${percent(ownNewest.named, ownNewest.asked)}%`} detail={<span className="text-secondary">{t("figures.namedDetail", { named: formatNumber(ownNewest.named), asked: formatNumber(ownNewest.asked) })}</span>} />
        <Figure label={t("figures.cited")} value={formatNumber(ownNewest.cited)} detail={<span className="text-secondary">{t("figures.newestMonth")}</span>} />
      </FigureRow>

      <Section title={t("growing.title")} hint={t("growing.hint")}>
        <ChartCard title={t("growing.monthly")} hint={t("growing.monthlyHint")} exportName={`${data.host}-ai-visits`} csv={() => toCsv([t("month"), ...visitSeries.map((entry) => entry.name)], visitRows.map((row) => [String(row.month), ...visitSeries.map((entry) => Number(row[entry.key] ?? 0))]))} enoughData={visitRows.length > 1}>
          <SiteBarChart data={visitRows} series={visitSeries} stacked labels={(value, key) => (key === "a0" && value > 0 ? formatNumber(value) : null)} />
        </ChartCard>
        <ChartCard title={t("growing.against", { now: nowWords, then: compareWords })} hint={t("growing.againstHint")} exportName={`${data.host}-ai-assistants`} csv={() => toCsv([t("columns.assistant"), compareWords, nowWords], assistantBars.map((row) => [row.label, row.then, row.now]))} enoughData={assistantBars.length > 0 && Boolean(compareWords)}>
          <SiteBarChart horizontal data={assistantBars} series={pairSeries} labels={(value) => formatNumber(value)} />
        </ChartCard>
        <ChartCard title={t("growing.kinds", { period: nowWords })} hint={t("growing.kindsHint")} exportName={`${data.host}-ai-kinds`} csv={() => toCsv([t("columns.kind"), t("columns.visits"), t("columns.enquiries")], kindBars.map((row) => [row.label, row.visits, row.enquiries]))} enoughData={kindBars.length > 0}>
          <SiteBarChart horizontal data={kindBars} series={[{ key: "visits", name: t("columns.visits"), colour: CHART_SERIES_BLUE }, { key: "enquiries", name: t("columns.enquiries"), colour: CHART_SERIES_ORANGE }]} labels={(value) => formatNumber(value)} />
        </ChartCard>
        <DataTable
          rows={assistantPager.pageRows}
          rowKey={(row) => row.name}
          search={{ value: assistantSearch, onChange: setAssistantSearch, placeholder: t("growing.search") }}
          cardHeader={<TableBar footer={assistantPager.footer} noun="results" title={t("growing.table")} actions={<ListDownload label={t("download")} fileName={`${data.host}-ai-assistants`} rows={assistants} columns={[{ header: t("columns.assistant"), value: (row) => row.name }, { header: t("columns.now"), value: (row) => row.now }, { header: t("columns.before"), value: (row) => row.before ?? "" }, { header: t("columns.yearAgo"), value: (row) => row.yearAgo ?? "" }, { header: t("columns.enquiries"), value: (row) => row.enquiries }]} />} />}
          empty={{ icon: <Sparkles className="h-8 w-8 text-muted/30" />, label: t("noMatch") }}
          footer={assistantPager.footer}
          columns={[
            { key: "name", header: t("columns.assistant"), cell: (row) => <span className="text-[13px] text-foreground">{row.name}</span> },
            { key: "now", header: t("columns.now"), align: "right", cell: (row) => mono(row.now) },
            { key: "before", header: t("columns.before"), align: "right", cell: (row) => mono(row.before) },
            { key: "yearAgo", header: t("columns.yearAgo"), align: "right", cell: (row) => mono(row.yearAgo) },
            { key: "enquiries", header: t("columns.enquiries"), align: "right", cell: (row) => mono(row.enquiries) },
          ]}
        />
      </Section>

      <Section title={t("answers.title")} hint={data.since ? t("answers.hint", { day: formatDay(data.since) }) : t("answers.hintNone")}>
        <ChartCard title={t("answers.named", { month: newest ? monthsWords([newest], tPeriod) : "" })} hint={t("answers.namedHint")} exportName={`${data.host}-ai-named`} csv={() => toCsv([t("columns.assistant"), ...siteSeries.map((entry) => entry.name)], shareRows("named").map((row) => [row.label, ...siteSeries.map((entry) => Number((row as Record<string, unknown>)[entry.key] ?? 0))]))} enoughData={engineRows.length > 0}>
          <SiteBarChart horizontal data={shareRows("named")} series={siteSeries} labels={(value) => `${value}%`} formatScale={(value) => `${value}%`} />
        </ChartCard>
        <ChartCard title={t("answers.recommended", { month: newest ? monthsWords([newest], tPeriod) : "" })} hint={t("answers.recommendedHint")} exportName={`${data.host}-ai-recommended`} csv={() => toCsv([t("columns.assistant"), ...siteSeries.map((entry) => entry.name)], shareRows("recommended").map((row) => [row.label, ...siteSeries.map((entry) => Number((row as Record<string, unknown>)[entry.key] ?? 0))]))} enoughData={engineRows.length > 0}>
          <SiteBarChart horizontal data={shareRows("recommended")} series={siteSeries} labels={(value) => `${value}%`} formatScale={(value) => `${value}%`} />
        </ChartCard>
        <DataTable
          rows={enginePager.pageRows}
          rowKey={(row) => row.engine}
          search={{ value: engineSearch, onChange: setEngineSearch, placeholder: t("answers.search") }}
          cardHeader={<TableBar footer={enginePager.footer} noun="results" title={t("answers.table")} actions={<ListDownload label={t("download")} fileName={`${data.host}-ai-answers`} rows={engines} columns={[{ header: t("columns.assistant"), value: (row) => row.name }, { header: t("columns.asked"), value: (row) => row.asked }, { header: t("columns.named"), value: (row) => row.named }, { header: t("columns.recommended"), value: (row) => row.recommended }, { header: t("columns.cited"), value: (row) => row.cited }, { header: t("columns.bestRival"), value: (row) => row.best?.host ?? "" }]} />} />}
          empty={{ icon: <Sparkles className="h-8 w-8 text-muted/30" />, label: t("noMatch") }}
          footer={enginePager.footer}
          columns={[
            { key: "name", header: t("columns.assistant"), cell: (row) => <span className="text-[13px] text-foreground">{row.name}</span> },
            { key: "asked", header: t("columns.asked"), align: "right", cell: (row) => mono(row.asked) },
            { key: "named", header: t("columns.named"), align: "right", cell: (row) => mono(percent(row.named, row.asked), "%") },
            { key: "recommended", header: t("columns.recommended"), align: "right", cell: (row) => mono(percent(row.recommended, row.asked), "%") },
            { key: "cited", header: t("columns.cited"), align: "right", cell: (row) => mono(row.cited) },
            { key: "best", header: t("columns.bestRival"), cell: (row) => (row.best ? <span className="text-[12px] text-secondary">{t("bestRival", { host: row.best.host, share: percent(row.best.named, row.asked) })}</span> : <span className="text-[12px] text-muted">–</span>) },
          ]}
        />
      </Section>

      <Section title={t("cited.title")} hint={data.citedCut ? t("cited.hintCut") : t("cited.hint")}>
        <ChartCard title={t("cited.monthly")} hint={t("cited.monthlyHint")} exportName={`${data.host}-ai-cited`} csv={() => toCsv([t("month"), ...citedSeries.map((entry) => entry.name)], citedRows.map((row) => [String(row.month), ...citedSeries.map((entry) => Number(row[entry.key] ?? 0))]))} enoughData={citedRows.length > 0}>
          <SiteBarChart data={citedRows} series={citedSeries} stacked labels={(value, key) => (key === citedSeries[0].key && value > 0 ? formatNumber(value) : null)} />
        </ChartCard>
        <DataTable
          rows={citedPager.pageRows}
          rowKey={(row) => row.path}
          search={{ value: pageSearch, onChange: setPageSearch, placeholder: t("cited.search") }}
          cardHeader={<TableBar footer={citedPager.footer} noun="results" title={t("cited.table")} actions={<ListDownload label={t("download")} fileName={`${data.host}-ai-cited-pages`} rows={cited} columns={[{ header: t("columns.page"), value: (row) => row.path }, { header: t("columns.times"), value: (row) => row.times }, { header: t("columns.assistants"), value: (row) => row.engines.map((engine) => engineName(engine)).join(", ") }]} />} />}
          empty={{ icon: <Sparkles className="h-8 w-8 text-muted/30" />, label: t("noMatch") }}
          footer={citedPager.footer}
          columns={[
            { key: "page", header: t("columns.page"), cell: (row) => <span className="text-[13px] text-info">{row.path}</span> },
            { key: "times", header: t("columns.times"), align: "right", cell: (row) => mono(row.times) },
            { key: "engines", header: t("columns.assistants"), cell: (row) => <span className="flex flex-wrap gap-2">{row.engines.map((engine) => <TagLabel key={engine}>{engineName(engine)}</TagLabel>)}</span> },
          ]}
        />
      </Section>

      {data.radar ? (
        <Section title={t("radar.title")} hint={t("radar.hint")}>
          <ChartCard title={t("radar.monthly")} hint={t("radar.monthlyHint")} exportName={`${data.host}-ai-mentions`} csv={() => toCsv([t("month"), ...radar.series.map((entry) => entry.name)], radar.rows.map((row) => [String(row.month), ...radar.series.map((entry) => Number(row[entry.key] ?? 0))]))} enoughData={radar.rows.length > 0} emptyText={t("radar.empty")}>
            <SiteBarChart data={radar.rows} series={radar.series} labels={(value) => (value > 0 ? formatNumber(value) : null)} />
          </ChartCard>
        </Section>
      ) : null}

      {data.chatgpt ? (
        <Section title={t("chatgpt.title")} hint={t("chatgpt.hint")}>
          <ChartCard title={t("chatgpt.monthly")} hint={t("radar.monthlyHint")} exportName={`${data.host}-chatgpt-mentions`} csv={() => toCsv([t("month"), ...chatgpt.series.map((entry) => entry.name)], chatgpt.rows.map((row) => [String(row.month), ...chatgpt.series.map((entry) => Number(row[entry.key] ?? 0))]))} enoughData={chatgpt.rows.length > 0} emptyText={t("radar.empty")}>
            <SiteBarChart data={chatgpt.rows} series={chatgpt.series} labels={(value) => (value > 0 ? formatNumber(value) : null)} />
          </ChartCard>
        </Section>
      ) : null}

      {data.demand ? (
        <Section title={t("demand.title")} hint={data.demand.month ? t("demand.hint", { month: monthsWords([data.demand.month], tPeriod) }) : t("demand.hintNone")}>
          <DataTable
            rows={demandPager.pageRows}
            rowKey={(row) => row.search}
            search={{ value: demandSearch, onChange: setDemandSearch, placeholder: t("demand.search") }}
            cardHeader={<TableBar footer={demandPager.footer} noun="results" title={t("demand.table")} actions={<ListDownload label={t("download")} fileName={`${data.host}-ai-demand`} rows={demand} columns={[{ header: t("columns.search"), value: (row) => row.search }, { header: t("columns.askedOfAi"), value: (row) => row.ai }]} />} />}
            empty={{ icon: <Sparkles className="h-8 w-8 text-muted/30" />, label: t("noMatch") }}
            footer={demandPager.footer}
            columns={[
              { key: "search", header: t("columns.search"), cell: (row) => <span className="text-[13px] text-foreground">{row.search}</span> },
              { key: "ai", header: t("columns.askedOfAi"), align: "right", cell: (row) => mono(row.ai) },
            ]}
          />
        </Section>
      ) : null}
    </>
  );
}
