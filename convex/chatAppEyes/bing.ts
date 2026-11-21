import type { Id } from "../_generated/dataModel";
import { readBingCrawling, readBingListPage, readBingListSeen, readBingLiveRows, readBingPerformance, readBingRecord, readList } from "../bingWebmasterReads";
import type { BingPeriodArg } from "../bingWebmasterSchema";
import { findMySite, type SiteReader } from "../siteAccess";
import { pageNameOf } from "../utils/bingWebmasterSeen";
import { keywordMatch, pageRefOf } from "../utils/bingWebmasterWeeks";
import { bingEyeNamesFrom, crawlingSeen, eyeWords, listSeen, performanceSeen, recordSeen, type BingEyeNames } from "../utils/sees/eyeData/bing";
import { englishDay, englishShortDay } from "../utils/sees/eyeData/englishDays";
import { englishWords } from "../utils/sees/serverWords";
import type { EyeBuilder, EyeBuilders, EyeReads, EyeRun } from "./types";

/**
 * Bing Webmaster's screens for a chat app's question, built as the screens build them
 * (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, Option B). The pattern is
 * Google Analytics Overview's (`googleAnalytics.ts`): the screens' own reader
 * helpers as reads, the screen's own pure figures function, English words from
 * `messages/en.json` (`utils/sees/serverWords.ts`).
 *
 * Only what's saved is read. A keyword's or a page's own screen asks Bing for its
 * pages or keywords as it opens (`askBingLive`); here only the rows an earlier
 * opening saved are read, so before any opening the eye has the record's own
 * figures without them.
 */

/** The connection's parts the screens' gate reads (`hasFigures`, useBing.ts): its newest day and week, and whether it's being chosen or cleared. */
async function connectionForEye(reader: SiteReader, args: Record<string, unknown>) {
  const site = await findMySite(reader, args.siteId as Id<"companyWebsites">);
  if (!site) return null;
  const connection = await reader.db.query("bingConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", site.hold._id)).first();
  if (!connection) return null;
  return { status: connection.status, newestDay: connection.newestDay ?? null, newestWeek: connection.newestWeek ?? null, clearing: connection.clearing === true };
}

/** A page's path for matching: "/door-handles" whether it came as a path or a whole address, without a closing slash. */
function pathFor(address: string): string {
  const path = pageNameOf(address.trim()).toLowerCase();
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

/**
 * A keyword's or a page's own screen's address, from its words or its address as a chat app names it: the keyword's place
 * in the website's Bing book, or the page's reference. The list's own search finds the candidates, as the screen's search
 * box does, and only the one named exactly is taken. Null when the list holds no such keyword or page.
 */
async function recordRefFor(reader: SiteReader, args: Record<string, unknown>) {
  const site = await findMySite(reader, args.siteId as Id<"companyWebsites">);
  const key = typeof args.key === "string" ? args.key.trim() : "";
  if (!site || !key) return null;
  const list = args.list === "page" ? "page" : "query";
  const read = await readList(reader, site.hold._id, { list, period: args.period as BingPeriodArg, q: list === "page" ? pathFor(key) : key });
  const same = list === "page" ? (name: string) => pathFor(name) === pathFor(key) : (name: string) => keywordMatch(name) === keywordMatch(key);
  const row = read.rows.find((one) => same(read.names?.get(one.number) ?? ""));
  return row ? (list === "page" ? pageRefOf(row.number) : String(row.number)) : null;
}

export const BING_EYE_READS: EyeReads = {
  "bing.connection": connectionForEye,
  "bing.recordRef": recordRefFor,
  "bing.performance": (reader, args) => readBingPerformance(reader, args as never),
  "bing.listPage": (reader, args) => readBingListPage(reader, args as never),
  "bing.listSeen": (reader, args) => readBingListSeen(reader, args as never),
  "bing.crawling": (reader, args) => readBingCrawling(reader, args as never),
  "bing.record": (reader, args) => readBingRecord(reader, args as never),
  "bing.liveRows": (reader, args) => readBingLiveRows(reader, args as never),
};

type Connection = NonNullable<Awaited<ReturnType<typeof connectionForEye>>>;
type Performance = Awaited<ReturnType<typeof readBingPerformance>>;
type ListPage = Awaited<ReturnType<typeof readBingListPage>>;
type ListSeen = Awaited<ReturnType<typeof readBingListSeen>>;
type Crawling = Awaited<ReturnType<typeof readBingCrawling>>;
type RecordAnswer = Awaited<ReturnType<typeof readBingRecord>>;

/** Whether the screens show figures at all, as their gate does (`hasFigures`, useBing.ts): Bing has sent a day, and nothing is being chosen or cleared. */
const hasFigures = (connection: Connection | null): connection is Connection =>
  Boolean(connection?.newestDay) && connection?.status !== "CHOOSING" && !connection?.clearing;

/** The English names the rules say, for the period chosen. */
function englishNames(period: string): BingEyeNames {
  return bingEyeNamesFrom(
    { chart: englishWords("bingWebmaster.chart"), eye: englishWords("bingWebmaster.seen.eye"), versus: englishWords("bingWebmaster.versus"), periods: englishWords("common.periods") },
    period,
    { day: englishDay, shortDay: englishShortDay },
  );
}

/** The table's first page as it opens: 25 rows (`SITE_DEFAULT_ROWS`), the most clicks first, or on Bing against Google the widest gap. */
const openingTable = (list: "query" | "page", sort: "clicks" | "gap") => ({ list, sort, direction: "desc", page: 1, rows: 25 });

/**
 * A list page (Keywords, Pages, Bing against Google): its totals and weeks, the table's first page as it opens, and the
 * list read whole for the eye. The screen hands its eye once the table's page is in; Bing against Google once Bing's
 * totals are too.
 */
function listScreen(list: "query" | "page", sort: "clicks" | "gap", needsTotals = false): EyeBuilder {
  return async (run: EyeRun, { siteId, period }) => {
    const connection = await run("bing.connection", { siteId }) as Connection | null;
    if (!hasFigures(connection)) return null;
    const [figures, answer, whole] = await Promise.all([
      run("bing.performance", { siteId, period }) as Promise<Performance>,
      run("bing.listPage", { siteId, period, ...openingTable(list, sort) }) as Promise<ListPage>,
      connection.newestWeek ? run("bing.listSeen", { siteId, list, period }) as Promise<ListSeen> : Promise.resolve(null),
    ]);
    // A list still being built shows as loading (`useSiteListPage`), with no eye.
    if (!answer || answer.preparing || (needsTotals && !figures?.totals)) return null;
    const names = englishNames(period);
    return listSeen(performanceSeen(figures, names), answer, whole, eyeWords(names));
  };
}

/** A keyword's or a page's own screen, the keyword's words or the page's address as `ask.key`. */
function recordScreen(list: "query" | "page"): EyeBuilder {
  return async (run, { siteId, period, key }) => {
    if (!key) return null;
    const connection = await run("bing.connection", { siteId }) as Connection | null;
    if (!hasFigures(connection)) return null;
    const ref = await run("bing.recordRef", { siteId, list, period, key }) as string | null;
    if (!ref) return null;
    const record = await run("bing.record", { siteId, list, ref, period }) as RecordAnswer;
    // The screen hands its eye once the record has figures for the period.
    if (!record?.figures) return null;
    const ask = `${list === "query" ? "keywordPages" : "pageKeywords"}|${record.key}`.slice(0, 900);
    const rows = await run("bing.liveRows", { siteId, ask });
    return recordSeen(list, record, rows, englishNames(period));
  };
}

export const BING_EYES: EyeBuilders = {
  /** Performance (`bing-webmaster/[siteId]/page.tsx`). */
  "bing.performance": async (run, { siteId, period }) => {
    const connection = await run("bing.connection", { siteId }) as Connection | null;
    if (!hasFigures(connection)) return null;
    const figures = await run("bing.performance", { siteId, period }) as Performance;
    if (!figures?.totals) return null;
    return performanceSeen(figures, englishNames(period));
  },
  /** Keywords (`keywords/page.tsx`). */
  "bing.keywords": listScreen("query", "clicks"),
  /** Pages (`pages/page.tsx`). */
  "bing.pages": listScreen("page", "clicks"),
  /** Bing against Google (`against-google/page.tsx`): the keyword list, the widest gap first. */
  "bing.versus": listScreen("query", "gap", true),
  /** Crawling and indexing (`crawling/page.tsx`). */
  "bing.crawling": async (run, { siteId, period }) => {
    const connection = await run("bing.connection", { siteId }) as Connection | null;
    if (!hasFigures(connection)) return null;
    const crawling = await run("bing.crawling", { siteId, period }) as Crawling;
    if (!crawling) return null;
    return crawlingSeen(crawling, englishNames(period));
  },
  /** A keyword's own screen (`keywords/keyword/page.tsx`, `BingRecordScreen`). */
  "bing.keyword": recordScreen("query"),
  /** A page's own screen (`pages/page/page.tsx`, `BingRecordScreen`). */
  "bing.page": recordScreen("page"),
};
