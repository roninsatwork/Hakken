"use client";

import { useTranslations } from "next-intl";
import { outOfTotal } from "@/convex/utils/outOfTotal";
import { BarsCard } from "@/src/ui/components/screens/BarsCard";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { CHART_COMPARATOR_GREY, CHART_SERIES_BLUE, CHART_SERIES_ORANGE, CHART_SERIES_TEAL, CHART_SERIES_VIOLET } from "@/src/ui/components/charts/chartPalette";
import { formatMonth, formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { useSiteParam } from "../../sites/_components/useSiteParam";
import { MoveLine } from "./PlacesParts";
import { readerLanguage } from "./searchConsoleFormat";

/**
 * Rich results, as Anthony chose it on the canvas (20 November 2026: "lets go with way 3 for rich snippets";
 * search-console-breakdowns-plan-2026-11-20.md): three boxes against the period before, and every click of the last six
 * months split into each kind of rich result and plain results. Shared parts only: `Figure` boxes with `MoveLine`, as
 * Countries and devices', and `BarsCard` stood up and stacked, as Products'.
 */

/** A kind of rich result, as the screen reads it: its name, its figures now, its clicks before where they're kept. */
export type LookRow = { key: string; name: string; clicks: number; impressions: number; position: number; pages: number | null; previousClicks: number | null };

export function LookBoxes({ looks, all, against, pagesShown }: {
  looks: readonly LookRow[] | undefined;
  /** Every click now and before, the hidden searches' too: Performance's own totals. */
  all: { now: number; before: number | null } | null;
  against: string;
  /** How many pages Google showed in these dates, in the country chosen. */
  pagesShown: number | null;
}) {
  const t = useTranslations("searchConsole.appearance.boxes");
  if (!looks || !all) return <div className="h-[104px] animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />;
  const clicks = looks.reduce((sum, look) => sum + look.clicks, 0);
  const held = looks.length > 0 && looks.every((look) => look.previousClicks !== null);
  const before = held ? looks.reduce((sum, look) => sum + (look.previousClicks ?? 0), 0) : null;
  const share = all.now > 0 ? Math.round((100 * clicks) / all.now) : null;
  const shareBefore = before !== null && all.before ? Math.round((100 * before) / all.before) : null;
  // The kind shown on most pages: a lower bound of the pages with any, as one page can show more than one kind.
  const most = [...looks].filter((look) => (look.pages ?? 0) > 0).sort((left, right) => (right.pages ?? 0) - (left.pages ?? 0))[0] ?? null;
  return (
    <FigureRow columns={3}>
      <Figure label={t("clicks")} value={formatNumber(clicks)} detail={<MoveLine now={clicks} before={before} against={against} />} />
      <Figure
        label={t("outOf100")}
        value={share === null ? "–" : formatNumber(share)}
        detail={(
          <>
            <span className="block text-secondary">{t("fromRich")}</span>
            {share !== null ? <MoveLine now={share} before={shareBefore} against={against} count /> : null}
          </>
        )}
      />
      <Figure
        label={t("pages")}
        value={most ? formatNumber(most.pages) : "–"}
        detail={(
          <>
            {most ? <span className="block text-secondary">{t("shownAs", { kind: most.name })}</span> : null}
            {pagesShown !== null ? <span className="block text-secondary">{t("outOf", { count: formatNumber(pagesShown) })}</span> : null}
          </>
        )}
      />
    </FigureRow>
  );
}

/** A month as the server sends it: every click, and each kind's where kept. */
export type LookMonth = { month: string; days: number; clicks: number; looks: Array<{ key: string; clicks: number; impressions: number }> | null };

const COUNTS = ["clicks", "share"] as const;
type Count = (typeof COUNTS)[number];
/** The kinds with most clicks keep a colour each; any others share one. Plain results are grey. */
const KIND_COLOURS = [CHART_SERIES_ORANGE, CHART_SERIES_BLUE, CHART_SERIES_TEAL];
const NAMED_KINDS = KIND_COLOURS.length;

/**
 * Every click of the last six months, a bar a month, split into each kind of rich result and plain results (every click less
 * the rich results'). Count: Clicks, or Out of every 100. A month whose rich results aren't counted yet is left out, and
 * said so. The current month is drawn as far as it goes ("November so far").
 */
export function LookMonthsCard({ months, newestMonth, nameOf, host, exportName }: {
  months: readonly LookMonth[] | undefined;
  /** The newest day's month, drawn "so far". */
  newestMonth: string | null;
  nameOf: (key: string) => string;
  host: string;
  exportName: string;
}) {
  const t = useTranslations("searchConsole.appearance.months");
  const [count, setCount] = useSiteParam<Count>("count", "clicks", COUNTS);
  const counted = (months ?? []).filter((month) => month.looks !== null);
  const totals = new Map<string, number>();
  for (const month of counted) for (const look of month.looks ?? []) totals.set(look.key, (totals.get(look.key) ?? 0) + look.clicks);
  const kinds = [...totals.entries()].filter(([, clicks]) => clicks > 0).sort((left, right) => right[1] - left[1]).map(([key]) => key);
  const named = kinds.slice(0, NAMED_KINDS);
  const others = kinds.length > NAMED_KINDS;
  const series = [
    ...named.map((key, at) => ({ key, name: nameOf(key), colour: KIND_COLOURS[at] })),
    ...(others ? [{ key: "others", name: t("others"), colour: CHART_SERIES_VIOLET }] : []),
    { key: "plain", name: t("plain"), colour: CHART_COMPARATOR_GREY },
  ];
  // A month by its name alone, as the canvas drew it; with its year when the six months reach into two.
  const years = new Set(counted.map((month) => month.month.slice(0, 4)));
  const monthName = (month: string) => (years.size > 1 ? formatMonth(month.slice(0, 7)) : new Intl.DateTimeFormat(readerLanguage(), { month: "long" }).format(new Date(`${month.slice(0, 7)}-15T12:00:00Z`)));
  const rows = counted.map((month) => {
    const looks = month.looks ?? [];
    const of = (key: string) => looks.find((look) => look.key === key)?.clicks ?? 0;
    const rich = looks.reduce((sum, look) => sum + look.clicks, 0);
    const parts = [...named.map(of), ...(others ? [rich - named.reduce((sum, key) => sum + of(key), 0)] : []), Math.max(0, month.clicks - rich)];
    const shown = count === "share" ? outOfTotal(parts) : parts;
    const label = month.month.slice(0, 7) === newestMonth ? t("soFar", { month: monthName(month.month) }) : monthName(month.month);
    return { label, ...Object.fromEntries(series.map((entry, at) => [entry.key, shown[at] ?? 0])) };
  });
  const left = (months ?? []).length - counted.length;
  const hint = [t("hint"), ...(left > 0 ? [t("notCounted", { count: left })] : [])].join(" ");
  return (
    <BarsCard
      title={t("title")}
      hint={hint}
      exportName={exportName}
      csvHeading={t("month")}
      csv={() => toCsv([t("month"), ...series.map((entry) => entry.name)], rows.map((row) => [row.label, ...series.map((entry) => Number((row as Record<string, unknown>)[entry.key] ?? 0))]))}
      host={host}
      waiting={months === undefined ? undefined : null}
      controls={[{ kind: "select", key: "count", label: t("count"), value: count, options: COUNTS.map((value) => ({ value, label: t(value) })), onChange: (next) => setCount(next as Count) }]}
      rows={rows}
      series={series}
      figure={t(count)}
      stacked
      upright
      totalOf={count === "clicks" ? (row) => series.reduce((sum, entry) => sum + Number(row[entry.key] ?? 0), 0) : undefined}
      // A part too thin to hold its figure says it on hover only.
      labels={(value, _key, row) => {
        const whole = series.reduce((sum, entry) => sum + Number(row[entry.key] ?? 0), 0);
        return whole > 0 && value / whole >= 0.12 ? formatNumber(value) : null;
      }}
      anything={rows.length > 0}
      empty={t("empty")}
    />
  );
}
