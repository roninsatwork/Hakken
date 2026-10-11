"use client";

import { useQuery } from "convex/react";
import { Activity } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { Change } from "@/src/ui/components/screens/Change";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import type { StatusTone } from "@/src/ui/components/screens/statusTone";
import { CUT_COLUMN, RecordLinkCell } from "../../../sites/_components/SiteCells";
import { SITE_SERIES_COLOURS, SiteLineChart } from "../../../sites/_components/SiteCharts";
import { formatNumber, formatShortDay, toCsv } from "../../../sites/_components/siteFormat";
import { SearchConsoleChartCard, useSeriesTicks } from "../../_components/SearchConsoleChartCard";
import { SearchConsoleListScreen } from "../../_components/SearchConsoleListTable";
import { CountryNotReady } from "../../_components/SearchConsoleNotices";
import { SearchConsoleSees } from "../../_components/SearchConsoleSees";
import { BeforeAfter, useSearchConsoleList, type ChipId } from "../../_components/SearchConsoleTables";
import { formatPosition } from "../../_components/searchConsoleFormat";
import { useRecordHref } from "../../_components/searchConsoleRecords";
import { countryArg, useSearchConsoleCountry } from "../../_components/useSearchConsole";
import { useChartPeriods } from "../../_components/useChartPeriods";

const CHIPS: readonly ChipId[] = ["brand", "way"];
const TONE: Record<"NORMAL" | "HIGH" | "VERY_HIGH", StatusTone> = { NORMAL: "success", HIGH: "warning", VERY_HIGH: "danger" };

/** A score as the page writes it: one decimal. */
const score = (value: number | null | undefined) => (value === null || value === undefined ? "…" : value.toFixed(1));

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
  const series = [{ key: "volatility", name: tv("series"), colour: SITE_SERIES_COLOURS[0] }];
  const ticks = useSeriesTicks(series);
  const latest = facts?.latest ?? null;
  const update = facts?.update ?? null;
  const clickChange = facts && facts.clicks.before !== null && facts.clicks.before > 0 ? (facts.clicks.now - facts.clicks.before) / facts.clicks.before : null;
  return (
    <SearchConsoleListScreen
      icon={<Activity className="h-5 w-5 text-brand" />}
      title={tv("title")}
      description={tv("description")}
      sees={<SearchConsoleSees screen="volatility" seen={facts?.seen} />}
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
              label={tv("lastWeek")}
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
            label={tv("clicks7")}
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
          {
            key: "key",
            header: t("table.keyword"),
            sortable: true,
            className: CUT_COLUMN.first,
            cell: (row) => <RecordLinkCell cut href={recordHref("keywords/keyword", row.key)}>{row.key}</RecordLinkCell>,
          },
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
          controls={ticks.controls}
          exportName={`${host}-search-console-volatility-${list.range.from}-to-${list.range.to}`}
          host={host}
          from={chart.from}
          to={chart.to}
          step={chart.step}
          csv={() => toCsv([chart.periodHeader, tv("series")], (periods ?? []).map((period) => [period.start, period.volatility ?? ""]))}
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
              <SiteLineChart height={280} series={ticks.shown} data={chart.rows((period) => ({ volatility: period.volatility ?? null }))} />
            </>
          )}
        </SearchConsoleChartCard>
      )}
    </SearchConsoleListScreen>
  );
}
