"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { Change } from "@/src/ui/components/screens/Change";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { CHART_SERIES_ORANGE, CHART_SERIES_SLATE } from "@/src/ui/components/charts/chartPalette";
import { cn } from "@/src/ui/lib/utils";
import { toCsv } from "../../sites/_components/siteFormat";
import type { Leagues } from "./LeagueCard";

/** The dots as drawn on the approved board: a column 70px wide, yours 18px, the rivals' 10px. */
const DOT = { column: "w-[70px]", you: 18, rival: 10 } as const;

/**
 * Places in a league as dots, first to last, left to right: yours larger and
 * in the charts' orange, the rivals' grey (the Executive summary, approved
 * 12 Oct 2026; the charts' own colours, not the theme's brand, which is near
 * white in the dark look).
 */
function PlaceDots({ place, total }: { place: number; total: number }) {
  const look = DOT;
  return (
    <span className="flex items-center" aria-hidden="true">
      {Array.from({ length: total }, (_, index) => {
        const you = index + 1 === place;
        const across = you ? look.you : look.rival;
        return (
          <span key={index} className={cn("flex justify-center", look.column)}>
            <span className="rounded-full" style={{ width: across, height: across, background: you ? CHART_SERIES_ORANGE : CHART_SERIES_SLATE }} />
          </span>
        );
      })}
    </span>
  );
}

/** The columns as drawn: each league's name, then its dots, then your place, side by side from the left. */
const RANK_ROW = "grid grid-cols-[minmax(0,18rem)_auto_auto] items-center justify-start gap-x-6";

/**
 * Where you rank against your rivals in every league (insights-analyst-plan.md
 * §5, drawn on the Main board): a row a league, its places as dots, yours in
 * orange, then your place in words and how far it moved in a year. Each row
 * opens its league. Nothing waits on a hover.
 */
export function RankDots({ leagues, rivals, href }: { leagues: Leagues["leagues"]; rivals: number; href: (segment: string) => string }) {
  const t = usePlatformTranslations("insights.summary.rank");
  const tPlace = usePlatformTranslations("insights.place");
  const tMenu = usePlatformTranslations("insights.menu.pages");
  const placed = leagues.filter((league) => league.place !== null);
  const total = Math.max(0, ...placed.map((league) => league.rows.length));
  const csv = () => toCsv([t("league"), t("place"), t("of")], placed.map((league) => [tMenu(league.id), league.place, league.rows.length]));
  return (
    <ChartCard title={t("title", { rivals })} hint={t("hint")} exportName="insights-where-you-rank" csv={csv} enoughData={placed.length > 0}>
      <div className="flex flex-col">
        <div className={cn(RANK_ROW, "px-2 pb-1")}>
          <span />
          <span className="flex">
            {Array.from({ length: total }, (_, index) => (
              <span key={index} className="w-[70px] text-center text-[11px] text-muted">{tPlace("ordinal", { place: index + 1 })}</span>
            ))}
          </span>
          <span />
        </div>
        {placed.map((league) => {
          const moved = league.placeBefore !== null && league.place !== null ? league.placeBefore - league.place : 0;
          return (
            <Link
              key={league.id}
              href={href(`leaderboards/${league.id}`)}
              className={cn(RANK_ROW, "rounded-[10px] px-2 py-2 hover:bg-hover/50")}
            >
              <span className="truncate text-[13px] text-secondary">{tMenu(league.id)}</span>
              <PlaceDots place={league.place ?? 0} total={total} />
              <span className="flex items-center gap-2 whitespace-nowrap">
                <span className="text-[13px] font-medium text-foreground">{tPlace("ofTotal", { place: league.place ?? 0, total: league.rows.length })}</span>
                {moved !== 0 ? <Change by={moved} arrow={moved > 0 ? "up" : "down"} /> : null}
              </span>
            </Link>
          );
        })}
        <Link href={href("leaderboards")} className="mt-2 inline-flex items-center gap-1 self-start px-2 text-[12.5px] text-secondary hover:text-info">
          {t("seeAll")}
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </ChartCard>
  );
}
