"use client";

import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { CHART_SERIES_ORANGE, CHART_SERIES_SLATE } from "@/src/ui/components/charts/chartPalette";
import { SiteBarChart } from "../../sites/_components/SiteCharts";
import { formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { monthsWords, periodWords } from "./insightPeriodWords";
import { LABEL } from "./StrategyNote";

type PeriodView = NonNullable<FunctionReturnType<typeof api.insightsPeriod.insightsPeriodView>>;
type Trio = { now: number; before: number | null; yearAgo: number | null };
type Kind = PeriodView["kinds"][number];

/**
 * The period chosen against the one it is read beside (insights-intelligence-
 * plan.md phases 1 and 2): the same period a year ago when it is held, as the
 * Analyst compares, otherwise the period just before. Shared by What moved on
 * the Executive summary and by What brings enquiries, so both compare alike.
 */
export function comparison(view: PeriodView) {
  const chosen = view.chosen;
  if (!chosen) return null;
  const side = chosen.yearAgo ? ("yearAgo" as const) : chosen.before ? ("before" as const) : null;
  const months = side ? chosen[side] : null;
  return { side, months, then: (trio: Trio) => (side ? trio[side] : null) };
}

/** A kind of page's name: its classification, or why it has none. */
export function useKindName() {
  const t = usePlatformTranslations("insights.enquiries");
  return (row: { name: string | null; type: string }) => row.name ?? t(row.type === "NOT_RECORDED" ? "notRecorded" : "notSorted");
}

/** The biggest kinds of page with anything to compare: a kind with nothing in either period is left out. */
export function comparedKinds(view: PeriodView, most = 5): Kind[] {
  const against = comparison(view);
  return view.kinds.slice(0, most).filter((row) => row.enquiries.now > 0 || (against?.then(row.enquiries) ?? 0) > 0);
}

/**
 * Articles' skew (Anthony, 2026-10-12: "articles could skew the service
 * lines"): the information pages' share of visits and of enquiries, and the
 * share of visits that enquired with them and without them.
 */
export function skewOf(view: PeriodView) {
  const total = (rows: readonly Kind[], field: "visits" | "enquiries") => rows.reduce((sum, row) => sum + row[field].now, 0);
  const articles = view.kinds.filter((row) => row.type === "INFORMATIONAL");
  const visits = total(view.kinds, "visits"), enquiries = total(view.kinds, "enquiries");
  const articleVisits = total(articles, "visits"), articleEnquiries = total(articles, "enquiries");
  if (articles.length === 0 || visits === 0 || articleVisits === 0) return null;
  const rate = (e: number, v: number) => (v > 0 ? Math.round((e * 1000) / v) / 10 : 0);
  return {
    visitsShare: Math.round((articleVisits * 100) / visits),
    enquiriesShare: enquiries > 0 ? Math.round((articleEnquiries * 100) / enquiries) : 0,
    rateWith: rate(enquiries, visits),
    rateWithout: rate(enquiries - articleEnquiries, visits - articleVisits),
  };
}

type ChartText = { title: string; hint: string; exportName: string };

/** Two bars a row, then and now: the period compared in grey, the period chosen in orange, each with its figure. */
function PairChart({ view, rows, label, text, percent = false }: { view: PeriodView; rows: Array<{ label: string; then: number; now: number }>; label: string; text: ChartText; percent?: boolean }) {
  const tPeriod = usePlatformTranslations("insights.period");
  const against = comparison(view);
  const nowWords = view.chosen ? periodWords(view.chosen.id, tPeriod) : "";
  const thenWords = against?.months ? monthsWords(against.months, tPeriod) : "";
  const shown = (value: number) => (percent ? `${value}%` : formatNumber(value));
  return (
    <ChartCard title={text.title} hint={text.hint} exportName={text.exportName} csv={() => toCsv([label, thenWords, nowWords], rows.map((row) => [row.label, row.then, row.now]))} enoughData={rows.length > 0 && Boolean(thenWords)}>
      <SiteBarChart
        horizontal
        data={rows}
        series={[{ key: "then", name: thenWords, colour: CHART_SERIES_SLATE }, { key: "now", name: nowWords, colour: CHART_SERIES_ORANGE }]}
        labels={(value) => shown(value)}
        {...(percent ? { formatScale: (value: number) => `${value}%` } : {})}
      />
    </ChartCard>
  );
}

/** Enquiries by kind of page, then and now. */
export function KindsAgainstChart({ view, text }: { view: PeriodView; text: ChartText }) {
  const t = usePlatformTranslations("insights.enquiries");
  const kindName = useKindName();
  const against = comparison(view);
  const rows = comparedKinds(view).map((row) => ({ label: kindName(row), then: against?.then(row.enquiries) ?? 0, now: row.enquiries.now }));
  return <PairChart view={view} rows={rows} label={t("kind")} text={text} />;
}

/** The share of each kind of page's visits that enquired, then and now. */
export function KindsRateChart({ view, text }: { view: PeriodView; text: ChartText }) {
  const t = usePlatformTranslations("insights.enquiries");
  const kindName = useKindName();
  const against = comparison(view);
  const rate = (e: number | null, v: number | null) => (e !== null && v ? Math.round((e * 1000) / v) / 10 : 0);
  const rows = comparedKinds(view).map((row) => ({ label: kindName(row), then: rate(against?.then(row.enquiries) ?? null, against?.then(row.visits) ?? null), now: rate(row.enquiries.now, row.visits.now) }));
  return <PairChart view={view} rows={rows} label={t("kind")} text={text} percent />;
}

/** Enquiries by where people came from, then and now. */
export function SourcesAgainstChart({ view, text }: { view: PeriodView; text: ChartText }) {
  const t = usePlatformTranslations("insights.enquiries");
  const tWhy = usePlatformTranslations("insights.why");
  const against = comparison(view);
  const rows = view.sources
    .map((row) => ({ label: tWhy(`groups.${row.group}`), then: against?.then(row.enquiries) ?? 0, now: row.enquiries.now }))
    .filter((row) => row.then > 0 || row.now > 0);
  return <PairChart view={view} rows={rows} label={t("source")} text={text} />;
}

/**
 * What moved (insights-intelligence-plan.md phase 1): drawn, not only
 * written — enquiries by kind of page and by where people came from against
 * the period compared, and how far the articles skew the website's figures,
 * above the causes weighed.
 */
export function WhatMoved({ view }: { view: PeriodView }) {
  const t = usePlatformTranslations("insights.moved");
  const tPeriod = usePlatformTranslations("insights.period");
  const against = comparison(view);
  if (!view.chosen || !against?.months || view.kinds.length === 0) return null;
  const nowWords = periodWords(view.chosen.id, tPeriod);
  const thenWords = monthsWords(against.months, tPeriod);
  const skew = skewOf(view);
  return (
    <section data-part="what-moved" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 data-part-title="true" className={LABEL}>{t("title")}</h2>
        <p className="max-w-[75ch] text-[13px] leading-[1.6] text-secondary">{t("hint", { now: nowWords, then: thenWords })}</p>
        {skew ? <p className="max-w-[75ch] text-[13px] leading-[1.6] text-foreground">{t("skew", skew)}</p> : null}
      </div>
      <KindsAgainstChart view={view} text={{ title: t("kinds", { now: nowWords, then: thenWords }), hint: t("kindsHint"), exportName: "insights-moved-kinds" }} />
      <SourcesAgainstChart view={view} text={{ title: t("sources", { now: nowWords, then: thenWords }), hint: t("sourcesHint"), exportName: "insights-moved-sources" }} />
    </section>
  );
}
