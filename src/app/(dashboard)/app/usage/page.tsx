"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowUpRight, Gauge, Globe } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { CreditKind } from "@/convex/creditKinds";
import Header from "@/src/ui/components/layout/Header";
import { CHART_COMPARATOR_GREY, CHART_SERIES_ORANGE } from "@/src/ui/components/charts/chartPalette";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { Meter } from "@/src/ui/components/screens/Meter";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { matchesSearchTerm, paginateItems } from "@/src/ui/components/screens/pagination";
import { ResearchSection } from "../keyword-research/_components/ResearchCells";
import { SiteLineChart } from "../sites/_components/SiteCharts";
import { ListDownload } from "../sites/_components/SiteDownloads";
import { MonthPicker, UsageWebsiteName } from "./_components/UsageParts";
import { relationshipWord, useUsageMonth, useUsageWords, type UsageWords } from "./_components/usageWords";

/**
 * Usage → Overview (docs/plans/active/usage-credits-plan.md, board Main):
 * the month's credits at a glance — what is left, what was used, the month
 * day by day, where the credits went, each website owned and tracked, and
 * every check that ran. A website picked in its table narrows the checks
 * below it.
 */

type Summary = NonNullable<FunctionReturnType<typeof api.creditUsage.usageSummary>>;
type WebsiteRow = Summary["websites"][number];
type LineRow = Summary["lines"][number];

const NOT_TIED = "none";
const keyOf = (website: { websiteId: string } | null) => website?.websiteId ?? NOT_TIED;

export default function UsageOverviewPage() {
  const words = useUsageWords();
  const { month, withMonth } = useUsageMonth();
  const summary = useQuery(api.creditUsage.usageSummary, { month });
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <PageHeader divider icon={<Gauge className="h-6 w-6 text-brand" />} title={words.t("title")} description={words.t("description")} />
        <Notice>{words.t("notice", { plan: words.number(summary?.plan.granted ?? 1000) })}</Notice>
        {summary && summary.owed > 0 ? <Notice tone="warning">{words.t("owed", { owed: words.number(summary.owed) })}</Notice> : null}
        <div className="flex flex-wrap items-center gap-3"><MonthPicker /></div>
        {summary === null ? <Notice>{words.t("noCompany")}</Notice> : <Overview summary={summary} words={words} picked={picked} onPick={setPicked} statementHref={withMonth("/app/usage/statement")} />}
      </div>
    </>
  );
}

function Overview({ summary, words, picked, onPick, statementHref }: {
  summary: Summary | undefined;
  words: UsageWords;
  picked: string | null;
  onPick: (key: string | null) => void;
  statementHref: string;
}) {
  const lastDay = summary ? summary.endsAt - 86_400_000 : 0;
  const pickedWebsite = picked && summary ? summary.websites.find((row) => keyOf(row.website) === picked) : undefined;
  return (
    <>
      <FigureRow>
        <Figure
          label={words.t("figures.planLeft")}
          value={summary ? words.number(summary.plan.left) : "…"}
          detail={summary ? words.t(summary.today === null ? "figures.planEnded" : "figures.planEnds", { date: words.date(lastDay) }) : null}
        />
        <Figure
          label={words.t("figures.boughtLeft")}
          value={summary ? words.number(summary.bought.left) : "…"}
          detail={summary ? (summary.bought.nextEndsAt ? words.t("figures.boughtEnds", { left: words.number(summary.bought.nextEndsLeft), date: words.date(summary.bought.nextEndsAt) }) : words.t("figures.noneBought")) : null}
        />
        <Figure
          label={words.t("figures.used", { plan: words.number(summary?.plan.granted ?? 0) })}
          value={summary ? words.number(summary.used) : "…"}
          detail={summary ? <Meter value={summary.plan.granted ? summary.used / summary.plan.granted : null} size="md" /> : null}
        />
        {summary?.forecast ? (
          <Figure
            emphasis
            label={words.t("figures.leftAtEnd", { date: words.date(lastDay) })}
            value={words.number(summary.forecast.leftAtEnd)}
            detail={words.t("figures.atThisPace")}
          />
        ) : (
          <Figure
            label={words.t("figures.endedUnused")}
            value={summary ? words.number(Math.max(0, summary.plan.granted - summary.used)) : "…"}
            detail={summary ? words.t("figures.endedOn", { date: words.date(lastDay) }) : null}
          />
        )}
      </FigureRow>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <UsageChart summary={summary} words={words} />
        <WhereTheyWent summary={summary} words={words} statementHref={statementHref} />
      </div>

      <ResearchSection title={words.t("websites.title")} description={words.t("websites.description")}>
        <WebsitesTable summary={summary} words={words} picked={picked} onPick={onPick} />
      </ResearchSection>

      <ResearchSection
        title={pickedWebsite ? words.t("lines.titleFor", { website: pickedWebsite.website?.host ?? words.t("websites.none") }) : words.t("lines.title")}
        description={words.t("lines.description")}
      >
        <LinesTable summary={summary} words={words} picked={picked} onPick={onPick} />
      </ResearchSection>
    </>
  );
}

/** The month's plan credits, what was left at the end of each day; the month before beside it; and, this month, where it is heading. */
function UsageChart({ summary, words }: { summary: Summary | undefined; words: UsageWords }) {
  if (!summary) return <ChartCard title={words.t("chart.title")} enoughData={false}><span /></ChartCard>;
  const series = {
    left: words.t("chart.left"),
    expected: words.t("chart.expected"),
    previous: words.month(summary.previous.month),
  };
  const used = runningTotals(summary.byDay);
  const previousUsed = runningTotals(summary.previous.byDay);
  const endOfToday = summary.today ?? summary.days;
  const leftToday = summary.plan.granted - (used[endOfToday - 1] ?? 0);
  const data = summary.byDay.map((_, index) => {
    const day = index + 1;
    const point: Record<string, unknown> = { label: String(day) };
    if (day <= endOfToday) point[series.left] = summary.plan.granted - used[index];
    if (index < previousUsed.length) point[series.previous] = summary.previous.granted - previousUsed[index];
    if (summary.forecast && day >= endOfToday) {
      const share = summary.days === endOfToday ? 1 : (day - endOfToday) / (summary.days - endOfToday);
      point[series.expected] = Math.round(leftToday + (summary.forecast.leftAtEnd - leftToday) * share);
    }
    return point;
  });
  return (
    <ChartCard
      title={words.t("chart.title")}
      hint={words.t("chart.hint", { plan: words.number(summary.plan.granted) })}
      exportName="usage-by-day"
      enoughData={summary.used > 0 || summary.previous.byDay.some((day) => day > 0)}
      emptyText={words.t("chart.empty")}
    >
      <SiteLineChart
        data={data}
        sharedScale
        series={[
          { key: series.left, name: series.left, colour: CHART_SERIES_ORANGE },
          ...(summary.forecast ? [{ key: series.expected, name: series.expected, colour: CHART_SERIES_ORANGE, dashed: true }] : []),
          { key: series.previous, name: series.previous, colour: CHART_COMPARATOR_GREY },
        ]}
      />
    </ChartCard>
  );
}

/** Each day's credits added to the days before it. */
function runningTotals(values: number[]): number[] {
  return values.reduce<number[]>((totals, value) => [...totals, (totals[totals.length - 1] ?? 0) + value], []);
}

/** The month's credits by kind of work, the biggest first. */
function WhereTheyWent({ summary, words, statementHref }: { summary: Summary | undefined; words: UsageWords; statementHref: string }) {
  const top = summary?.kinds[0]?.credits ?? 0;
  return (
    <ChartCard title={words.t("where.title")} hint={summary ? words.t("where.hint", { credits: words.number(summary.used) }) : null} enoughData={(summary?.kinds.length ?? 0) > 0} emptyText={words.t("where.empty")}>
      <div className="flex flex-col gap-4">
        {summary?.kinds.map((row) => (
          <div key={row.kind} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3 text-[13px]">
              <Link href={`/app/usage/work?kind=${row.kind}${summary.month ? `&month=${summary.month}` : ""}`} className="text-foreground hover:underline">{words.kind(row.kind)}</Link>
              <span className="flex items-center gap-3">
                <span className="font-mono text-[12px] tabular-nums text-secondary">{share(row.credits, summary.used)}</span>
                <span className="font-mono text-[12px] tabular-nums text-foreground">{words.number(row.credits)}</span>
              </span>
            </div>
            <Meter value={top ? row.credits / top : null} size="md" />
          </div>
        ))}
        <div className="flex items-center border-t border-border-dim pt-4">
          <Link href={statementHref} className="inline-flex items-center gap-1.5 text-[12px] text-secondary hover:text-foreground">
            {words.t("where.statement")}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </ChartCard>
  );
}

const share = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "–");

/** Each website the month's work was for, owned and tracked, and the work tied to none. */
function WebsitesTable({ summary, words, picked, onPick }: { summary: Summary | undefined; words: UsageWords; picked: string | null; onPick: (key: string | null) => void }) {
  const [search, setSearch] = useState("");
  const [relationship, setRelationship] = useState("");
  const [page, setPage] = useState(1);
  const rows = summary?.websites.filter((row) =>
    (!relationship || (relationship === NOT_TIED ? !row.website : row.website?.relationship === relationship))
    && matchesSearchTerm(search, [row.website?.host ?? words.t("websites.none")]));
  // Work tied to no website comes last whatever the order.
  const ordered = rows ? [...rows.filter((row) => row.website), ...rows.filter((row) => !row.website)] : undefined;
  const paged = paginateItems(ordered ?? [], page);
  const top = Math.max(1, ...(summary?.websites.map((row) => row.credits) ?? [1]));
  const owned = summary?.websites.filter((row) => row.website?.relationship === "owned").reduce((sum, row) => sum + row.credits, 0) ?? 0;
  const tracked = summary?.websites.filter((row) => row.website?.relationship === "tracked").reduce((sum, row) => sum + row.credits, 0) ?? 0;
  const checks = (row: WebsiteRow) => row.kinds.map((kind: CreditKind) => words.kind(kind)).join(", ");
  return (
    <DataTable
      rows={ordered === undefined ? undefined : paged.items}
      rowKey={(row) => keyOf(row.website)}
      onRowClick={(row) => onPick(picked === keyOf(row.website) ? null : keyOf(row.website))}
      rowClassName={(row) => (picked === keyOf(row.website) ? "bg-foreground/[0.04]" : "")}
      search={{ value: search, onChange: (next) => { setSearch(next); setPage(1); }, placeholder: words.t("websites.search") }}
      filters={(
        <Select value={relationship} onChange={(next) => { setRelationship(next); setPage(1); }} chip={{ label: words.t("websites.relationship"), choice: relationship ? (relationship === NOT_TIED ? words.t("websites.none") : words.t(`websites.${relationship}`)) : null }}>
          <option value="">{words.t("websites.everyRelationship")}</option>
          <option value="owned">{words.t("websites.owned")}</option>
          <option value="tracked">{words.t("websites.tracked")}</option>
          <option value={NOT_TIED}>{words.t("websites.none")}</option>
        </Select>
      )}
      empty={{ icon: <Globe className="h-8 w-8 text-muted/30" />, label: search || relationship ? words.t("websites.noMatch") : words.t("websites.empty") }}
      cardHeader={(
        <TableBar
          footer={{ isLoading: summary === undefined, totalCount: ordered?.length ?? 0 }}
          noun="websites"
          actions={<ListDownload fileName="usage-by-website" rows={ordered} columns={[
            { header: words.t("websites.columns.website"), value: (row) => row.website?.host ?? words.t("websites.none") },
            { header: words.t("websites.columns.relationship"), value: (row) => relationshipWord(words, row.website) },
            { header: words.t("websites.columns.checks"), value: checks },
            { header: words.t("websites.columns.runs"), value: (row) => row.runs },
            { header: words.t("websites.columns.credits"), value: (row) => row.credits },
          ]} />}
        >
          <span className="text-[13px] text-secondary">{words.t("websites.totals", { owned: words.number(owned), tracked: words.number(tracked) })}</span>
        </TableBar>
      )}
      footer={{ mode: "paged", page: paged.page, totalPages: paged.totalPages, totalCount: paged.totalItems, pageSize: paged.pageSize, isLoading: summary === undefined, onPageChange: setPage }}
      columns={[
        { key: "website", header: words.t("websites.columns.website"), cell: (row) => <UsageWebsiteName website={row.website} words={words} /> },
        { key: "relationship", header: words.t("websites.columns.relationship"), cell: (row) => <TagLabel>{relationshipWord(words, row.website)}</TagLabel> },
        { key: "checks", header: words.t("websites.columns.checks"), cell: (row) => <span className="text-[12px] text-secondary">{checks(row)}</span> },
        { key: "runs", header: words.t("websites.columns.runs"), align: "right", cell: (row) => <span className="font-mono text-[12px] tabular-nums">{words.number(row.runs)}</span> },
        { key: "credits", header: words.t("websites.columns.credits"), align: "right", cell: (row) => <span className="font-mono text-[13px] text-foreground">{words.number(row.credits)}</span> },
        { key: "share", header: words.t("websites.columns.share"), className: "w-[200px]", cell: (row) => <ShareCell part={row.credits} whole={summary?.used ?? 0} top={top} /> },
      ]}
    />
  );
}

function ShareCell({ part, whole, top }: { part: number; whole: number; top: number }) {
  return (
    <span className="flex items-center gap-3">
      <span className="w-8 font-mono text-[12px] tabular-nums text-secondary">{share(part, whole)}</span>
      <Meter value={top ? part / top : null} className="w-full" />
    </span>
  );
}

/** Every kind of check on every website this month, with what one run of it used — narrowed to the website picked above. */
function LinesTable({ summary, words, picked, onPick }: { summary: Summary | undefined; words: UsageWords; picked: string | null; onPick: (key: string | null) => void }) {
  const [search, setSearch] = useState("");
  const [often, setOften] = useState("");
  const [page, setPage] = useState(1);
  const oftenOf = (row: LineRow) => words.often(row.everyDays);
  const oftens = [...new Set(summary?.lines.map(oftenOf) ?? [])];
  const hosts = [...new Map(summary?.lines.map((row) => [keyOf(row.website), row.website]) ?? []).entries()];
  const rows = summary?.lines.filter((row) =>
    (!picked || keyOf(row.website) === picked)
    && (!often || oftenOf(row) === often)
    && matchesSearchTerm(search, [words.kind(row.kind), row.website?.host ?? words.t("websites.none")]));
  const paged = paginateItems(rows ?? [], page);
  const top = Math.max(1, ...(summary?.lines.map((row) => row.credits) ?? [1]));
  const total = rows?.reduce((sum, row) => sum + row.credits, 0) ?? 0;
  const each = (row: LineRow) => (row.runs > 0 ? Math.round(row.credits / row.runs) : 0);
  const pickedName = picked ? hosts.find(([key]) => key === picked)?.[1]?.host ?? words.t("websites.none") : null;
  return (
    <DataTable
      rows={rows === undefined ? undefined : paged.items}
      rowKey={(row) => `${row.kind}:${keyOf(row.website)}`}
      search={{ value: search, onChange: (next) => { setSearch(next); setPage(1); }, placeholder: words.t("lines.search") }}
      filters={(
        <>
          <Select value={picked ?? ""} onChange={(next) => { onPick(next || null); setPage(1); }} chip={{ label: words.t("filters.website"), choice: pickedName }}>
            <option value="">{words.t("filters.everyWebsite")}</option>
            {hosts.map(([key, website]) => <option key={key} value={key}>{website?.host ?? words.t("websites.none")}</option>)}
          </Select>
          <Select value={often} onChange={(next) => { setOften(next); setPage(1); }} chip={{ label: words.t("lines.often"), choice: often || null }}>
            <option value="">{words.t("lines.everyOften")}</option>
            {oftens.map((word) => <option key={word} value={word}>{word}</option>)}
          </Select>
        </>
      )}
      empty={{ icon: <Gauge className="h-8 w-8 text-muted/30" />, label: search || often || picked ? words.t("lines.noMatch") : words.t("lines.empty") }}
      cardHeader={(
        <TableBar
          footer={{ isLoading: summary === undefined, totalCount: rows?.length ?? 0 }}
          noun="checks"
          actions={<ListDownload fileName="usage-checks" rows={rows} columns={[
            { header: words.t("lines.columns.check"), value: (row) => words.kind(row.kind) },
            { header: words.t("lines.columns.website"), value: (row) => row.website?.host ?? words.t("websites.none") },
            { header: words.t("lines.columns.often"), value: oftenOf },
            { header: words.t("lines.columns.runs"), value: (row) => row.runs },
            { header: words.t("lines.columns.each"), value: each },
            { header: words.t("lines.columns.credits"), value: (row) => row.credits },
          ]} />}
        >
          <span className="text-[13px] text-secondary">{words.t("lines.totals", { credits: words.number(total) })}</span>
        </TableBar>
      )}
      footer={{ mode: "paged", page: paged.page, totalPages: paged.totalPages, totalCount: paged.totalItems, pageSize: paged.pageSize, isLoading: summary === undefined, onPageChange: setPage }}
      columns={[
        {
          key: "check",
          header: words.t("lines.columns.check"),
          cell: (row) => (
            <span className="flex flex-col">
              <Link href={`/app/usage/work?kind=${row.kind}${summary?.month ? `&month=${summary.month}` : ""}`} className="text-[13px] text-foreground hover:underline">{words.kind(row.kind)}</Link>
              <span className="text-[12px] text-secondary">{words.price(row.kind, summary?.prices.find((price) => price.kind === row.kind) ?? { credits: 0, per: 1 })}</span>
            </span>
          ),
        },
        { key: "website", header: words.t("lines.columns.website"), cell: (row) => <UsageWebsiteName website={row.website} words={words} /> },
        { key: "often", header: words.t("lines.columns.often"), cell: (row) => <TagLabel>{oftenOf(row)}</TagLabel> },
        { key: "runs", header: words.t("lines.columns.runs"), align: "right", cell: (row) => <span className="font-mono text-[12px] tabular-nums">{words.number(row.runs)}</span> },
        { key: "each", header: words.t("lines.columns.each"), align: "right", cell: (row) => <span className="font-mono text-[12px] tabular-nums text-secondary">{words.number(each(row))}</span> },
        { key: "credits", header: words.t("lines.columns.credits"), align: "right", cell: (row) => <span className="font-mono text-[13px] text-foreground">{words.number(row.credits)}</span> },
        { key: "share", header: words.t("lines.columns.share"), className: "w-[200px]", cell: (row) => <ShareCell part={row.credits} whole={summary?.used ?? 0} top={top} /> },
      ]}
    />
  );
}
