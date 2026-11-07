import { appendFileSync } from "fs";
import { expectEyeHolds } from "@/src/test/eyeHolds";
import { describe, expect, test } from "vitest";
import en from "@/messages/en.json";
import { readFixture } from "@/src/test/readFixture";
import type { ServicesAnswer } from "../../googleAnalyticsServiceReads";
import { servicesEyeData } from "./analyticsServices";
import { findingWords } from "./findings";
import { pageDataFor } from "./pageData";
import { pageFindings } from "./pageFindings";

/**
 * Services' eye on its own rules (services-new-page-plan-2026-11-07.md, step 6; AGENTS.md: "The eye is the app's USP: it is never weak,
 * empty or broken on any page, for any dates"), on Ronins' own figures as saved on 7 November 2026, for every date the menu offers.
 * Built as the page builds it (`servicesEyeData`), cut as the eye cuts it (`pageDataFor`), then read by its rules. On This week Ronins'
 * service pages had 13 visits and one event: the eye still says how small that is, against the week before and the whole website.
 */

const SCREEN = "googleAnalytics.services";
const WHOLE = ["lastWeek", "lastMonth", "last3Months", "last6Months", "last12Months"] as const;
const BEGUN = ["thisWeek", "thisMonth"] as const;
const SAVED = readFixture("roninsServices") as Record<(typeof WHOLE)[number] | (typeof BEGUN)[number], ServicesAnswer>;
const NAMES = en.googleAnalytics.eyeNames as Record<string, string>;

function said(period: keyof typeof SAVED) {
  expectEyeHolds(SCREEN, servicesEyeData(SAVED[period], NAMES));
  const found = pageFindings(SCREEN, pageDataFor(servicesEyeData(SAVED[period], NAMES), SCREEN));
  const words = found.map(findingWords);
  if (process.env.PRINT_FINDINGS) appendFileSync(process.env.PRINT_FINDINGS, `services · ${period}\n  ${words.join("\n  ")}\n`);
  return words;
}

/** Never money, never anything bought or sold, never a group called busy or quiet. */
function expectClean(words: readonly string[]) {
  const text = words.join("\n");
  expect(/£|\$|€|revenue|worth|value|money|spend/i.test(text), text).toBe(false);
  expect(/\bbought\b|\bsales?\b|\bsold\b|basket/i.test(text), text).toBe(false);
  expect(/\bbusy\b|\bquiet\b/i.test(text), text).toBe(false);
}

const headline = (words: readonly string[]) => words.some((line) => line.startsWith(`${NAMES.allServices}: visits`));

describe("Services' eye, on every date the menu offers (Ronins)", () => {
  test.each(WHOLE)("%s: the headline and four or more things", (period) => {
    const words = said(period);
    expect(words.length, words.join("\n")).toBeGreaterThanOrEqual(4);
    expect(headline(words), words.join("\n")).toBe(true);
    expectClean(words);
  });

  test.each(BEGUN)("%s, just begun: the headline and something more, never nothing", (period) => {
    const words = said(period);
    expect(words.length, words.join("\n")).toBeGreaterThanOrEqual(2);
    expect(headline(words), words.join("\n")).toBe(true);
    expectClean(words);
  });
});

describe("Services' eye says what a person would miss (Ronins, last 12 months)", () => {
  const words = said("last12Months");

  test("the services get more than their share of the website's events", () => {
    expect(words).toContain("All your services: share of all events 65.7%, against 51.9% for their share of all visits.");
  });

  test("a service whose visits fell while its events rose", () => {
    expect(words).toContain("ChatBot Agency: events up 60%, to 8 from 5 the span before; Visits: down 60.6%.");
  });

  test("the busiest service gets fewer of the events than of the visits", () => {
    expect(words).toContain("AI Agency: share of all events 21.7%, against 35.6% for its share of all service visits.");
  });

  // Code digs (eye-code-first-brief-plan-2026-11-07.md): the headline says where its move came from, so the writer can't skip it.
  test("the headline says which service and which channel the rise came from", () => {
    expect(words[0]).toBe("All your services: visits up 31.1%, to 2227 from 1699 the span before; Events: up 53.3%. The service that rose most: AI Agency. The channel that rose most: Organic Search.");
  });

  test("and a fall's, over the last 3 months", () => {
    expect(said("last3Months")[0]).toContain("The service that fell most: AI Agency. The channel that fell most: Organic Search.");
  });

  test("a rate for every 100 visits leads with its number, never read as a percentage", () => {
    const rates = [...WHOLE, ...BEGUN].flatMap((period) => said(period)).filter((line) => line.includes("for every 100 visits"));
    expect(rates).toContain("AI Agency: 0 events for every 100 visits, against 5.5 for The whole website.");
    for (const line of rates) expect(line, line).toMatch(/: [\d.]+ events for every 100 visits, against [\d.]+ /);
  });
});

describe("Services' eye with nothing to go on", () => {
  test("no service had a visit: it says so against the whole website and the dates before", () => {
    const empty = { ...SAVED.lastMonth, services: SAVED.lastMonth.services.map((one) => ({ ...one, now: { ...one.now, visits: 0, events: 0, views: 0, engaged: 0, scrolled: 0 } })) };
    const found = pageFindings(SCREEN, pageDataFor(servicesEyeData(empty, NAMES), SCREEN)).map(findingWords);
    expect(found.length).toBeGreaterThanOrEqual(2);
    expect(found.join("\n")).toMatch(/All your services: visits/);
  });
});
