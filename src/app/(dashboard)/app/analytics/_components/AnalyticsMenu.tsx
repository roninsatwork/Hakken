"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { SectionMenu } from "../../_components/SectionMenu";
import { ANALYTICS_GROUPS, ANALYTICS_PAGES, pageForPath, useAnalyticsHref } from "./useAnalytics";

/**
 * A website's pages in the Google Analytics section, as drawn (§11): the
 * figures, then the settings. A short menu, so no jump box; page names only,
 * never a mark or a label. A landing page's own screen keeps Landing pages
 * lit, a channel's sources Channels.
 */
export function AnalyticsMenu({ siteId }: { siteId: string }) {
  const t = useTranslations("googleAnalytics.menu");
  const pathname = usePathname();
  const hrefFor = useAnalyticsHref(siteId);
  return (
    <SectionMenu
      label={t("label")}
      currentId={pageForPath(pathname, siteId)}
      openAtFirst={[...ANALYTICS_GROUPS]}
      groups={ANALYTICS_GROUPS.map((group) => ({
        id: group,
        label: t(`groups.${group}`),
        items: ANALYTICS_PAGES.filter((page) => page.group === group).map((page) => ({
          id: page.id,
          label: t(page.id),
          href: hrefFor(page.segment),
          count: null,
        })),
      }))}
    />
  );
}
