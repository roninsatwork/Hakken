"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { SectionMenu } from "../../_components/SectionMenu";
import { formatNumber } from "../../sites/_components/siteFormat";
import { BING_GROUPS, BING_PAGES, pageForPath, useBingHref, useBingStatus } from "./useBing";

/**
 * A website's pages in the Bing Webmaster section, as drawn
 * (bing-webmaster-plan.md §5): Bing's figures, then against Google, then the
 * settings, with "Jump to a page" as Search Console's. Keywords and Pages
 * carry how many Bing showed the website for in its last 90 days.
 */
export function BingMenu({ siteId }: { siteId: string }) {
  const t = useTranslations("bingWebmaster.menu");
  const pathname = usePathname();
  const hrefFor = useBingHref(siteId);
  const counts = useBingStatus()?.counts;
  const countOf = (id: string) => {
    const value = id === "keywords" ? counts?.keywords : id === "pages" ? counts?.pages : null;
    return value === null || value === undefined ? null : formatNumber(value);
  };
  return (
    <SectionMenu
      label={t("label")}
      jump={{ label: t("jumpLabel"), placeholder: t("jumpPlaceholder") }}
      currentId={pageForPath(pathname, siteId)}
      openAtFirst={[...BING_GROUPS]}
      groups={BING_GROUPS.map((group) => ({
        id: group,
        label: t(`groups.${group}`),
        items: BING_PAGES.filter((page) => page.group === group).map((page) => ({
          id: page.id,
          label: t(page.id),
          href: hrefFor(page.segment),
          count: countOf(page.id),
        })),
      }))}
    />
  );
}
