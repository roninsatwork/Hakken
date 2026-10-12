import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { readPageKinds } from "./pageKinds";
import { assistantOf } from "./utils/aiAssistants";
import { SOURCE_JOIN, type HistoryKind, type HistoryRow } from "./utils/insightHistory";
import { NOT_SORTED_KIND, type ClassificationType } from "./utils/pageKinds";
import type { WhyInput } from "./utils/insightWhy";

/**
 * The history (utils/insightHistory.ts) read as the periods Insights shows
 * (docs/plans/active/insights-intelligence-plan.md, phases 1, 7 and 8): each
 * month's figures, each page sorted into the company's own classifications,
 * each source into the kind it is, and the six tests' figures for any two
 * spans. Shared by the screens' read (insightsPeriod.ts) and the weekly run,
 * so the Analyst and the page say the same.
 */

export type HistoryRecord = { kind: HistoryKind; month: string; from: string; to: string; rows: HistoryRow[]; cut?: boolean };

/** History records a website keeps at most (insightHistory.ts). */
const RECORDS_MOST = 200;

/** A website's whole history, in one bounded read. */
export async function historyOf(ctx: Pick<QueryCtx, "db">, holdId: Id<"companyWebsites">): Promise<HistoryRecord[]> {
  const rows = await ctx.db.query("insightHistory").withIndex("by_hold_kind_month", (q) => q.eq("companyWebsiteId", holdId)).take(RECORDS_MOST);
  return rows.map(({ kind, month, from, to, rows: lines }) => ({ kind, month, from, to, rows: lines }));
}

/** A page's kind: one of the company's classifications, Not sorted, or Analytics keeping no landing page for the visit. */
export type PageKind = { key: string; name: string | null; type: ClassificationType | "NOT_SORTED" | "NOT_RECORDED" };

export const NOT_RECORDED_KIND = "NOT_RECORDED";

/** Where a visit came from, as the screens group it: Google, each AI assistant, the other search engines, typed in, websites, social. */
export type SourceGroup = "GOOGLE" | "AI" | "OTHER_SEARCH" | "TYPED" | "WEBSITES" | "SOCIAL" | "OTHER";
export const SOURCE_GROUPS: readonly SourceGroup[] = ["GOOGLE", "AI", "OTHER_SEARCH", "TYPED", "WEBSITES", "SOCIAL", "OTHER"];

/** A kept source's group and its own name: an assistant by its name, a website by its address. */
export function sourceOf(key: string): { group: SourceGroup; name: string } {
  const [channel = "", source = ""] = key.split(SOURCE_JOIN);
  const assistant = assistantOf(source);
  if (assistant || channel === "AI Assistant") return { group: "AI", name: assistant ?? source };
  if (channel === "Organic Search") return source.trim().toLowerCase() === "google" ? { group: "GOOGLE", name: "Google" } : { group: "OTHER_SEARCH", name: source };
  if (channel === "Direct") return { group: "TYPED", name: source };
  if (channel === "Referral") return { group: "WEBSITES", name: source };
  if (channel.includes("Social")) return { group: "SOCIAL", name: source };
  return { group: "OTHER", name: source || channel };
}

/** Each page path the history names, sorted into the company's classifications; Not sorted while it has none. */
export async function pageKindsOf(ctx: Pick<QueryCtx, "db">, holdId: Id<"companyWebsites">): Promise<(path: string) => PageKind> {
  const kinds = await readPageKinds(ctx, holdId);
  const notSorted: PageKind = { key: NOT_SORTED_KIND, name: null, type: "NOT_SORTED" };
  const notRecorded: PageKind = { key: NOT_RECORDED_KIND, name: null, type: "NOT_RECORDED" };
  const seen = new Map<string, PageKind>();
  return (path) => {
    if (path === "(not set)" || path === "") return notRecorded;
    const held = seen.get(path);
    if (held) return held;
    if (!kinds) return notSorted;
    // Analytics names a landing page without its last slash where Search Console and the classifications keep it.
    let key = kinds.kindOf(path);
    if (key === NOT_SORTED_KIND && !path.endsWith("/") && !/\.[a-z0-9]+$/i.test(path)) key = kinds.kindOf(`${path}/`);
    const kind: PageKind = key === NOT_SORTED_KIND ? notSorted : { key, name: kinds.nameOf(key), type: kinds.typeOf(key) ?? "NOT_SORTED" };
    seen.set(path, kind);
    return kind;
  };
}

type Figures = { visits: number; enquiries: number };
type Clicks = { clicks: number; impressions: number; positionSum: number };

/** One month's figures, every source added up. */
export type MonthFigures = {
  month: string;
  /** Analytics held the month from its first day to its last. */
  whole: boolean;
  visits: number;
  enquiries: number;
  people: number | null;
  /** Search Console's own figures for the website, from its days; null when the month's days are not all held. */
  clicks: number | null;
  shown: number | null;
  positionSum: number | null;
  /** Analytics' visits from Google and Google's clicks on the days both are held: the counting check's. */
  googleVisits: number;
  googleClicks: number;
  sources: Map<string, Figures>;
  kinds: Map<string, Figures & { kind: PageKind }>;
  /** Search Console's figures by page, added up by kind: Google counts about half the clicks by page as for the website. */
  consoleKinds: Map<string, Clicks & { kind: PageKind }>;
};

const monthEnd = (month: string) => {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
};
const wholeMonth = (record: HistoryRecord | undefined) => record !== undefined && record.from === `${record.month}-01` && record.to === monthEnd(record.month);

/** Every month the history holds, oldest first, with what each source said of it. */
export function monthsOf(records: readonly HistoryRecord[], kindOf: (path: string) => PageKind): MonthFigures[] {
  const byKind = (kind: HistoryKind) => new Map(records.filter((record) => record.kind === kind).map((record) => [record.month, record]));
  const sources = byKind("GA_SOURCES"), pages = byKind("GA_PAGES"), consolePages = byKind("SC_PAGES");
  const people = new Map((records.find((record) => record.kind === "GA_MONTHS")?.rows ?? []).map((row) => [row.key, row.people ?? null]));
  const days = records.find((record) => record.kind === "DAYS")?.rows ?? [];
  const months = [...new Set([...sources.keys(), ...pages.keys(), ...consolePages.keys()])].filter(Boolean).sort();
  return months.map((month) => {
    const sourceRecord = sources.get(month);
    const figures: MonthFigures = {
      month,
      whole: wholeMonth(sourceRecord),
      visits: 0, enquiries: 0,
      people: people.get(month) ?? null,
      clicks: null, shown: null, positionSum: null,
      googleVisits: 0, googleClicks: 0,
      sources: new Map(), kinds: new Map(), consoleKinds: new Map(),
    };
    for (const row of sourceRecord?.rows ?? []) {
      figures.visits += row.visits ?? 0;
      figures.enquiries += row.enquiries ?? 0;
      const held = figures.sources.get(row.key) ?? { visits: 0, enquiries: 0 };
      held.visits += row.visits ?? 0;
      held.enquiries += row.enquiries ?? 0;
      figures.sources.set(row.key, held);
    }
    for (const row of pages.get(month)?.rows ?? []) {
      const kind = kindOf(row.key);
      const held = figures.kinds.get(kind.key) ?? { kind, visits: 0, enquiries: 0 };
      held.visits += row.visits ?? 0;
      held.enquiries += row.enquiries ?? 0;
      figures.kinds.set(kind.key, held);
    }
    for (const row of consolePages.get(month)?.rows ?? []) {
      const kind = kindOf(row.key);
      const held = figures.consoleKinds.get(kind.key) ?? { kind, clicks: 0, impressions: 0, positionSum: 0 };
      held.clicks += row.clicks ?? 0;
      held.impressions += row.impressions ?? 0;
      held.positionSum += row.positionSum ?? 0;
      figures.consoleKinds.set(kind.key, held);
    }
    const inMonth = days.filter((day) => day.key.startsWith(month));
    const consoleDays = inMonth.filter((day) => day.clicks !== undefined);
    if (consoleDays.length > 0 && consoleDays.length === Number(monthEnd(month).slice(8))) {
      figures.clicks = consoleDays.reduce((sum, day) => sum + (day.clicks ?? 0), 0);
      figures.shown = consoleDays.reduce((sum, day) => sum + (day.impressions ?? 0), 0);
      figures.positionSum = consoleDays.reduce((sum, day) => sum + (day.positionSum ?? 0), 0);
    }
    for (const day of inMonth) {
      if (day.clicks === undefined || day.googleVisits === undefined) continue;
      figures.googleVisits += day.googleVisits;
      figures.googleClicks += day.clicks;
    }
    return figures;
  });
}

/**
 * The month Google changed what it counts as shown: the newest month whose
 * times shown fell by more than a third on the month before while its clicks
 * held within a fifth and its average place rose five places or more —
 * showings far down the results no longer counted. Times shown and place are
 * not compared across it. Null when none.
 */
export function countingBreak(months: readonly MonthFigures[]): string | null {
  let found: string | null = null;
  for (let at = 1; at < months.length; at += 1) {
    const before = months[at - 1], after = months[at];
    if (!before.shown || !after.shown || !before.clicks || !after.clicks || before.positionSum === null || after.positionSum === null) continue;
    const shownRatio = after.shown / before.shown;
    const clicksRatio = after.clicks / before.clicks;
    const placeBefore = before.positionSum / before.shown, placeAfter = after.positionSum / after.shown;
    if (shownRatio <= 0.65 && clicksRatio >= 0.8 && clicksRatio <= 1.25 && placeBefore - placeAfter >= 5) found = after.month;
  }
  // A change part-way through a month leaves it half one way and half the other: when the next month's place rose
  // five places more, the month found is a half-way one and the next is the first counted the new way.
  const at = months.findIndex((month) => month.month === found);
  const next = at >= 0 ? months[at + 1] : undefined;
  const half = at >= 0 ? months[at] : undefined;
  if (next && half && next.shown && half.shown && next.positionSum !== null && half.positionSum !== null && half.positionSum / half.shown - next.positionSum / next.shown >= 5) found = next.month;
  return found;
}

/** A span's figures added up; null when a month of it is not held whole. */
export function spanFigures(months: readonly MonthFigures[], span: readonly string[]) {
  const held = span.map((month) => months.find((entry) => entry.month === month));
  if (held.some((month) => !month || !month.whole)) return null;
  const whole = held as MonthFigures[];
  const add = <T,>(value: (month: MonthFigures) => T | null, plus: (a: T, b: T) => T): T | null => {
    let total: T | null = null;
    for (const month of whole) {
      const one = value(month);
      if (one === null) return null;
      total = total === null ? one : plus(total, one);
    }
    return total;
  };
  const kinds = new Map<string, Figures & { kind: PageKind }>();
  const consoleKinds = new Map<string, Clicks & { kind: PageKind }>();
  const sources = new Map<string, Figures>();
  for (const month of whole) {
    for (const [key, entry] of month.kinds) {
      const total = kinds.get(key) ?? { kind: entry.kind, visits: 0, enquiries: 0 };
      total.visits += entry.visits;
      total.enquiries += entry.enquiries;
      kinds.set(key, total);
    }
    for (const [key, entry] of month.consoleKinds) {
      const total = consoleKinds.get(key) ?? { kind: entry.kind, clicks: 0, impressions: 0, positionSum: 0 };
      total.clicks += entry.clicks;
      total.impressions += entry.impressions;
      total.positionSum += entry.positionSum;
      consoleKinds.set(key, total);
    }
    for (const [key, entry] of month.sources) {
      const total = sources.get(key) ?? { visits: 0, enquiries: 0 };
      total.visits += entry.visits;
      total.enquiries += entry.enquiries;
      sources.set(key, total);
    }
  }
  return {
    visits: whole.reduce((sum, month) => sum + month.visits, 0),
    enquiries: whole.reduce((sum, month) => sum + month.enquiries, 0),
    // People can't be added across months: a single month's only.
    people: whole.length === 1 ? whole[0].people : null,
    clicks: add((month) => month.clicks, (a, b) => a + b),
    shown: add((month) => month.shown, (a, b) => a + b),
    positionSum: add((month) => month.positionSum, (a, b) => a + b),
    googleVisits: whole.reduce((sum, month) => sum + month.googleVisits, 0),
    googleClicks: whole.reduce((sum, month) => sum + month.googleClicks, 0),
    kinds,
    consoleKinds,
    sources,
  };
}

export type SpanFigures = NonNullable<ReturnType<typeof spanFigures>>;

/** Sources added up by their group. */
export function byGroup(sources: ReadonlyMap<string, Figures>): Map<SourceGroup, Figures> {
  const out = new Map<SourceGroup, Figures>();
  for (const [key, entry] of sources) {
    const { group } = sourceOf(key);
    const total = out.get(group) ?? { visits: 0, enquiries: 0 };
    total.visits += entry.visits;
    total.enquiries += entry.enquiries;
    out.set(group, total);
  }
  return out;
}

const service = (kind: PageKind) => kind.type === "SERVICE";

/** The service pages' Search Console figures in a span. */
function serviceConsole(span: SpanFigures) {
  let clicks = 0, impressions = 0, positionSum = 0;
  for (const entry of span.consoleKinds.values()) {
    if (!service(entry.kind)) continue;
    clicks += entry.clicks;
    impressions += entry.impressions;
    positionSum += entry.positionSum;
  }
  return { clicks, impressions, position: impressions > 0 ? Math.round((positionSum / impressions) * 10) / 10 : null };
}

/** The service pages' best month for average place since Google last changed what it counts. */
export function bestServiceMonth(months: readonly MonthFigures[], since: string | null): { month: string; position: number } | null {
  let best: { month: string; position: number } | null = null;
  for (const month of months) {
    if (!month.whole || (since && month.month < since)) continue;
    let impressions = 0, positionSum = 0;
    for (const entry of month.consoleKinds.values()) {
      if (!service(entry.kind)) continue;
      impressions += entry.impressions;
      positionSum += entry.positionSum;
    }
    if (impressions === 0) continue;
    const position = Math.round((positionSum / impressions) * 10) / 10;
    if (!best || position < best.position) best = { month: month.month, position };
  }
  return best;
}

/** The six tests' figures for two spans: now, and the span it is set against. */
export function whyInputOf(
  now: SpanFigures,
  then: SpanFigures,
  extras: {
    rivals: { now: number | null; then: number | null };
    best: { month: string; position: number } | null;
    pageOne: { now: number; before: number; months?: { now: string; then: string } } | null;
    aiOverviews: { with: number; of: number } | null;
    shownComparable: boolean;
    clarity?: { clarity: number; analytics: number; days: number } | null;
  },
): WhyInput {
  const share = (span: SpanFigures) => (span.googleClicks > 0 ? span.googleVisits / span.googleClicks : null);
  const sNow = serviceConsole(now), sThen = serviceConsole(then);
  const groupsNow = byGroup(now.sources), groupsThen = byGroup(then.sources);
  const kinds = [...new Set([...now.kinds.keys(), ...then.kinds.keys()])].map((key) => {
    const one = now.kinds.get(key) ?? then.kinds.get(key)!;
    return {
      key,
      service: service(one.kind),
      visits: { now: now.kinds.get(key)?.visits ?? 0, then: then.kinds.get(key)?.visits ?? 0 },
      enquiries: { now: now.kinds.get(key)?.enquiries ?? 0, then: then.kinds.get(key)?.enquiries ?? 0 },
    };
  });
  return {
    enquiries: { now: now.enquiries, then: then.enquiries },
    visits: { now: now.visits, then: then.visits },
    share: { now: share(now), then: share(then) },
    rivals: extras.rivals,
    service: {
      shown: { now: sNow.impressions, then: sThen.impressions },
      clicks: { now: sNow.clicks, then: sThen.clicks },
      position: { now: sNow.position, then: sThen.position },
      best: extras.best,
    },
    pageOne: extras.pageOne,
    clarity: extras.clarity ?? null,
    aiOverviews: extras.aiOverviews,
    shownComparable: extras.shownComparable,
    sources: SOURCE_GROUPS.map((group) => ({ key: group, now: groupsNow.get(group)?.visits ?? 0, then: groupsThen.get(group)?.visits ?? 0 })).filter((source) => source.now > 0 || source.then > 0),
    kinds,
  };
}

type Visits = { visits: number; enquiries: number };
type Times = { times: number; enquiries: number };

/** A span's lists, added up: each page, each source by its own name, each event, each kind, and each page's visitors from Google's search. */
export type SpanLists = {
  pages: Map<string, Visits>;
  sources: Map<string, Visits>;
  events: Map<string, Times>;
  kinds: Map<string, Visits>;
  googleByPage: Map<string, Visits>;
  /** Each source's pages: the landing pages it sent people to, by the source's own name. */
  pagesBySource: Map<string, Map<string, Visits>>;
  /** Each page's visitors and enquiries by where they came from, grouped: Google, AI assistants, typed in and the rest. */
  pagesByGroup: Map<string, Map<SourceGroup, Visits>>;
};

const addTo = <T extends Record<string, number>>(map: Map<string, T>, key: string, empty: () => T, values: Partial<T>) => {
  const held = map.get(key) ?? empty();
  for (const [field, value] of Object.entries(values)) (held as Record<string, number>)[field] += value ?? 0;
  map.set(key, held);
};

/** The history's month lists, ready to add up over any span of months. */
export function listsOf(records: readonly HistoryRecord[], kindOf: (path: string) => PageKind) {
  const monthly = (kind: HistoryKind) => new Map(records.filter((record) => record.kind === kind).map((record) => [record.month, record]));
  const pages = monthly("GA_PAGES"), sources = monthly("GA_SOURCES"), pageSources = monthly("GA_PAGE_SOURCES"), events = monthly("GA_EVENTS");
  const visits = () => ({ visits: 0, enquiries: 0 });
  return {
    over(span: readonly string[]): SpanLists {
      const out: SpanLists = { pages: new Map(), sources: new Map(), events: new Map(), kinds: new Map(), googleByPage: new Map(), pagesBySource: new Map(), pagesByGroup: new Map() };
      for (const month of span) {
        for (const row of pages.get(month)?.rows ?? []) {
          addTo(out.pages, row.key, visits, { visits: row.visits ?? 0, enquiries: row.enquiries ?? 0 });
          addTo(out.kinds, kindOf(row.key).key, visits, { visits: row.visits ?? 0, enquiries: row.enquiries ?? 0 });
        }
        for (const row of sources.get(month)?.rows ?? []) addTo(out.sources, row.key, visits, { visits: row.visits ?? 0, enquiries: row.enquiries ?? 0 });
        for (const row of events.get(month)?.rows ?? []) addTo(out.events, row.key, () => ({ times: 0, enquiries: 0 }), { times: row.times ?? 0, enquiries: row.enquiries ?? 0 });
        for (const row of pageSources.get(month)?.rows ?? []) {
          const [path = "", channel = "", source = ""] = row.key.split(SOURCE_JOIN);
          const figures = { visits: row.visits ?? 0, enquiries: row.enquiries ?? 0 };
          if (channel === "Organic Search" && source.trim().toLowerCase() === "google") addTo(out.googleByPage, path, visits, figures);
          const { name, group } = sourceOf([channel, source].join(SOURCE_JOIN));
          let bySource = out.pagesBySource.get(name);
          if (!bySource) out.pagesBySource.set(name, (bySource = new Map()));
          addTo(bySource, path, visits, figures);
          let byGroup = out.pagesByGroup.get(path);
          if (!byGroup) out.pagesByGroup.set(path, (byGroup = new Map()));
          addTo(byGroup, group, visits, figures);
        }
      }
      return out;
    },
  };
}
