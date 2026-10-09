"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SectionMenu } from "../../_components/SectionMenu";
import { formatNumber } from "./siteFormat";
import { SITE_PAGES, SITE_PAGE_GROUPS, isSiteMenuPath, sitePageForPath, type SitePage } from "./sitePages";
import { BACK_KEY, isThisSitesAddress } from "./siteRecordLinks";
import { sharedSiteQuery } from "./useSiteParam";

export type MenuCounts = {
  keywords: number | null;
  pages: number | null;
  top3: number | null;
  referringDomains: number | null;
  brokenBacklinks: number | null;
  aiNamed: number | null;
  aiAsked: number | null;
  trackedSearches: number;
  trackedFanOut: number;
  rankedUp: number | null;
  rankedDown: number | null;
  suggestions: number;
  citedPages: number;
  /** Every page of the company's own website once; null on a competitor, or before the list is built. */
  yourPages: number | null;
  /** Discovery's Local pages (`localSummaries`): absent from a deployment older than them. */
  localMapSearches?: number;
  localMarket?: number;
  localRivalPosts?: number;
  localListings?: number;
  localReviews?: number;
};

/**
 * The side menu (D4, D5): Overview and Site audit, then one group per kind of
 * data collected, each page with its key number beside it so the headline is
 * visible without opening anything. A page not built yet is listed, greyed,
 * and says so, so the menu is one shape from the first day. The current range
 * travels on every link. How it looks — "Jump to a page", the groups that
 * fold away (Anthony, 2026-09-24: "all closed by default apart from site"),
 * the drop-down on a phone — is `SectionMenu`, shared with Learn.
 */
export function SiteMenu({ siteId, counts }: { siteId: string; counts: MenuCounts }) {
  const t = useTranslations("sites.menu");
  const pathname = usePathname();
  const params = useSearchParams();
  // Only the dates and "compare with" travel: a page's own filters stay on it.
  const query = sharedSiteQuery(params);
  // A record's own screen keeps the page it was opened from lit, so the reader
  // still knows where they are; one opened from a bookmark lights the page it
  // belongs to.
  const back = params.get(BACK_KEY);
  const openedFrom = !isSiteMenuPath(pathname, siteId) && back && isThisSitesAddress(back, siteId) ? back.split("?")[0] : null;
  const current = sitePageForPath(openedFrom ?? pathname, siteId);
  const hrefFor = (page: SitePage) => `/app/sites/${siteId}${page.segment ? `/${page.segment}` : ""}${query}`;

  const countFor = (page: SitePage): string | null => {
    switch (page.count) {
      case "aiNamed":
        return counts.aiNamed === null || counts.aiAsked === null ? null : `${counts.aiNamed}/${counts.aiAsked}`;
      // Text in the menu's count, not a cell: the kit's `Change` draws a cell (frozen in the screen kit's `recipes` list).
      case "moves":
        return counts.rankedUp === null && counts.rankedDown === null
          ? null
          : `▲${counts.rankedUp ?? 0} ▼${counts.rankedDown ?? 0}`;
      case undefined:
        return null;
      default: {
        // Missing as well as null: a count the server does not send yet (a page newer than the deployment) shows nothing, never a dash.
        const value = counts[page.count] as number | null | undefined;
        return value === null || value === undefined || value === 0 ? null : formatNumber(value);
      }
    }
  };

  return (
    <SectionMenu
      label={t("label")}
      jump={{ label: t("jumpLabel"), placeholder: t("jumpPlaceholder") }}
      currentId={current.id}
      openAtFirst={["site"]}
      groups={SITE_PAGE_GROUPS.map((group) => ({
        id: group,
        label: t(`groups.${group}`),
        items: SITE_PAGES.filter((page) => page.group === group).map((page) => ({
          id: page.id,
          label: t(`pages.${page.id}`),
          href: page.built ? hrefFor(page) : null,
          count: countFor(page),
          note: t("comingSoon"),
        })),
      }))}
    />
  );
}
