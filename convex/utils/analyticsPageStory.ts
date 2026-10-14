import { splitChannelKey, type ListRow } from "../googleAnalyticsLists";

/**
 * A page's story on its own All pages screen (docs/plans/active/analytics-page-screen-plan.md
 * §2, §4): what Google's answers, asked when the screen opens, come to. Pure
 * arithmetic over the rows each ask is held as, so every figure is worked out
 * the same way for the screen and Ask Hakken alike.
 *
 * Two scopes, never mixed (PS1): **views of this page** — its readers, their
 * devices, ages, days and clicks, how far they read and where they went
 * next — and **visits that started on this page**, which carry the
 * conversions they went on to make anywhere on the website, each source's
 * figures, and the pages those visits saw.
 */

/** A row's parts, joined into one key: a source and what it is split by (`source␞returning`). */
export const STORY_JOIN = "\u001e";

/** The two events that say how far a page was read: each view, and each reader past 90% down (`scroll`). */
export const READ_EVENTS = ["page_view", "scroll"] as const;

/** A click that leaves the website, and a file downloaded: Google counts no click between the website's own pages. */
export const CLICK_EVENTS = ["click", "file_download"] as const;

export { OTHER_ROWS } from "./analyticsSharedLists";
import { OTHER_ROWS } from "./analyticsSharedLists";

/** Google's own words for a figure it couldn't place: never one of the groups shown. */
const UNPLACED = new Set(["unknown", "(not set)", "", "(other)"]);

const share = (part: number, whole: number): number | null => (whole > 0 ? part / whole : null);

export function joined(...parts: string[]): string {
  return parts.join(STORY_JOIN);
}

export function splitJoined(key: string): string[] {
  return key.split(STORY_JOIN);
}

/**
 * Every address a view's page before may name for this page (`pageReferrer`
 * is the whole address): each of the website's addresses, https or http, the
 * path with its slash and without.
 */
export function referrerUrls(addresses: readonly string[], path: string): string[] {
  const bare = path.length > 1 ? path.replace(/\/+$/, "") : path;
  const paths = [...new Set([path, bare, bare === "/" ? "/" : `${bare}/`])];
  return [...new Set(addresses.flatMap((host) => ["https", "http"].flatMap((scheme) => paths.map((one) => `${scheme}://${host.toLowerCase()}${one}`))))];
}

/**
 * Different pages a visit, for visits that started here: each page a visit saw
 * counted once (Google's sessions by page, added up) over the visits. A page
 * Google counts several times in one visit — its contents links taken as new
 * views — is still one page (PS4).
 */
export function differentPages(pageVisits: number, visits: number): number | null {
  return visits > 0 ? Math.max(1, pageVisits / visits) : null;
}

/** The page's views a visit that saw it: 1 when each visit counts it once, more when Google counts it again. */
export function viewsPerVisit(views: number, visits: number): number | null {
  return visits > 0 ? views / visits : null;
}

/**
 * How far a page is read: its readers past 90% down (`scroll`) over the visits
 * that saw it — never over its views, which Google swells when it counts the
 * page again in one visit (PS4), at most all of them.
 */
export function readShare(rows: readonly ListRow[], visits: number): number | null {
  // Nothing answered: not known, never none read.
  if (rows.length === 0) return null;
  const scrolls = rows.filter((row) => row.key === "scroll").reduce((sum, row) => sum + (row.times ?? 0), 0);
  const read = share(scrolls, visits);
  return read === null ? null : Math.min(1, read);
}

export type NextStory = {
  /** The page viewed straight after, by its number; null for this page again, for none, or for the rest. */
  key: string | null;
  /** `others`: the pages past the 20 most viewed after it, added up (ga-stored-figures-plan.md SF14). */
  kind: "page" | "again" | "left" | "others";
  views: number;
  /** Of this page's views, 0–1. */
  share: number;
};

/**
 * Where a page's views led (§2, section 7): another of the website's pages
 * (its views whose page before was this one); this page again — its views
 * beyond one a visit, since Google keeps a repeat view's first page before
 * (§3); and none, worked out as the rest. Biggest first.
 */
export function nextOf(pageViews: number, visitsThatSaw: number, pages: readonly ListRow[]): NextStory[] {
  if (pageViews <= 0) return [];
  const onward = pages.filter((row) => row.views > 0 && row.key !== "(not set)" && row.key !== OTHER_ROWS);
  const others = pages.filter((row) => row.key === OTHER_ROWS).reduce((sum, row) => sum + row.views, 0);
  const again = Math.max(0, pageViews - visitsThatSaw);
  const ahead = onward.reduce((sum, row) => sum + row.views, 0) + others;
  const left = Math.max(0, pageViews - again - ahead);
  const rows: NextStory[] = [
    ...onward.map((row) => ({ key: row.key, kind: "page" as const, views: row.views, share: row.views / pageViews })),
    ...(others > 0 ? [{ key: null, kind: "others" as const, views: others, share: others / pageViews }] : []),
    ...(again > 0 ? [{ key: null, kind: "again" as const, views: again, share: again / pageViews }] : []),
    ...(left > 0 ? [{ key: null, kind: "left" as const, views: left, share: left / pageViews }] : []),
  ];
  return rows.sort((a, b) => b.views - a.views);
}

export type SourceStory = {
  /** The channel and source, as Google names them. */
  key: string;
  channel: string;
  /** Google's own name for the source (`google`, `(direct)`, `chatgpt.com`). */
  source: string;
  visits: number;
  /** Different pages a visit; null without the pages it saw. */
  pages: number | null;
  /** Seconds engaged a visit. */
  time: number | null;
  /** Its visits that read this page past 90% down, 0–1. */
  read: number | null;
  /** Its visits by people who had been before, 0–1. */
  back: number | null;
  conversions: number;
  value: number;
};

/**
 * Each source's visits that started here, one line each — never a group of
 * sources (PS2) — with the different pages they saw, the time they gave, how
 * far they read this page, how many came back, and the conversions they
 * went on to make. Busiest first.
 */
export function sourcesOf(
  channels: readonly ListRow[],
  pagesSeen: readonly ListRow[],
  back: readonly ListRow[],
  read: readonly ListRow[],
  money: (row: ListRow) => { conversions: number; value: number },
  /**
   * From the shared lists (ga-stored-figures-plan.md SF13): pages a visit as
   * Google counts them, and reading over the whole visit — a source's visits
   * are not kept by each page they saw, so a visit that reads two pages to
   * the end counts twice (at most all of them).
   */
  shared = false,
): SourceStory[] {
  const pageVisits = new Map(pagesSeen.map((row) => [row.key, row.visits]));
  const returning = new Map<string, { all: number; back: number }>();
  for (const row of back) {
    const [key, kind] = splitTail(row.key);
    const held = returning.get(key) ?? { all: 0, back: 0 };
    held.all += row.visits;
    if (kind === "returning") held.back += row.visits;
    returning.set(key, held);
  }
  const reads = new Map<string, ListRow[]>();
  for (const row of read) {
    const [key, event] = splitTail(row.key);
    reads.set(key, [...(reads.get(key) ?? []), { ...row, key: event }]);
  }
  return channels
    .filter((row) => row.visits > 0)
    .map((row) => {
      const { channel, source } = splitChannelKey(row.key);
      const came = returning.get(row.key);
      const { conversions, value } = money(row);
      return {
        key: row.key,
        channel,
        source,
        visits: row.visits,
        pages: shared ? viewsPerVisit(row.views, row.visits) : pageVisits.has(row.key) ? differentPages(pageVisits.get(row.key) ?? 0, row.visits) : null,
        time: row.visits > 0 ? row.seconds / row.visits : null,
        read: readShare(reads.get(row.key) ?? [], row.visits),
        back: came ? share(came.back, came.all) : null,
        conversions,
        value,
      };
    })
    .sort((a, b) => b.visits - a.visits || b.conversions - a.conversions);
}

/** A joined key's last part apart from the rest: `channel␟source␞returning` as the source's key and `returning`. */
function splitTail(key: string): [string, string] {
  const at = key.lastIndexOf(STORY_JOIN);
  return at < 0 ? [key, ""] : [key.slice(0, at), key.slice(at + STORY_JOIN.length)];
}

export type SplitStory = { key: string; count: number; share: number };

/** Rows by their key, Google's unplaced ones left out, with each one's share of those placed. Biggest first. */
export function placed(rows: ReadonlyArray<{ key: string; count: number }>): { rows: SplitStory[]; placed: number } {
  const kept = rows.filter((row) => !UNPLACED.has(row.key.toLowerCase()) && row.count > 0);
  const total = kept.reduce((sum, row) => sum + row.count, 0);
  return { rows: kept.map((row) => ({ ...row, share: total > 0 ? row.count / total : 0 })).sort((a, b) => b.count - a.count), placed: total };
}

/**
 * Who a page's readers are, by age or gender, where Google can tell (PS7):
 * each group's share of the readers it could place, beside the website's,
 * with the conversions from visits that started here in each group — and how
 * many readers, and conversions, it could place at all.
 */
export function whoOf(
  readers: ReadonlyArray<{ key: string; count: number }>,
  website: ReadonlyArray<{ key: string; count: number }>,
  converted: ReadonlyArray<{ key: string; count: number }>,
): {
  rows: Array<{ key: string; readers: number; share: number; websiteShare: number | null; conversions: number }>;
  readersPlaced: number;
  conversionsPlaced: number;
  conversions: number;
} {
  const own = placed(readers);
  const theirs = placed(website);
  const sites = new Map(theirs.rows.map((row) => [row.key, row.share]));
  const made = placed(converted);
  const madeBy = new Map(made.rows.map((row) => [row.key, row.count]));
  const keys = [...new Set([...own.rows.map((row) => row.key), ...made.rows.map((row) => row.key)])];
  const rows = keys.map((key) => {
    const readersHere = own.rows.find((row) => row.key === key)?.count ?? 0;
    return {
      key,
      readers: readersHere,
      share: own.placed > 0 ? readersHere / own.placed : 0,
      websiteShare: theirs.placed > 0 ? sites.get(key) ?? 0 : null,
      conversions: madeBy.get(key) ?? 0,
    };
  });
  return {
    rows: rows.sort((a, b) => a.key.localeCompare(b.key, "en", { numeric: true })),
    readersPlaced: own.placed,
    conversionsPlaced: made.placed,
    conversions: converted.reduce((sum, row) => sum + row.count, 0),
  };
}

/** The days of the week, Monday first, as Google numbers them (`dayOfWeek`: 0 is Sunday). */
export const WEEKDAYS = ["1", "2", "3", "4", "5", "6", "0"] as const;

export function weekdaysOf(rows: readonly ListRow[]): Array<{ day: string; views: number }> {
  const views = new Map(rows.map((row) => [row.key, row.views]));
  return WEEKDAYS.map((day) => ({ day, views: views.get(day) ?? 0 }));
}

/** Each device's share of views, beside the website's (`desktop`, `mobile`, `tablet`), biggest first. */
export function devicesOf(rows: readonly ListRow[], website: ReadonlyMap<string, number>): Array<{ device: string; share: number; websiteShare: number | null }> {
  const own = placed(rows.map((row) => ({ key: row.key, count: row.views })));
  const theirs = placed([...website.entries()].map(([key, count]) => ({ key, count })));
  const sites = new Map(theirs.rows.map((row) => [row.key, row.share]));
  return own.rows.map((row) => ({ device: row.key, share: row.share, websiteShare: theirs.placed > 0 ? sites.get(row.key) ?? 0 : null }));
}

/** The links out and downloads its readers clicked, by address, most first. */
export function clicksOf(rows: readonly ListRow[], most: number): Array<{ kind: "click" | "download"; url: string; clicks: number }> {
  return rows
    .map((row) => {
      const [event, url] = splitJoined(row.key);
      return { kind: event === "file_download" ? "download" as const : "click" as const, url: url ?? "", clicks: row.times ?? 0 };
    })
    .filter((row) => row.clicks > 0 && !UNPLACED.has(row.url))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, most);
}
