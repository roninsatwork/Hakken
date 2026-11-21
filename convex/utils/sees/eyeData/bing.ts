import { pageNameOf } from "../../bingWebmasterSeen";

/**
 * What each Bing Webmaster page hands its eye (ask-hakken-every-chart-page-plan-2026-11-03.md, section 7), built in one
 * place for the screens and for a chat app's question (`chatAppEyes/bing.ts`), so the two can't disagree
 * (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, Option B). The answers that draw each page come in, with every name a
 * rule may say in the reader's words: a week as "Week of 26 Oct", a day as "14 Oct 2026", Bing and Google as the page
 * names them, and every money page, never only the first page of them. The rules' test builds the figures the same way
 * (`convex/utils/sees/bingPageFindings.test.ts`).
 */

/** The reader's words for what the rules name, from the page's own translations (or English, on the server). */
export type BingEyeNames = {
  bing: string;
  google: string;
  /** The span before, as the eye says it: "The period before". */
  before: string;
  /** The period chosen, as the menu says it: "Last month". */
  period: string;
  /** A week by its Monday, written as `shortDay` writes it: "Week of 26 Oct". */
  weekOf: (day: string) => string;
  /** A day as the screens write it in the reader's language: "14 Oct 2026". */
  day: (day: string) => string;
  /** A day without its year, as a chart's axis writes it: "26 Oct". */
  shortDay: (day: string) => string;
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

/** A namespace's words: the screens' `useTranslations`, or the server's `englishWords`. */
type Words = (key: string, values?: Record<string, string | number>) => string;

const capital = (words: string) => words.charAt(0).toLocaleUpperCase() + words.slice(1);

/**
 * The names the rules say, from the section's own words: Bing and Google as the charts name them, the span before and
 * the period chosen as the dates menu says them, a week, and the boxes' own labels. `chosen`: the menu's period, or
 * `custom`.
 */
export function bingEyeNamesFrom(
  t: { chart: Words; eye: Words; versus: Words; periods: Words },
  chosen: string,
  days: { day: (day: string) => string; shortDay: (day: string) => string },
): BingEyeNames {
  return {
    bing: t.chart("bing"),
    google: t.chart("google"),
    // "The month before", "The same days last week": the span before as the dates menu says it, starting a sentence.
    before: capital(t.periods(`before.${chosen}`)),
    period: chosen === "custom" ? t.periods("customName") : t.periods(chosen),
    weekOf: (day) => t.eye("weekOf", { day }),
    day: days.day,
    shortDay: days.shortDay,
    topThree: t.eye("topThree"),
    bingHigher: t.versus("bingHigher"),
    googleHigher: t.versus("googleHigher"),
    onlyBing: t.versus("onlyBing"),
    inGoogleNotBing: t.eye("inGoogleNotBing"),
    averageDay: t.eye("averageDay"),
    home: t.eye("home"),
    lastSixWeeks: t.eye("lastSixWeeks"),
    sixWeeksBefore: t.eye("sixWeeksBefore"),
  };
}

/** The names as figures carry them: words only. */
export function eyeWords(names: BingEyeNames): Record<string, string> {
  return Object.fromEntries(Object.entries(names).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

/** Performance's figures (`bingPerformance`), each week named, with the names its rules say. */
export function performanceSeen<Figures extends { weeks: ReadonlyArray<{ week: string }> }>(figures: Figures | null | undefined, names: BingEyeNames) {
  if (!figures) return figures;
  return { ...figures, weeks: figures.weeks.map((week) => ({ ...week, name: names.weekOf(names.shortDay(week.week)) })), names: eyeWords(names) };
}

/**
 * A list page's figures: its totals and weeks (`figures`, as `performanceSeen` shaped them), the page of the table on
 * screen (`list`), and the list read whole for the eye (`wholeList`, `bingListSeen`) — what moved, the engines' gaps,
 * each kind of page. Each part is handed as it came, so the eye works the page out again only when one changes.
 */
export function listSeen<Figures, List, Whole>(figures: Figures | null | undefined, list: List, wholeList: Whole | null | undefined, words: Record<string, string>) {
  return { figures: figures ?? null, list, wholeList: wholeList ?? null, names: words };
}

type MoneyPage = { page: string; title: string | null; inIndex: boolean | null; lastRead: string | null; googleIndexed: boolean | null; googleLastRead: string | null };

/** Crawling's figures (`bingCrawling`): each day named, and every money page by its name — the table shows them all, the eye too. */
export function crawlingSeen<Crawling extends { days: ReadonlyArray<{ day: string }>; pages: ReadonlyArray<MoneyPage> }>(crawling: Crawling | null | undefined, names: BingEyeNames) {
  if (!crawling) return crawling;
  const { pages, ...rest } = crawling;
  const moneyPages = Object.fromEntries(pages.map((page) => [
    pageNameOf(page.page, page.title),
    { inIndex: page.inIndex, lastRead: page.lastRead, googleIndexed: page.googleIndexed, googleLastRead: page.googleLastRead },
  ]));
  return { ...rest, days: crawling.days.map((day) => ({ ...day, name: names.day(day.day) })), moneyPages, names: eyeWords(names) };
}

/** A keyword's or a page's own screen (`bingRecord`): its figures and weeks, its span before, and the rows Bing gave the screen. */
export function recordSeen<Answer>(list: "query" | "page", record: Answer, rows: unknown, names: BingEyeNames) {
  return { list, record, rows: rows ?? null, names: eyeWords(names) };
}
