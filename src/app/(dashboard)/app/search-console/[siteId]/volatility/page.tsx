"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Activity } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { Change } from "@/src/ui/components/screens/Change";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { ExplorerToolbar } from "@/src/ui/components/screens/ChartExplorer";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import type { StatusTone } from "@/src/ui/components/screens/statusTone";

import { SITE_SERIES_COLOURS, SiteLineChart } from "../../../sites/_components/SiteCharts";
import { formatNumber, formatShortDay, toCsv } from "../../../sites/_components/siteFormat";
import { SearchConsoleChartCard } from "../../_components/SearchConsoleChartCard";
import { SearchConsoleListScreen } from "../../_components/SearchConsoleListTable";
import { CountryNotReady } from "../../_components/SearchConsoleNotices";
import { SearchConsoleSees } from "../../_components/SearchConsoleSees";
import { BeforeAfter, useSearchConsoleList, type ChipId, keywordColumn } from "../../_components/SearchConsoleTables";
import { formatPosition } from "../../_components/searchConsoleFormat";
import { useRecordHref } from "../../_components/searchConsoleRecords";
import { countryArg, useSearchConsoleCountry } from "../../_components/useSearchConsole";
import { useChartPeriods } from "../../_components/useChartPeriods";

const CHIPS: readonly ChipId[] = ["brand", "way"];
const TONE: Record<"NORMAL" | "HIGH" | "VERY_HIGH", StatusTone> = { NORMAL: "success", HIGH: "warning", VERY_HIGH: "danger" };

/** A score as the page writes it: one decimal. */
const score = (value: number | null | undefined) => (value === null || value === undefined ? "…" : value.toFixed(1));

/**
 * The chart's lines (Anthony, 2026-11-20: "a selector to the volatility chart for positive volatility and negative
 * volatility … use the standard multi select dropdown"; then "Positions Improved and Positions Declined … not up and down"):
 * the score, and its two parts, Positions improved and Positions declined, which add up to it. All
 * three start ticked, in the kit's tick-box dropdown, each keeping its colour whichever are ticked.
 */
const LINES = ["volatility", "volatilityUp", "volatilityDown"] as const;
type Line = (typeof LINES)[number];

/**
 * Volatility (docs/plans/active/search-console-volatility-plan.md §2.1, drawn
 * as board 1): how much the website's positions on Google moved each day, out
 * of 10, against its own usual — "is it Google, or is it us?". What Hakken
 * sees under the title, then four figures, the score day by day with
 * Google's updates marked, and the keywords counted on the newest complete
 * day, the most moved first, each opening its record. Read from Search
 * Console's own days: nothing bought.
 */
export default function SearchConsoleVolatilityPage() {
  const t = useTranslations("searchConsole");
  const tv = useTranslations("searchConsole.volatility");
  const language = useLocale();
  const list = useSearchConsoleList({ dimension: "query", view: "volatility", opening: "movedBy", chips: CHIPS });
  const recordHref = useRecordHref(list.siteId);
  const [country] = useSearchConsoleCountry();
  const facts = useQuery(
    api.searchConsoleVolatility.searchConsoleVolatility,
    list.status?.connection?.newestDay ? { siteId: list.siteId, language, ...countryArg(country) } : "skip",
  );
  const chart = useChartPeriods({ ...list, kind: "web" });
  const { figures, periods } = chart;
  const host = list.status?.host ?? "";
  const lineNames: Record<Line, string> = { volatility: tv("series"), volatilityUp: tv("up"), volatilityDown: tv("down") };
  const [ticked, setTicked] = useState<Line[]>([...LINES]);
  const series = LINES.map((key, at) => ({ key, name: lineNames[key], colour: SITE_SERIES_COLOURS[at] })).filter((line) => ticked.includes(line.key));
  const showsParts = ticked.some((key) => key !== "volatility");
  // The two parts are kept from 20 November 2026, and a week or month past the days kept is never built again, so on long
  // dates the score's line reaches back further than its parts: the chart says where they start.
  const scored = (periods ?? []).filter((period) => period.volatility !== undefined);
  const firstParts = scored.find((period) => period.volatilityUp !== undefined);
  const partsNote = !showsParts || scored.length === 0 ? null
    : !firstParts ? tv("partsNone")
      : firstParts !== scored[0] ? tv("partsFrom", { day: formatShortDay(firstParts.start) }) : null;
  const latest = facts?.latest ?? null;
  const update = facts?.update ?? null;
  // Its figures keep the newest seven days whatever the menu says, so they name the day they end on (calendar-periods-plan.md).
  const newestWords = facts?.newestDay ? formatShortDay(facts.newestDay) : "…";
  const clickChange = facts && facts.clicks.before !== null && facts.clicks.before > 0 ? (facts.clicks.now - facts.clicks.before) / facts.clicks.before : null;
  // The eye's figures: the four boxes' (with the same days' times shown), the keywords on screen and the chart, each
  // part named as the page names it; "Do first" may open the search that moved most (section 6 of
  // ask-hakken-every-chart-page-plan-2026-11-03.md).
  const tw = useTranslations("searchConsole.sees");
  const shownRows = list.table.pageRows ?? null;
  const latestDay = latest?.day ?? null;
  const seesData = useMemo(() => (facts
    ? {
      volatility: facts,
      rows: shownRows,
      picked: true,
      // By their first day (`day`), so the eye keeps the newest of a long chart, never its oldest.
      chart: periods ? periods.map((period) => ({ ...period, day: period.start })) : null,
      names: {
        latest: latestDay ? formatShortDay(latestDay) : tv("latestDayNone"),
        up: tv("up"), down: tv("down"),
        usual: tw("usual"), last7: tw("last7"), week7Before: tw("week7Before"), climbed5: tw("climbed5"), fell5: tw("fell5"), beforeIt: tw("beforeIt"), dayBefore: tw("dayBefore"),
      },
    }
    : undefined), [facts, shownRows, periods, latestDay, tv, tw]);
  const moved = shownRows?.find((row) => row.clicks > 0 && row.positionChange !== null);
  const seesLinks = useMemo(() => (moved ? [{ label: moved.key, href: recordHref("keywords/keyword", moved.key) }] : []), [moved, recordHref]);
  return (
    <SearchConsoleListScreen
      icon={<Activity className="h-5 w-5 text-brand" />}
      title={tv("title")}
      description={tv("description")}
      sees={<SearchConsoleSees screen="volatility" seen={facts?.seen} data={seesData} links={seesLinks} />}
      kindSwitch={false}
      heroes={
        <FigureRow>
          <Figure
            emphasis
            label={latest ? tv("latestDay", { day: formatShortDay(latest.day) }) : tv("latestDayNone")}
            value={latest ? score(latest.volatility) : facts ? "–" : "…"}
            detail={latest?.level ? <StatusLabel tone={TONE[latest.level]}>{tv(`levels.${latest.level}`)}</StatusLabel> : <span className="text-secondary">{tv("noLevel")}</span>}
          />
          {update ? (
            <Figure
              label={tv("during")}
              value={score(update.during)}
              detail={<span className="text-secondary">{update.before === null ? tv("noBefore") : tv("beforeIt", { score: score(update.before) })}</span>}
            />
          ) : (
            <Figure
              label={tv("lastWeek", { day: newestWords })}
              value={score(facts?.week.now)}
              detail={<span className="text-secondary">{facts?.week.before === null || !facts ? tv("noBefore") : tv("weekBefore", { score: score(facts.week.before) })}</span>}
            />
          )}
          <Figure
            label={tv("moved5")}
            value={latest ? formatNumber(latest.movedUp5 + latest.movedDown5) : "…"}
            detail={<span className="text-secondary">{latest ? tv("downUp", { down: latest.movedDown5, up: latest.movedUp5, day: formatShortDay(latest.day) }) : ""}</span>}
          />
          <Figure
            label={tv("clicks7", { day: newestWords })}
            value={facts ? formatNumber(facts.clicks.now) : "…"}
            detail={clickChange === null ? <span className="text-secondary">{tv("noBefore")}</span> : (
              <span className="inline-flex items-center gap-1.5">
                <Change by={Math.round(clickChange * 100)} format={(value) => `${formatNumber(value)}%`} />
                <span className="text-secondary">{tv("onWeekBefore")}</span>
              </span>
            )}
          />
        </FigureRow>
      }
      table={{
        list,
        chips: CHIPS,
        noun: "keywords",
        searchPlaceholder: t("keywords.searchPlaceholder"),
        rowHref: (row) => recordHref("keywords/keyword", row.key),
        emptyIcon: <Activity className="h-8 w-8 text-muted/30" />,
        emptyLabel: tv("empty"),
        download: [
          { header: t("table.keyword"), field: "key" },
          { header: tv("positionBefore"), field: "previousPosition" },
          { header: t("table.position"), field: "position" },
          { header: t("table.moved"), field: "positionChange" },
          { header: t("table.clicks"), field: "clicks" },
        ],
        columns: [
          keywordColumn(t("table.keyword"), recordHref),
          { key: "position", header: t("table.position"), align: "right", sortable: true, cell: (row) => <BeforeAfter before={row.previousPosition} now={row.impressions > 0 ? row.position : null} format={formatPosition} /> },
          { key: "movedBy", header: t("table.moved"), align: "right", sortable: true, cell: (row) => <Change by={row.positionChange} kind="places" same format={formatPosition} /> },
          { key: "clicks", header: t("table.clicks"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.clicks)}</span> },
        ],
      }}
    >
      {facts?.live && country ? <CountryNotReady country={country} /> : (
        <SearchConsoleChartCard
          title={tv("chartTitle")}
          hint={facts?.usual ? tv("chartHintUsual", { usual: score(facts.usual) }) : tv("chartHint")}
          controls={(
            <ExplorerToolbar controls={[{
              kind: "ticks", key: "lines", label: tv("show"), everyWord: tv("every"),
              choices: LINES.map((key) => ({ key, label: lineNames[key] })), ticked, onChange: (next) => setTicked(next as Line[]),
            }]}
            />
          )}
          exportName={`${host}-search-console-volatility-${list.range.from}-to-${list.range.to}`}
          host={host}
          from={chart.from}
          to={chart.to}
          step={chart.step}
          csv={() => toCsv(
            [chart.periodHeader, tv("series"), tv("up"), tv("down")],
            (periods ?? []).map((period) => [period.start, period.volatility ?? "", period.volatilityUp ?? "", period.volatilityDown ?? ""]),
          )}
        >
          {periods === undefined ? (
            <div className="h-[280px] animate-pulse rounded-xl bg-sidebar/30" aria-busy="true" />
          ) : figures?.preparing || figures?.notBuilt ? (
            <p className="py-10 text-center text-[13px] text-secondary">{t(figures.preparing ? "chart.preparing" : "chart.notBuilt")}</p>
          ) : periods.every((period) => period.volatility === undefined) ? (
            <p className="py-10 text-center text-[13px] text-secondary">{tv("chartNothing")}</p>
          ) : (
            <>
              {chart.note ? <p className="mb-3 text-[12px] text-secondary">{chart.note}</p> : null}
              {partsNote ? <p className="mb-3 text-[12px] text-secondary">{partsNote}</p> : null}
              {series.length === 0 ? (
                <p className="py-10 text-center text-[13px] text-secondary">{tv("nothingTicked")}</p>
              ) : (
                <SiteLineChart
                  height={280}
                  series={series}
                  sharedScale
                  keepEmptyRows
                  formatValue={(value) => score(value)}
                  data={chart.rows((period) => ({ volatility: period.volatility ?? null, volatilityUp: period.volatilityUp ?? null, volatilityDown: period.volatilityDown ?? null }))}
                />
              )}
            </>
          )}
        </SearchConsoleChartCard>
      )}
    </SearchConsoleListScreen>
  );
}
