"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { SectionMenu } from "../../_components/SectionMenu";
import { SEARCH_CONSOLE_GROUPS, SEARCH_CONSOLE_PAGES, pageForPath, useSearchConsoleHref } from "./useSearchConsole";

/**
 * A website's pages in the Search Console section, grouped as drawn
 * (search-console-plan.md §13.1): Google's own figures, then Changes,
 * Opportunities, Breakdowns and Settings. The menu is the Sites one
 * (`SectionMenu`) — "Jump to a page", each group folding away — and opens
 * as Sites does: Google's figures and the page's own group, the rest closed.
 * Page names only, never a mark or a label (Anthony, 2026-09-25). A
 * keyword's or a page's own screen keeps the list it belongs to lit; on a
 * phone the menu is one drop-down.
 */
export function SearchConsoleMenu({ siteId }: { siteId: string }) {
  const t = useTranslations("searchConsole.menu");
  const pathname = usePathname();
  const hrefFor = useSearchConsoleHref(siteId);
  return (
    <SectionMenu
      label={t("label")}
      jump={{ label: t("jumpLabel"), placeholder: t("jumpPlaceholder") }}
      currentId={pageForPath(pathname, siteId)}
      // As Sites: the first group open, and the group of the page being read; the rest fold away (Anthony, 2026-10-03: "most are closed when you go to the page so it's no overwhelm").
      openAtFirst={["figures"]}
      groups={SEARCH_CONSOLE_GROUPS.map((group) => ({
        id: group,
        label: t(`groups.${group}`),
        items: SEARCH_CONSOLE_PAGES.filter((page) => page.group === group).map((page) => ({
          id: page.id,
          label: t(page.id),
          href: hrefFor(page.segment),
        })),
      }))}
    />
  );
}
