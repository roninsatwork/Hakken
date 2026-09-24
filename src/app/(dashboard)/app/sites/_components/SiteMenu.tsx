"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/src/ui/lib/utils";
import { Field } from "@/src/ui/components/screens/Field";
import { Select } from "@/src/ui/components/screens/Select";
import { formatNumber } from "./siteFormat";
import { SITE_PAGES, SITE_PAGE_GROUPS, sitePageForPath, type SitePage } from "./sitePages";
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
  rankedUp: number | null;
  rankedDown: number | null;
  suggestions: number;
  citedPages: number;
};

/**
 * The side menu (D4, D5): Overview and Calendar, then one group per kind of
 * data collected, each page with its key number beside it so the headline is
 * visible without opening anything. A page not built yet is listed, greyed,
 * and says so, so the menu is one shape from the first day. "Jump to a page"
 * finds any page by typing; on a phone the whole menu is one drop-down. The
 * current range travels on every link.
 */
export function SiteMenu({ siteId, counts }: { siteId: string; counts: MenuCounts }) {
  const t = useTranslations("sites.menu");
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const [filter, setFilter] = useState("");
  // Only the dates and "compare with" travel: a page's own filters stay on it.
  const query = sharedSiteQuery(params);
  const current = sitePageForPath(pathname, siteId);
  const hrefFor = (page: SitePage) => `/app/sites/${siteId}${page.segment ? `/${page.segment}` : ""}${query}`;

  const countFor = (page: SitePage): string | null => {
    switch (page.count) {
      case "aiNamed":
        return counts.aiNamed === null || counts.aiAsked === null ? null : `${counts.aiNamed}/${counts.aiAsked}`;
      case "moves":
        return counts.rankedUp === null && counts.rankedDown === null
          ? null
          : `▲${counts.rankedUp ?? 0} ▼${counts.rankedDown ?? 0}`;
      case undefined:
        return null;
      default: {
        const value = counts[page.count];
        return value === null || value === 0 ? null : formatNumber(value);
      }
    }
  };

  const term = filter.trim().toLowerCase();
  const matches = (page: SitePage) =>
    !term || `${t(`groups.${page.group}`)} ${t(`pages.${page.id}`)}`.toLowerCase().includes(term);

  return (
    <>
      <div className="lg:hidden">
        <Select
          aria-label={t("label")}
          value={current.id}
          onChange={(id) => {
            const page = SITE_PAGES.find((entry) => entry.id === id);
            if (page?.built) router.push(hrefFor(page));
          }}
        >
          {SITE_PAGE_GROUPS.map((group) => (
            <optgroup key={group} label={t(`groups.${group}`)}>
              {SITE_PAGES.filter((page) => page.group === group).map((page) => (
                <option key={page.id} value={page.id} disabled={!page.built}>
                  {t(`pages.${page.id}`)}{page.built ? "" : ` · ${t("comingSoon")}`}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </div>

      <nav aria-label={t("label")} className="hidden flex-col gap-1 text-[13px] lg:flex">
        <Field
          label={t("jumpLabel")}
          labelHidden
          placeholder={t("jumpPlaceholder")}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        {SITE_PAGE_GROUPS.map((group) => {
          const pages = SITE_PAGES.filter((page) => page.group === group && matches(page));
          if (pages.length === 0) return null;
          return (
            <div key={group} className="flex flex-col gap-0.5">
              <div className="px-3 pt-4 pb-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
                {t(`groups.${group}`)}
              </div>
              {pages.map((page) => {
                const isCurrent = page.id === current.id;
                const count = countFor(page);
                const label = t(`pages.${page.id}`);
                if (!page.built) {
                  return (
                    <span
                      key={page.id}
                      aria-disabled="true"
                      className="flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-muted/70"
                    >
                      <span>{label}</span>
                      <span className="text-[10px] uppercase tracking-wider">{t("comingSoon")}</span>
                    </span>
                  );
                }
                return (
                  <Link
                    key={page.id}
                    href={hrefFor(page)}
                    aria-current={isCurrent ? "page" : undefined}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 transition-colors",
                      isCurrent
                        ? "bg-hover text-foreground shadow-[inset_2px_0_0_var(--brand)]"
                        : "text-secondary hover:bg-hover hover:text-foreground",
                    )}
                  >
                    <span>{label}</span>
                    {count !== null && <span className="text-[11px] tabular-nums text-muted">{count}</span>}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
    </>
  );
}
