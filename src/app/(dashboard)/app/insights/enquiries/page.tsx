"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { Inbox } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { Change } from "@/src/ui/components/screens/Change";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { HakkenSees } from "@/src/ui/components/screens/HakkenSees";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { CHART_SERIES_BLUE, CHART_SERIES_ORANGE, CHART_SERIES_ROSE, CHART_SERIES_SLATE, CHART_SERIES_TEAL, CHART_SERIES_VIOLET } from "@/src/ui/components/charts/chartPalette";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { SiteBarChart } from "../../sites/_components/SiteCharts";
import { monthRow } from "../../sites/_components/datedRows";
import { formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { ListDownload } from "../../sites/_components/SiteDownloads";
import { useSitePager } from "../../sites/_components/useSitePagedTable";
import { useSiteSearch } from "../../sites/_components/useSiteParam";
import { LABEL } from "../_components/StrategyNote";
import { KindsAgainstChart, KindsRateChart, SourcesAgainstChart, useKindName } from "../_components/PeriodCharts";
import { monthsWords, periodWords, sourceWords } from "../_components/insightPeriodWords";
import { useInsightsHref, useInsightsPeriodChoice, useInsightsPeriodView, useInsightsSite } from "../_components/useInsights";

const KIND_COLOURS = [CHART_SERIES_ORANGE, CHART_SERIES_BLUE, CHART_SERIES_VIOLET, CHART_SERIES_TEAL, CHART_SERIES_ROSE, CHART_SERIES_SLATE];
type Trio = { now: number; before: number | null; yearAgo: number | null };
const rate = (enquiries: number, visits: number) => (visits > 0 ? Math.round((enquiries * 1000) / visits) / 10 : null);
const perEnquiry = (visits: number, enquiries: number) => (enquiries > 0 ? Math.round(visits / enquiries) : null);

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
 * What brings enquiries (docs/plans/active/insights-intelligence-plan.md
 * phase 2, drawn and approved 12 Oct 2026): the period chosen in the header,
 * kinds of page first — the company's own classifications — then where people
 * came from, each AI assistant by name and a page for each source, the
 * searches and pages behind the enquiries, and each kind of enquiry. Every
 * chart over months carries Google's updates; every figure against the
 * period before and a year ago.
 */
export default function InsightsEnquiriesPage() {
  const t = usePlatformTranslations("insights.enquiries");
  const tPeriod = usePlatformTranslations("insights.period");
  const tWhy = usePlatformTranslations("insights.why");
  const href = useInsightsHref();
  const site = useInsightsSite();
  const period = useInsightsPeriodChoice();
  const view = useInsightsPeriodView();
  const data = useQuery(api.insightsPeriod.insightsEnquiries, { ...(site ? { siteId: site } : {}), ...(period ? { period } : {}) });
  const [kindSearch, setKindSearch, kindTerm] = useSiteSearch("kq", "kinds");
  const [sourceSearch, setSourceSearch, sourceTerm] = useSiteSearch("sq", "sources");
  const [pageSearch, setPageSearch, pageTerm] = useSiteSearch("pq", "pages");
  const [readSearch, setReadSearch, readTerm] = useSiteSearch("rq", "read");
  const [eventSearch, setEventSearch, eventTerm] = useSiteSearch("eq", "events");
  const [searchSearch, setSearchSearch, searchTerm] = useSiteSearch("wq", "searches");
  const [quietSearch, setQuietSearch, quietTerm] = useSiteSearch("nq", "quiet");
  const matcher = (term: string) => wordStartMatcher(term.toLowerCase());
  const kinds = view?.kinds.filter((row) => { const m = matcher(kindTerm); return !m || m(row.name ?? t("notSorted")); });
  const sourceName = (row: { name: string; group: string }) => sourceWords(row.name, row.group, { typed: tWhy("groups.TYPED"), unknown: t("unknownSource") });
  const sources = data?.sources.filter((row) => { const m = matcher(sourceTerm); return !m || m(sourceName(row)); });
  const pages = data?.pages.filter((row) => { const m = matcher(pageTerm); return !m || m(row.path) || m(row.kind ?? ""); });
  const read = data?.journey?.rows.filter((row) => { const m = matcher(readTerm); return !m || m(row.path); });
  const events = data?.events.filter((row) => { const m = matcher(eventTerm); return !m || m(row.name); });
  const searches = data?.searches.filter((row) => { const m = matcher(searchTerm); return !m || m(row.search) || m(row.page); });
  const quiet = data?.noEnquiries.filter((row) => { const m = matcher(quietTerm); return !m || m(row.search) || m(row.page); });
  const kindPager = useSitePager(view ? kinds : undefined, { isLoading: view === undefined, table: "kinds" });
  const sourcePager = useSitePager(data ? sources : undefined, { isLoading: data === undefined, table: "sources" });
  const pagePager = useSitePager(data ? pages : undefined, { isLoading: data === undefined, table: "pages" });
  const readPager = useSitePager(data ? read : undefined, { isLoading: data === undefined, table: "read" });
  const eventPager = useSitePager(data ? events : undefined, { isLoading: data === undefined, table: "events" });
  const searchPager = useSitePager(data ? searches : undefined, { isLoading: data === undefined, table: "searches" });
  const quietPager = useSitePager(data ? quiet : undefined, { isLoading: data === undefined, table: "quiet" });
  const kindName = useKindName();
  const header = <PageHeader icon={<Inbox className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />;
  if (view === undefined || data === undefined) return <>{header}<div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" /></>;
  if (!view?.chosen || !view.figures || !data) return <>{header}<HakkenEmptyState icon={Inbox} title={t("emptyTitle")} description={t("emptyDescription")} /></>;

  const chosen = view.chosen;
  const nowWords = periodWords(chosen.id, tPeriod);
  const compareMonths = chosen.yearAgo ?? chosen.before;
  const compareWords = compareMonths ? monthsWords(compareMonths, tPeriod) : "";
  const then = (trio: Trio) => (chosen.yearAgo ? trio.yearAgo : trio.before);
  const changeOf = (trio: Trio) => {
    const was = then(trio);
    return was === null ? null : trio.now - was;
  };
  // The service pages and the articles: the kinds an agency reads apart (Anthony, 2026-10-12: "articles could skew the service lines").
  const sum = (rows: typeof view.kinds, field: "visits" | "enquiries", side: "now" | "before" | "yearAgo") => rows.reduce((total, row) => total + (row[field][side] ?? 0), 0);
  const service = view.kinds.filter((row) => row.type === "SERVICE");
  const articles = view.kinds.filter((row) => row.type === "INFORMATIONAL");
  const side = chosen.yearAgo ? "yearAgo" as const : "before" as const;
  const totalVisits = sum(view.kinds, "visits", "now"), totalEnquiries = sum(view.kinds, "enquiries", "now");
  const share = (part: number, whole: number) => (whole > 0 ? Math.round((part * 100) / whole) : 0);
  const says = [
    t("sees.service", { visits: share(sum(service, "visits", "now"), totalVisits), enquiries: share(sum(service, "enquiries", "now"), totalEnquiries), period: nowWords }),
    ...(articles.length > 0 ? [t("sees.articles", { visits: share(sum(articles, "visits", "now"), totalVisits), enquiries: share(sum(articles, "enquiries", "now"), totalEnquiries) })] : []),
    t("sees.estimates"),
  ];

  // Each kind month by month: the five biggest kinds of the period, the rest as one.
  const topKinds = view.kinds.slice(0, 5);
  const kindSeries = [...topKinds.map((row, at) => ({ key: row.key, name: kindName(row), colour: KIND_COLOURS[at] })), { key: "rest", name: t("otherPages"), colour: CHART_SERIES_SLATE }];
  const byMonth = data.byMonth.map((month) => monthRow(month.month, Object.fromEntries([
    ...topKinds.map((row) => [row.key, month.kinds.find((entry) => entry.key === row.key)?.enquiries ?? 0]),
    ["rest", month.kinds.filter((entry) => !topKinds.some((row) => row.key === entry.key)).reduce((total, entry) => total + entry.enquiries, 0)],
  ])));
  const shareBars = topKinds.map((row) => ({ label: kindName(row), visits: share(row.visits.now, totalVisits), enquiries: share(row.enquiries.now, totalEnquiries) }));
  const eventNames = [...new Set(data.byMonth.flatMap((month) => month.events.map((event) => event.name)))];
  const eventSeries = eventNames.map((name, at) => ({ key: name, name, colour: KIND_COLOURS[at % KIND_COLOURS.length] }));
  const eventRows = data.byMonth.map((month) => monthRow(month.month, Object.fromEntries(eventNames.map((name) => [name, month.events.find((event) => event.name === name)?.enquiries ?? 0]))));
  const mono = (value: number | null, suffix = "") => <span className="font-mono text-[12px] text-foreground">{value === null ? "–" : `${formatNumber(value)}${suffix}`}</span>;
  const change = (trio: Trio) => <Change by={changeOf(trio)} format={(value) => formatNumber(value)} />;

  return (
    <>
      {header}
      <HakkenSees says={says} steps={[]} />
      <FigureRow>
        <Figure label={t("figures.enquiries", { period: nowWords })} value={formatNumber(view.figures.enquiries.now)} detail={<span className="text-secondary">{t("figures.against", { then: formatNumber(then(view.figures.enquiries) ?? 0), period: compareWords })}</span>} />
        <Figure label={t("figures.service", { period: nowWords })} value={formatNumber(sum(service, "enquiries", "now"))} detail={<span className="text-secondary">{t("figures.against", { then: formatNumber(sum(service, "enquiries", side)), period: compareWords })}</span>} />
        <Figure label={t("figures.articles", { period: nowWords })} value={formatNumber(sum(articles, "enquiries", "now"))} detail={<span className="text-secondary">{t("figures.against", { then: formatNumber(sum(articles, "enquiries", side)), period: compareWords })}</span>} />
        <Figure label={t("figures.perEnquiry")} value={formatNumber(perEnquiry(sum(service, "visits", "now"), sum(service, "enquiries", "now")))} detail={<span className="text-secondary">{t("figures.perEnquiryDetail", { then: formatNumber(perEnquiry(sum(service, "visits", side), sum(service, "enquiries", side))), period: compareWords })}</span>} />
      </FigureRow>

      <Section title={t("kinds.title")} hint={t("kinds.hint")}>
        <ChartCard title={t("kinds.monthly")} hint={t("kinds.monthlyHint")} exportName="insights-enquiries-by-kind" csv={() => toCsv([t("month"), ...kindSeries.map((entry) => entry.name)], byMonth.map((row) => [String(row.month), ...kindSeries.map((entry) => Number(row[entry.key] ?? 0))]))} enoughData={byMonth.length > 1}>
          <SiteBarChart data={byMonth} series={kindSeries} stacked labels={(value, key) => (key === topKinds[0]?.key && value > 0 ? formatNumber(value) : null)} />
        </ChartCard>
        <KindsAgainstChart view={view} text={{ title: t("kinds.against", { period: nowWords, then: compareWords }), hint: t("kinds.againstHint"), exportName: "insights-enquiries-kinds-against" }} />
        <KindsRateChart view={view} text={{ title: t("kinds.rate"), hint: t("kinds.rateHint"), exportName: "insights-enquiries-kinds-rate" }} />
        <ChartCard title={t("kinds.share")} hint={t("kinds.shareHint")} exportName="insights-enquiries-kinds-share" csv={() => toCsv([t("kind"), t("kinds.shareVisits"), t("kinds.shareEnquiries")], shareBars.map((row) => [row.label, row.visits, row.enquiries]))} enoughData={shareBars.length > 0}>
          <SiteBarChart horizontal data={shareBars} series={[{ key: "visits", name: t("kinds.shareVisits"), colour: CHART_SERIES_SLATE }, { key: "enquiries", name: t("kinds.shareEnquiries"), colour: CHART_SERIES_ORANGE }]} labels={(value) => `${value}%`} formatScale={(value) => `${value}%`} />
        </ChartCard>
        <DataTable
          rows={kindPager.pageRows}
          rowKey={(row) => row.key}
          search={{ value: kindSearch, onChange: setKindSearch, placeholder: t("kinds.search") }}
          cardHeader={<TableBar footer={kindPager.footer} noun="results" title={t("kinds.table")} actions={<ListDownload label={t("download")} fileName="insights-kinds" rows={kinds} columns={[{ header: t("kind"), value: (row) => kindName(row) }, { header: t("columns.visits"), value: (row) => row.visits.now }, { header: t("columns.enquiries"), value: (row) => row.enquiries.now }]} />} />}
          empty={{ icon: <Inbox className="h-8 w-8 text-muted/30" />, label: t("noMatch") }}
          footer={kindPager.footer}
          columns={[
            { key: "kind", header: t("kind"), cell: (row) => <span className="text-[13px] text-foreground">{kindName(row)}</span> },
            { key: "type", header: t("columns.type"), cell: (row) => <TagLabel>{t(`types.${row.type}`)}</TagLabel> },
            { key: "visits", header: t("columns.visits"), align: "right", cell: (row) => mono(row.visits.now) },
            { key: "enquiries", header: t("columns.enquiries"), align: "right", cell: (row) => mono(row.enquiries.now) },
            { key: "rate", header: t("columns.rate"), align: "right", cell: (row) => mono(rate(row.enquiries.now, row.visits.now), "%") },
            { key: "per", header: t("columns.perEnquiry"), align: "right", cell: (row) => mono(perEnquiry(row.visits.now, row.enquiries.now)) },
            { key: "change", header: t("columns.against", { period: compareWords }), align: "right", cell: (row) => change(row.enquiries) },
          ]}
        />
      </Section>

      <Section title={t("sources.title")} hint={t("sources.hint")}>
        <SourcesAgainstChart view={view} text={{ title: t("sources.against", { period: nowWords, then: compareWords }), hint: t("sources.againstHint"), exportName: "insights-enquiries-sources" }} />
        <DataTable
          rows={sourcePager.pageRows}
          rowKey={(row) => row.key}
          search={{ value: sourceSearch, onChange: setSourceSearch, placeholder: t("sources.search") }}
          cardHeader={<TableBar footer={sourcePager.footer} noun="results" title={t("sources.table")} actions={<ListDownload label={t("download")} fileName="insights-sources" rows={sources} columns={[{ header: t("source"), value: sourceName }, { header: t("columns.visits"), value: (row) => row.visits.now }, { header: t("columns.enquiries"), value: (row) => row.enquiries.now }]} />} />}
          empty={{ icon: <Inbox className="h-8 w-8 text-muted/30" />, label: t("noMatch") }}
          footer={sourcePager.footer}
          columns={[
            { key: "source", header: t("source"), cell: (row) => <Link href={`${href("enquiries/source")}${href("").includes("?") ? "&" : "?"}name=${encodeURIComponent(row.name)}`} className="text-[13px] text-foreground hover:underline">{sourceName(row)}</Link> },
            { key: "group", header: t("columns.kind"), cell: (row) => <TagLabel>{tWhy(`groups.${row.group}`)}</TagLabel> },
            { key: "visits", header: t("columns.visits"), align: "right", cell: (row) => mono(row.visits.now) },
            { key: "enquiries", header: t("columns.enquiries"), align: "right", cell: (row) => mono(row.enquiries.now) },
            { key: "rate", header: t("columns.rate"), align: "right", cell: (row) => mono(rate(row.enquiries.now, row.visits.now), "%") },
            { key: "change", header: t("columns.against", { period: compareWords }), align: "right", cell: (row) => change(row.enquiries) },
          ]}
        />
      </Section>

      <Section title={t("behind.title")} hint={t("behind.hint")}>
        <DataTable
          rows={searchPager.pageRows}
          rowKey={(row) => `${row.search}|${row.page}`}
          search={{ value: searchSearch, onChange: setSearchSearch, placeholder: t("behind.searchSearch") }}
          cardHeader={<TableBar footer={searchPager.footer} noun="results" title={t("behind.searches")} actions={<ListDownload label={t("download")} fileName="insights-searches" rows={searches} columns={[{ header: t("columns.search"), value: (row) => row.search }, { header: t("columns.page"), value: (row) => row.page }, { header: t("columns.clicks"), value: (row) => row.clicks }, { header: t("columns.estimate"), value: (row) => row.estimate }]} />} />}
          empty={{ icon: <Inbox className="h-8 w-8 text-muted/30" />, label: t("noMatch") }}
          footer={searchPager.footer}
          columns={[
            { key: "search", header: t("columns.search"), cell: (row) => <span className="text-[13px] text-foreground">{row.search}</span> },
            { key: "page", header: t("columns.page"), cell: (row) => <span className="text-[13px] text-info">{row.page}</span> },
            { key: "clicks", header: t("columns.clicks"), align: "right", cell: (row) => mono(row.clicks) },
            { key: "estimate", header: t("columns.estimate"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-foreground">{row.estimate < 1 ? t("underOne") : t("about", { count: Math.round(row.estimate) })}</span> },
            { key: "sure", header: t("columns.sure"), cell: (row) => <TagLabel>{t(row.sure ? "sure.yes" : "sure.no")}</TagLabel> },
          ]}
        />
        <DataTable
          rows={quietPager.pageRows}
          rowKey={(row) => `${row.search}|${row.page}`}
          search={{ value: quietSearch, onChange: setQuietSearch, placeholder: t("behind.searchSearch") }}
          cardHeader={<TableBar footer={quietPager.footer} noun="results" title={t("behind.noEnquiries")} actions={<ListDownload label={t("download")} fileName="insights-searches-no-enquiries" rows={quiet} columns={[{ header: t("columns.search"), value: (row) => row.search }, { header: t("columns.page"), value: (row) => row.page }, { header: t("kind"), value: (row) => row.kind ?? "" }, { header: t("columns.clicks"), value: (row) => row.clicks }]} />} />}
          empty={{ icon: <Inbox className="h-8 w-8 text-muted/30" />, label: t("noMatch") }}
          footer={quietPager.footer}
          columns={[
            { key: "search", header: t("columns.search"), cell: (row) => <span className="text-[13px] text-foreground">{row.search}</span> },
            { key: "page", header: t("columns.page"), cell: (row) => <span className="text-[13px] text-info">{row.page}</span> },
            { key: "kind", header: t("kind"), cell: (row) => <TagLabel>{row.kind ?? t("notSorted")}</TagLabel> },
            { key: "clicks", header: t("columns.clicks"), align: "right", cell: (row) => mono(row.clicks) },
          ]}
        />
        <DataTable
          rows={pagePager.pageRows}
          rowKey={(row) => row.path}
          search={{ value: pageSearch, onChange: setPageSearch, placeholder: t("behind.pageSearch") }}
          cardHeader={<TableBar footer={pagePager.footer} noun="results" title={t("behind.pages")} actions={<ListDownload label={t("download")} fileName="insights-pages" rows={pages} columns={[{ header: t("columns.page"), value: (row) => row.path }, { header: t("kind"), value: (row) => row.kind ?? "" }, { header: t("columns.enquiries"), value: (row) => row.enquiries.now }, { header: t("columns.fromGoogle"), value: (row) => row.from.GOOGLE }, { header: t("columns.fromAi"), value: (row) => row.from.AI }, { header: t("columns.typedIn"), value: (row) => row.from.TYPED }, { header: t("columns.fromOthers"), value: (row) => row.from.OTHER }]} />} />}
          empty={{ icon: <Inbox className="h-8 w-8 text-muted/30" />, label: t("noMatch") }}
          footer={pagePager.footer}
          columns={[
            { key: "page", header: t("columns.page"), cell: (row) => <span className="text-[13px] text-info">{row.path}</span> },
            { key: "kind", header: t("kind"), cell: (row) => <TagLabel>{row.kind ?? t("notSorted")}</TagLabel> },
            { key: "enquiries", header: t("columns.enquiries"), align: "right", cell: (row) => mono(row.enquiries.now) },
            { key: "fromGoogle", header: t("columns.fromGoogle"), align: "right", cell: (row) => mono(row.from.GOOGLE) },
            { key: "fromAi", header: t("columns.fromAi"), align: "right", cell: (row) => mono(row.from.AI) },
            { key: "typedIn", header: t("columns.typedIn"), align: "right", cell: (row) => mono(row.from.TYPED) },
            { key: "fromOthers", header: t("columns.fromOthers"), align: "right", cell: (row) => mono(row.from.OTHER) },
            { key: "change", header: t("columns.against", { period: compareWords }), align: "right", cell: (row) => change(row.enquiries) },
          ]}
        />
        {data.journey ? (
          <DataTable
            rows={readPager.pageRows}
            rowKey={(row) => row.path}
            search={{ value: readSearch, onChange: setReadSearch, placeholder: t("behind.pageSearch") }}
            cardHeader={<TableBar footer={readPager.footer} noun="results" title={t("behind.read")} actions={<ListDownload label={t("download")} fileName="insights-pages-read" rows={read} columns={[{ header: t("columns.page"), value: (row) => row.path }, { header: t("columns.enquiringVisits"), value: (row) => row.enquiries }]} />} />}
            empty={{ icon: <Inbox className="h-8 w-8 text-muted/30" />, label: t("noMatch") }}
            footer={readPager.footer}
            columns={[
              { key: "page", header: t("columns.page"), cell: (row) => <span className="text-[13px] text-info">{row.path}</span> },
              { key: "kind", header: t("kind"), cell: (row) => <TagLabel>{row.kind ?? t("notSorted")}</TagLabel> },
              { key: "enquiries", header: t("columns.enquiringVisits"), align: "right", cell: (row) => mono(row.enquiries) },
              { key: "visits", header: t("columns.visits"), align: "right", cell: (row) => mono(row.visits) },
            ]}
          />
        ) : null}
      </Section>

      <Section title={t("events.title")} hint={t("events.hint")}>
        <ChartCard title={t("events.monthly")} hint={t("events.monthlyHint")} exportName="insights-enquiries-by-event" csv={() => toCsv([t("month"), ...eventSeries.map((entry) => entry.name)], eventRows.map((row) => [String(row.month), ...eventSeries.map((entry) => Number(row[entry.key] ?? 0))]))} enoughData={eventRows.length > 1 && eventSeries.length > 0}>
          <SiteBarChart data={eventRows} series={eventSeries} stacked labels={(value, key) => (key === eventSeries[0]?.key && value > 0 ? formatNumber(value) : null)} />
        </ChartCard>
        <DataTable
          rows={eventPager.pageRows}
          rowKey={(row) => row.name}
          search={{ value: eventSearch, onChange: setEventSearch, placeholder: t("events.search") }}
          cardHeader={<TableBar footer={eventPager.footer} noun="results" title={t("events.table")} actions={<ListDownload label={t("download")} fileName="insights-events" rows={events} columns={[{ header: t("columns.event"), value: (row) => row.name }, { header: t("columns.times"), value: (row) => row.times.now }, { header: t("columns.enquiries"), value: (row) => row.enquiries.now }]} />} />}
          empty={{ icon: <Inbox className="h-8 w-8 text-muted/30" />, label: t("noMatch") }}
          footer={eventPager.footer}
          columns={[
            { key: "event", header: t("columns.event"), cell: (row) => <span className="font-mono text-[12px] text-foreground">{row.name}</span> },
            { key: "counted", header: t("columns.counted"), cell: (row) => (row.counted ? <StatusLabel tone="success">{t("events.counted")}</StatusLabel> : <StatusLabel tone="neutral">{t("events.notCounted")}</StatusLabel>) },
            { key: "times", header: t("columns.times"), align: "right", cell: (row) => mono(row.times.now) },
            { key: "enquiries", header: t("columns.enquiries"), align: "right", cell: (row) => mono(row.enquiries.now) },
            { key: "change", header: t("columns.against", { period: compareWords }), align: "right", cell: (row) => change(row.times) },
          ]}
        />
      </Section>
    </>
  );
}
