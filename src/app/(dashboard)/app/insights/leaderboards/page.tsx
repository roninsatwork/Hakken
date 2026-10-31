"use client";

import { useMemo } from "react";
import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { Trophy } from "lucide-react";
import { HakkenSees } from "@/src/ui/components/screens/HakkenSees";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { ChangeLine } from "@/src/ui/components/screens/Change";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { MAIN_LEAGUES } from "@/convex/utils/insightLeagues";
import { LeagueCard, leagueName, type LeagueData } from "../_components/LeagueCard";
import { useInsightsBox, useInsightsHref, useInsightsLeagues, useInsightsSite } from "../_components/useInsights";
import { boxedSays } from "../_components/insightBoxSays";
import { formatNumber } from "../../sites/_components/siteFormat";

/**
 * Leaderboards (docs/plans/active/insights-analyst-plan.md §5, I8; drawn as
 * the Leagues board): where the website ranks against its rivals, the four
 * main leagues from Anthony's reference first — domain authority, organic
 * traffic, AI mindshare, share of voice — then every other measure Hakken
 * reads, each a graph of every website with its figure on its bar. Each
 * opens its own page.
 */
export default function InsightsLeaderboardsPage() {
  const t = usePlatformTranslations("insights.leaderboards");
  // The box as its specialist wrote it this week (insights-one-voice-plan.md phase 4), else the screen's own sentences.
  const box = useInsightsBox("LEADERBOARDS");
  const tBox = usePlatformTranslations("insights.box");
  const tl = usePlatformTranslations("insights.leagues");
  const tPlace = usePlatformTranslations("insights.place");
  const tMenu = usePlatformTranslations("insights.menu.pages");
  const href = useInsightsHref();
  const data = useInsightsLeagues();
  const site = useInsightsSite();
  // The eye's page figures (sees-every-page-plan-2026-10-31.md): one object while its answers stay the same, so it is not handed over again on every render.
  const seesData = useMemo(() => ({ leagues: data, box }), [data, box]);

  const header = <PageHeader icon={<Trophy className="h-5 w-5 text-brand" />} title={t("title")} description={data ? t("description", { rivals: data.rivals }) : t("descriptionLoading")} />;
  if (data === undefined) return <>{header}<div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" /></>;
  if (data === null || data.leagues.length === 0) {
    return <>{header}<HakkenEmptyState icon={Trophy} title={t("emptyTitle")} description={t("emptyDescription")} /></>;
  }

  const leagues = data.leagues;
  const placed = leagues.filter((league) => league.place !== null);
  const led = placed.filter((league) => league.place === 1);
  const best = Math.min(...placed.map((league) => league.place ?? 99));
  const worst = Math.max(...placed.map((league) => league.place ?? 0));
  const bestLeagues = placed.filter((league) => league.place === best);
  const worstLeagues = placed.filter((league) => league.place === worst);
  const climbing = placed
    .filter((league) => league.placeBefore !== null && league.place !== null && league.placeBefore > league.place)
    .sort((a, b) => ((b.placeBefore ?? 0) - (b.place ?? 0)) - ((a.placeBefore ?? 0) - (a.place ?? 0)))[0] ?? null;
  const names = (list: LeagueData[]) => list.map((league) => tl(`${league.id}.short`)).join(t("and"));
  const main = MAIN_LEAGUES.map((id) => leagues.find((league) => league.id === id)).filter((league): league is LeagueData => Boolean(league));
  const others = leagues.filter((league) => !league.main);
  const ord = (place: number | null) => (place ? tPlace("ordinal", { place }) : "–");

  // What Hakken sees: your places in the four main leagues, the leagues you lead, and the place to climb first.
  const weakestMain = [...main].filter((league) => league.place !== null && league.gapAbove !== null).sort((a, b) => (b.place ?? 0) - (a.place ?? 0))[0] ?? null;
  const above = weakestMain && weakestMain.place ? weakestMain.rows[weakestMain.place - 2] : null;
  const says = [
    t("sees.main", {
      places: main.map((league) => t("sees.placeIn", { place: ord(league.place), league: tl(`${league.id}.short`) })).join(t("and")),
    }),
    led.length > 0 ? t("sees.lead", { count: led.length, leagues: names(led) }) : t("sees.leadNone"),
  ];
  const steps = weakestMain && above
    ? [{ words: t("sees.climb", { league: tl(`${weakestMain.id}.short`), gap: formatNumber(weakestMain.gapAbove ?? 0), above: leagueName(weakestMain, above) }), link: tl("seeLeague"), href: href(`leaderboards/${weakestMain.id}`) }]
    : [];

  return (
    <>
      {header}
      <HakkenSees says={boxedSays(box, says, tBox)} steps={steps} page={{ screen: "insights.leaderboards", siteId: site, data: seesData }} />
      <FigureRow>
        <Figure label={t("figures.lead")} value={t("figures.leadValue", { count: led.length, total: leagues.length })} detail={<span className="text-secondary">{led.length > 0 ? names(led) : t("figures.leadNone")}</span>} />
        <Figure label={t("figures.best")} value={ord(best)} detail={<span className="text-secondary">{names(bestLeagues)}</span>} />
        <Figure
          label={t("figures.climbing")}
          value={climbing ? tMenu(climbing.id) : "–"}
          detail={climbing ? <ChangeLine by={1}>{t("figures.climbed", { count: (climbing.placeBefore ?? 0) - (climbing.place ?? 0) })}</ChangeLine> : <span className="text-secondary">{t("figures.noneClimbing")}</span>}
        />
        <Figure label={t("figures.weakest")} value={ord(worst)} detail={<span className="text-secondary">{names(worstLeagues)}</span>} />
      </FigureRow>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {main.map((league) => <LeagueCard key={league.id} league={league} host={data.host} href={href(`leaderboards/${league.id}`)} />)}
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {others.map((league) => <LeagueCard key={league.id} league={league} host={data.host} href={href(`leaderboards/${league.id}`)} />)}
      </div>
      {data.asOf ? <p className="text-[12px] text-muted">{t("asOf", { day: data.asOf })}</p> : null}
    </>
  );
}
