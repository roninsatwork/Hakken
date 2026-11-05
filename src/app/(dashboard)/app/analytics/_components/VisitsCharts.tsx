"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { FunctionReturnType } from "convex/server";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { NOT_SORTED_KIND } from "@/convex/utils/pageKinds";
import { isUnknownValue } from "@/convex/utils/analyticsUnknown";
import type { VisitorList } from "@/convex/googleAnalyticsLists";
import { BarsCard } from "@/src/ui/components/screens/BarsCard";
import { DaysChart, type DaysLine } from "@/src/ui/components/screens/DaysChart";
import { MapCard } from "@/src/ui/components/screens/MapCard";
import { useSeesPart } from "@/src/ui/components/screens/hakkenSeesStore";
import { CHART_COMPARATOR_GREY, CHART_SERIES_BLUE, CHART_SERIES_ORANGE, CHART_SERIES_SLATE } from "@/src/ui/components/charts/chartPalette";
import type { SiteSeries } from "../../sites/_components/SiteCharts";
import { SiteTreemap } from "../../sites/_components/SiteTreemap";
import { formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { useVisitorName } from "./useVisitorName";
import { periodWord, useAnalyticsArgs, useAnalyticsStatus, usePeriod, useStep } from "./useAnalytics";

/**
 * Visits' charts (docs/plans/active/visits-redo-plan-2026-11-03.md, step 1; board 2 of the canvas "Hakken — Visitors,
 * redo", approved 3 November 2026 with "ok bjuidl it"): new and returning visits by day with September beside them,
 * what people looked at by kind of page, and who visits the website, by one of its six lists. Every figure is visits or
 * views, never people (Anthony, 2026-11-03: "lets stick with visits").
 */

type Days = NonNullable<FunctionReturnType<typeof api.googleAnalyticsVisitorReads.analyticsVisitorDays>>;
type Span = { from: string; to: string } | null;
type Point = Days["points"][number];
/** The dates chosen and the span before in words (`useSpanWords`). */
type SpanWords = { now: string; before: string; beforeNamed: string | undefined };

/** A span's own name where it is one calendar month ("September", "October 2025"); null for any other dates. */
export function useSpanName(): (span: Span) => string | null {
  const locale = useLocale();
  const months = useMemo(() => new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, { month: "long", timeZone: "UTC" }), [locale]);
  const year = new Date().getUTCFullYear();
  return (span) => {
    if (!span?.from || !span.to || !span.from.endsWith("-01")) return null;
    const last = new Date(Date.UTC(Number(span.from.slice(0, 4)), Number(span.from.slice(5, 7)), 0)).toISOString().slice(0, 10);
    if (span.to !== last) return null;
    const name = months.format(new Date(`${span.from}T00:00:00Z`));
    return Number(span.from.slice(0, 4)) === year ? name : `${name} ${span.from.slice(0, 4)}`;
  };
}

/** The dates chosen and the span before, each by its name where it has one, else in the date menu's words. */
export function useSpanWords(span: Span, spanBefore: Span): { now: string; before: string; beforeNamed: string | undefined } {
  const tf = useTranslations("googleAnalytics.filters");
  const [period] = usePeriod();
  const nameOf = useSpanName();
  const now = nameOf(span);
  const before = nameOf(spanBefore);
  return { now: now ?? tf(`periods.${periodWord(period)}`), before: before ?? tf(`before.${periodWord(period)}`), beforeNamed: before ?? undefined };
}

/** A list's dates and the dates it's set against, for `useSpanWords` and `useSpanInWords`. */
export function spansOfList(answer: { from: string | null; to: string | null; spanBefore: { from: string | null; to: string | null } | null } | undefined): [Span, Span] {
  const before = answer?.spanBefore;
  return [answer?.from && answer.to ? { from: answer.from, to: answer.to } : null, before?.from && before.to ? { from: before.from, to: before.to } : null];
}

/**
 * The dates for the middle of a sentence: "October" or "these dates", "September" or "the month before", so "Views in
 * October compared with September" reads the same way whichever dates are chosen.
 */
export function useSpanInWords(span: Span, spanBefore: Span): { now: string; before: string } {
  const tf = useTranslations("googleAnalytics.filters");
  const [period] = usePeriod();
  const nameOf = useSpanName();
  return { now: nameOf(span) ?? tf("theseDates"), before: nameOf(spanBefore) ?? tf(`before.${periodWord(period)}`) };
}

/**
 * New and returning visits by day (Anthony, 2026-11-03: "by day"), the kit's chart with menus as lines, with one menu:
 * Compare with the span before or Nothing ("i think we need a compare option on this chart"). The span before is laid
 * under the period step by step, first under first, as dashed grey lines — Conversions' over-time chart's way — so a
 * month's weekends need not line up. No dots: the chart with menus draws none (the plan's question 5).
 */
export function VisitsLineCard({ spans: words, host }: { spans: SpanWords; host: string }) {
  const t = useTranslations("googleAnalytics.visitors");
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const [step] = useStep();
  const [against, setAgainst] = useState<"before" | "none">("before");
  const answer = useQuery(api.googleAnalyticsVisitorReads.analyticsVisitorDays, status?.connection?.newestDay ? args : "skip");
  const points = answer?.points;
  const pointsBefore = answer?.pointsBefore;
  const comparing = against === "before" && Boolean(pointsBefore && pointsBefore.length > 0);
  // The eye reads each day's visits by its date, never a day's place in a list (visits-redo-plan-2026-11-03.md, step 2),
  // with the names it says weekends against weekdays in (pageOwnFindings.ts).
  const seen = useMemo(() => (answer ? {
    // Days only, and only where every point is a day: past 90 days a point is a week or a month (its `lastDay`), which
    // no weekend rule may read as a Monday, and the last 90 days of a year are not the year the page shows.
    byDay: answer.points.some((point) => point.lastDay) ? {} : Object.fromEntries(answer.points.map((point) => [point.day, { new: point.new, returning: point.returning }])),
    newName: t("line.new"), returningName: t("line.returning"), weekendName: t("line.eyeWeekend"), weekdayName: t("line.eyeWeekday"),
  } : null), [answer, t]);
  useSeesPart("days", seen);
  const line = (key: "new" | "returning", list: readonly Point[] | null | undefined) => (list ?? []).map((point) => ({ day: point.day, ...(point.lastDay ? { lastDay: point.lastDay } : {}), value: point[key] }));
  const lines: DaysLine[] = [
    { key: "new", name: t("line.new"), colour: CHART_SERIES_ORANGE, points: line("new", points) },
    { key: "returning", name: t("line.returning"), colour: CHART_SERIES_BLUE, points: line("returning", points) },
    ...(comparing ? [
      { key: "newBefore", name: t("line.newBefore", { before: words.before }), colour: CHART_COMPARATOR_GREY, dashed: true, under: true, points: line("new", pointsBefore) },
      { key: "returningBefore", name: t("line.returningBefore", { before: words.before }), colour: CHART_COMPARATOR_GREY, dashed: true, under: true, points: line("returning", pointsBefore) },
    ] : []),
  ];
  return (
    <DaysChart
      title={t(`line.title.${step}`)}
      hint={comparing ? t(`line.compareHint.${step}`, { span: words.now, before: words.before }) : t("line.hint", { span: words.now })}
      exportName="google-analytics-new-and-returning"
      csvDay="day"
      host={host}
      step={step}
      waiting={answer === undefined ? undefined : null}
      controls={[{
        kind: "select", key: "against", label: t("compareWith"), value: against,
        options: [{ value: "before", label: words.beforeNamed ?? words.before }, { value: "none", label: t("nothing") }],
        onChange: (next) => setAgainst(next as "before" | "none"),
      }]}
      lines={lines}
      figure={t("line.visits")}
      anything={(rows) => rows.some((row) => Number(row.new) > 0 || Number(row.returning) > 0)}
      empty={t("who.empty")}
    />
  );
}

/** Lists where Google places only some visits: their unknown is left out of the bars and counted in the hint. */
const PLACED_ONLY: readonly VisitorList[] = ["age", "gender", "interest"];
/** Interests shown at most: a website has a hundred or more, each a long name. */
const MOST_INTERESTS = 8;
/** An interest by its last part: Google's "Travel/Travel Buffs" is "Travel Buffs". */
const shortInterest = (label: string) => label.split("/").at(-1)?.trim() || label;
/** A group as the eye names it: an interest by its last part, an age with its dash; the rest as Google keeps them. */
export const eyeName = (view: VisitorList, key: string) => (view === "interest" ? shortInterest(key) : view === "age" ? key.replace("-", "–") : key);

/**
 * "Who visits your website, by …" (the chart Anthony approved on a page's own screen on 3 November, `WhoLooksCard`):
 * the kit's chart with menus as bars, one bar a group's visits, the span before in grey beside it. Its By is the
 * table's choice under it (the plan's question 6), so the two always show the same list.
 */
export function WhoVisitsCard({ view, onView, views, spans, host }: {
  view: VisitorList;
  onView: (next: VisitorList) => void;
  views: readonly VisitorList[];
  /** The dates chosen and the span before in words (`useSpanWords`): the bars' and the grey bars' names. */
  spans: SpanWords;
  host: string;
}) {
  const t = useTranslations("googleAnalytics.visitors");
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const nameOf = useVisitorName();
  const [against, setAgainst] = useState<"before" | "none">("before");
  const answer = useQuery(api.googleAnalyticsVisitorReads.analyticsVisitorBars, status?.connection?.newestDay ? { ...args, list: view } : "skip");
  const rows = useMemo(() => answer?.rows ?? [], [answer?.rows]);
  const placedOnly = PLACED_ONLY.includes(view);
  const shown = useMemo(() => {
    const placed = placedOnly ? rows.filter((row) => !isUnknownValue(row.key)) : rows;
    const ordered = view === "age" ? [...placed].sort((left, right) => left.key.localeCompare(right.key)) : placed;
    return view === "interest" ? ordered.slice(0, MOST_INTERESTS) : ordered;
  }, [rows, placedOnly, view]);
  const comparing = against === "before" && rows.some((row) => row.visitsBefore !== null);
  const label = (key: string) => (view === "interest" ? shortInterest(key) : view === "age" ? key.replace("-", "–") : nameOf(key));
  const data = shown.map((row) => ({ key: row.key, label: label(row.key), value: row.visits, ...(comparing ? { before: row.visitsBefore } : {}) }));
  const beforeName = spans.beforeNamed ?? spans.before;
  const series: SiteSeries[] = [
    { key: "value", name: spans.now, colour: CHART_SERIES_ORANGE },
    ...(comparing ? [{ key: "before", name: beforeName, colour: CHART_SERIES_SLATE }] : []),
  ];
  const total = rows.reduce((sum, row) => sum + row.visits, 0);
  const placedVisits = rows.filter((row) => !isUnknownValue(row.key)).reduce((sum, row) => sum + row.visits, 0);
  const hint = [
    view === "age" || view === "gender" ? t(`who.hint.${view}`, { placed: formatNumber(placedVisits), visits: formatNumber(total) })
      : view === "interest" ? t("who.hint.interest", { shown: Math.min(MOST_INTERESTS, rows.filter((row) => !isUnknownValue(row.key)).length), count: rows.filter((row) => !isUnknownValue(row.key)).length })
        : t(`who.hint.${view}`),
    comparing ? t("who.greyBars", { before: beforeName }) : null,
  ].filter(Boolean).join(" ");
  return (
    <BarsCard
      title={view === "visitorType" ? t("who.titleTypes") : t("who.title", { by: view })}
      hint={hint}
      exportName={`google-analytics-visits-${view}`}
      csvHeading={t(`who.by.${view}`)}
      host={host}
      waiting={answer === undefined ? undefined : answer?.waiting ? t("who.waiting") : null}
      controls={[
        { kind: "select", key: "by", label: t("who.byLabel"), value: view, options: views.map((one) => ({ value: one, label: t(`who.by.${one}`) })), onChange: (next) => onView(next as VisitorList) },
        { kind: "select", key: "against", label: t("compareWith"), value: against, options: [{ value: "before", label: beforeName }, { value: "none", label: t("nothing") }], onChange: (next) => setAgainst(next as "before" | "none") },
      ]}
      rows={data}
      series={series}
      figure={t("who.visits")}
      drawnColumn
      anything={data.some((row) => row.value > 0)}
      empty={t("who.empty")}
    />
  );
}

/** A page group too small to label in the treemap: under this share of views, named in a line under it. */
const SMALL_SHARE = 0.02;

/**
 * "What people looked at, by kind of page" (Anthony, 2026-11-03: "this is pages visited by type no where they start"):
 * the kit's treemap (`SiteTreemap`, Sites → structure's), each box a page group sized by its views, Not sorted among
 * them; the groups too small to label are named in a line under it (the plan's question 4).
 */
export function PageKindsCard({ host }: { host: string }) {
  const t = useTranslations("googleAnalytics.visitors.kinds");
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const answer = useQuery(api.googleAnalyticsPageKindViews.analyticsPageKindViews, status?.connection?.newestDay ? args : "skip");
  const kinds = useMemo(() => (answer?.kinds ?? []).map((kind) => ({ ...kind, label: kind.kind === NOT_SORTED_KIND ? t("notSorted") : kind.name ?? kind.kind })), [answer?.kinds, t]);
  const placed = kinds.reduce((sum, kind) => sum + kind.views, 0);
  const most = Math.max(1, ...kinds.map((kind) => kind.views));
  const share = (views: number) => `${Math.round((views / Math.max(1, placed)) * 100)}%`;
  const small = kinds.filter((kind) => kind.views / Math.max(1, placed) < SMALL_SHARE);
  // Not sorted marked as such, so the eye can say how much of the treemap tells the reader nothing (pageOwnFindings.ts).
  const seen = useMemo(() => (answer && answer.kinds.length > 0 ? { kinds: kinds.map((kind) => ({ name: kind.label, views: kind.views, pages: kind.pages, sorted: kind.kind !== NOT_SORTED_KIND })) } : null), [answer, kinds]);
  useSeesPart("whatPeopleLookedAt", seen);
  const message = answer === null || answer?.waiting ? (answer?.waiting ? t("waiting") : t("empty"))
    : answer && !answer.sorted ? t("unsorted")
      : answer && kinds.length === 0 ? t("empty")
        : null;
  return (
    <MapCard
      title={t("title")}
      hint={t("hint")}
      exportName="google-analytics-views-by-kind"
      csv={() => toCsv(["kind", "views", "pages"], kinds.map((kind) => [kind.label, kind.views, kind.pages]))}
      host={host}
      loading={answer === undefined}
      message={message}
      under={small.length > 0 ? <p className="text-[12px] text-secondary">{t("also", { list: small.map((kind) => t("alsoOne", { name: kind.label, views: formatNumber(kind.views) })).join(" · ") })}</p> : null}
    >
      <SiteTreemap
        items={kinds.map((kind) => ({
          id: kind.kind,
          name: kind.label,
          value: kind.views,
          shade: kind.views / most,
          caption: t("caption", { views: formatNumber(kind.views), share: share(kind.views) }),
          readout: [{ value: formatNumber(kind.views), label: t("views") }, { value: share(kind.views), label: t("ofViews") }, { value: formatNumber(kind.pages), label: t("pages") }],
        }))}
      />
    </MapCard>
  );
}
