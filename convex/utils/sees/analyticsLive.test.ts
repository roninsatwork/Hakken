import { describe, expect, test } from "vitest";
import { expectAnalyticsWords } from "@/src/test/analyticsSeenWords";
import { liveSees } from "./analyticsLive";

/**
 * What Hakken sees on Live (google-analytics-plan.md §18.7): the box worked
 * out from board 14's minute, with words in English and Italian for every
 * code.
 */

describe("14 · Live", () => {
  test("people on now and the page most are on; a conversion and how long ago; see today's conversions", () => {
    const box = liveSees({ now: 4, people: 11, topPage: { title: "AI Agency | Agent Automation Company", people: 3 }, conversion: { eventName: "form_submission", minutesAgo: 12 } });
    expect(box).toEqual({
      says: [{ code: "onNow", a: 4, b: 3, text: "AI Agency | Agent Automation Company" }, { code: "converted", text: "form_submission", a: 12 }],
      steps: [{ code: "seeConversions", link: "conversions", to: { segment: "conversions" } }],
    });
    expectAnalyticsWords("live", box);
  });

  test("nobody now but some in the half hour; nobody at all; no page named", () => {
    const quiet = liveSees({ now: 0, people: 5, topPage: { title: "Home", people: 2 }, conversion: null });
    expect(quiet).toEqual({ says: [{ code: "quietNow", a: 5 }], steps: [] });
    const nobody = liveSees({ now: 0, people: 0, topPage: null, conversion: null });
    expect(nobody).toEqual({ says: [{ code: "nobody" }], steps: [] });
    const unnamed = liveSees({ now: 2, people: 2, topPage: null, conversion: null });
    expect(unnamed.says).toEqual([{ code: "onNowOnly", a: 2 }]);
    for (const shown of [quiet, nobody, unnamed]) expectAnalyticsWords("live", shown);
  });
});
