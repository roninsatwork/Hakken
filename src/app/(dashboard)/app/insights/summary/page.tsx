"use client";

import { useQuery } from "convex/react";
import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { LayoutDashboard } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { ChangeLine } from "@/src/ui/components/screens/Change";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { CHART_SERIES_BLUE, CHART_SERIES_ORANGE, CHART_SERIES_SLATE, CHART_SERIES_TEAL, CHART_SERIES_VIOLET } from "@/src/ui/components/charts/chartPalette";
import { shortName } from "@/convex/utils/insightLeagues";
import type { Score } from "@/convex/utils/insightSummary";
import { SiteBarChart } from "../../sites/_components/SiteCharts";
import { monthRow } from "../../sites/_components/datedRows";
import { formatDay, formatMonth, formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { ReportDownloadAction } from "../_components/ReportDownload";
import { RankDots } from "../_components/RankDots";
import { ScorecardRows } from "../_components/ScorecardRows";
import { StrategyNote, WorkLog, type WorkLine } from "../_components/StrategyNote";
import { useInsightsHome, useInsightsHref, useInsightsLeagues, useInsightsSite } from "../_components/useInsights";

/** Taken off a month's last share so the stack never tops 100% by a rounding and the scale ends at 100%. */
const FULL_BAR_SLACK = 1e-6;

/** Rivals' colours on the split share chart: none near your orange, so you never need telling apart by hue (he is colour blind). */
const RIVAL_COLOURS = [CHART_SERIES_BLUE, CHART_SERIES_VIOLET, CHART_SERIES_TEAL, CHART_SERIES_SLATE];

/** The monthly report is written from the 4th (§4.1): the next 4th, as a day. */
function nextMonthlyReport(today: Date): string {
  const year = today.getUTCFullYear(), month = today.getUTCMonth();
  return new Date(Date.UTC(year, today.getUTCDate() < 4 ? month : month + 1, 4)).toISOString().slice(0, 10);
}

/**
 * The executive summary (docs/plans/active/insights-analyst-plan.md §4.1;
 * the Main board, redrawn and approved 12 Oct 2026): the page a managing
 * director reads in thirty seconds — the Head of Strategy's verdict, note and
 * important points; what Hakken did this week and does next; the four figures
 * that matter against the same 90 days a year ago; your share of your market
 * against each rival; how many visits it takes to win an enquiry; where you
 * rank in every league; and the scorecard, worst first. Read from the newest
 * week the team saved; nothing is worked out when it opens (§8).
 */
export default function InsightsSummaryPage() {
  const t = usePlatformTranslations("insights.summary");
  const tPlace = usePlatformTranslations("insights.place");
  const href = useInsightsHref();
  const site = useInsightsSite();
  const home = useInsightsHome();
  const leagues = useInsightsLeagues();
  const week = useQuery(api.insightsReads.insightsThisWeek, site ? { siteId: site } : {});
  const board = useQuery(api.insightsReads.insightsLatestReport, site ? { kind: "BOARD", siteId: site } : { kind: "BOARD" });
  const conversion = useQuery(api.insightsConversion.insightsConversion, site ? { siteId: site } : {});
  const newest = week?.weeks.find((entry) => !site || entry.siteId === site) ?? week?.weeks[0] ?? null;
  const scorecard = newest?.summary?.scorecard ?? [];

  const score = (measure: Score["measure"]) => scorecard.find((row) => row.measure === measure) ?? null;
  const shown90 = (row: Score | null) => (row?.now === null || row?.now === undefined ? "–" : row.unit === "percent" ? `${row.now}%` : formatNumber(row.now));
  const change = (row: Score | null) => {
    if (!row || row.now === null || row.before === null) return <span className="text-secondary">{t("noYear")}</span>;
    if (row.unit === "percent") return <ChangeLine by={(row.now - row.before) * (row.lowerIsBetter ? -1 : 1)}>{t("changePoints", { points: Math.abs(Math.round((row.now - row.before) * 10) / 10), before: row.before })}</ChangeLine>;
    const percent = row.before > 0 ? Math.round(((row.now - row.before) / row.before) * 100) : null;
    return <ChangeLine by={(row.now - row.before) * (row.lowerIsBetter ? -1 : 1)}>{percent === null ? t("changeFromNone") : t("changeOn", { percent: Math.abs(percent), before: formatNumber(row.before) })}</ChangeLine>;
  };
  const market = leagues?.leagues.find((league) => league.id === "traffic") ?? null;
  const findings = (week?.findings ?? []).filter((finding) => !newest || finding.siteId === newest.siteId);

  // What Hakken did this week and does next, each line opening its page: an agency's report, never a to-do list.
  const did: WorkLine[] = [];
  const next: WorkLine[] = [];
  if (newest) {
    did.push({ words: t("work.read", { figures: formatNumber(newest.checked), sources: newest.sources.filter((source) => source.facts > 0).length, rivals: leagues?.rivals ?? 0 }), href: href("sources") });
    did.push({ words: t("work.found", { ruledOut: newest.ruledOut, findings: findings.length }), href: href("this-week") });
    const reviewed = conversion?.pages ?? [];
    if (reviewed.length > 0) did.push({ words: t("work.pages", { pages: reviewed.length, fix: reviewed.filter((page) => page.verdict !== "KEEP").length }), href: href("page-reviews") });
    const cited = leagues?.leagues.find((league) => league.id === "cited");
    const yours = cited?.rows.find((row) => row.you);
    if (cited?.place && yours) did.push({ words: t("work.cited", { count: formatNumber(yours.value), place: tPlace("ofTotal", { place: cited.place, total: cited.rows.length }) }), href: href("leaderboards/cited") });
    if (newest.changes > 0) did.push({ words: t("work.changes", { changes: newest.changes }), href: href("track-record") });
    if (newest.nextRead) next.push({ words: t("work.nextRead", { day: formatDay(newest.nextRead) }), href: href("this-week") });
    next.push({ words: t("work.watch"), href: href("track-record") });
    next.push({ words: t("work.monthly", { day: formatDay(nextMonthlyReport(new Date())) }), href: href("reports") });
    for (const check of newest.checks) next.push({ words: t("work.check", { day: formatDay(check.day), count: check.count }), href: href("track-record") });
  }

  // Each month's Google visitors shared between you and each rival, you at the foot of the bar (Anthony, 2026-10-12:
  // a share shows the others too); a week saved before the rivals were kept shows you alone.
  const shareMonths = newest?.summary?.shareByMonth ?? [];
  const rivalHosts = [...new Set(shareMonths.flatMap((month) => (month.rivals ?? []).map((rival) => rival.host)))];
  const shareOf = (value: number, total: number) => (total > 0 ? Math.round((value / total) * 1000) / 10 : 0);
  const shareBars = shareMonths.map((month) => {
    const shares = rivalHosts.map((host) => shareOf(month.rivals?.find((rival) => rival.host === host)?.value ?? 0, month.total));
    // The last rival takes what rounding leaves, a hair under, so a month adds up to 100% and the scale stops
    // at 100% rather than 120% (Anthony, 2026-10-12: "all the bars only got to about 90%").
    if (shares.length > 0) shares[shares.length - 1] = Math.max(0, Math.round((100 - shareOf(month.you, month.total) - shares.slice(0, -1).reduce((sum, share) => sum + share, 0)) * 10) / 10 - FULL_BAR_SLACK);
    return monthRow(month.month, { you: shareOf(month.you, month.total), ...Object.fromEntries(shares.map((share, index) => [`rival${index}`, share])) });
  });
  const shareSeries = [
    { key: "you", name: t("share.figure"), colour: CHART_SERIES_ORANGE },
    ...rivalHosts.map((host, index) => ({ key: `rival${index}`, name: shortName(host), colour: RIVAL_COLOURS[index % RIVAL_COLOURS.length] })),
  ];
  // People for each enquiry, month by month — the same count as the figure and the verdict — where the week holds
  // Google's people a month; visits on a week saved before. The month in progress is lighter, "so far".
  const months = (newest?.summary?.enquiriesByMonth ?? []).filter((month) => month.conversions > 0);
  const byPeople = months.length > 0 && months.every((month) => month.people !== undefined);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const perBars = months.map((month) => monthRow(
    month.month,
    { visits: Math.round((byPeople ? month.people ?? 0 : month.visits) / month.conversions) },
    month.month === thisMonth ? { part: true, readout: t("per.soFar", { month: formatMonth(month.month) }) } : {},
  ));

  return (
    <>
      <PageHeader
        icon={<LayoutDashboard className="h-5 w-5 text-brand" />}
        title={t("title")}
        description={home ? t("description", { company: home.company }) : undefined}
        action={<ReportDownloadAction report={board} label={t("downloadBoard")} />}
      />
      {newest ? (
        <>
          <StrategyNote verdict={newest.verdict} paragraphs={newest.summary?.paragraphs ?? []} writtenAt={newest.createdAt} points={findings.filter((finding) => finding.headline !== newest.verdict)} href={href} />
          <WorkLog did={did} next={next} />
        </>
      ) : week !== undefined ? <Notice>{t("noWeek")}</Notice> : null}
      <FigureRow>
        <Figure label={t("measures.enquiries")} value={shown90(score("enquiries"))} detail={change(score("enquiries"))} />
        <Figure label={t("measures.visitors")} value={shown90(score("visitors"))} detail={change(score("visitors"))} />
        <Figure label={t("measures.visitorsPerEnquiry")} value={shown90(score("visitorsPerEnquiry"))} detail={change(score("visitorsPerEnquiry"))} />
        <Figure
          label={t("place")}
          value={market?.place ? tPlace("ofTotal", { place: market.place, total: market.rows.length }) : "–"}
          detail={market?.place && market.placeBefore ? <ChangeLine by={market.placeBefore - market.place}>{t("placeMoved", { count: Math.abs(market.placeBefore - market.place) })}</ChangeLine> : <span className="text-secondary">{t("placeDetail")}</span>}
        />
      </FigureRow>
      <ChartCard title={t("share.title")} hint={t(rivalHosts.length > 0 ? "share.hintRivals" : "share.hint")} exportName="insights-market-share" csv={() => toCsv([t("share.month"), ...shareSeries.map((entry) => entry.name)], shareBars.map((row) => [String(row.day).slice(0, 7), ...shareSeries.map((entry) => Number(row[entry.key] ?? 0))]))} enoughData={shareBars.length > 1} emptyText={t("share.empty")}>
        <SiteBarChart
          data={shareBars}
          series={shareSeries}
          stacked={rivalHosts.length > 0}
          formatScale={(value) => `${value}%`}
          formatValue={(value) => `${Math.round(value * 10) / 10}%`}
          labels={(value, key) => (key === "you" ? `${value}%` : null)}
        />
      </ChartCard>
      <ChartCard title={t(byPeople ? "per.titlePeople" : "per.title")} hint={t(byPeople ? "per.hintPeople" : "per.hint")} exportName="insights-visits-per-enquiry" csv={() => toCsv([t("share.month"), t("per.figure")], perBars.map((row) => [String(row.day).slice(0, 7), Number(row.visits)]))} enoughData={perBars.length > 1} emptyText={t("per.empty")}>
        <SiteBarChart data={perBars} series={[{ key: "visits", name: t(byPeople ? "per.figurePeople" : "per.figure"), colour: CHART_SERIES_ORANGE }]} labels={(value) => formatNumber(value)} />
      </ChartCard>
      {leagues && leagues.leagues.some((league) => league.place !== null) ? <RankDots leagues={leagues.leagues} rivals={leagues.rivals} href={href} /> : null}
      {scorecard.length > 0 ? <ScorecardRows scorecard={scorecard} href={href} /> : null}
    </>
  );
}
