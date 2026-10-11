"use client";

import { useTranslations } from "next-intl";
import { SectionMenu, type SectionMenuGroup } from "../../_components/SectionMenu";
import { INSIGHTS_GROUPS, INSIGHTS_PAGES, isLeague, pageForPath, useInsightsHome, useInsightsHref, useInsightsLeagues, useInsightsPath } from "./useInsights";

/**
 * Insights' side menu (insights-analyst-plan.md §4.1, drawn as every
 * Insights board's left column): the shared section menu, each league with
 * your place beside it, This week and All findings with their counts, and
 * the pages still to be built greyed until their phase lands.
 */
export function InsightsMenu() {
  const t = useTranslations("insights.menu");
  const tPlace = useTranslations("insights.place");
  const href = useInsightsHref();
  const current = pageForPath(useInsightsPath());
  const home = useInsightsHome();
  const leagues = useInsightsLeagues();
  const placeOf = (id: string) => {
    const league = leagues?.leagues.find((entry) => entry.id === id);
    return league?.place ? tPlace("ordinal", { place: league.place }) : null;
  };
  const countOf = (id: string): string | null => {
    if (isLeague(id)) return placeOf(id);
    if (id === "week" && home?.thisWeek) return String(home.thisWeek);
    if (id === "findings" && home?.findings) return String(home.findings);
    return null;
  };
  const groups: SectionMenuGroup[] = INSIGHTS_GROUPS.map((group) => ({
    id: group,
    label: t(`groups.${group}`),
    items: INSIGHTS_PAGES.filter((page) => page.group === group).map((page) => ({
      id: page.id,
      label: t(`pages.${page.id}`),
      href: page.built ? href(page.segment) : null,
      count: page.built ? countOf(page.id) : null,
      ...(page.built ? {} : { note: t("soon") }),
    })),
  }));
  return <SectionMenu label={t("label")} groups={groups} currentId={current ?? "leagues"} openAtFirst={["overview", "leaderboards"]} />;
}
