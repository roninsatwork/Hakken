"use client";

import Link from "next/link";
import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { ArrowUpRight } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { CHART_SERIES_ORANGE, CHART_SERIES_SLATE } from "@/src/ui/components/charts/chartPalette";
import { shortName } from "@/convex/utils/insightLeagues";
import { SiteBarChart } from "../../sites/_components/SiteCharts";
import { formatNumber, toCsv } from "../../sites/_components/siteFormat";

export type Leagues = NonNullable<FunctionReturnType<typeof api.insightsReads.insightsLeagues>>;
export type LeagueData = Leagues["leagues"][number];

/** A league's row as people read it: a website by its short name, a Business Profile by its own. */
export function leagueName(league: LeagueData, row: LeagueData["rows"][number]): string {
  return league.id === "reviews" ? row.name : shortName(row.name);
}

/**
 * One league as a chart (insights-analyst-plan.md §5, drawn on the
 * Leaderboards board): each website a bar, first at the top, you in orange
 * — Sites' own bar chart, never a copy — with the way to the league's page.
 */
export function LeagueCard({ league, host, href, title }: { league: LeagueData; host: string; href?: string; title?: string }) {
  const t = usePlatformTranslations("insights.leagues");
  const tPlace = usePlatformTranslations("insights.place");
  const data = league.rows.map((row) => ({
    label: `${row.place}  ${row.you ? t("you") : leagueName(league, row)}`,
    value: row.value,
    you: row.you,
  }));
  const csv = () => toCsv(
    [t("place"), t("website"), t(`${league.id}.figure`)],
    league.rows.map((row) => [row.place, leagueName(league, row), row.value]),
  );
  return (
    <ChartCard title={title ?? t("cardTitle", { league: t(`${league.id}.title`) })} hint={t(`${league.id}.hint`)} exportName={`${host}-${league.id}-league`} csv={csv}>
      <div className="flex flex-col gap-4">
        <SiteBarChart
          data={data}
          series={[{ key: "value", name: t(`${league.id}.figure`), colour: CHART_SERIES_SLATE }]}
          horizontal
          highlight={{ colour: CHART_SERIES_ORANGE, rows: (row) => row.you === true }}
          formatValue={(value) => formatNumber(value)}
        />
        {href ? (
          <Link href={href} className="inline-flex items-center gap-1 self-start text-[12.5px] text-secondary hover:text-info">
            {t("seeLeague")}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      <span className="sr-only">{league.place ? tPlace("ofTotal", { place: league.place, total: league.rows.length }) : ""}</span>
    </ChartCard>
  );
}

/** Where you rank in every league, first to last: each league a bar as long as the places you're ahead of last. */
export function RankStrip({ leagues, host, title, hint }: { leagues: Leagues["leagues"]; host: string; title?: string; hint?: string }) {
  const t = usePlatformTranslations("insights.leagues");
  const tPlace = usePlatformTranslations("insights.place");
  const tMenu = usePlatformTranslations("insights.menu.pages");
  const ranked = leagues.filter((league) => league.place !== null);
  const data = ranked.map((league) => ({
    label: tMenu(league.id),
    value: league.rows.length - (league.place ?? league.rows.length) + 1,
    place: league.place ?? 0,
    total: league.rows.length,
  }));
  const csv = () => toCsv([t("league"), t("place"), t("of")], ranked.map((league) => [tMenu(league.id), league.place, league.rows.length]));
  return (
    <ChartCard title={title ?? t("everyLeague.title")} hint={hint ?? t("everyLeague.hint")} exportName={`${host}-every-league`} csv={csv}>
      <SiteBarChart
        data={data}
        series={[{ key: "value", name: t("everyLeague.figure"), colour: CHART_SERIES_ORANGE }]}
        horizontal
        formatValue={(_value, entry) => {
          const row = (entry as { payload?: { place?: number; total?: number } }).payload;
          return row?.place ? tPlace("ofTotal", { place: row.place, total: row.total ?? 0 }) : "";
        }}
        formatScale={() => ""}
      />
    </ChartCard>
  );
}
