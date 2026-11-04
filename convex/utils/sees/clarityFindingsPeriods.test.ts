import { describe, expect, test } from "vitest";
import { readFixture } from "@/src/test/readFixture";
import en from "@/messages/en.json";
import { errorsSees, overviewSees, pageSees, pagesSees, sourceNameOf, type ClaritySeesWords } from "@/src/app/(dashboard)/app/clarity/_components/claritySees";
import { formatDay } from "@/src/app/(dashboard)/app/sites/_components/siteFormat";
import { findingWords, type Finding } from "./findings";
import { pageDataFor } from "./pageData";
import { pageFindings } from "./pageFindings";

const overviewFixture = readFixture("roninsClarityOverview");
const errorsFixture = readFixture("roninsClarityErrors");
const pagesFixture = readFixture("roninsClarityPages");
const pageFixture = readFixture("roninsClarityPage");

/**
 * Microsoft Clarity's own findings on every period the date menu offers, on Ronins' own figures as its screens read
 * them on 3 November 2026 (ask-hakken-every-chart-page-plan-2026-11-03.md, section 8; Anthony, 2026-11-03: "we have a
 * date selection picker FFS … please add this to your tests"). Ronins is the only website with Clarity connected.
 *
 * Clarity keeps fewer days than Google Analytics: Ronins' begin on 11 October 2026, so only This week and Last week have
 * a span before (26 October; 19 to 25 October). On the other five there is none, and no finding may claim a change;
 * Last 3, 6 and 12 months hold the same 22 days. Ronins' errors are few — six visits in those 22 days, none this week —
 * so Errors says what is there and nothing more: on a span with no error it says nothing at all.
 */

type Period = "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth" | "last3Months" | "last6Months" | "last12Months";
const PERIODS: readonly Period[] = ["thisWeek", "lastWeek", "thisMonth", "lastMonth", "last3Months", "last6Months", "last12Months"];
/** The periods Clarity holds a span before for, on Ronins' figures. */
const WITH_BEFORE: readonly Period[] = ["thisWeek", "lastWeek"];

type Stored = Record<string, unknown> & { sameAs?: string; expected?: number; period?: Record<string, unknown> };
/** A period's answer as stored: the long periods hold the 3 months' days, with their own "days expected". */
function answerOf(fixture: Record<string, unknown>, period: Period): never {
  const stored = fixture[period] as Stored;
  if (!stored.sameAs) return stored as never;
  const same = fixture[stored.sameAs] as Stored;
  return { ...same, period: { ...same.period, expected: stored.expected } } as never;
}

const capital = (words: string) => `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
const DEVICES = en.clarity.devices as Record<string, string>;

/** The screens' own English words, as `useClaritySeesWords` builds them. */
function wordsFor(period: Period): ClaritySeesWords {
  const device = (code: string) => DEVICES[code] ?? DEVICES.Other;
  return {
    website: en.clarity.common.eye.website,
    before: capital(en.common.periods.before[period]),
    device,
    source: (source) => sourceNameOf(source, "www.agency.test", { direct: en.clarity.sources.direct, own: en.clarity.sources.own }),
    ownSource: en.clarity.sources.own,
    group: (kind, name) => name ?? (kind === "NOT_SORTED" ? null : kind),
    low: en.clarity.common.eye.low,
    otherSources: en.clarity.common.eye.otherSources,
    day: formatDay,
    days: en.clarity.common.eye.days,
    where: (browser, code) => en.clarity.common.browserOn.replace("{browser}", browser).replace("{device}", device(code).toLowerCase()),
  };
}

function said(screen: string, data: unknown): { findings: Finding[]; words: string[] } {
  const findings = pageFindings(screen, pageDataFor(data, screen));
  const words = findings.map(findingWords);
  return { findings, words };
}

/**
 * Never trivia, housekeeping or money: no page, group, source or browser "holding" the visits (only the pages scrolled
 * less than a quarter of the way, a share the screen itself filters by), no pages not sorted yet, no conversions or Google.
 */
function plain(words: readonly string[], findings: readonly Finding[] = []) {
  const all = words.join("\n");
  expect(all).not.toMatch(/Not sorted/i);
  expect(all).not.toMatch(/conversion|enquir|purchase|revenue|£|\$|€|ranking|search results/i);
  expect(findings.filter((one) => one.kind === "holdsMost" && one.params.measure === "visits" && !one.id.startsWith("holdsMost:low:")).map(findingWords), all).toEqual([]);
}

/** A finding that claims a change against the span before: on a period Clarity holds none for, never. */
const claimsBefore = (finding: Finding) => /before|last week|last month/i.test(String(finding.params.other ?? "")) || finding.kind === "shareMoved" || finding.kind === "newLost" || finding.kind === "movedUp" || finding.kind === "movedDown";

/** How many each page finds on each period, as Ronins' figures stand: each low count said with why. */
const FOUND: Record<string, Partial<Record<Period, number>>> = {
  // One day, and two days, of about 70 and 99 visits: no gap is past chance (a day's scroll moves ten points on its own).
  // Last week: the website's scroll and two page groups' against the week before; phones' 20 visits are too few.
  "clarity.overview": { thisWeek: 0, lastWeek: 3, thisMonth: 0, lastMonth: 5, last3Months: 5 },
  // One visit hit an error last week, six in all the 22 days, none in November.
  "clarity.errors": { thisWeek: 0, lastWeek: 2, thisMonth: 0, lastMonth: 3, last3Months: 3 },
  "clarity.pages": { thisWeek: 0, lastWeek: 4, thisMonth: 1, lastMonth: 4, last3Months: 5 },
};
const found = (screen: string, period: Period) => FOUND[screen][period] ?? FOUND[screen].last3Months!;

describe("Clarity's Overview finds the biggest things on every period (Ronins, 3 November 2026)", () => {
  for (const period of PERIODS) {
    test(period, () => {
      const { findings, words } = said("clarity.overview", overviewSees(answerOf(overviewFixture, period), wordsFor(period)));
      plain(words, findings);
      expect(findings.length, words.join("\n")).toBeGreaterThanOrEqual(found("clarity.overview", period));
      if (period === "lastWeek") {
        // Its headline: the whole website's scroll against the week before, then the page groups that fell most.
        expect(words[0]).toBe("The whole website: how far people scroll 30.5%, against 36.7% for The week before.");
        expect(words).toContain("Content hub: how far people scroll 27.3%, against 36.4% for The week before.");
      }
      if (!WITH_BEFORE.includes(period)) expect(findings.some(claimsBefore), words.join("\n")).toBe(false);
    });
  }

  test("Last month: phones against computers, a page group against the website, a browser's errors, and the page holding the quick backs", () => {
    const { words } = said("clarity.overview", overviewSees(answerOf(overviewFixture, "lastMonth"), wordsFor("lastMonth")));
    expect(words[0]).toBe("Phones: how far people scroll 20.9%, against 33.7% for Computers.");
    expect(words).toContain("Brand: how far people scroll 44.5%, against 33.1% across the whole website.");
    // The screen's own box says 0.6% of visits hit an error: errors are a share of the days that counted them.
    expect(words).toContain("MobileSafari: share of visits that hit an error 8.3%, against 0.6% across the whole website.");
    // Of the website's own 15 quick backs, as its box counts them: 6 on the home page, 12.5% of the visits.
    expect(words).toContain("/ holds 40% of the list's visits that went straight back.");
  });
});

describe("Clarity's Errors says what its few errors show, and nothing on a span without one", () => {
  for (const period of PERIODS) {
    test(period, () => {
      const { findings, words } = said("clarity.errors", errorsSees(answerOf(errorsFixture, period), wordsFor(period)));
      plain(words, findings);
      if (found("clarity.errors", period) === 0) expect(findings, words.join("\n")).toEqual([]);
      else expect(findings.length, words.join("\n")).toBeGreaterThanOrEqual(found("clarity.errors", period));
      if (!WITH_BEFORE.includes(period)) expect(findings.some(claimsBefore), words.join("\n")).toBe(false);
    });
  }

  test("errors bunched on four days, and new errors on a page against the week before", () => {
    const month = said("clarity.errors", errorsSees(answerOf(errorsFixture, "lastMonth"), wordsFor("lastMonth"))).words;
    expect(month).toContain(`${formatDay("2026-10-19")} to ${formatDay("2026-10-22")} holds 83.3% of the list's visits that hit an error.`);
    const week = said("clarity.errors", errorsSees(answerOf(errorsFixture, "lastWeek"), wordsFor("lastWeek"))).words;
    expect(week).toEqual(["The whole website: share of visits that hit an error 0.3%, against 1.2% for The week before.", "Pages with errors: 1 new and 3 lost."]);
  });
});

describe("Clarity's Pages finds the biggest things on every period", () => {
  for (const period of PERIODS) {
    test(period, () => {
      const { findings, words } = said("clarity.pages", pagesSees(answerOf(pagesFixture, period), wordsFor(period)));
      plain(words, findings);
      expect(findings.length, words.join("\n")).toBeGreaterThanOrEqual(found("clarity.pages", period));
      if (!WITH_BEFORE.includes(period)) expect(findings.some(claimsBefore), words.join("\n")).toBe(false);
      // A page of the chart and of the table is said once: the chart's figures are the eye's alone.
      expect(new Set(findings.map((one) => `${one.kind}|${one.params.name}|${one.params.measure}`)).size).toBe(findings.length);
    });
  }

  test("Last week: the busy page whose scroll fell most, and the visits on pages scrolled less than a quarter of the way", () => {
    const { words } = said("clarity.pages", pagesSees(answerOf(pagesFixture, "lastWeek"), wordsFor("lastWeek")));
    expect(words[0]).toBe("/hub/kapferer-brand-identity-prism/: how far people scroll 26.5%, against 40.1% for The week before.");
    expect(words).toContain("Pages scrolled less than a quarter of the way: 13.1% of all the visits, from 2.7% the span before.");
  });
});

describe("A page's own screen in Clarity finds the biggest things on every period", () => {
  const pages = pageFixture as unknown as Record<string, Record<string, unknown>>;
  const onPage = (path: string, period: Period) => said("clarity.page", pageSees(answerOf(pages[path], period), path, wordsFor(period)));
  // The home page and the busiest article; about 70 and 99 visits a day or two, and the home page's 12 this month, are
  // too few for anything past chance.
  const PAGE_FOUND: Record<string, Partial<Record<Period, number>>> = {
    "/": { thisWeek: 0, lastWeek: 1, thisMonth: 0, lastMonth: 3, last3Months: 3 },
    "/hub/kapferer-brand-identity-prism/": { thisWeek: 0, lastWeek: 1, thisMonth: 0, lastMonth: 5, last3Months: 4 },
  };
  for (const path of Object.keys(PAGE_FOUND)) {
    for (const period of PERIODS) {
      test(`${path} ${period}`, () => {
        const { findings, words } = onPage(path, period);
        plain(words, findings);
        expect(findings.length, words.join("\n")).toBeGreaterThanOrEqual(PAGE_FOUND[path][period] ?? PAGE_FOUND[path].last3Months!);
        if (!WITH_BEFORE.includes(period)) expect(findings.some(claimsBefore), words.join("\n")).toBe(false);
      });
    }
  }

  test("the busiest article: a browser and device where far more of its visits hit an error, and phones against computers", () => {
    const { words } = onPage("/hub/kapferer-brand-identity-prism/", "lastMonth");
    expect(words).toContain("MobileSafari on phones: share of visits that hit an error 33.3%, against 0.9% for /hub/kapferer-brand-identity-prism/.");
    expect(words).toContain("Phones: share of visits that hit an error 12%, against 0% for Computers.");
    // Its scroll against similar pages, the other articles of its group.
    expect(words[0]).toBe("/hub/kapferer-brand-identity-prism/: how far people scroll 34.4%, against 26.9% on similar pages.");
  });

  test("the home page: its visits from Direct go straight back far more than from its other sources", () => {
    const { words } = onPage("/", "lastMonth");
    expect(words).toContain("Direct: share of visits that went straight back 22.4%, against 3.7% for Its other sources.");
  });

  test("an ordinary page says nothing it cannot stand behind: /ai-agency/ scrolls as its group does, with no problem past chance", () => {
    for (const period of PERIODS) expect(onPage("/ai-agency/", period).findings, period).toEqual([]);
  });
});
