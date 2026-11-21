import { describe, expect, test } from "vitest";
import { expectEyeHolds } from "@/src/test/eyeHolds";
import { readFixture } from "@/src/test/readFixture";
import { bingByHandReads, bingNamesFor, type BingByHandFixture } from "@/src/test/bingByHand";
import type { Id } from "../_generated/dataModel";
import type { CalendarPeriod } from "../utils/calendarPeriods";
import { crawlingSeen, eyeWords, listSeen, performanceSeen, recordSeen } from "../utils/sees/eyeData/bing";
import { findingWords } from "../utils/sees/findings";
import { pageDataFor } from "../utils/sees/pageData";
import { pageFindings } from "../utils/sees/pageFindings";
import { BING_EYE_READS, BING_EYES } from "./bing";
import type { EyeAsk, EyeRun } from "./types";

/**
 * Bing Webmaster's screens built on the server for a chat app's question (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md,
 * Option B) hand the eye exactly what the screens hand it, and so find the screens' own findings. No website on dev has
 * Bing connected (21 November 2026), so the reads answer from the figures written by hand for a shop like More Handles
 * (`src/test/fixtures/bingMoreHandlesByHand.json`, shaped as each read answers by `src/test/bingByHand.ts`), the same the
 * rules' test of every period reads (`convex/utils/sees/bingPageFindings.test.ts`).
 */

const byHand: BingByHandFixture = readFixture("bingMoreHandlesByHand");
const reads = bingByHandReads(byHand);
const SITE = "site" as Id<"companyWebsites">;
const PERIODS: readonly CalendarPeriod[] = ["lastWeek", "lastMonth", "last3Months", "last12Months"];
const SCREENS = ["bing.performance", "bing.keywords", "bing.pages", "bing.versus", "bing.crawling", "bing.keyword", "bing.page"] as const;
type Screen = (typeof SCREENS)[number];

type Connection = { status: string; newestDay: string | null; newestWeek: string | null; clearing: boolean };
const CONNECTED: Connection = { status: "CONNECTED", newestDay: "2026-11-03", newestWeek: "2026-11-01", clearing: false };

/** A run answering each read from the figures by hand, noting every read it was asked for. */
function runFor(period: CalendarPeriod, asked: Array<{ read: string; args: Record<string, unknown> }> = [], connection: Connection = CONNECTED): EyeRun {
  const { keywords, pages } = reads.PERIODS[period];
  return async (read, args) => {
    asked.push({ read, args });
    // A record's rows are asked for by what its screen asked Bing: "pageKeywords|<address>" or "keywordPages|<keyword>".
    const list = args.list === "page" || String(args.ask ?? "").startsWith("pageKeywords|") ? "page" : "query";
    const figures = list === "page" ? pages : keywords;
    const record = reads.recordOf(period, list);
    if (read === "bing.connection") return connection;
    if (read === "bing.performance") return reads.performanceOf(period);
    if (read === "bing.crawling") return reads.crawlingOf(period);
    if (read === "bing.listSeen") return reads.wholeListOf(figures, list);
    if (read === "bing.listPage") return reads.tablePageOf(figures, list, args.sort === "gap") ?? null;
    if (read === "bing.recordRef") return record && record.key === args.key ? record.ref : null;
    if (read === "bing.record") return record && record.ref === args.ref ? record.record : null;
    if (read === "bing.liveRows") return record && args.ask === `${list === "page" ? "pageKeywords" : "keywordPages"}|${record.key}` ? record.rows : null;
    throw new Error(`There's no read called ${read}.`);
  };
}

/** The keyword's words and the page's address written by hand: what a chat app names a record's screen by. */
function keyFor(screen: Screen, period: CalendarPeriod): string | undefined {
  if (screen === "bing.keyword") return reads.recordOf(period, "query")?.key;
  if (screen === "bing.page") return reads.recordOf(period, "page")?.key;
  return undefined;
}

/** What each page hands its eye, built as the screens build it, in the screens' own English names. */
function screenData(screen: Screen, period: CalendarPeriod): unknown {
  const names = bingNamesFor(period);
  const figures = performanceSeen(reads.performanceOf(period), names);
  const words = eyeWords(names);
  const { keywords, pages } = reads.PERIODS[period];
  const record = (list: "query" | "page") => {
    const answer = reads.recordOf(period, list);
    return answer ? recordSeen(list, answer.record, answer.rows, names) : null;
  };
  switch (screen) {
    case "bing.performance": return figures;
    case "bing.keywords": return listSeen(figures, reads.tablePageOf(keywords, "query"), reads.wholeListOf(keywords, "query"), words);
    case "bing.pages": return listSeen(figures, reads.tablePageOf(pages, "page"), reads.wholeListOf(pages, "page"), words);
    case "bing.versus": return listSeen(figures, reads.tablePageOf(keywords, "query", true), reads.wholeListOf(keywords, "query"), words);
    case "bing.crawling": return crawlingSeen(reads.crawlingOf(period), names);
    case "bing.keyword": return record("query");
    case "bing.page": return record("page");
  }
}

const build = (screen: Screen, period: CalendarPeriod, run: EyeRun = runFor(period)) => {
  const key = keyFor(screen, period);
  const ask: EyeAsk = { siteId: SITE, period, ...(key ? { key } : {}) };
  return BING_EYES[screen](run, ask);
};

describe("Bing Webmaster's screens built for a chat app hand the eye what the screens hand it", () => {
  test("every screen with its own rules has a builder, and every read a builder asks for is a Bing read", async () => {
    expect(Object.keys(BING_EYES).sort()).toEqual([...SCREENS].sort());
    const asked: Array<{ read: string; args: Record<string, unknown> }> = [];
    for (const screen of SCREENS) await build(screen, "lastMonth", runFor("lastMonth", asked));
    for (const { read } of asked) {
      expect(read.startsWith("bing."), read).toBe(true);
      expect(BING_EYE_READS[read], read).toBeTypeOf("function");
    }
    // Each list as its table opens: the first 25 rows, the most clicks first, or on Bing against Google the widest gap.
    const tables = asked.filter((one) => one.read === "bing.listPage").map((one) => one.args);
    expect(tables).toContainEqual(expect.objectContaining({ list: "query", sort: "clicks", direction: "desc", page: 1, rows: 25 }));
    expect(tables).toContainEqual(expect.objectContaining({ list: "page", sort: "clicks", direction: "desc", page: 1, rows: 25 }));
    expect(tables).toContainEqual(expect.objectContaining({ list: "query", sort: "gap", direction: "desc", page: 1, rows: 25 }));
  });

  for (const period of PERIODS) {
    test(period, async () => {
      for (const screen of SCREENS) {
        const data = await build(screen, period);
        expect(data, `${screen} on ${period}`).toEqual(screenData(screen, period));
        expectEyeHolds(screen, data);
        const said = pageFindings(screen, pageDataFor(data, screen)).map(findingWords);
        expect(said.length, `${screen} on ${period} found nothing`).toBeGreaterThan(0);
      }
    });
  }

  test("a keyword's and a page's own screens need the keyword or the page, and one the list holds", async () => {
    for (const screen of ["bing.keyword", "bing.page"] as const) {
      expect(await BING_EYES[screen](runFor("lastMonth"), { siteId: SITE, period: "lastMonth" })).toBeNull();
      expect(await BING_EYES[screen](runFor("lastMonth"), { siteId: SITE, period: "lastMonth", key: "a keyword nobody searched" })).toBeNull();
    }
  });

  test("nothing is built while Bing has sent no day, or the website is being chosen or cleared, as the screens show no figures then", async () => {
    const quiet: Connection[] = [
      { ...CONNECTED, newestDay: null, newestWeek: null },
      { ...CONNECTED, status: "CHOOSING" },
      { ...CONNECTED, clearing: true },
    ];
    for (const connection of quiet) {
      for (const screen of SCREENS) expect(await build(screen, "lastMonth", runFor("lastMonth", [], connection)), screen).toBeNull();
    }
  });
});
