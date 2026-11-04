import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { assistantOf } from "@/convex/utils/aiAssistants";

/**
 * What each Clarity screen hands its eye (ask-hakken-every-chart-page-plan-2026-11-03.md, section 8): the answer of the
 * query that draws it, every name in the reader's own words — a device as "Phones", a source as "Google", a page group
 * by its name, never a code or an id — and the words the page's own rules need (`convex/utils/sees/own/clarity.ts`):
 * the whole website, the span before, computers. Pure, so the screens and the rules' test of every period
 * (`convex/utils/sees/clarityFindingsPeriods.test.ts`) build the very same figures.
 */

type Overview = FunctionReturnType<typeof api.clarityScreens.clarityOverview>;
type Errors = FunctionReturnType<typeof api.clarityScreens.clarityErrors>;
type PagesList = FunctionReturnType<typeof api.clarityScreens.clarityPagesList>;
type OnePage = FunctionReturnType<typeof api.clarityScreens.clarityPage>;

/** The screen's own words for what the eye names. */
export type ClaritySeesWords = {
  /** "The whole website". */
  website: string;
  /** What the period is set against, with a capital: "The week before". Said only where Clarity holds it. */
  before: string;
  /** A device by Clarity's name for it ("PC") in the reader's words ("Computers"). */
  device: (code: string) => string;
  /** A source by Clarity's name for it ("google") in the reader's words ("Google"). */
  source: (code: string) => string;
  /** The words for visits between the website's own pages, which no person chose as a source. */
  ownSource: string;
  /** A page group's words; null for pages not sorted yet, which are Hakken's housekeeping and never a finding. */
  group: (kind: string, name: string | null) => string | null;
  /** "Pages scrolled less than a quarter of the way". */
  low: string;
  /** "Its other sources": what one of a page's sources is set beside. */
  otherSources: string;
  /** A day in the reader's words: "19 Oct". */
  day: (day: string) => string;
  /** A run of days, "{from} to {to}". */
  days: string;
  /** A browser on a device, as the screens' "Mostly on" says it: "MobileSafari on phones". */
  where: (browser: string, device: string) => string;
};

/**
 * A source as Clarity names it, in the reader's words: "google" and "bing" as Google and Bing, an AI assistant by its
 * name, the website's own address as visits between its pages, and no source as a direct visit. Each its own line,
 * never grouped. `host`: the website's own.
 */
export function sourceNameOf(source: string, host: string, words: { direct: string; own: string }): string {
  const own = host.replace(/^www\./, "").toLowerCase();
  const name = source.trim().toLowerCase().replace(/^www\./, "");
  if (!name || name === "direct" || name === "(direct)") return words.direct;
  if (own && (name === own || name.endsWith(`.${own}`))) return words.own;
  const assistant = assistantOf(name);
  if (assistant) return assistant;
  return /^[a-z]+$/.test(name) ? name[0].toUpperCase() + name.slice(1) : name;
}

/**
 * The own screens of the pages the eye may name (ask-hakken-every-chart-page-plan-2026-11-03.md, checklist 3): where
 * "Do first" looks into one page, before the section's other pages. Each once, by its address.
 */
export function pageLinks(pages: ReadonlyArray<string | null | undefined>, href: (page: string) => string): Array<{ label: string; href: string }> {
  return [...new Set(pages.filter((page): page is string => Boolean(page)))].map((page) => ({ label: page, href: href(page) }));
}

type Split = { name: string };
const devicesOf = <Row extends Split>(rows: readonly Row[], words: ClaritySeesWords) => rows.map((row) => ({ ...row, device: row.name, name: words.device(row.name) }));
const sourcesOf = <Row extends Split>(rows: readonly Row[], words: ClaritySeesWords) => rows.map((row) => {
  const name = words.source(row.name);
  return { ...row, source: row.name, name, ...(name === words.ownSource ? { own: true } : {}) };
});
const mostlyOf = (mostly: { browser: string; device: string } | null, words: ClaritySeesWords) => (mostly ? words.where(mostly.browser, mostly.device) : null);

/** The Overview: its groups, devices and sources in words, its error pages with where they mostly happen. */
export function overviewSees(data: Overview, words: ClaritySeesWords) {
  return {
    ...data,
    names: { website: words.website, before: data.before ? words.before : null, computers: words.device("PC") },
    groups: data.groups.map((group) => ({ ...group, name: words.group(group.kind, group.name) })),
    devices: devicesOf(data.devices, words),
    sources: data.sources ? { ...data.sources, rows: sourcesOf(data.sources.rows, words) } : null,
    errors: { ...data.errors, pages: data.errors.pages.map((entry) => ({ ...entry, mostlyName: mostlyOf(entry.mostly, words) })) },
  };
}

/** Errors: the days with an error in words, for errors bunched on a few of them. */
export function errorsSees(data: Errors, words: ClaritySeesWords) {
  return {
    ...data,
    names: {
      website: words.website,
      before: data.before ? words.before : null,
      days: Object.fromEntries(data.byDay.filter((day) => (day.errors ?? 0) > 0).map((day) => [day.day, words.day(day.day)])),
      daysWords: words.days,
    },
    pages: data.pages.map((entry) => ({ ...entry, mostlyName: mostlyOf(entry.mostly, words) })),
  };
}

/**
 * Pages: every page named by its address, as the table links it; the summary's pages moved most, the first each way;
 * and the chart's busiest pages and each page group with their figures under `figures`, so the general rules, which
 * Pages keeps for its table, never read a group's visits as news ("Content hub: 45% of all the visits") nor say a page
 * of the chart and of the table twice.
 */
export function pagesSees(answer: PagesList, words: ClaritySeesWords) {
  const { groups, summary, ...rest } = answer;
  return {
    ...rest,
    names: { website: words.website, before: answer.period.before ? words.before : null, low: words.low },
    rows: answer.rows.map((row) => ({ ...row, name: row.page })),
    busiest: answer.busiest.map((row) => ({ name: row.page, figures: row.now, scrollBefore: row.scrollBefore, visitsBefore: row.visitsBefore })),
    summary: {
      allVisits: summary.allVisits,
      lowVisits: summary.lowVisits,
      allVisitsBefore: summary.allVisitsBefore,
      lowVisitsBefore: summary.lowVisitsBefore,
      fell: summary.scrollFell[0] ?? null,
      rose: summary.scrollRose[0] ?? null,
    },
    groupAverages: groups.map((group) => ({ name: words.group(group.kind, group.name), figures: group.now, scrollBefore: group.scrollBefore, visitsBefore: group.visitsBefore })),
  };
}

/** A page's own screen: its devices, the website's and its sources in words, each browser and device its errors are on. */
export function pageSees(data: OnePage, page: string, words: ClaritySeesWords) {
  return {
    ...data,
    names: { website: words.website, before: data.before ? words.before : null, computers: words.device("PC"), page, otherSources: words.otherSources },
    devices: devicesOf(data.devices, words),
    websiteDevices: devicesOf(data.websiteDevices, words),
    sources: data.sources ? { ...data.sources, rows: sourcesOf(data.sources.rows, words) } : null,
    errors: data.errors.map((row) => {
      const [browser, device] = row.name.split("|");
      return { ...row, key: row.name, name: words.where(browser, device ?? "") };
    }),
  };
}
