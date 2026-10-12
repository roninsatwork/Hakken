"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { CHART_SERIES_ORANGE, CHART_SERIES_SLATE } from "@/src/ui/components/charts/chartPalette";
import type { Score } from "@/convex/utils/insightSummary";
import { formatNumber } from "../../sites/_components/siteFormat";
import { ListDownload } from "../../sites/_components/SiteDownloads";

const STATUS_TONE = { BEHIND: "danger", WATCH: "warning", ON_TRACK: "success" } as const;
/** Worst first: what needs a look before what is fine. */
const STATUS_ORDER = ["BEHIND", "WATCH", "ON_TRACK"] as const;
/** Where each measure is read in full. */
const MEASURE_PAGE: Record<Score["measure"], string> = {
  enquiries: "funnel",
  visitors: "funnel",
  visitorsPerEnquiry: "page-reviews",
  googleVisits: "leaderboards/traffic",
  googleClicksPerEnquiry: "funnel",
  googleEnquiries: "funnel",
  aiVisits: "leaderboards/recommended",
  marketShare: "leaderboards/traffic",
  aiMentions: "leaderboards/mindshare",
  strength: "leaderboards/strength",
  reviews: "leaderboards/reviews",
};

/** A figure as the scorecard writes it: a share with its sign, a count grouped. */
const figure = (row: Score, value: number) => (row.unit === "percent" ? `${value}%` : formatNumber(value));

/** A year ago and now as two bars on one scale, grey then orange, each with its figure: nothing waits on a hover. */
function YearBars({ row, t }: { row: Score; t: (key: string) => string }) {
  const top = Math.max(row.now ?? 0, row.before ?? 0) || 1;
  // The charts' own grey and orange, as drawn: a year ago, then now.
  const bar = (value: number, colour: string) => (
    <span className="flex items-center gap-2">
      <span className="h-3 rounded-sm" style={{ width: `${Math.max(2, (value / top) * 150)}px`, background: colour }} />
      <span className="font-mono text-[11px] text-foreground">{figure(row, value)}</span>
    </span>
  );
  return (
    <span className="grid w-[260px] shrink-0 grid-cols-[5rem_1fr] items-center gap-x-2 gap-y-1">
      {row.before !== null ? (
        <>
          <span className="text-[11px] text-muted">{t("yearAgo")}</span>
          {bar(row.before, CHART_SERIES_SLATE)}
        </>
      ) : null}
      <span className="text-[11px] text-muted">{t("now")}</span>
      {row.now !== null ? bar(row.now, CHART_SERIES_ORANGE) : <span className="text-[11px] text-muted">–</span>}
      {row.before === null ? <span className="col-span-2 text-[11px] text-muted">{t("noYear")}</span> : null}
    </span>
  );
}

/**
 * The scorecard (Executive summary, approved 12 Oct 2026, after "good but I
 * don't understand it"): each measure Hakken watches, grouped worst first,
 * each with a plain sentence, a year ago and now as bars, and its place among
 * the agencies left to "Where you rank" (Anthony, 12 Oct: "remove the
 * leaderboard from the scorecard"). Every comparison is the last 90 days against the same
 * 90 days a year ago, never the whole year. A row opens its page.
 */
export function ScorecardRows({ scorecard, href }: { scorecard: Score[]; href: (segment: string) => string }) {
  const t = usePlatformTranslations("insights.summary.scorecard");
  const tMeasure = usePlatformTranslations("insights.summary.measures");
  const tStatus = usePlatformTranslations("insights.summary.status");
  const change = (row: Score) => {
    if (row.now === null || row.before === null) return "";
    if (row.unit === "percent") {
      const points = Math.round((row.now - row.before) * 10) / 10;
      return points === 0 ? t("same") : t(points > 0 ? "pointsMore" : "pointsFewer", { points: Math.abs(points) });
    }
    if (row.before === 0) return t("same");
    const percent = Math.round(((row.now - row.before) / row.before) * 100);
    return percent === 0 ? t("same") : t(percent > 0 ? "more" : "fewer", { percent: Math.abs(percent) });
  };
  const sentence = (row: Score) => {
    const now = row.now === null ? "–" : figure(row, row.now);
    const said = row.before === null
      ? t("sentenceNoYear", { now })
      : t(row.measure === "marketShare" ? "sentenceShare" : "sentence", { now, before: figure(row, row.before), change: change(row) });
    return `${said}${row.lowerIsBetter ? ` ${t("lower")}` : ""}`;
  };
  return (
    <section data-part="scorecard" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 data-part-title="true" className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">{t("title")}</h2>
          <p className="max-w-[75ch] text-[13px] leading-[1.6] text-secondary">{t("hint", { count: scorecard.length })}</p>
        </div>
        <ListDownload
          label={t("download")}
          fileName="insights-scorecard"
          rows={scorecard}
          columns={[
            { header: t("measure"), value: (row) => tMeasure(row.measure) },
            { header: t("now"), value: (row) => row.now ?? "" },
            { header: t("yearAgo"), value: (row) => row.before ?? "" },
            { header: t("status"), value: (row) => tStatus(row.status) },
          ]}
        />
      </div>
      {STATUS_ORDER.map((status) => {
        const rows = scorecard.filter((row) => row.status === status);
        if (rows.length === 0) return null;
        return (
          <div key={status} className="flex flex-col">
            <div className="flex flex-wrap items-center gap-3 border-b border-border-dim pb-2">
              <StatusLabel tone={STATUS_TONE[status]}>{tStatus(status)}</StatusLabel>
              <span className="text-[12px] text-muted">{t("groupCount", { count: rows.length, total: scorecard.length })} · {t(`groups.${status}`)}</span>
            </div>
            {rows.map((row) => (
              <Link
                key={row.measure}
                href={href(MEASURE_PAGE[row.measure])}
                className="flex flex-wrap items-center gap-4 rounded-[10px] border-b border-border-dim/50 px-2 py-3 hover:bg-hover/50"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[13px] font-medium text-foreground">{tMeasure(row.measure)}</span>
                  <span className="text-[12px] text-secondary">{sentence(row)}</span>
                </span>
                <YearBars row={row} t={t} />
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-secondary" aria-hidden="true" />
              </Link>
            ))}
          </div>
        );
      })}
    </section>
  );
}
