import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { pageNameOf } from "@/convex/utils/bingWebmasterSeen";
import { formatDay, formatShortDay } from "../../sites/_components/siteFormat";

/**
 * What each Bing Webmaster page hands its eye (ask-hakken-every-chart-page-plan-2026-11-03.md, section 7): the answers
 * that draw it, with every name a rule may say in the reader's words — a week as "Week of 26 Oct", a day as "14 Oct
 * 2026", Bing and Google as the page names them — and every money page, never only the first page of them. No React
 * here, so the rules' test builds the figures the way the pages do (`convex/utils/sees/bingPageFindings.test.ts`).
 */

type Performance = NonNullable<FunctionReturnType<typeof api.bingWebmasterReads.bingPerformance>>;
type Crawling = NonNullable<FunctionReturnType<typeof api.bingWebmasterReads.bingCrawling>>;
type RecordAnswer = NonNullable<FunctionReturnType<typeof api.bingWebmasterReads.bingRecord>>;

/** The reader's words for what the rules name, from the page's own translations. */
export type BingEyeNames = {
  bing: string;
  google: string;
  /** The span before, as the eye says it: "The period before". */
  before: string;
  /** The period chosen, as the menu says it: "Last month". */
  period: string;
  weekOf: (day: string) => string;
  topThree?: string;
  bingHigher?: string;
  googleHigher?: string;
  onlyBing?: string;
  inGoogleNotBing?: string;
  averageDay?: string;
  /** The home page, whose path "/" names nothing; a record's chart's newest six weeks, and the six before them. */
  home?: string;
  lastSixWeeks?: string;
  sixWeeksBefore?: string;
};

/** The names as figures carry them: words only. */
export function eyeWords(names: BingEyeNames): Record<string, string> {
  const { weekOf: _weekOf, ...words } = names;
  return Object.fromEntries(Object.entries(words).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

/** Performance's figures, each week named, with the names its rules say. */
export function performanceSeen(figures: Performance | null | undefined, names: BingEyeNames) {
  if (!figures) return figures;
  return { ...figures, weeks: figures.weeks.map((week) => ({ ...week, name: names.weekOf(formatShortDay(week.week)) })), names: eyeWords(names) };
}

/**
 * A list page's figures: its totals and weeks (`figures`, as `performanceSeen` shaped them), the page of the table on
 * screen (`list`), and the list read whole for the eye (`wholeList`, `bingListSeen`) — what moved, the engines' gaps,
 * each kind of page. Each part is handed as it came, so the eye works the page out again only when one changes.
 */
export function listSeen<List, Whole>(figures: ReturnType<typeof performanceSeen>, list: List, wholeList: Whole, words: Record<string, string>) {
  return { figures: figures ?? null, list, wholeList: wholeList ?? null, names: words };
}

/** Crawling's figures: each day named, and every money page by its name — the table shows them all, the eye too. */
export function crawlingSeen(crawling: Crawling | null | undefined, names: BingEyeNames) {
  if (!crawling) return crawling;
  const { pages, ...rest } = crawling;
  const moneyPages = Object.fromEntries(pages.map((page) => [
    pageNameOf(page.page, page.title),
    { inIndex: page.inIndex, lastRead: page.lastRead, googleIndexed: page.googleIndexed, googleLastRead: page.googleLastRead },
  ]));
  return { ...rest, days: crawling.days.map((day) => ({ ...day, name: formatDay(day.day) })), moneyPages, names: eyeWords(names) };
}

/** A keyword's or a page's own screen: its figures and weeks, its span before, and the rows Bing gave the screen. */
export function recordSeen(list: "query" | "page", record: RecordAnswer, rows: unknown, names: BingEyeNames) {
  return { list, record, rows: rows ?? null, names: eyeWords(names) };
}
