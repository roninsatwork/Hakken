"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { cn } from "@/src/ui/lib/utils";
import { Button } from "@/src/ui/components/screens/Button";
import { Field } from "@/src/ui/components/screens/Field";
import { Select } from "@/src/ui/components/screens/Select";
import { formatNumber } from "./siteFormat";
import { SITE_PAGES, SITE_PAGE_GROUPS, isSiteMenuPath, setupMet, sitePageForPath, type SitePage, type SitePageGroup } from "./sitePages";
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
  questionsSetUp: boolean;
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
 *
 * **Each group folds away.** Anthony, 2026-09-24: "there are too many options
 * on the screen — can we make each section an accordion please, and they are
 * all closed by default apart from site". Site starts open, and so does the
 * group of the page being read — a menu that hid the page you are on would
 * leave you lost — and a group opened stays open while you move between
 * pages. Typing in "Jump to a page" shows every match, open or not.
 */
export function SiteMenu({ siteId, counts }: { siteId: string; counts: MenuCounts }) {
  const t = useTranslations("sites.menu");
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const [filter, setFilter] = useState("");
  // Only the dates and "compare with" travel: a page's own filters stay on it.
  const query = sharedSiteQuery(params);
  // A record's own screen keeps the page it was opened from lit, so the reader
  // still knows where they are; one opened from a bookmark lights the page it
  // belongs to.
  const back = params.get(BACK_KEY);
  const openedFrom = !isSiteMenuPath(pathname, siteId) && back && isThisSitesAddress(back, siteId) ? back.split("?")[0] : null;
  const current = sitePageForPath(openedFrom ?? pathname, siteId);
  const hrefFor = (page: SitePage) => `/app/sites/${siteId}${page.segment ? `/${page.segment}` : ""}${query}`;

  const [open, setOpen] = useState<ReadonlySet<SitePageGroup>>(() => new Set<SitePageGroup>(["site", current.group]));
  // Arriving on a page in a closed group — from an Overview card, say — opens
  // it, adjusted during render rather than in an effect so the menu never
  // draws a frame with the page hidden.
  const [seenGroup, setSeenGroup] = useState<SitePageGroup>(current.group);
  if (seenGroup !== current.group) {
    setSeenGroup(current.group);
    setOpen((before) => new Set([...before, current.group]));
  }
  const toggle = (group: SitePageGroup) => setOpen((before) => {
    const next = new Set(before);
    if (next.has(group)) next.delete(group);
    else next.add(group);
    return next;
  });

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
          const isOpen = term !== "" || open.has(group);
          const panelId = `site-menu-${group}`;
          // A group with nothing set up says so on its heading, not five times over.
          const groupNotSetUp = pages.every((page) => !setupMet(page, counts));
          return (
            <div key={group} className="flex flex-col gap-0.5">
              <Button
                variant="ghost"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(group)}
                className="flex w-full items-center justify-between rounded-lg px-3 pt-4 pb-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted hover:bg-transparent hover:text-foreground"
              >
                <span className="flex items-center gap-2">
                  {t(`groups.${group}`)}
                  {groupNotSetUp ? <span className="rounded-full border border-border-dim px-1.5 py-px text-[9.5px] tracking-[0.08em] text-muted">{t("notSetUp")}</span> : null}
                </span>
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} aria-hidden="true" />
              </Button>
              {isOpen ? (
                <div id={panelId} className="flex flex-col gap-0.5">
                  {pages.map((page) => {
                    const isCurrent = page.id === current.id;
                    const count = countFor(page);
                    const notSetUp = !groupNotSetUp && !setupMet(page, counts);
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
                        {notSetUp
                          ? <span className="text-[10px] uppercase tracking-wider text-muted">{t("notSetUp")}</span>
                          : count !== null && <span className="text-[11px] tabular-nums text-muted">{count}</span>}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
    </>
  );
}
