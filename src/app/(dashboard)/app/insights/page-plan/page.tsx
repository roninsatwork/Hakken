"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { ListChecks } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { HakkenSees, type HakkenSeesStep } from "@/src/ui/components/screens/HakkenSees";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { CHART_SERIES_BLUE, CHART_SERIES_ORANGE, CHART_SERIES_ROSE, CHART_SERIES_SLATE, CHART_SERIES_VIOLET } from "@/src/ui/components/charts/chartPalette";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { PLAN_ACTIONS, type PlanPage } from "@/convex/utils/insightPlan";
import { COMPETING_REASONS, VERDICTS, type PageDecision } from "@/convex/utils/insightDecisions";
import { SiteBarChart } from "../../sites/_components/SiteCharts";
import { formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { formatPosition } from "../../search-console/_components/searchConsoleFormat";
import { ListDownload } from "../../sites/_components/SiteDownloads";
import { useSitePager } from "../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../sites/_components/useSiteParam";
import { LABEL } from "../_components/StrategyNote";
import { useInsightsBox, useInsightsSite } from "../_components/useInsights";
import { boxedSays } from "../_components/insightBoxSays";

/** Each verdict's colour on the chart by kind of page: improve in orange, the page's own action; keep quiet grey. */
const VERDICT_COLOURS: Record<string, string> = { IMPROVE: CHART_SERIES_ORANGE, MERGE: CHART_SERIES_VIOLET, REDIRECT: CHART_SERIES_BLUE, REMOVE: CHART_SERIES_ROSE, KEEP: CHART_SERIES_SLATE };
/** A verdict's tone: what to act on warns, keeping is quiet. The words carry it, never the colour alone. */
const VERDICT_TONE = { IMPROVE: "warning", MERGE: "info", REDIRECT: "info", REMOVE: "danger", KEEP: "neutral" } as const;

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
 * Page decisions (docs/plans/active/insights-intelligence-plan.md phase 4,
 * "the Page plan taken further"; first drawn as the Page plan board): a
 * verdict for every page of the website — keep, improve, merge, redirect,
 * remove — by kind of page; the pages most at stake first, each with the
 * search it should win and its one thing to do; then every page; then the
 * pages to create. What each page should do, never its words (I22).
 */
export default function InsightsPagePlanPage() {
  const t = usePlatformTranslations("insights.pagePlan");
  const tDecide = usePlatformTranslations("insights.decisions");
  const tPlace = usePlatformTranslations("insights.place");
  const tBox = usePlatformTranslations("insights.box");
  // The Page decisions specialist's summary of its decisions, when it wrote one this week; else the screen's own sentences.
  const box = useInsightsBox("PAGE_DECISIONS");
  const site = useInsightsSite();
  const data = useQuery(api.insightsReads.insightsPlan, site ? { siteId: site } : {});
  const decided = useQuery(api.insightDecisions.insightsPageDecisions, site ? { siteId: site } : {});
  // The eye's page figures (sees-every-page-plan-2026-10-31.md): one object while its answers stay the same, so it is not handed over again on every render.
  const seesData = useMemo(() => ({ plan: data, decisions: decided, box }), [data, decided, box]);
  const [search, setSearch, term] = useSiteSearch();
  const [action, setAction] = useSiteParam<string>("action", "");
  const [pageSearch, setPageSearch, pageTerm] = useSiteSearch("pq", "every");
  const [verdict, setVerdict] = useSiteParam<string>("verdict", "");
  const [createSearch, setCreateSearch, createTerm] = useSiteSearch("cq", "create");
  const rows = data?.plan?.pages;
  // Rates keep their decimal (5.1%); counts are whole.
  const rated = (row: PlanPage) => row.why === "bestRate" || row.why === "rateFell";
  const figure = (row: PlanPage, value: number | null) => (value === null ? "" : rated(row) ? formatPosition(value) : formatNumber(value));
  const why = (row: PlanPage) => t(`why.${row.why}`, { a: figure(row, row.a), b: row.why === "bestRate" ? "" : figure(row, row.b), count: row.b ?? 0, place: row.b === null ? "" : tPlace("ordinal", { place: row.b }) });
  const matches = wordStartMatcher(term.toLowerCase());
  const shown = rows?.filter((row) => (!action || row.action === action) && (!matches || matches(`${row.page} ${row.shouldWin.join(" ")}`)));
  const pages = useSitePager(data ? shown ?? [] : undefined, { isLoading: data === undefined });
  const pageMatches = wordStartMatcher(pageTerm.toLowerCase());
  const every = decided?.decisions.filter((row) => (!verdict || row.verdict === verdict) && (!pageMatches || pageMatches(row.path) || pageMatches(row.kind ?? "")));
  const everyPager = useSitePager(decided === undefined ? undefined : every ?? [], { isLoading: decided === undefined, table: "every" });
  const createMatches = wordStartMatcher(createTerm.toLowerCase());
  const creates = decided?.creates.filter((row) => !createMatches || createMatches(row.search));
  const createPager = useSitePager(decided === undefined ? undefined : creates ?? [], { isLoading: decided === undefined, table: "create" });
  const header = <PageHeader icon={<ListChecks className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />;
  if (data === undefined || decided === undefined) return <>{header}<div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" /></>;
  const planned = rows ?? [];
  const decisions = decided?.decisions ?? [];
  if (planned.length === 0 && decisions.length === 0) return <>{header}<HakkenEmptyState icon={ListChecks} title={t("emptyTitle")} description={t("emptyDescription")} /></>;

  const count = (value: string) => decisions.filter((row) => row.verdict === value).length;
  const lost = planned.filter((row) => row.action === "REBUILD" || row.action === "RESTORE");
  const reach = planned.filter((row) => row.action === "STRENGTHEN");
  const topCreate = decided?.creates[0];
  const everySays = decisions.length > 0 ? [tDecide("sees.every", { pages: decided?.pages ?? decisions.length, improve: count("IMPROVE"), merge: count("MERGE"), redirect: count("REDIRECT"), remove: count("REMOVE"), keep: count("KEEP") })] : [];
  // Who decided (insights-one-voice-plan.md, the standard): the Page decisions specialist, Keyword cannibalisation's, or the rule.
  const decidedSays = decisions.length > 0 ? [tDecide("sees.decided", {
    agent: decisions.filter((row) => row.decidedBy === "AGENT" && !COMPETING_REASONS.has(row.reason)).length,
    competing: decisions.filter((row) => COMPETING_REASONS.has(row.reason)).length,
  })] : [];
  const planSays = [
    lost.length > 0 ? t("sees.lost", { count: lost.length, page: lost[0].page, a: formatNumber(lost[0].a ?? 0), b: formatNumber(lost[0].b ?? 0) }) : t("sees.noneLost"),
    ...(reach.length > 0 ? [t("sees.reach", { count: reach.length, pages: reach.map((row) => row.page).join(", ") })] : []),
  ];
  const createSays = topCreate ? [tDecide("sees.create", { count: decided?.creates.length ?? 0, search: topCreate.search, volume: formatNumber(topCreate.volume ?? 0) })] : [];
  // The Page decisions specialist's summary takes the counts' place when it wrote one; who decided the pages, and the page plan's, follow.
  const says = box && decisions.length > 0
    ? [...boxedSays(box, [...everySays, ...createSays], tBox), ...decidedSays, ...planSays]
    : [...everySays, ...decidedSays, ...planSays, ...createSays];
  const stepWords = (row: PlanPage) => t(`do.${row.action}`, { page: row.page, search: row.shouldWin[0] ?? "" });
  const steps: HakkenSeesStep[] = planned.slice(0, 3).map((row) => ({ words: stepWords(row), link: t("addTask"), href: `/app/assistant?ask=${encodeURIComponent(stepWords(row))}` }));
  const bars = planned.filter((row) => row.enquiriesBefore !== null).slice(0, 8).map((row) => ({ label: row.page, before: row.enquiriesBefore ?? 0, now: row.enquiries }));
  const csv = () => toCsv([t("columns.page"), t("chart.before"), t("chart.now")], bars.map((row) => [row.label, row.before, row.now]));

  // Verdicts by kind of page: the company's own classifications, the most pages first.
  const kindName = (row: PageDecision) => row.kind ?? tDecide("notSorted");
  const kinds = [...new Set(decisions.map(kindName))]
    .map((kind): { label: string } & Record<string, string | number> => ({ label: kind, ...Object.fromEntries(VERDICTS.map((value) => [value, decisions.filter((row) => kindName(row) === kind && row.verdict === value).length])) }))
    .sort((a, b) => VERDICTS.reduce((sum, value) => sum + Number(b[value]), 0) - VERDICTS.reduce((sum, value) => sum + Number(a[value]), 0))
    .slice(0, 10);
  // The specialist's own sentence where one decided the page; else the rule's reason.
  const reasonWords = (row: PageDecision) => row.why || tDecide(`reasons.${row.reason}`, { into: row.into ?? "", domains: row.domains ?? 0 });
  const mono = (value: number | null) => <span className="font-mono text-[12px] text-foreground">{value === null ? "–" : formatNumber(value)}</span>;

  return (
    <>
      {header}
      <HakkenSees says={says} steps={steps} page={{ screen: "insights.pagePlan", siteId: site, data: seesData }} />
      {decisions.length > 0 ? (
        <>
          <FigureRow>
            {/* Merging and redirecting both send a page's visitors to another: one figure, so the row fits. */}
            {([["IMPROVE", count("IMPROVE")], ["MOVE", count("MERGE") + count("REDIRECT")], ["REMOVE", count("REMOVE")], ["KEEP", count("KEEP")]] as const).map(([value, total]) => (
              <Figure key={value} label={tDecide(`figures.${value}`)} value={formatNumber(total)} detail={<span className="text-secondary">{tDecide("figures.of", { pages: decided?.pages ?? decisions.length })}</span>} />
            ))}
          </FigureRow>
          <ChartCard title={tDecide("chart.title")} hint={tDecide("chart.hint")} exportName={`${decided?.host ?? "website"}-page-decisions`} csv={() => toCsv([tDecide("columns.kind"), ...VERDICTS.map((value) => tDecide(`verdicts.${value}`))], kinds.map((row) => [row.label, ...VERDICTS.map((value) => Number(row[value]))]))} enoughData={kinds.length > 0}>
            <SiteBarChart horizontal stacked data={kinds} series={VERDICTS.map((value) => ({ key: value, name: tDecide(`verdicts.${value}`), colour: VERDICT_COLOURS[value] }))} labels={(value) => (value > 0 ? formatNumber(value) : null)} />
          </ChartCard>
        </>
      ) : null}

      <Section title={tDecide("first.title")} hint={tDecide("first.hint")}>
        <ChartCard title={t("chart.title")} hint={t("chart.hint")} exportName={`${data?.host ?? "website"}-page-plan`} csv={csv} enoughData={bars.length > 0}>
          <SiteBarChart data={bars} series={[{ key: "before", name: t("chart.before"), colour: CHART_SERIES_SLATE }, { key: "now", name: t("chart.now"), colour: CHART_SERIES_ORANGE }]} horizontal labels={(value) => formatNumber(value)} />
        </ChartCard>
        <DataTable
          rows={pages.pageRows}
          rowKey={(row) => row.page}
          search={{ value: search, onChange: setSearch, placeholder: t("search") }}
          filters={
            <Select chip={{ label: t("action"), choice: action ? t(`actions.${action}`) : null }} value={action} onChange={setAction} aria-label={t("action")}>
              <option value="">{t("everyAction")}</option>
              {PLAN_ACTIONS.map((value) => <option key={value} value={value}>{t(`actions.${value}`)}</option>)}
            </Select>
          }
          cardHeader={<TableBar footer={pages.footer} noun="results" title={t("tableTitle", { count: shown?.length ?? 0 })} actions={<ListDownload label={t("download")} fileName={`${data?.host ?? "website"}-page-plan`} rows={shown} columns={[{ header: t("columns.page"), value: (row) => row.page }, { header: t("columns.shouldWin"), value: (row) => row.shouldWin.join(", ") }, { header: t("columns.action"), value: (row) => t(`actions.${row.action}`) }, { header: t("columns.why"), value: why }]} />} />}
          empty={{ icon: <ListChecks className="h-8 w-8 text-muted/30" />, label: t("noMatch") }}
          footer={pages.footer}
          columns={[
            { key: "page", header: t("columns.page"), cell: (row) => <span className="flex min-w-0 flex-col"><span className="truncate text-[13px] text-foreground">{row.page}</span>{row.title ? <span className="truncate text-[12px] text-secondary">{row.title}</span> : null}</span> },
            { key: "shouldWin", header: t("columns.shouldWin"), cell: (row) => <span className="text-[12px] text-secondary">{row.shouldWin.length > 0 ? row.shouldWin.join(", ") : "–"}</span> },
            { key: "action", header: t("columns.action"), cell: (row) => <TagLabel className="text-foreground">{t(`actions.${row.action}`)}</TagLabel> },
            { key: "why", header: t("columns.why"), cell: (row) => <span className="text-[12px] text-secondary">{why(row)}</span> },
          ]}
        />
      </Section>

      {decisions.length > 0 ? (
        <Section title={tDecide("every.title")} hint={tDecide("every.hint")}>
          <DataTable
            rows={everyPager.pageRows}
            rowKey={(row) => row.path}
            search={{ value: pageSearch, onChange: setPageSearch, placeholder: tDecide("every.search") }}
            filters={
              <Select chip={{ label: tDecide("columns.verdict"), choice: verdict ? tDecide(`verdicts.${verdict}`) : null }} value={verdict} onChange={setVerdict} aria-label={tDecide("columns.verdict")}>
                <option value="">{tDecide("everyVerdict")}</option>
                {VERDICTS.map((value) => <option key={value} value={value}>{tDecide(`verdicts.${value}`)}</option>)}
              </Select>
            }
            cardHeader={<TableBar footer={everyPager.footer} noun="results" title={tDecide("every.table")} actions={<ListDownload label={t("download")} fileName={`${decided?.host ?? "website"}-page-decisions`} rows={every} columns={[
              { header: tDecide("columns.page"), value: (row) => row.path },
              { header: tDecide("columns.kind"), value: kindName },
              { header: tDecide("columns.verdict"), value: (row) => tDecide(`verdicts.${row.verdict}`) },
              { header: tDecide("columns.why"), value: reasonWords },
              { header: tDecide("columns.visits"), value: (row) => row.visits },
              { header: tDecide("columns.enquiries"), value: (row) => row.enquiries },
              { header: tDecide("columns.clicks"), value: (row) => row.clicks },
              { header: tDecide("columns.domains"), value: (row) => row.domains ?? "" },
            ]} />} />}
            empty={{ icon: <ListChecks className="h-8 w-8 text-muted/30" />, label: t("noMatch") }}
            footer={everyPager.footer}
            columns={[
              { key: "page", header: tDecide("columns.page"), cell: (row) => <span className="text-[13px] text-info">{row.path}</span> },
              { key: "kind", header: tDecide("columns.kind"), cell: (row) => <TagLabel>{kindName(row)}</TagLabel> },
              { key: "verdict", header: tDecide("columns.verdict"), cell: (row) => <StatusLabel tone={VERDICT_TONE[row.verdict]}>{tDecide(`verdicts.${row.verdict}`)}</StatusLabel> },
              { key: "why", header: tDecide("columns.why"), cell: (row) => <span className="text-[12px] text-secondary">{reasonWords(row)}</span> },
              { key: "visits", header: tDecide("columns.visits"), align: "right", cell: (row) => mono(row.visits) },
              { key: "enquiries", header: tDecide("columns.enquiries"), align: "right", cell: (row) => mono(row.enquiries) },
              { key: "clicks", header: tDecide("columns.clicks"), align: "right", cell: (row) => mono(row.clicks) },
              { key: "domains", header: tDecide("columns.domains"), align: "right", cell: (row) => mono(row.domains) },
            ]}
          />
        </Section>
      ) : null}

      {decided && decided.creates.length > 0 ? (
        <Section title={tDecide("create.title")} hint={tDecide("create.hint")}>
          <DataTable
            rows={createPager.pageRows}
            rowKey={(row) => row.search}
            search={{ value: createSearch, onChange: setCreateSearch, placeholder: tDecide("create.search") }}
            cardHeader={<TableBar footer={createPager.footer} noun="results" title={tDecide("create.table")} actions={<ListDownload label={t("download")} fileName={`${decided.host}-pages-to-create`} rows={creates} columns={[
              { header: tDecide("columns.search"), value: (row) => row.search },
              { header: tDecide("columns.from"), value: (row) => tDecide(`from.${row.from}`) },
              { header: tDecide("columns.volume"), value: (row) => row.volume ?? "" },
              { header: tDecide("columns.rivals"), value: (row) => row.rivals },
              { header: tDecide("columns.best"), value: (row) => row.best ?? "" },
            ]} />} />}
            empty={{ icon: <ListChecks className="h-8 w-8 text-muted/30" />, label: t("noMatch") }}
            footer={createPager.footer}
            columns={[
              { key: "search", header: tDecide("columns.search"), cell: (row) => <span className="text-[13px] text-foreground">{row.search}</span> },
              { key: "from", header: tDecide("columns.from"), cell: (row) => <TagLabel>{tDecide(`from.${row.from}`)}</TagLabel> },
              { key: "volume", header: tDecide("columns.volume"), align: "right", cell: (row) => mono(row.volume) },
              { key: "rivals", header: tDecide("columns.rivals"), align: "right", cell: (row) => mono(row.rivals) },
              { key: "best", header: tDecide("columns.best"), align: "right", cell: (row) => mono(row.best) },
            ]}
          />
        </Section>
      ) : null}
    </>
  );
}
