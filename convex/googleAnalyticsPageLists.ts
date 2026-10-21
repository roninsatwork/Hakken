import type { ActionCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { ask, askList, countryIdOf, failed, periodRange, writeList, type CollectTarget, type Session, type StepResult } from "./googleAnalyticsCollect";
import { FINISHED, fetchedKey } from "./googleAnalyticsJobs";
import { CALENDAR_PERIODS, isRunning } from "./utils/calendarPeriods";
import { numberPages } from "./googleAnalyticsPageNumbers";
import type { GoogleFailure } from "./googleApi";
import { CompactRows, EVERY_DEVICE, PAGE_FACT_JOIN, beforeKey, channelKey, emptyRow, slotKey, splitChannelKey, unpackPart, type ListRow, type PackedPart } from "./googleAnalyticsLists";
import { addressesOf } from "./holdPageRefs";
import { assistantOf } from "./utils/aiAssistants";
import { CLICK_EVENTS, READ_EVENTS } from "./utils/analyticsPageStory";
import { HOLD_ROWS, OTHER_ROWS, PAGE_TOP_ROWS, keepPerPage, trimDue } from "./utils/analyticsSharedLists";
import { EVENT_DETAIL } from "./utils/analyticsEvents";
import { buildFlow, type Onward, type Route } from "./utils/landingFlow";
import type { AnalyticsPeriod, AnalyticsWhich, PageFactList } from "./googleAnalyticsSchema";
import type { ReportRow } from "./googleAnalyticsApi";

/**
 * The shared page lists (docs/plans/active/ga-stored-figures-plan.md SF13,
 * SF14; Anthony, 2026-10-14: "normalise … we don't need to store this so
 * precisely that it's not reusable"): each one plain fact keyed by page, a
 * page's top 20 rows and the rest as one "other", for each date range and
 * device, sorted by page so a screen reads only its page's rows. Every
 * page's screen, a landing page's channels and Ask Hakken are worked out
 * from them; a page's screen never asks Google (SF15).
 */

type Reader = { db: QueryCtx["db"] };

const DEVICES = [EVERY_DEVICE, "desktop", "mobile", "tablet"] as const;

/**
 * The parts of one date range and device's shared page lists, each a job of
 * its own (collection-reliability-plan.md, RR2): one list, or the two read from
 * one ask, asked, written and let go before the next — never all of them held
 * in one step to its end, as before 2026-10-15, when kordatackle.com's 90 days
 * on mobile ran its step out of memory.
 */
export const PAGE_LIST_PARTS = [
  "sources", "before", "clicks", "who", "landedWho", "browser", "system", "interest",
  "countries", "seen", "flow", "weekdays", "devices", "eventsNow", "eventsBefore",
] as const;
export type PageListPart = typeof PAGE_LIST_PARTS[number];

/** One date range and device of the shared page lists, for the main home country or another (`country`), one part: a job of the run. */
export type PageListsJob = { pages: true; period: AnalyticsPeriod; device: string; country?: string; part?: PageListPart };

/** The lists each part writes, and for which dates: a job reads only their slots. */
const LISTS_OF_PART: Record<PageListPart, ReadonlyArray<readonly [PageFactList, "NOW" | "BEFORE"]>> = {
  sources: [["landingSource", "NOW"]],
  before: [["pageReferrer", "NOW"], ["pageNext", "NOW"]],
  clicks: [["pageClicks", "NOW"]],
  who: [["pageWho", "NOW"]],
  landedWho: [["landingWho", "NOW"]],
  browser: [["landingBrowser", "NOW"]],
  system: [["landingSystem", "NOW"]],
  interest: [["landingInterest", "NOW"]],
  countries: [["pageCountry", "NOW"]],
  seen: [["landingPagesSeen", "NOW"]],
  flow: [],
  weekdays: [["pageWeekday", "NOW"]],
  devices: [["pageDevice", "NOW"]],
  eventsNow: [["eventPage", "NOW"], ["eventDetail", "NOW"]],
  eventsBefore: [["eventPage", "BEFORE"], ["eventDetail", "BEFORE"]],
};

/** The parts a date range and device has: every country's readers with the main home country's alone, each device's views with every device's alone. */
function partsOf(device: string, country: string | undefined): PageListPart[] {
  return PAGE_LIST_PARTS.filter((part) => (part !== "countries" || !country) && (part !== "devices" || !device));
}

/**
 * The shared lists a run asks (calendar-periods-plan.md, phase 6): This Week and This Month each run, This Quarter and
 * This Year with the weekly lists, and each finished period due (`finishedDue`) — for the main home country, then each
 * other (ga-stored-figures-plan.md SF7) — each part a job. A period Google has sent none of yet is not asked.
 */
export function pageListJobs(weekly: boolean, others: readonly string[] = [], top?: string, finished: readonly string[] = []): PageListsJob[] {
  return [undefined, ...others].flatMap((country) => {
    const periods: AnalyticsPeriod[] = [
      ...CALENDAR_PERIODS.filter((period) => isRunning(period) && (weekly || period === "thisWeek" || period === "thisMonth")),
      ...FINISHED.filter((period) => finished.includes(fetchedKey(period, country))),
    ].filter((period) => top === undefined || periodRange(period, "NOW", top) !== null);
    return periods.flatMap((period) => DEVICES.flatMap((device) =>
      partsOf(device, country).map((part) => ({ pages: true as const, period, device, ...(country ? { country } : {}), part }))));
  });
}

/** A row's key past its page: its parts. */
export function factParts(key: string): string[] {
  return key.split(PAGE_FACT_JOIN);
}

/** Each path as the website's page number, once for all (`numberPages`): a landing page slashed as the website holds it. */
async function refsOf(ctx: ActionCtx, target: CollectTarget, paths: readonly string[], landing: boolean): Promise<Map<string, string>> {
  const unique = [...new Set(paths)];
  if (unique.length === 0) return new Map();
  const numbered = await numberPages(ctx, target, unique.map((path) => emptyRow(channelKey(path, path))), landing ? "landing" : "page", true);
  return new Map(numbered.map((row) => {
    const { channel: ref, source: path } = splitChannelKey(row.key);
    return [path, ref];
  }));
}

/** Rows numbered by their page, two paths of one page added into one row; "(not set)" kept as it is. */
async function numbered(ctx: ActionCtx, target: CollectTarget, rows: readonly ListRow[], landing: boolean): Promise<ListRow[]> {
  const refs = await refsOf(ctx, target, rows.map((row) => splitChannelKey(row.key).channel), landing);
  return summedRows(rows.map((row) => {
    const { channel: path, source: rest } = splitChannelKey(row.key);
    return { ...row, key: channelKey(refs.get(path) ?? path, rest) };
  }));
}

function add(into: ListRow, row: ListRow) {
  for (const field of ["visits", "engaged", "seconds", "views", "purchases", "revenue", "people", "newPeople", "length"] as const) into[field] += row[field];
  if (row.times !== undefined) into.times = (into.times ?? 0) + row.times;
  if (row.converting !== undefined) into.converting = (into.converting ?? 0) + row.converting;
  for (const [event, count] of row.counts) into.counts.set(event, (into.counts.get(event) ?? 0) + count);
  for (const [event, value] of row.values) into.values.set(event, (into.values.get(event) ?? 0) + value);
}

/**
 * Each page's top rows by `measure`, the rest added into one row (SF14) —
 * one a group where `groupOf` names one (a landing page's other sources, a
 * channel each), and rows `keep` names never folded (an AI assistant's). A
 * row that is already a page's "other" — added up while a big website's list
 * was read (`TRIM_KEEP`, ga-big-site-reliability-plan.md BR3) — never takes
 * one of the top places: it is added into the other row again.
 */
export function topPerPage(
  rows: readonly ListRow[],
  measure: (row: ListRow) => number,
  groupOf: (rest: string) => string = () => OTHER_ROWS,
  keep: (rest: string) => boolean = () => false,
  /** The rows each page keeps: a number, or one worked out from how many pages the list has (`keepPerPage`). */
  topOf: number | ((pages: number) => number) = PAGE_TOP_ROWS,
): ListRow[] {
  const byPage = new Map<string, ListRow[]>();
  for (const row of rows) {
    const page = splitChannelKey(row.key).channel;
    const pageRows = byPage.get(page);
    if (pageRows) pageRows.push(row);
    else byPage.set(page, [row]);
  }
  const top = typeof topOf === "number" ? topOf : topOf(byPage.size);
  const out: ListRow[] = [];
  for (const [page, pageRows] of byPage) {
    const sorted = [...pageRows].sort((left, right) => measure(right) - measure(left) || left.key.localeCompare(right.key));
    const others = new Map<string, ListRow>();
    // A row's place among the page's rows, an "other" row left out of the count.
    let at = 0;
    for (const row of sorted) {
      const rest = splitChannelKey(row.key).source;
      const other = groupOf(rest) === rest;
      const place = other ? top : at;
      if (!other) at += 1;
      if (place < top || keep(rest)) {
        out.push(row);
        continue;
      }
      const key = channelKey(page, groupOf(rest));
      const into = others.get(key) ?? { ...emptyRow(key), ...(row.times !== undefined ? { times: 0 } : {}) };
      add(into, row);
      others.set(key, into);
    }
    out.push(...others.values());
  }
  return out;
}

/**
 * A page list's cut while it is read (BR3, RR2): each page's biggest by the
 * list's own rule — `TRIM_KEEP` of them, or fewer on a website with so many
 * pages that the list would pass `hold` rows (`keepPerPage`).
 */
export function trimTo(measure: (row: ListRow) => number, groupOf?: (rest: string) => string, keep?: (rest: string) => boolean, hold: number = HOLD_ROWS): (rows: ListRow[]) => ListRow[] {
  return (rows) => topPerPage(rows, measure, groupOf, keep, (pages) => keepPerPage(pages, hold));
}

/**
 * A page list's rows as Google's answers arrive (BR2, BR3): each answer row
 * keyed as the list keeps it (`keysOf`), its figures put by `fill`, added up
 * by key — and once more than `TRIM_ABOVE` are held, cut by `cut`, so a big
 * website's list is never held whole.
 */
export function heldRows(
  fill: (row: ListRow, answer: ReportRow) => void,
  cut: (rows: ListRow[]) => ListRow[],
  keysOf: (answer: ReportRow) => string[] = (answer) => answer.keys,
  hold: number = HOLD_ROWS,
) {
  const held = new Map<string, ListRow>();
  const due = trimDue(hold);
  return {
    sink: (rows: ReportRow[]) => {
      for (const answer of rows) {
        const keys = keysOf(answer);
        const key = channelKey(keys[0] ?? "", keys.slice(1).join(PAGE_FACT_JOIN));
        const row = held.get(key) ?? emptyRow(key);
        fill(row, answer);
        held.set(key, row);
      }
      if (due.now(held.size)) {
        const kept = cut([...held.values()]);
        held.clear();
        for (const row of kept) held.set(row.key, row);
        due.after(held.size);
      }
    },
    rows: () => [...held.values()],
    /** Rows held now: cut back whenever past `TRIM_ABOVE`. */
    size: () => held.size,
  };
}

/**
 * Pages a page list is asked about at once on a big website (Anthony,
 * 2026-10-16: "yes" to asking a big website's pages in groups of 2,000).
 * A list asked of every page at once holds each page's rows while Google's
 * answers arrive, so its exact top 20 can be kept: at 14,000 pages, 300,000
 * rows and more than a step's 512 MB (the rehearsal at ten times
 * kordatackle.com, 2026-10-15). Past this many pages, a list is asked a
 * group of pages at a time — each page's top 20 kept exactly as on a small
 * website — for more asks against the property's allowance; a website whose
 * pages are all numbered within it is asked in one ask, as before.
 */
export const GROUP_PAGES = 2_000;

/** The dimension each part's rows are keyed by first, which a big website's groups of pages filter on; none for an event's lists. */
const LEAD_OF_PART: Record<PageListPart, "pagePath" | "landingPage" | null> = {
  sources: "landingPage", before: "pagePath", clicks: "pagePath", who: "pagePath", landedWho: "landingPage",
  browser: "landingPage", system: "landingPage", interest: "landingPage", countries: "pagePath", seen: "landingPage",
  flow: "landingPage", weekdays: "pagePath", devices: "pagePath", eventsNow: null, eventsBefore: null,
};

type ListFlags = { folded: boolean; thresholded: boolean; cut: boolean };

/**
 * One list a part's asks made: its finished rows, written as they are, or
 * gathered from each group of a big website's pages first. `topLater`: rows
 * keyed by another page than the one asked — a page's next pages, asked by
 * the page after — whose top rows are chosen once every group is in.
 */
type PartList = {
  list: PageFactList;
  rows: ListRow[];
  flags: ListFlags;
  events?: readonly string[];
  which?: "NOW" | "BEFORE";
  topLater?: (row: ListRow) => number;
};

type Asking = { startDate: string; endDate: string; hostNames: string[]; countries?: string[]; device?: string };

/**
 * A big website's pages for one date range, device and country — every page
 * with an event in the dates — in groups of `size`, the addresses of one page
 * always in one group, so each group holds whole pages. Null to ask every
 * page at once: a website numbering `GROUP_PAGES` pages or fewer (no extra
 * ask), or with that few in the dates.
 */
async function pageGroupsOf(
  ctx: ActionCtx,
  session: Session,
  target: CollectTarget,
  lead: "pagePath" | "landingPage",
  asking: Asking,
  most: number,
  size: number,
): Promise<string[][] | null | GoogleFailure> {
  if ((await addressesOf(ctx, target.companyWebsiteId)).numbers.size <= most) return null;
  const listed = await ask(session, target.property!, { ...asking, dimensions: [lead], metrics: ["eventCount"] });
  if (!listed.ok) return listed;
  const paths = listed.rows.map((row) => row.keys[0] ?? "");
  if (paths.length <= most) return null;
  const refs = await refsOf(ctx, target, paths, lead === "landingPage");
  const byPage = new Map<string, string[]>();
  for (const path of paths) {
    const page = refs.get(path) ?? path;
    const held = byPage.get(page);
    if (held) held.push(path);
    else byPage.set(page, [path]);
  }
  const pages = [...byPage.values()];
  const groups: string[][] = [];
  for (let at = 0; at < pages.length; at += size) groups.push(pages.slice(at, at + size).flat());
  return groups;
}

/**
 * Each page's top rows of a list gathered from every group — rows keyed by
 * another page than the one asked — chosen a page at a time in key order, as
 * `topPerPage` chooses them from the whole list.
 */
function topEach(rows: CompactRows, measure: (row: ListRow) => number): CompactRows {
  const out = new CompactRows(rows.events);
  let page: string | null = null;
  let pageRows: ListRow[] = [];
  for (const row of rows.inKeyOrder()) {
    const at = splitChannelKey(row.key).channel;
    if (at !== page && pageRows.length > 0) {
      out.add(topPerPage(pageRows, measure));
      pageRows = [];
    }
    page = at;
    pageRows.push(row);
  }
  if (pageRows.length > 0) out.add(topPerPage(pageRows, measure));
  return out;
}

/**
 * One date range and device of the shared page lists — one part of them, or
 * all for a job booked before RR2 — each asked of Google once for every page,
 * or a group of a big website's pages at a time (`GROUP_PAGES`), numbered,
 * cut to each page's top rows and written. Every answer is added up as it
 * arrives, inside `HOLD_ROWS` (half of it, and groups of half as many pages,
 * on a careful second try).
 */
export async function collectPageLists(
  ctx: ActionCtx,
  session: Session,
  connectionId: Id<"googleAnalyticsConnections">,
  target: CollectTarget,
  job: PageListsJob,
  top: string,
  /**
   * The second try at these lists after the platform stopped them (collection-reliability-plan.md, RR1): smaller pieces.
   * `slots`: the step's own slots read, shared by the parts of one date range and device, read once for all of them;
   * `groups`: a big website's groups of pages, likewise.
   */
  how: {
    careful?: boolean;
    slots?: Map<string, Record<string, { slot: number; hash: string; from: string; to: string }>>;
    groups?: Map<string, string[][] | null>;
    /** Pages a group (`GROUP_PAGES`): fewer in a test, to see a small website asked in groups. */
    groupPages?: number;
  } = {},
): Promise<StepResult> {
  const range = periodRange(job.period, "NOW", top);
  // Google has sent none of the period yet: nothing to ask (its jobs are planned only once it has).
  if (!range) return { ok: true, rows: 0, requests: session.requests };
  const device = job.device || undefined;
  const property = target.property!;
  const country = job.country ?? "";
  const hold = how.careful ? HOLD_ROWS / 2 : HOLD_ROWS;
  // Another home country's lists (SF7): every ask filtered to it, the countries' list aside.
  const asking = country ? { ...target, country: countryIdOf(country) } : target;
  const base = { startDate: range.from, endDate: range.to, hostNames: target.addresses, countries: [asking.country], ...(device ? { device } : {}) };
  const failure = (answer: GoogleFailure): StepResult => failed(session, answer);
  // The slots of every part of this date range and device, read once a step and shared by its parts (RR2).
  const parts = job.part ? [job.part] : partsOf(job.device, job.country);
  const group = `${job.period}|${job.device}|${country}`;
  let slots = how.slots?.get(group);
  if (!slots) {
    const keys = partsOf(job.device, job.country).flatMap((part) => LISTS_OF_PART[part].map(([list, which]) => slotKey(list, job.period, which, job.device, country)));
    slots = await ctx.runQuery(internal.googleAnalyticsCollect.slotsOf, { companyWebsiteId: target.companyWebsiteId, keys }) as Record<string, { slot: number; hash: string; from: string; to: string }>;
    how.slots?.set(group, slots);
  }
  const held = slots;
  let total = 0;
  let cut = false;
  const slotOf = (list: PageFactList, which: "NOW" | "BEFORE") => slotKey(list, job.period, which, job.device, country);
  const datesOf = (which: "NOW" | "BEFORE") => (which === "NOW" ? range : periodRange(job.period, which, top) ?? range);
  const write = async (list: PageFactList, rows: ListRow[], flags: ListFlags, events: readonly string[] = [], which: "NOW" | "BEFORE" = "NOW") => {
    total += rows.length;
    cut ||= flags.cut;
    const key = slotOf(list, which);
    return await writeList(ctx, connectionId, target, list, key, rows, datesOf(which), flags, held[key], events);
  };
  // A list gathered from a big website's groups of pages: written whole, packed as `write` packs it.
  const writeGathered = async (list: PageFactList, rows: CompactRows, flags: ListFlags, which: "NOW" | "BEFORE" = "NOW") => {
    total += rows.size;
    cut ||= flags.cut;
    const key = slotOf(list, which);
    return await writeList(ctx, connectionId, target, list, key, { parts: rows.toParts() }, datesOf(which), flags, held[key]);
  };
  // A big website's groups of pages for this date range, device and country, asked once a step for its parts.
  const groupsFor = async (lead: "pagePath" | "landingPage", everyCountry = false) => {
    const key = `${group}|${lead}|${everyCountry}`;
    if (how.groups?.has(key)) return how.groups.get(key)!;
    const { countries: _countries, ...anyCountry } = base;
    const most = how.groupPages ?? GROUP_PAGES;
    const found = await pageGroupsOf(ctx, session, target, lead, everyCountry ? anyCountry : base, most, how.careful ? Math.ceil(most / 2) : most);
    if (found === null || Array.isArray(found)) how.groups?.set(key, found);
    return found;
  };
  const flagsOf = (answer: ListFlags) => ({ folded: answer.folded, thresholded: answer.thresholded, cut: answer.cut });
  const only = device ? { device } : {};
  const ended = () => ({ ok: true as const, rows: total, requests: session.requests, ...(cut ? { cut: true } : {}) });

  // A part's lists from one ask of every page, or of one group of a big website's pages (`pages`, of its lead dimension).
  const askPart = async (part: PageListPart, pages?: string[]): Promise<PartList[] | GoogleFailure> => {
    const onPages = (dimension: "pagePath" | "landingPage") => (pages ? { only: { dimension, values: pages } } : {});
    const onlyLanding = pages ? { ...only, landingPage: pages } : only;
    switch (part) {
      case "sources": {
        // A landing page by source and new or returning, with each key event and reading: its channels, sources and returning visitors.
        const sourceEvents = [...target.events, ...READ_EVENTS];
        // A channel's other sources kept as one row of that channel, and an AI assistant's never folded: channel sums stay whole.
        const sourceOther = (rest: string) => [factParts(rest)[0] ?? "", OTHER_ROWS, ""].join(PAGE_FACT_JOIN);
        const assistant = (rest: string) => assistantOf(factParts(rest)[1] ?? "") !== null;
        const sources = await askList(session, { ...asking, events: sourceEvents }, "landingSource", [], range, onlyLanding, { trim: trimTo((row) => row.visits, sourceOther, assistant, hold), hold });
        if (!sources.ok) return sources;
        const sourceRows = await numbered(ctx, target, [...sources.groups.values()].flat(), true);
        return [{ list: "landingSource", rows: topPerPage(sourceRows, (row) => row.visits, sourceOther, assistant), flags: sources.flags, events: sourceEvents }];
      }
      case "before": {
        // A page by the page before each view: the website's own pages by number, another website by its address, none.
        const beforeHeld = heldRows((row, one) => { row.views += one.values[0] ?? 0; }, trimTo((row) => row.views, undefined, undefined, hold), (one) => [one.keys[0] ?? "", beforeKey(one.keys[1] ?? "", target.addresses)], hold);
        const before = await ask(session, property, { ...base, ...onPages("pagePath"), dimensions: ["pagePath", "pageReferrer"], metrics: ["screenPageViews"] }, beforeHeld.sink);
        if (!before.ok) return before;
        const beforeRows = beforeHeld.rows();
        const ownBefore = beforeRows.map((row) => splitChannelKey(row.key).source).filter((rest) => rest.startsWith("page:")).map((rest) => rest.slice(5));
        const ownRefs = await refsOf(ctx, target, ownBefore, false);
        const byPage = await numbered(ctx, target, beforeRows, false);
        const referred = summedRows(byPage.map((row) => {
          const { channel: page, source: rest } = splitChannelKey(row.key);
          return rest.startsWith("page:") ? { ...row, key: channelKey(page, `page:${ownRefs.get(rest.slice(5)) ?? rest.slice(5)}`) } : row;
        }));
        // Read the other way: each of the website's pages by the pages viewed straight after it.
        const next = referred.flatMap((row) => {
          const { channel: page, source: rest } = splitChannelKey(row.key);
          return rest.startsWith("page:") ? [{ ...row, key: channelKey(rest.slice(5), page) }] : [];
        });
        return [
          { list: "pageReferrer", rows: topPerPage(referred, (row) => row.views), flags: flagsOf(before) },
          { list: "pageNext", rows: next, flags: flagsOf(before), topLater: (row) => row.views },
        ];
      }
      case "clicks": {
        // A page by the links out and downloads clicked on it.
        const clickHeld = heldRows((row, one) => {
          row.times = (row.times ?? 0) + (one.values[0] ?? 0);
          row.people += one.values[1] ?? 0;
        }, trimTo((row) => row.times ?? 0, undefined, undefined, hold), undefined, hold);
        const clicks = await ask(session, property, { ...base, ...onPages("pagePath"), dimensions: ["pagePath", "eventName", "linkUrl"], metrics: ["eventCount", "totalUsers"], eventNames: [...CLICK_EVENTS] }, clickHeld.sink);
        if (!clicks.ok) return clicks;
        return [{ list: "pageClicks", rows: topPerPage(await numbered(ctx, target, clickHeld.rows(), false), (row) => row.times ?? 0), flags: flagsOf(clicks) }];
      }
      case "who": {
        // A page's readers by age and gender, where Google can tell: added up as Google's answers arrive (RR2).
        const whoHeld = heldRows((row, one) => {
          row.people += one.values[0] ?? 0;
          row.views += one.values[1] ?? 0;
        }, trimTo((row) => row.people, undefined, undefined, hold), (one) => [one.keys[0] ?? "", (one.keys[1] ?? "").toLowerCase(), (one.keys[2] ?? "").toLowerCase()], hold);
        const who = await ask(session, property, { ...base, ...onPages("pagePath"), dimensions: ["pagePath", "userAgeBracket", "userGender"], metrics: ["totalUsers", "screenPageViews"] }, whoHeld.sink);
        if (!who.ok) return who;
        return [{ list: "pageWho", rows: await numbered(ctx, target, whoHeld.rows(), false), flags: flagsOf(who) }];
      }
      case "landedWho": {
        // The visits that started on a page by age and gender, with each key event: its conversions by each.
        const landedWho = await askList(session, asking, "landingWho", [], range, onlyLanding, { trim: trimTo((row) => row.visits, undefined, undefined, hold), hold });
        if (!landedWho.ok) return landedWho;
        const landedRows = [...landedWho.groups.values()].flat().map((row) => {
          const { channel: page, source: rest } = splitChannelKey(row.key);
          return { ...row, key: channelKey(page, factParts(rest).map((one) => one.toLowerCase()).join(PAGE_FACT_JOIN)) };
        });
        return [{ list: "landingWho", rows: await numbered(ctx, target, landedRows, true), flags: landedWho.flags, events: target.events }];
      }
      case "browser":
      case "system":
      case "interest": {
        // The visits that started on a page by the visitors' browser and operating system, with each key event, and by their
        // interests without them: Visitors' "where each kind of visitor lands" (ga-conversions-visitors-plan.md CV7, CV8).
        // Interests are among the 120 asks an hour Google allows of age, gender and interests, so they are asked once, not
        // twice with the key events: a night's run stays two hours (CV10).
        const list = part === "browser" ? "landingBrowser" : part === "system" ? "landingSystem" : "landingInterest";
        const events = part === "interest" ? [] : target.events;
        const asked = await askList(session, { ...asking, events: [...events] }, list, [], range, onlyLanding, { trim: trimTo((row) => row.visits, undefined, undefined, hold), hold });
        if (!asked.ok) return asked;
        return [{ list, rows: topPerPage(await numbered(ctx, target, [...asked.groups.values()].flat(), true), (row) => row.visits), flags: asked.flags, events }];
      }
      case "countries": {
        // A page's readers in every country, whatever the home country (PS8): asked with the main home country's lists alone.
        if (country) return [];
        const { countries: _countries, ...everyCountry } = base;
        const countryHeld = heldRows((row, one) => {
          row.people += one.values[0] ?? 0;
          row.views += one.values[1] ?? 0;
        }, trimTo((row) => row.people, undefined, undefined, hold), (one) => [one.keys[0] ?? "", (one.keys[1] ?? "").toUpperCase()], hold);
        const countries = await ask(session, property, { ...everyCountry, ...onPages("pagePath"), dimensions: ["pagePath", "countryId"], metrics: ["totalUsers", "screenPageViews"] }, countryHeld.sink);
        if (!countries.ok) return countries;
        return [{ list: "pageCountry", rows: topPerPage(await numbered(ctx, target, countryHeld.rows(), false), (row) => row.people), flags: flagsOf(countries) }];
      }
      case "seen": {
        // The pages the visits that started on a page saw, each by its number.
        const seen = await askList(session, { ...asking, events: [] }, "landingPagesSeen", [], range, onlyLanding, { trim: trimTo((row) => row.visits, undefined, undefined, hold), hold });
        if (!seen.ok) return seen;
        const seenRows = await numbered(ctx, target, [...seen.groups.values()].flat(), true);
        const seenRefs = await refsOf(ctx, target, seenRows.map((row) => splitChannelKey(row.key).source), false);
        const seenNumbered = summedRows(seenRows.map((row) => {
          const { channel: page, source: path } = splitChannelKey(row.key);
          return { ...row, key: channelKey(page, seenRefs.get(path) ?? path) };
        }));
        return [{ list: "landingPagesSeen", rows: topPerPage(seenNumbered, (row) => row.visits), flags: seen.flags }];
      }
      case "weekdays": {
        // A page's views by day of the week.
        const weekdays = await askList(session, { ...asking, events: [] }, "pageWeekday", [], range, pages ? { ...only, pagePath: pages } : only, { trim: trimTo((row) => row.views, undefined, undefined, hold), hold });
        if (!weekdays.ok) return weekdays;
        return [{ list: "pageWeekday", rows: await numbered(ctx, target, [...weekdays.groups.values()].flat(), false), flags: weekdays.flags }];
      }
      case "devices": {
        // A page's views on each device, whatever device is chosen: asked with every device's lists alone.
        if (device) return [];
        const deviceHeld = heldRows((row, one) => { row.views += one.values[0] ?? 0; }, trimTo((row) => row.views, undefined, undefined, hold), (one) => [one.keys[0] ?? "", (one.keys[1] ?? "").toLowerCase()], hold);
        const devices = await ask(session, property, { ...base, ...onPages("pagePath"), dimensions: ["pagePath", "deviceCategory"], metrics: ["screenPageViews"] }, deviceHeld.sink);
        if (!devices.ok) return devices;
        return [{ list: "pageDevice", rows: await numbered(ctx, target, deviceHeld.rows(), false), flags: flagsOf(devices) }];
      }
      case "eventsNow":
      case "eventsBefore": {
        // Each event by the pages it happened on and by what it was about — its link, file, words, depth or video — now and the
        // span before, for its own screen (SF15): an event's top 20 of each, the rest as one.
        const which = part === "eventsNow" ? "NOW" : "BEFORE";
        const details = [...new Set(Object.values(EVENT_DETAIL))];
        const dates = datesOf(which);
        const at = { ...base, startDate: dates.from, endDate: dates.to };
        const timesAndPeople = (row: ListRow, one: ReportRow) => {
          row.times = (row.times ?? 0) + (one.values[0] ?? 0);
          row.people += one.values[1] ?? 0;
        };
        const pageHeld = heldRows(timesAndPeople, trimTo((row) => row.times ?? 0, undefined, undefined, hold), undefined, hold);
        const pagesOf = await ask(session, property, { ...at, dimensions: ["eventName", "pagePath"], metrics: ["eventCount", "totalUsers"] }, pageHeld.sink);
        if (!pagesOf.ok) return pagesOf;
        const pageRows = pageHeld.rows();
        const refs = await refsOf(ctx, target, pageRows.map((row) => splitChannelKey(row.key).source), false);
        const byRef = summedRows(pageRows.map((row) => {
          const { channel: event, source: path } = splitChannelKey(row.key);
          return { ...row, key: channelKey(event, refs.get(path) ?? path) };
        }));
        // What each event was about, asked once for all of them: each row's own detail (`EVENT_DETAIL`), the others "(not set)".
        const aboutHeld = heldRows(timesAndPeople, trimTo((row) => row.times ?? 0, undefined, undefined, hold), (one) => {
          const event = one.keys[0] ?? "";
          return [event, one.keys[1 + details.indexOf(EVENT_DETAIL[event])] ?? ""];
        }, hold);
        const answer = await ask(session, property, { ...at, dimensions: ["eventName", ...details], metrics: ["eventCount", "totalUsers"], eventNames: Object.keys(EVENT_DETAIL) }, aboutHeld.sink);
        if (!answer.ok) return answer;
        return [
          { list: "eventPage", rows: topPerPage(byRef, (row) => row.times ?? 0), flags: flagsOf(pagesOf), which },
          { list: "eventDetail", rows: topPerPage(aboutHeld.rows(), (row) => row.times ?? 0), flags: flagsOf(answer), which },
        ];
      }
      case "flow":
        return [];
    }
  };

  for (const part of parts) {
    if (part === "flow") {
      // The website's flow from its landing pages (landing-pages-flow-plan.md LF5, §3b): a step of its own, so it can be filled alone.
      const flowStep = await collectFlowLists(ctx, session, connectionId, target, job, top, hold, () => groupsFor("landingPage"));
      if (!flowStep.result.ok) return flowStep.result;
      total += flowStep.result.rows;
      if (flowStep.ended) return ended();
      continue;
    }
    const lead = LEAD_OF_PART[part];
    const groups = lead ? await groupsFor(lead, part === "countries") : null;
    if (groups !== null && !Array.isArray(groups)) return failure(groups);
    if (groups === null) {
      const lists = await askPart(part);
      if (!Array.isArray(lists)) return failure(lists);
      // The website changed under a write: nothing more is written for it.
      for (const one of lists) {
        if (!(await write(one.list, one.topLater ? topPerPage(one.rows, one.topLater) : one.rows, one.flags, one.events, one.which))) return ended();
      }
      continue;
    }
    // A big website's pages a group at a time: each list's finished rows gathered small, and written whole once all are in.
    const gathered = new Map<PageFactList, Omit<PartList, "rows"> & { rows: CompactRows }>();
    for (const pages of groups) {
      const lists = await askPart(part, pages);
      if (!Array.isArray(lists)) return failure(lists);
      for (const one of lists) {
        const into = gathered.get(one.list) ?? { ...one, rows: new CompactRows(one.events ?? []), flags: { folded: false, thresholded: false, cut: false } };
        into.rows.add(one.rows);
        into.flags = { folded: into.flags.folded || one.flags.folded, thresholded: into.flags.thresholded || one.flags.thresholded, cut: into.flags.cut || one.flags.cut };
        gathered.set(one.list, into);
      }
    }
    for (const one of gathered.values()) {
      if (!(await writeGathered(one.list, one.topLater ? topEach(one.rows, one.topLater) : one.rows, one.flags, one.which))) return ended();
    }
  }
  return ended();
}

/**
 * The website's flow from its landing pages for one date range and device
 * (landing-pages-flow-plan.md LF5, §3b): the routes inside each landing page's
 * own visits, with the conversions made on the page each led to, kept as the
 * chart draws them; and each landing page's visits that went on, counted once
 * a visit, with the page most opened next. Part of every run's shared lists,
 * and asked alone when a website's flow is filled by itself. `ended`: the
 * website changed under it, so nothing more is written. A big website's
 * landing pages are asked a group at a time (`groups`, `GROUP_PAGES`), their
 * routes gathered small, and the flow worked out once from all of them: it
 * shows the busiest pages of the whole website.
 */
export async function collectFlowLists(
  ctx: ActionCtx,
  session: Session,
  connectionId: Id<"googleAnalyticsConnections">,
  target: CollectTarget,
  job: PageListsJob,
  top: string,
  hold: number = HOLD_ROWS,
  groups: () => Promise<string[][] | null | GoogleFailure> = async () => null,
): Promise<{ result: StepResult; ended: boolean }> {
  const range = periodRange(job.period, "NOW", top);
  if (!range) return { result: { ok: true, rows: 0, requests: session.requests }, ended: true };
  const device = job.device || undefined;
  const country = job.country ?? "";
  const asking = country ? { ...target, country: countryIdOf(country) } : target;
  const base = { startDate: range.from, endDate: range.to, hostNames: target.addresses, countries: [asking.country], ...(device ? { device } : {}) };
  const keys = (["landingFlow", "landingOnward"] as const).map((list) => slotKey(list, job.period, "NOW", job.device, country));
  const slots: Record<string, { slot: number; hash: string; from: string; to: string }> =
    await ctx.runQuery(internal.googleAnalyticsCollect.slotsOf, { companyWebsiteId: target.companyWebsiteId, keys });
  const pageGroups = await groups();
  if (pageGroups !== null && !Array.isArray(pageGroups)) return { result: failed(session, pageGroups), ended: false };
  // The routes, each landing page's busiest kept as Google's answers arrive (RR2): its arrivals always, the rest of its
  // smallest routes let go — they only ever reach the chart's "more" boxes. A landing page's routes are all in one group.
  const arrival = (rest: string) => !beforeKey(factParts(rest)[0] ?? "", target.addresses).startsWith("page:");
  const steps = new FlowSteps();
  const routeFlags = { folded: false, thresholded: false, cut: false };
  let onwardFlags = { folded: false, thresholded: false, cut: false };
  for (const pages of pageGroups ?? [undefined]) {
    const routes = await askList(session, asking, "landingFlow", [], range, { ...(device ? { device } : {}), ...(pages ? { landingPage: pages } : {}) }, { trim: trimTo((row) => row.visits, () => DROPPED_ROUTES, arrival, hold), hold });
    if (!routes.ok) return { result: failed(session, routes), ended: false };
    routeFlags.folded ||= routes.flags.folded;
    routeFlags.thresholded ||= routes.flags.thresholded;
    routeFlags.cut ||= routes.flags.cut;
    // Each landing page's visits that went on from each of the website's pages, added up as they arrive: another
    // website's address, or none, is never read.
    const onwardHeld = heldRows(
      (row, one) => { row.visits += one.values[0] ?? 0; },
      trimTo((row) => row.visits, undefined, undefined, hold),
      (one) => [one.keys[0] ?? "", beforeKey(one.keys[1] ?? "", target.addresses)],
      hold,
    );
    const onward = await ask(session, target.property!, { ...base, ...(pages ? { only: { dimension: "landingPage", values: pages } } : {}), dimensions: ["landingPage", "pageReferrer"], metrics: ["sessions"] }, onwardHeld.sink);
    if (!onward.ok) return { result: failed(session, onward), ended: false };
    onwardFlags = { folded: onwardFlags.folded || onward.folded, thresholded: onwardFlags.thresholded || onward.thresholded, cut: onwardFlags.cut || onward.cut };
    for (const row of [...routes.groups.values()].flat()) {
      if (splitChannelKey(row.key).source !== DROPPED_ROUTES) steps.addRoute(row, target.addresses);
    }
    for (const row of onwardHeld.rows()) {
      const { channel, source } = splitChannelKey(row.key);
      if (source.startsWith("page:")) steps.addOnward(channel, source, row.visits);
    }
  }
  const flow = await flowOf(ctx, target, steps);
  const rows = flow.flow.length + flow.onward.length;
  const done = (ended: boolean) => ({ result: { ok: true as const, rows, requests: session.requests }, ended });
  if (!(await writeList(ctx, connectionId, target, "landingFlow", keys[0], flow.flow, range, routeFlags, slots[keys[0]], target.events))) return done(true);
  if (!(await writeList(ctx, connectionId, target, "landingOnward", keys[1], flow.onward, range, onwardFlags, slots[keys[1]], []))) return done(true);
  return done(false);
}

/** A landing page's smallest routes, let go while its routes are read (RR2). */
const DROPPED_ROUTES = "(dropped)";

/** No conversions on a route: one map shared by every such route. */
const NO_COUNTS: ReadonlyMap<string, number> = new Map();

/**
 * Google's routes and onward visits as the flow takes them — by address, a
 * page's address held once however many routes name it — gathered from every
 * group of a big website's landing pages before the flow is worked out.
 */
class FlowSteps {
  private readonly texts = new Map<string, string>();
  readonly routes: Array<{ landing: string; before: string; page: string; visits: number; counts: ReadonlyMap<string, number> }> = [];
  readonly onward: Array<{ landing: string; before: string; visits: number }> = [];

  private once(text: string): string {
    const held = this.texts.get(text);
    if (held !== undefined) return held;
    this.texts.set(text, text);
    return text;
  }

  addRoute(row: ListRow, addresses: readonly string[]): void {
    const { channel: landing, source } = splitChannelKey(row.key);
    const [referrer = "", page = ""] = factParts(source);
    this.routes.push({ landing: this.once(landing), before: this.once(beforeKey(referrer, addresses)), page: this.once(page), visits: row.visits, counts: row.counts.size > 0 ? row.counts : NO_COUNTS });
  }

  addOnward(landing: string, before: string, visits: number): void {
    this.onward.push({ landing: this.once(landing), before: this.once(before), visits });
  }
}

/**
 * Google's routes and onward visits as the kept flow and each landing page's
 * onward row (`buildFlow`). A page is one number wherever it stands: Google
 * names a landing page without its slash and the same page, seen next,
 * with it, so a landing page takes its slashed page's number in the flow.
 * The onward rows keep the landing page's own number, as Landing pages' list
 * does, so the table finds them.
 */
async function flowOf(ctx: ActionCtx, target: CollectTarget, steps: FlowSteps) {
  const parts = steps.routes;
  const asked = steps.onward;
  const ownPath = (key: string) => (key.startsWith("page:") ? key.slice(5) : null);
  const pagePaths = new Set([
    ...parts.flatMap((one) => [one.page, ...(ownPath(one.before) !== null ? [ownPath(one.before)!] : [])]),
    ...asked.flatMap((one) => (ownPath(one.before) !== null ? [ownPath(one.before)!] : [])),
  ]);
  const landingPaths = [...new Set([...parts.map((one) => one.landing), ...asked.map((one) => one.landing)])];
  const asPage = (path: string) => (pagePaths.has(path) ? path : pagePaths.has(`${path}/`) ? `${path}/` : path);
  const pageRefs = await refsOf(ctx, target, [...new Set([...pagePaths, ...landingPaths.map(asPage)])], false);
  const landingRefs = await refsOf(ctx, target, landingPaths, true);
  const pageRef = (path: string) => pageRefs.get(path) ?? path;
  const flowLanding = (path: string) => pageRef(asPage(path));
  const before = (key: string) => (ownPath(key) !== null ? pageRef(ownPath(key)!) : "");
  const routes: Route[] = parts.map((one) => ({ landing: flowLanding(one.landing), before: before(one.before), page: pageRef(one.page), visits: one.visits, counts: one.counts }));
  const onward: Onward[] = asked.filter((one) => before(one.before) !== "").map((one) => ({ landing: flowLanding(one.landing), before: before(one.before), visits: one.visits }));
  const built = buildFlow(routes, onward);
  const flowRows = built.flow.map((row) => ({ ...emptyRow(channelKey(row.parts[0] ?? "", row.parts.slice(1).join(PAGE_FACT_JOIN))), visits: row.visits, times: row.times, counts: row.counts }));
  // Each landing page's onward row under its Landing pages number.
  const ownNumber = new Map(landingPaths.map((path) => [flowLanding(path), landingRefs.get(path) ?? path]));
  const onwardRowsKept = summedRows(built.onward.map((row) => ({ ...emptyRow(channelKey(ownNumber.get(row.landing) ?? row.landing, row.next)), visits: row.visits, times: row.times })));
  return { flow: flowRows, onward: onwardRowsKept };
}

/** Rows that share a key once numbered — a page Analytics names with and without its slash — added into one. */
function summedRows(rows: readonly ListRow[]): ListRow[] {
  const held = new Map<string, ListRow>();
  for (const row of rows) {
    const into = held.get(row.key);
    if (into) add(into, row);
    else held.set(row.key, { ...row, counts: new Map(row.counts), values: new Map(row.values) });
  }
  return [...held.values()];
}

/** One page's rows of a shared list, keyed by what follows the page, and whether Google held back small groups. */
export type PageRows = { rows: ListRow[]; thresholded: boolean };

/**
 * One page's rows of a shared list for a date range and device, read from
 * the parts its rows are in alone (`firstKey`) — or null when the list is
 * not built yet.
 */
export async function readPageRows(ctx: Reader, holdId: Id<"companyWebsites">, list: PageFactList, period: AnalyticsPeriod, device: string, page: string, which: AnalyticsWhich = "NOW", country = ""): Promise<PageRows | null> {
  const key = slotKey(list, period, which, device, country);
  const slot = await ctx.db
    .query("googleAnalyticsPeriodSlots")
    .withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", holdId).eq("key", key))
    .first();
  if (!slot) return null;
  const prefix = channelKey(page, "");
  // The part a page's first row is in, and any after it that start within the page.
  const first = await ctx.db
    .query("googleAnalyticsPeriods")
    .withIndex("by_hold_key_slot_first", (q) => q.eq("companyWebsiteId", holdId).eq("key", key).eq("slot", slot.slot).lte("firstKey", prefix))
    .order("desc")
    .first();
  const within = await ctx.db
    .query("googleAnalyticsPeriods")
    .withIndex("by_hold_key_slot_first", (q) => q.eq("companyWebsiteId", holdId).eq("key", key).eq("slot", slot.slot).gt("firstKey", prefix).lt("firstKey", `${prefix}￿`))
    .take(slot.parts);
  const parts = [...(first ? [first] : []), ...within];
  const rows = parts
    .flatMap((part) => unpackPart(part as PackedPart))
    .filter((row) => row.key.startsWith(prefix))
    .map((row) => ({ ...row, key: row.key.slice(prefix.length) }));
  return { rows, thresholded: slot.thresholded === true };
}
