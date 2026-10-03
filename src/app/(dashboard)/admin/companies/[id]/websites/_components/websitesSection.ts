import {
  CalendarClock,
  Gauge,
  Globe,
  IdCard,
  LineChart,
  ListChecks,
  MapPin,
  MessageSquare,
  MessageSquareQuote,
  Receipt,
  Search,
  Sparkles,
  Swords,
  type LucideIcon,
} from "lucide-react";

/**
 * The company's Websites section as one menu (docs/plans/active/
 * websites-section-menu-plan.md): every page, the group it sits in, and where
 * it lives for **All websites** and for **one website** — so the menu, the
 * website chooser and every link agree on one map.
 *
 * A website's pages keep their addresses (`…/websites/site/<id>/…`) and the
 * company's keep theirs, so nothing that links in breaks; which one a menu
 * item opens is the website chosen. A page a website does not have — a
 * competitor has no lists of its own — is not offered for it.
 */

export type SectionPageId =
  | "websites"
  | "searches"
  | "questions"
  | "competitors"
  | "names"
  | "market"
  | "todo"
  | "rankings"
  | "answers"
  | "fanOut"
  | "schedules"
  | "limits"
  | "runs";

export type SectionGroup = "websites" | "track" | "results" | "collection";

export type Relationship = "OWNED" | "TRACKED";

type SectionPage = {
  id: SectionPageId;
  group: SectionGroup;
  icon: LucideIcon;
  /** Where it lives for All websites, under `…/websites`; "" is the list itself. */
  all: string;
  /** Where it lives for one website, under `…/websites/site/<id>`; null when it is the company's alone. */
  site: string | null;
  /** Which websites have it: a competitor is compared on its pair's lists and has none of its own. */
  owners: "OWNED" | "ANY";
};

export const SECTION_GROUPS: readonly SectionGroup[] = ["websites", "track", "results", "collection"];

export const SECTION_PAGES: readonly SectionPage[] = [
  { id: "websites", group: "websites", icon: Globe, all: "", site: null, owners: "ANY" },
  { id: "searches", group: "track", icon: Search, all: "ai-searches/searches", site: "searches", owners: "OWNED" },
  { id: "questions", group: "track", icon: MessageSquare, all: "ai-searches", site: "questions", owners: "OWNED" },
  { id: "competitors", group: "track", icon: Swords, all: "competitors", site: "competitors", owners: "OWNED" },
  { id: "names", group: "track", icon: IdCard, all: "names", site: "profile", owners: "ANY" },
  // Where a website trades and where it is watched from, inputs only (search-console-plan.md
  // §16; Anthony, 2026-10-03). A competitor has no countries, but is still watched from somewhere.
  { id: "market", group: "track", icon: MapPin, all: "market", site: "market", owners: "ANY" },
  { id: "todo", group: "results", icon: ListChecks, all: "todo", site: "", owners: "OWNED" },
  { id: "rankings", group: "results", icon: LineChart, all: "rankings", site: "keywords", owners: "ANY" },
  { id: "answers", group: "results", icon: MessageSquareQuote, all: "answers", site: "citations", owners: "OWNED" },
  { id: "fanOut", group: "results", icon: Sparkles, all: "ai-searches/fan-out", site: "fan-out", owners: "OWNED" },
  // Schedule and limits until 2026-09-28, then two screens (Anthony: "This
  // should be two screens / Schedules / Limits"); the old addresses, `data`
  // and a website's `settings`, redirect to Schedules.
  { id: "schedules", group: "collection", icon: CalendarClock, all: "schedules", site: "schedules", owners: "ANY" },
  { id: "limits", group: "collection", icon: Gauge, all: "limits", site: "limits", owners: "ANY" },
  { id: "runs", group: "collection", icon: Receipt, all: "runs", site: null, owners: "ANY" },
];

/** The icon a page header wears, the menu's own, so the two always match. */
export const SECTION_ICONS = Object.fromEntries(SECTION_PAGES.map((page) => [page.id, page.icon])) as Record<SectionPageId, LucideIcon>;

export type SectionPlace = { page: SectionPageId; siteId: string | null };

export function sectionBase(companyId: string): string {
  return `/admin/companies/${companyId}/websites`;
}

function pageById(id: SectionPageId): SectionPage {
  return SECTION_PAGES.find((page) => page.id === id)!;
}

/** Whether a website of this kind has the page. */
export function pageApplies(id: SectionPageId, relationship: Relationship): boolean {
  const page = pageById(id);
  return page.site !== null && (page.owners === "ANY" || relationship === "OWNED");
}

/** The pages the menu offers: every one for All websites or a company's own site; a competitor's own few, and the company's. */
export function pagesFor(relationship: Relationship | null): SectionPage[] {
  if (relationship === null || relationship === "OWNED") return [...SECTION_PAGES];
  return SECTION_PAGES.filter((page) => page.site === null || page.owners === "ANY");
}

/** Where a page lives for the website chosen, or for All websites. */
export function sectionHref(companyId: string, id: SectionPageId, site: { siteId: string; relationship: Relationship } | null): string {
  const base = sectionBase(companyId);
  const page = pageById(id);
  if (site && page.site !== null && pageApplies(id, site.relationship)) {
    return `${base}/site/${site.siteId}${page.site ? `/${page.site}` : ""}`;
  }
  return `${base}${page.all ? `/${page.all}` : ""}`;
}

/** Which page an address is, and for which website — the menu lights it and the chooser shows it. */
export function readSectionPath(companyId: string, pathname: string): SectionPlace {
  const base = sectionBase(companyId);
  const rest = pathname.startsWith(base) ? pathname.slice(base.length).replace(/\/+$/, "") : "";
  const onSite = /^\/site\/([^/]+)(?:\/([^/]+))?/.exec(rest);
  if (onSite) {
    const segment = onSite[2] ?? "";
    const page = SECTION_PAGES.find((entry) => entry.site === segment);
    return { page: page?.id ?? "todo", siteId: onSite[1] };
  }
  if (rest === "/runs" || rest.startsWith("/runs/")) return { page: "runs", siteId: null };
  // One prompt's fan-out queries is a page of Your prompts (prompt-fan-out-queries-plan.md).
  if (rest.startsWith("/ai-searches/prompts/")) return { page: "questions", siteId: null };
  const segment = rest.replace(/^\//, "");
  const page = SECTION_PAGES.find((entry) => entry.all === segment);
  return { page: page?.id ?? "websites", siteId: null };
}

/**
 * Where choosing a website — or All websites — goes from the page open: the
 * same page for it where it has one, else where a website of that kind opens
 * (its to-do list for a company's own site, its rankings for a competitor).
 */
export function switchHref(
  companyId: string,
  current: SectionPageId,
  site: { siteId: string; relationship: Relationship } | null,
): string {
  if (!site) return sectionHref(companyId, current, null);
  if (pageApplies(current, site.relationship)) return sectionHref(companyId, current, site);
  return sectionHref(companyId, site.relationship === "OWNED" ? "todo" : "rankings", site);
}
