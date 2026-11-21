import { assistantOf } from "../../aiAssistants";
import { NOT_SORTED_KIND } from "../../pageKinds";

/**
 * What each Clarity screen hands its eye (ask-hakken-every-chart-page-plan-2026-11-03.md, section 8), built in one place
 * for the screens and for a chat app's question (`chatAppEyes/clarity.ts`), so the two can't disagree
 * (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, Option B): the answer of the query that draws it, every name in the
 * reader's own words — a device as "Phones", a source as "Google", a page group by its name, never a code or an id — and
 * the words the page's own rules need (`convex/utils/sees/own/clarity.ts`): the whole website, the span before,
 * computers. Pure, so the rules' test of every period (`convex/utils/sees/clarityFindingsPeriods.test.ts`) builds the
 * very same figures.
 */

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
  /** A day in the reader's words: "19 Oct 2026". */
  day: (day: string) => string;
  /** A run of days, "{from} to {to}". */
  days: string;
  /** A browser on a device, as the screens' "Mostly on" says it: "MobileSafari on phones". */
  where: (browser: string, device: string) => string;
};

/** A namespace's words: the screens' `useTranslations`, or the server's `englishWords`. */
type Words = (key: string, values?: Record<string, string | number>) => string;

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

/** A device as Clarity names it, in words a person uses (`clarity.devices`). "Any": a large website's page asked for without its devices. */
export function clarityDeviceName(devices: Words): (device: string) => string {
  return (device) => (device === "PC" || device === "Mobile" || device === "Tablet" || device === "Any" ? devices(device) : devices("Other"));
}

/**
 * The words a Clarity screen hands its eye beside its figures, every name as the screen itself says it. `chosen`: the
 * menu's period, or `custom`. `host`: the website's own, for visits between its pages. `kindName`: a page group's words
 * where the screen shows its groups; pages not sorted yet go unnamed, as Hakken's housekeeping is never news.
 */
export function claritySeesWordsFrom(
  t: { common: Words; sources: Words; devices: Words; periods: Words },
  chosen: string,
  options: { host: string; day: (day: string) => string; kindName?: (kind: string) => string },
): ClaritySeesWords {
  const device = clarityDeviceName(t.devices);
  const before = t.periods(`before.${chosen}`);
  return {
    website: t.common("eye.website"),
    before: `${before.charAt(0).toUpperCase()}${before.slice(1)}`,
    device,
    source: (source) => sourceNameOf(source, options.host, { direct: t.sources("direct"), own: t.sources("own") }),
    ownSource: t.sources("own"),
    group: (kind, name) => name ?? (kind === NOT_SORTED_KIND || !options.kindName ? null : options.kindName(kind)),
    low: t.common("eye.low"),
    otherSources: t.common("eye.otherSources"),
    day: options.day,
    days: t.common("eye.days", { from: "{from}", to: "{to}" }),
    where: (browser, code) => t.common("browserOn", { browser, device: device(code).toLowerCase() }),
  };
}

type Split = { name: string };
type Mostly = { browser: string; device: string } | null;
const devicesOf = <Row extends Split>(rows: readonly Row[], words: ClaritySeesWords) => rows.map((row) => ({ ...row, device: row.name, name: words.device(row.name) }));
const sourcesOf = <Row extends Split>(rows: readonly Row[], words: ClaritySeesWords) => rows.map((row) => {
  const name = words.source(row.name);
  return { ...row, source: row.name, name, ...(name === words.ownSource ? { own: true } : {}) };
});
const mostlyOf = (mostly: Mostly, words: ClaritySeesWords) => (mostly ? words.where(mostly.browser, mostly.device) : null);

/** The Overview (`clarityOverview`): its groups, devices and sources in words, its error pages with where they mostly happen. */
export function overviewSees<Data extends {
  before: unknown;
  groups: ReadonlyArray<{ kind: string; name: string | null }>;
  devices: readonly Split[];
  sources: { rows: readonly Split[] } | null;
  errors: { pages: ReadonlyArray<{ mostly: Mostly }> };
}>(data: Data, words: ClaritySeesWords) {
  return {
    ...data,
    names: { website: words.website, before: data.before ? words.before : null, computers: words.device("PC") },
    groups: data.groups.map((group) => ({ ...group, name: words.group(group.kind, group.name) })),
    devices: devicesOf(data.devices, words),
    sources: data.sources ? { ...data.sources, rows: sourcesOf(data.sources.rows, words) } : null,
    errors: { ...data.errors, pages: data.errors.pages.map((entry) => ({ ...entry, mostlyName: mostlyOf(entry.mostly, words) })) },
  };
}

/** Errors (`clarityErrors`): the days with an error in words, for errors bunched on a few of them. */
export function errorsSees<Data extends {
  before: unknown;
  byDay: ReadonlyArray<{ day: string; errors: number | null }>;
  pages: ReadonlyArray<{ mostly: Mostly }>;
}>(data: Data, words: ClaritySeesWords) {
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

type PageLine = { page: string; now: unknown; scrollBefore: number | null; visitsBefore: number };

/**
 * Pages (`clarityPagesList`): every page named by its address, as the table links it; the summary's pages moved most,
 * the first each way; and the chart's busiest pages and each page group with their figures under `figures`, so the
 * general rules, which Pages keeps for its table, never read a group's visits as news ("Content hub: 45% of all the
 * visits") nor say a page of the chart and of the table twice.
 */
export function pagesSees<Answer extends {
  groups: ReadonlyArray<{ kind: string; name: string | null; now: unknown; scrollBefore: number | null; visitsBefore: number }>;
  summary: { allVisits: number; lowVisits: number; allVisitsBefore: number | null; lowVisitsBefore: number | null; scrollFell: readonly PageLine[]; scrollRose: readonly PageLine[] };
  period: { before: unknown };
  rows: ReadonlyArray<{ page: string }>;
  busiest: readonly PageLine[];
}>(answer: Answer, words: ClaritySeesWords) {
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

/** A page's own screen (`clarityPage`): its devices, the website's and its sources in words, each browser and device its errors are on. */
export function pageSees<Data extends {
  before: unknown;
  devices: readonly Split[];
  websiteDevices: readonly Split[];
  sources: { rows: readonly Split[] } | null;
  errors: readonly Split[];
}>(data: Data, page: string, words: ClaritySeesWords) {
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
