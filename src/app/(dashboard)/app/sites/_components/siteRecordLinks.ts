"use client";

import { useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SITE_PAGES, isSiteMenuPath, sitePageForPath, type SitePage } from "./sitePages";
import { useSiteId } from "./useSite";
import { sharedSiteQuery } from "./useSiteParam";

/**
 * Where a click on a Sites table opens: a record's own screen, never a modal.
 *
 * Anthony, 2026-09-24: "I don't want any modals that are clickable from the
 * tables or anywhere in this section. These are all new screens with a back
 * button" (docs/plans/active/sites-ux-updates-plan.md §3). Each record has its
 * own address, under the menu page it belongs to, naming what it shows — so it
 * can be bookmarked, shared or opened in a new tab.
 *
 * **The way back travels with the link.** Every link to a record carries the
 * address it was clicked from (`back`): the page, its filters, its search and
 * its table page, all of which live in the address. Back on the record's
 * screen returns there exactly as it was left. A record opened from a bookmark
 * has no `back`, and returns to the page it belongs to.
 */

/** A record a Sites screen can open, by the key that finds it. */
export type SiteRecord =
  | { kind: "keyword"; keyword: string }
  | { kind: "page"; page: string }
  | { kind: "feature"; feature: string }
  | { kind: "answer"; answerId: string }
  | { kind: "rival"; rivalId: string }
  | { kind: "domain"; domain: string }
  | { kind: "anchor"; anchor: string }
  | { kind: "problem"; check: string };

type RecordAddress = { segment: string; key: string; parent: SitePage["id"] };

/** Each record's screen: its path under the site, the address key holding its identity, and the menu page it belongs to. */
const RECORDS: Record<SiteRecord["kind"], RecordAddress> = {
  keyword: { segment: "keywords/keyword", key: "keyword", parent: "keywordsAll" },
  page: { segment: "keywords/pages/page", key: "path", parent: "keywordsPages" },
  feature: { segment: "google/features/feature", key: "feature", parent: "googleFeatures" },
  answer: { segment: "ai/answers/answer", key: "answer", parent: "aiAnswers" },
  rival: { segment: "competitors/rival", key: "rival", parent: "competitorsSideBySide" },
  domain: { segment: "backlinks/domains/domain", key: "domain", parent: "backlinksDomains" },
  anchor: { segment: "backlinks/anchors/anchor", key: "anchor", parent: "backlinksAnchors" },
  problem: { segment: "audit/problem", key: "check", parent: "siteAudit" },
};

/** The address key holding the way back. */
export const BACK_KEY = "back";

/**
 * How long a way back may be. A record opened from a record carries that
 * record's own way back inside its own, so a long chain doubles as it grows;
 * past this, the chain is dropped and Back goes to the page it belongs to.
 */
const MAX_BACK_LENGTH = 1_800;

function identityOf(record: SiteRecord): string {
  switch (record.kind) {
    case "keyword":
      return record.keyword;
    case "page":
      return record.page;
    case "feature":
      return record.feature;
    case "answer":
      return record.answerId;
    case "rival":
      return record.rivalId;
    case "domain":
      return record.domain;
    case "anchor":
      return record.anchor;
    case "problem":
      return record.check;
  }
}

/** The menu page a kind of record belongs to. */
export function recordParent(kind: SiteRecord["kind"]): SitePage {
  const parent = RECORDS[kind].parent;
  return SITE_PAGES.find((page) => page.id === parent) ?? SITE_PAGES[0];
}

/** A record's identity, read from the address of its own screen; empty when missing. */
export function useRecordKey(kind: SiteRecord["kind"]): string {
  const params = useSearchParams();
  return params.get(RECORDS[kind].key) ?? "";
}

/**
 * Links to records, from the page being read: the dates travel, and this
 * page — its filters, its search and its table page — is the way back. A
 * record of another of the company's sites — a competitor's ranking for the
 * same search — opens under that site (`onSiteId`), still with the way back
 * to here.
 */
export function useSiteRecordHref(siteId: string): (record: SiteRecord, onSiteId?: string) => string {
  const pathname = usePathname();
  const params = useSearchParams();
  return useCallback((record: SiteRecord, onSiteId?: string) => {
    const address = RECORDS[record.kind];
    const query = new URLSearchParams(sharedSiteQuery(params).replace(/^\?/, ""));
    query.set(address.key, identityOf(record));
    const current = params.toString();
    const here = `${pathname}${current ? `?${current}` : ""}`;
    if (here.length <= MAX_BACK_LENGTH) query.set(BACK_KEY, here);
    return `/app/sites/${onSiteId ?? siteId}/${address.segment}?${query.toString()}`;
  }, [pathname, params, siteId]);
}

/** Whether an address is one of this site's own pages: what the menu keeps lit. */
export function isThisSitesAddress(address: string, siteId: string): boolean {
  const base = `/app/sites/${siteId}`;
  return address === base || address.startsWith(`${base}/`) || address.startsWith(`${base}?`);
}

/**
 * Whether an address is a Sites page at all: the only kind of way back that
 * is followed, so a link cannot send anybody off the app. Which site it is
 * does not matter — each site checks its own reader — and a competitor's
 * record opened from this site's comes back here.
 */
function isSitesAddress(address: string): boolean {
  return address.startsWith("/app/sites/") && !address.startsWith("//");
}

/**
 * Where Back leads from a record's screen: the address it was opened from,
 * when that is a Sites page, or else the page the record belongs to, with the
 * dates.
 */
export function useSiteBackHref(siteId: string, kind: SiteRecord["kind"]): string {
  const params = useSearchParams();
  const back = params.get(BACK_KEY);
  if (back && isSitesAddress(back)) return back;
  const parent = recordParent(kind);
  return `/app/sites/${siteId}${parent.segment ? `/${parent.segment}` : ""}${sharedSiteQuery(params)}`;
}

/**
 * The back row of a record's screen, for its `DetailHeader` (the record-level
 * header, docs/developer/screen-kit.md "Headers"): where Back leads
 * (`useSiteBackHref`), and what it says. It names the page it leads to when
 * that is one of the menu's pages — "Back to All keywords" — and from one
 * record to another just says "Back", since a record is not a page with a name.
 */
export function useRecordBack(kind: SiteRecord["kind"]): { label: string; href: string } {
  const siteId = useSiteId();
  const href = useSiteBackHref(siteId, kind);
  const label = useBackLabel()(href);
  return { label, href };
}

/** What a back row says for where it leads: "Back to All keywords" for a menu page of any site, "Back" for a record. */
function useBackLabel(): (href: string) => string {
  const t = useTranslations("sites.record");
  const tm = useTranslations("sites.menu.pages");
  const siteId = useSiteId();
  return (href) => {
    const path = href.split("?")[0];
    const onSite = path.match(/^\/app\/sites\/([^/?]+)/)?.[1] ?? siteId;
    return isSiteMenuPath(path, onSite) ? t("backTo", { page: tm(sitePageForPath(path, onSite).id) }) : t("back");
  };
}

/**
 * The back row of one of the menu's own pages, when it was opened from a link
 * on another page — a figure that opens the records behind it, a band that
 * opens its keywords — and null when it was opened from the menu, where the
 * menu itself is the way around.
 */
export function useListBack(): { label: string; href: string } | null {
  const params = useSearchParams();
  const label = useBackLabel();
  const back = params.get(BACK_KEY);
  return back && isSitesAddress(back) ? { label: label(back), href: back } : null;
}

/**
 * Links from here to one of the menu's own pages, narrowed by its filters —
 * a band's keywords, a folder's pages — with the dates and the way back to
 * here, like a link to a record.
 */
export function useSiteListHref(siteId: string): (segment: string, filters?: Record<string, string>, onSiteId?: string) => string {
  const pathname = usePathname();
  const params = useSearchParams();
  return useCallback((segment: string, filters: Record<string, string> = {}, onSiteId?: string) => {
    const query = new URLSearchParams(sharedSiteQuery(params).replace(/^\?/, ""));
    for (const [key, value] of Object.entries(filters)) query.set(key, value);
    const current = params.toString();
    const here = `${pathname}${current ? `?${current}` : ""}`;
    if (here.length <= MAX_BACK_LENGTH) query.set(BACK_KEY, here);
    return `/app/sites/${onSiteId ?? siteId}${segment ? `/${segment}` : ""}?${query.toString()}`;
  }, [pathname, params, siteId]);
}
