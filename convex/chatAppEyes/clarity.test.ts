import { describe, expect, test } from "vitest";
import { expectEyeHolds } from "@/src/test/eyeHolds";
import { readFixture } from "@/src/test/readFixture";
import { CLARITY_RONINS_HOST, clarityAnswerOf, clarityWordsFor } from "@/src/test/clarityRonins";
import type { Id } from "../_generated/dataModel";
import type { CalendarPeriod } from "../utils/calendarPeriods";
import { errorsSees, overviewSees, pageSees, pagesSees } from "../utils/sees/eyeData/clarity";
import { findingWords } from "../utils/sees/findings";
import { pageDataFor } from "../utils/sees/pageData";
import { pageFindings } from "../utils/sees/pageFindings";
import { CLARITY_EYE_READS, CLARITY_EYES } from "./clarity";
import type { EyeAsk, EyeRun } from "./types";

/**
 * Microsoft Clarity's screens built on the server for a chat app's question (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md,
 * Option B) hand the eye exactly what the screens hand it, in the screens' own English words, and so find the screens'
 * own findings. The reads answer from Ronins' figures as its screens read them (`src/test/fixtures/roninsClarity*.json`),
 * the same the rules' test of every period reads (`convex/utils/sees/clarityFindingsPeriods.test.ts`).
 */

const fixtures: { overview: Record<string, unknown>; errors: Record<string, unknown>; pages: Record<string, unknown>; page: Record<string, Record<string, unknown>> } = {
  overview: readFixture("roninsClarityOverview"),
  errors: readFixture("roninsClarityErrors"),
  pages: readFixture("roninsClarityPages"),
  page: readFixture("roninsClarityPage"),
};
const SITE = "site" as Id<"companyWebsites">;
const PERIODS: readonly CalendarPeriod[] = ["lastWeek", "lastMonth", "last3Months", "last12Months"];
const SCREENS = ["clarity.overview", "clarity.errors", "clarity.pages", "clarity.page"] as const;
type Screen = (typeof SCREENS)[number];
/** The page a page's own screen is asked about: the home page, as a chat app might name it, by its whole address. */
const PAGE = "/";
const PAGE_KEY = `https://${CLARITY_RONINS_HOST}/`;

type Connection = { host: string; status: string; newestDay: string | null };
const CONNECTED: Connection = { host: CLARITY_RONINS_HOST, status: "CONNECTED", newestDay: "2026-11-03" };

/** A run answering each read from Ronins' figures, noting every read it was asked for. */
function runFor(period: CalendarPeriod, asked: Array<{ read: string; args: Record<string, unknown> }> = [], connection: Connection = CONNECTED): EyeRun {
  return async (read, args) => {
    asked.push({ read, args });
    if (read === "clarity.connection") return connection;
    if (read === "clarity.overview") return clarityAnswerOf(fixtures.overview, period);
    if (read === "clarity.errors") return clarityAnswerOf(fixtures.errors, period);
    if (read === "clarity.pagesList") return clarityAnswerOf(fixtures.pages, period);
    if (read === "clarity.page") return fixtures.page[String(args.page)] ? clarityAnswerOf(fixtures.page[String(args.page)], period) : null;
    throw new Error(`There's no read called ${read}.`);
  };
}

/** What each screen hands its eye, built as the screens build it, in the screens' own English words. */
function screenData(screen: Screen, period: CalendarPeriod): unknown {
  const words = clarityWordsFor(period);
  if (screen === "clarity.overview") return overviewSees(clarityAnswerOf(fixtures.overview, period), words);
  if (screen === "clarity.errors") return errorsSees(clarityAnswerOf(fixtures.errors, period), words);
  if (screen === "clarity.pages") return pagesSees(clarityAnswerOf(fixtures.pages, period), words);
  return pageSees(clarityAnswerOf(fixtures.page[PAGE], period), PAGE, words);
}

const build = (screen: Screen, period: CalendarPeriod, run: EyeRun = runFor(period)) => {
  const ask: EyeAsk = { siteId: SITE, period, ...(screen === "clarity.page" ? { key: PAGE_KEY } : {}) };
  return CLARITY_EYES[screen](run, ask);
};

describe("Microsoft Clarity's screens built for a chat app hand the eye what the screens hand it", () => {
  test("every screen with its own rules has a builder, and every read a builder asks for is a Clarity read", async () => {
    expect(Object.keys(CLARITY_EYES).sort()).toEqual([...SCREENS].sort());
    const asked: Array<{ read: string; args: Record<string, unknown> }> = [];
    for (const screen of SCREENS) await build(screen, "lastMonth", runFor("lastMonth", asked));
    for (const { read } of asked) {
      expect(read.startsWith("clarity."), read).toBe(true);
      expect(CLARITY_EYE_READS[read], read).toBeTypeOf("function");
    }
    // Every screen as it opens: every device, and Pages' table at its first 25 rows, the most visits first.
    expect(asked.every(({ args }) => args.device === undefined)).toBe(true);
    expect(asked.find((one) => one.read === "clarity.pagesList")?.args).toMatchObject({ sort: "visits", direction: "desc", page: 1, rows: 25 });
    // A page named by its whole address is read by its path, as Clarity keeps it.
    expect(asked.find((one) => one.read === "clarity.page")?.args).toMatchObject({ page: PAGE });
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

  test("a page's own screen needs the page", async () => {
    expect(await CLARITY_EYES["clarity.page"](runFor("lastMonth"), { siteId: SITE, period: "lastMonth" })).toBeNull();
  });

  test("nothing is built for a website Clarity has sent no day for", async () => {
    for (const screen of SCREENS) {
      expect(await build(screen, "lastMonth", runFor("lastMonth", [], { ...CONNECTED, newestDay: null })), screen).toBeNull();
    }
  });
});
