"use client";

import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Lightbulb } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { HakkenSees } from "@/src/ui/components/screens/HakkenSees";
import { Notice } from "@/src/ui/components/screens/Notice";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { CHART_SERIES_ORANGE, CHART_SERIES_SLATE } from "@/src/ui/components/charts/chartPalette";
import { formatFact, type Fact } from "@/convex/utils/insightFacts";
import { SiteBarChart } from "../../../sites/_components/SiteCharts";
import { formatDay, toCsv } from "../../../sites/_components/siteFormat";
import { ListDownload } from "../../../sites/_components/SiteDownloads";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useInsightsHref } from "../../_components/useInsights";
import { useInsightWords } from "../../_components/insightWords";

type Evidence = { key: string; source: string; shows: string; against: string };
type RuledOut = { key: string; explanation: string; why: string };

/** A fact's label as a heading: its first letter a capital. */
const heading = (label: string) => label.charAt(0).toUpperCase() + label.slice(1);

/** A fact's span in words, when it has one. */
function spanOf(fact: Fact): string {
  if (fact.from && fact.to && fact.from !== fact.to) return `${formatDay(fact.from)} – ${formatDay(fact.to)}`;
  return fact.to ? formatDay(fact.to) : "";
}

/**
 * A finding, the whole case (docs/plans/active/insights-analyst-plan.md
 * §4.1, drawn as the Finding board; I21): the story and what to do first,
 * the figures it rests on against their comparisons, every piece of
 * evidence by its source, what the specialists ruled out and why, and how
 * we'll know — the day Hakken checks again and puts the result on the Track
 * record.
 */
export default function InsightsFindingPage() {
  const params = useParams();
  const t = useTranslations("insights.finding");
  const words = useInsightWords();
  const href = useInsightsHref();
  const finding = useQuery(api.insightsReads.insightsFinding, { findingId: params.findingId as Id<"insightFindings"> });
  const facts = new Map((finding?.facts ?? []).map((fact) => [fact.key, fact]));
  const pairs = (finding?.comparisons ?? [])
    .map(([a, b]) => ({ now: facts.get(a), then: facts.get(b) }))
    .filter((pair): pair is { now: Fact; then: Fact } => Boolean(pair.now && pair.then));
  const compared = new Set(pairs.flatMap((pair) => [pair.now.key, pair.then.key]));
  const evidence: Evidence[] = [
    ...pairs.map((pair) => ({
      key: `${pair.now.key}|${pair.then.key}`,
      source: words.source(pair.now.source),
      shows: `${heading(pair.now.label)}: ${formatFact(pair.now)}${spanOf(pair.now) ? ` (${spanOf(pair.now)})` : ""}`,
      against: `${formatFact(pair.then)}${spanOf(pair.then) ? ` (${spanOf(pair.then)})` : ""}`,
    })),
    ...(finding?.facts ?? []).filter((fact) => !compared.has(fact.key)).map((fact) => ({
      key: fact.key,
      source: words.source(fact.source),
      shows: `${heading(fact.label)}: ${formatFact(fact)}`,
      against: spanOf(fact) || "–",
    })),
  ];
  const ruledOut: RuledOut[] = (finding?.ruledOut ?? []).map((line, index) => {
    const at = line.indexOf(": ");
    return at > 0 && at < 90 ? { key: String(index), explanation: line.slice(0, at), why: line.slice(at + 2) } : { key: String(index), explanation: line, why: "" };
  });
  const evidencePages = useSitePager(finding ? evidence : undefined, { isLoading: finding === undefined, table: "evidence" });
  const ruledPages = useSitePager(finding ? ruledOut : undefined, { isLoading: finding === undefined, table: "ruled" });

  const back = { label: t("back"), href: href("findings") };
  if (finding === undefined) return <div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />;
  if (finding === null) return <HakkenEmptyState icon={Lightbulb} title={t("notFound")} description={t("notFoundDescription")} />;

  const sources = finding.sources.map(words.source).join(t("and"));
  const bars = pairs.slice(0, 6).map((pair) => ({ label: heading(pair.now.label), then: pair.then.value, now: pair.now.value }));
  const csv = () => toCsv([t("chart.figure"), t("chart.then"), t("chart.now")], bars.map((row) => [row.label, row.then, row.now]));
  // The story's sentences, each its own line, as the box says them.
  const says = finding.story.split(/(?<=\.)\s+(?=[A-Z])/).filter(Boolean);

  return (
    <>
      <DetailHeader
        back={back}
        icon={<Lightbulb className="h-6 w-6 text-brand" />}
        title={finding.headline}
        description={t("description", { host: finding.host, day: words.day(finding.createdAt), sources })}
        pills={
          <>
            <StatusLabel tone="info">{words.status({ isNew: finding.isNew, outcome: finding.outcome })}</StatusLabel>
            <StatusLabel tone="success">{t("checked")}</StatusLabel>
            <TagLabel>{words.sure(finding.sure)}</TagLabel>
            <TagLabel>{words.pattern(finding.pattern)}</TagLabel>
          </>
        }
      />
      <HakkenSees says={says} steps={[{ words: finding.action, link: t("seeAll"), href: href("this-week") }]} />
      {pairs.length > 0 ? (
        <FigureRow>
          {pairs.slice(0, 4).map((pair) => (
            <Figure key={`${pair.now.key}|${pair.then.key}`} label={heading(pair.now.label)} value={formatFact(pair.now)} detail={<span className="text-secondary">{t("against", { figure: formatFact(pair.then), span: spanOf(pair.then) })}</span>} />
          ))}
        </FigureRow>
      ) : null}
      <ChartCard title={t("chart.title")} hint={t("chart.hint")} exportName={`${finding.host}-finding`} csv={csv} enoughData={bars.length > 0} emptyText={t("chart.empty")}>
        <SiteBarChart
          data={bars}
          series={[{ key: "then", name: t("chart.then"), colour: CHART_SERIES_SLATE }, { key: "now", name: t("chart.now"), colour: CHART_SERIES_ORANGE }]}
          horizontal
        />
      </ChartCard>
      <DataTable
        rows={evidencePages.pageRows}
        rowKey={(row) => row.key}
        cardHeader={<TableBar footer={evidencePages.footer} noun="results" title={t("evidence.title")} actions={<ListDownload label={t("download")} fileName={`${finding.host}-finding-evidence`} rows={evidence} columns={[{ header: t("evidence.source"), value: (row) => row.source }, { header: t("evidence.shows"), value: (row) => row.shows }, { header: t("evidence.against"), value: (row) => row.against }]} />} />}
        empty={{ icon: <Lightbulb className="h-8 w-8 text-muted/30" />, label: t("evidence.empty") }}
        footer={evidencePages.footer}
        columns={[
          { key: "source", header: t("evidence.source"), cell: (row) => <TagLabel>{row.source}</TagLabel> },
          { key: "shows", header: t("evidence.shows"), cell: (row) => <span className="text-[13px] text-foreground">{row.shows}</span> },
          { key: "against", header: t("evidence.against"), cell: (row) => <span className="text-[12px] text-secondary">{row.against}</span> },
        ]}
      />
      <DataTable
        rows={ruledPages.pageRows}
        rowKey={(row) => row.key}
        cardHeader={<TableBar footer={ruledPages.footer} noun="results" title={t("ruledOut.title")} actions={<ListDownload label={t("download")} fileName={`${finding.host}-finding-ruled-out`} rows={ruledOut} columns={[{ header: t("ruledOut.explanation"), value: (row) => row.explanation }, { header: t("ruledOut.why"), value: (row) => row.why }]} />} />}
        empty={{ icon: <Lightbulb className="h-8 w-8 text-muted/30" />, label: t("ruledOut.empty") }}
        footer={ruledPages.footer}
        columns={[
          { key: "explanation", header: t("ruledOut.explanation"), cell: (row) => <span className="text-[13px] text-foreground">{row.explanation}</span> },
          { key: "why", header: t("ruledOut.why"), cell: (row) => <span className="text-[12px] text-secondary">{row.why}</span> },
        ]}
      />
      <Notice>{finding.checkOn ? t("howWeKnow", { day: formatDay(finding.checkOn), how: finding.howWeKnow }) : finding.howWeKnow}</Notice>
    </>
  );
}
