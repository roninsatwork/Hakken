"use client";

import { useQuery } from "convex/react";
import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { QuickCheckNotice } from "../_components/QuickCheckNotice";
import { LayoutDashboard } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { ChangeLine } from "@/src/ui/components/screens/Change";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { HakkenSees } from "@/src/ui/components/screens/HakkenSees";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { CHART_SERIES_BLUE, CHART_SERIES_ORANGE, CHART_SERIES_SLATE, CHART_SERIES_TEAL, CHART_SERIES_VIOLET } from "@/src/ui/components/charts/chartPalette";
import { shortName } from "@/convex/utils/insightLeagues";
import type { Score } from "@/convex/utils/insightSummary";
import { SiteBarChart } from "../../sites/_components/SiteCharts";
import { monthRow } from "../../sites/_components/datedRows";
import { formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { ListDownload } from "../../sites/_components/SiteDownloads";
import { useSitePager } from "../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../sites/_components/useSiteParam";
import { LeagueCard } from "../_components/LeagueCard";
import { ReportDownloadAction } from "../_components/ReportDownload";
import { EnquiryCheckNotice } from "../_components/EnquiryCheckNotice";
import { useInsightsHome, useInsightsHref, useInsightsLeagues, useInsightsSite } from "../_components/useInsights";

/** Taken off a month's last share so the stack never tops 100% by a rounding and the scale ends at 100%. */
const FULL_BAR_SLACK = 1e-6;

/** Rivals' colours on the split share chart: none near your orange, so you never need telling apart by hue (he is colour blind). */
const RIVAL_COLOURS = [CHART_SERIES_BLUE, CHART_SERIES_VIOLET, CHART_SERIES_TEAL, CHART_SERIES_SLATE];

const STATUS_TONE = { ON_TRACK: "success", WATCH: "warning", BEHIND: "danger" } as const;

/**
 * The executive summary (docs/plans/active/insights-analyst-plan.md §4.1,
 * drawn as the Main board): the page a managing director reads in thirty
 * seconds — the week's verdict and what to do first, the four figures that
 * matter against last year, your share of your market over time against
 * each rival, how many visits it takes to win an enquiry month by month,
 * where you rank in every league as a graph of every website, and the
 * scorecard against last year and your rivals. Read from the
 * newest week the team saved; nothing is worked out when it opens (§8).
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
  const [search, setSearch, term] = useSiteSearch();
  const [status, setStatus] = useSiteParam<string>("status", "");
  const newest = week?.weeks.find((entry) => !site || entry.siteId === site) ?? week?.weeks[0] ?? null;
  const scorecard = newest?.summary?.scorecard ?? [];
  const shown = week ? scorecard.filter((row) => (!status || row.status === status) && (!term || t(`measures.${row.measure}`).toLowerCase().includes(term.toLowerCase()))) : undefined;
  const pages = useSitePager(shown, { isLoading: week === undefined });

  const score = (measure: Score["measure"]) => scorecard.find((row) => row.measure === measure) ?? null;
  const shown90 = (row: Score | null) => (row?.now === null || row?.now === undefined ? "–" : row.unit === "percent" ? `${row.now}%` : formatNumber(row.now));
  const change = (row: Score | null) => {
    if (!row || row.now === null || row.before === null) return <span className="text-secondary">{t("noYear")}</span>;
    if (row.unit === "percent") return <ChangeLine by={(row.now - row.before) * (row.lowerIsBetter ? -1 : 1)}>{t("changePoints", { points: Math.abs(Math.round((row.now - row.before) * 10) / 10), before: row.before })}</ChangeLine>;
    const percent = row.before > 0 ? Math.round(((row.now - row.before) / row.before) * 100) : null;
    return <ChangeLine by={(row.now - row.before) * (row.lowerIsBetter ? -1 : 1)}>{percent === null ? t("changeFromNone") : t("changeOn", { percent: Math.abs(percent), before: formatNumber(row.before) })}</ChangeLine>;
  };
  const market = leagues?.leagues.find((league) => league.id === "traffic") ?? null;
  const findings = week?.findings ?? [];
  const says = newest ? [newest.verdict, ...(findings[0] && findings[0].headline !== newest.verdict ? [findings[0].headline] : [])] : [t("noWeek")];
  const steps = findings.slice(0, 3).map((finding) => ({ words: finding.action, link: t("seeFinding"), href: href(`findings/${finding.findingId}`) }));

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
  const perBars = (newest?.summary?.enquiriesByMonth ?? []).filter((month) => month.conversions > 0).map((month) => monthRow(month.month, { visits: Math.round(month.visits / month.conversions) }));

  return (
    <>
      <PageHeader
        icon={<LayoutDashboard className="h-5 w-5 text-brand" />}
        title={t("title")}
        description={home ? t("description", { company: home.company }) : undefined}
        action={<ReportDownloadAction report={board} label={t("downloadBoard")} />}
      />
      <HakkenSees says={says} steps={steps} />
      <QuickCheckNotice />
      <EnquiryCheckNotice check={newest?.summary?.enquiryCheck} />
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
      <ChartCard title={t("per.title")} hint={t("per.hint")} exportName="insights-visits-per-enquiry" csv={() => toCsv([t("share.month"), t("per.figure")], perBars.map((row) => [String(row.day).slice(0, 7), Number(row.visits)]))} enoughData={perBars.length > 1} emptyText={t("per.empty")}>
        <SiteBarChart data={perBars} series={[{ key: "visits", name: t("per.figure"), colour: CHART_SERIES_ORANGE }]} labels={(value) => formatNumber(value)} />
      </ChartCard>
      {/* Where you rank against your rivals: each league a graph of every website, its figure on its bar, you in orange (Anthony, 2026-10-12: a graph, further down the page). */}
      {leagues && leagues.leagues.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {leagues.leagues.map((league) => <LeagueCard key={league.id} league={league} host={leagues.host} href={href(`leaderboards/${league.id}`)} />)}
        </div>
      ) : null}
      <DataTable
        rows={pages.pageRows}
        rowKey={(row) => row.measure}
        search={{ value: search, onChange: setSearch, placeholder: t("table.search") }}
        filters={
          <Select chip={{ label: t("table.status"), choice: status ? t(`status.${status}`) : null }} value={status} onChange={setStatus} aria-label={t("table.status")}>
            <option value="">{t("table.everyStatus")}</option>
            {(["ON_TRACK", "WATCH", "BEHIND"] as const).map((value) => <option key={value} value={value}>{t(`status.${value}`)}</option>)}
          </Select>
        }
        cardHeader={
          <TableBar
            footer={pages.footer}
            noun="results"
            title={t("table.title")}
            actions={
              <ListDownload
                label={t("table.download")}
                fileName="insights-scorecard"
                rows={shown}
                columns={[
                  { header: t("table.measure"), value: (row) => t(`measures.${row.measure}`) },
                  { header: t("table.now"), value: (row) => row.now ?? "" },
                  { header: t("table.year"), value: (row) => row.before ?? "" },
                  { header: t("table.rivals"), value: (row) => (row.place ? `${row.place}/${row.places}` : "") },
                  { header: t("table.status"), value: (row) => t(`status.${row.status}`) },
                ]}
              />
            }
          />
        }
        empty={{ icon: <LayoutDashboard className="h-8 w-8 text-muted/30" />, label: newest ? t("table.noMatch") : t("noWeek") }}
        footer={pages.footer}
        columns={[
          { key: "measure", header: t("table.measure"), cell: (row) => <span className="text-[13px] text-foreground">{t(`measures.${row.measure}`)}</span> },
          { key: "now", header: t("table.now"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-foreground">{shown90(row)}</span> },
          { key: "year", header: t("table.year"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.before === null ? "–" : row.unit === "percent" ? `${row.before}%` : formatNumber(row.before)}</span> },
          { key: "change", header: t("table.change"), align: "right", cell: (row) => <span className="text-[12px]">{change(row)}</span> },
          { key: "rivals", header: t("table.rivals"), cell: (row) => <span className="text-[12px] text-secondary">{row.place && row.places ? tPlace("ofTotal", { place: row.place, total: row.places }) : "–"}</span> },
          { key: "status", header: t("table.status"), cell: (row) => <StatusLabel tone={STATUS_TONE[row.status]}>{t(`status.${row.status}`)}</StatusLabel> },
        ]}
      />
      {newest ? <Notice>{t("did", { findings: findings.length, checked: formatNumber(newest.checked), ruledOut: newest.ruledOut })}</Notice> : null}
    </>
  );
}
