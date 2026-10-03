"use client";

import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { SectionMenu } from "../../_components/SectionMenu";
import { formatNumber } from "../../sites/_components/siteFormat";
import { SEARCH_CONSOLE_GROUPS, SEARCH_CONSOLE_PAGES, pageForPath, useSearchConsoleHref, type SearchConsolePageId } from "./useSearchConsole";

/**
 * A website's pages in the Search Console section, grouped as drawn
 * (search-console-plan.md §13.1): what the company tracks first, then
 * Google's own figures, Changes, Opportunities, Breakdowns and Settings. The
 * menu is the Sites one (`SectionMenu`) — "Jump to a page", each group
 * folding away — and opens as Sites does: Tracked, Google's figures and the
 * page's own group, the rest closed. Page names only, never a mark or a
 * label (Anthony, 2026-09-25) — but Tracked keywords and Tracked pages carry
 * how many are tracked beside them, as drawn (2026-10-03), read as each tick
 * changes. A keyword's or a page's own screen keeps the list it belongs to
 * lit; on a phone the menu is one drop-down.
 */
export function SearchConsoleMenu({ siteId }: { siteId: string }) {
  const t = useTranslations("searchConsole.menu");
  const pathname = usePathname();
  const hrefFor = useSearchConsoleHref(siteId);
  const tracking = useQuery(api.searchConsoleTracking.searchConsoleTracking, { siteId: siteId as Id<"companyWebsites"> });
  const counts: Partial<Record<SearchConsolePageId, number>> = tracking
    ? { trackedKeywords: tracking.keywords.count, trackedPages: tracking.pages.count }
    : {};
  return (
    <SectionMenu
      label={t("label")}
      jump={{ label: t("jumpLabel"), placeholder: t("jumpPlaceholder") }}
      currentId={pageForPath(pathname, siteId)}
      // As Sites: the first groups open, and the group of the page being read; the rest fold away (Anthony, 2026-10-03: "most are closed when you go to the page so it's no overwhelm").
      openAtFirst={["tracked", "figures"]}
      groups={SEARCH_CONSOLE_GROUPS.map((group) => ({
        id: group,
        label: t(`groups.${group}`),
        items: SEARCH_CONSOLE_PAGES.filter((page) => page.group === group).map((page) => {
          const count = counts[page.id];
          return {
            id: page.id,
            label: t(page.id),
            href: hrefFor(page.segment),
            count: count === undefined ? null : formatNumber(count),
          };
        }),
      }))}
    />
  );
}
