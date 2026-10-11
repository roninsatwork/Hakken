import { describe, expect, test } from "vitest";
import { expectAnalyticsWords } from "@/src/test/analyticsSeenWords";
import { eventSees, eventsSees, type EventFacts } from "./analyticsEvents";

/**
 * What Hakken sees on Events and an event's own screen
 * (google-analytics-plan.md §18.7): each box worked out from Ronins' figures
 * as the drawings read them (§18.2 boards 22 and 23), with words in English
 * and Italian for every code.
 */

const event = (eventName: string, times: number, figures: Partial<EventFacts> = {}): EventFacts => ({ eventName, times, visits: 0, counted: false, ...figures });

describe("22 · Events", () => {
  const ronins = [
    event("page_view", 2_431),
    event("scroll", 512),
    event("click", 64, { visits: 52 }),
    event("form_submission", 12, { counted: true }),
    event("live_chat_event", 0, { counted: true }),
    event("phone_number_click", 0, { counted: true }),
    event("view_search_results", 3),
  ];

  test("conversions that never happened; scrolls to the bottom; clicks away; searches", () => {
    const box = eventsSees(ronins, 808);
    expect(box).toEqual({
      says: [
        { code: "neverFired", text: "live_chat_event,phone_number_click", a: 2 },
        { code: "reachedBottom", a: 512 / 2_431, b: 512 },
        { code: "clicksAway", a: 64, b: 52 / 808 },
      ],
      steps: [
        { code: "tryConversions", text: "live_chat_event,phone_number_click", a: 2, link: "trackingHealth", to: { segment: "tracking-health" } },
        { code: "seeLinks", link: "linksClicked", to: { segment: "events/event", filters: { key: "click" } } },
        { code: "seeSearches", link: "wordsSearched", to: { segment: "events/event", filters: { key: "view_search_results" } } },
      ],
    });
    // Clicks in under one visit in twenty are not worth a sentence.
    const few = eventsSees(ronins, 52 * 21);
    expect(few.says.map((phrase) => phrase.code)).toEqual(["neverFired", "reachedBottom", "searched"]);
    const none = eventsSees([event("form_submission", 0, { counted: true })], 808);
    expect(none).toEqual({ says: [{ code: "none" }], steps: [] });
    for (const shown of [box, few, none]) expectAnalyticsWords("events", shown);
  });
});

describe("23 · An event's own screen", () => {
  test("a click: its times, the link clicked most, and none of its people converting after; open links in a new tab", () => {
    const box = eventSees({
      eventName: "click", detail: "linkUrl", times: 64, timesBefore: 73, people: 41, pageViews: 2_431,
      about: [{ label: "linkedin.com/company/ronins", times: 18 }, { label: "clutch.co/profile/ronins", times: 10 }],
      after: { did: 41, converted: 0 },
    });
    expect(box).toEqual({
      says: [
        { code: "times.down", text: "click", a: 64, b: 41, c: 73 },
        { code: "topLink", text: "linkedin.com/company/ronins", a: 18, b: 18 / 64 },
        { code: "noneAfter", a: 41 },
      ],
      steps: [{ code: "newTab", link: "allPages", to: { segment: "all-pages" } }],
    });
    expectAnalyticsWords("event", box);
  });

  test("by its kind: a search, a scroll, a file, a video, or only how many times", () => {
    const search = eventSees({ eventName: "view_search_results", detail: "searchTerm", times: 3, timesBefore: 3, people: 3, pageViews: 100, about: [{ label: "pricing", times: 2 }] });
    expect(search.says.map((phrase) => phrase.code)).toEqual(["times.same", "topSearch"]);
    expect(search.steps).toEqual([{ code: "answerSearch", text: "pricing", link: "allPages", to: { segment: "all-pages" } }]);
    const scroll = eventSees({ eventName: "scroll", detail: "percentScrolled", times: 512, timesBefore: 480, people: 318, pageViews: 2_431, about: [{ label: "90", times: 512 }] });
    expect(scroll.says).toEqual([{ code: "times.up", text: "scroll", a: 512, b: 318, c: 480 }, { code: "reached", a: 512 / 2_431, b: 2_431 }]);
    const file = eventSees({ eventName: "file_download", detail: "fileName", times: 6, timesBefore: null, people: 5, pageViews: 0, about: [{ label: "brochure.pdf", times: 4 }] });
    expect(file.says).toEqual([{ code: "timesNew", text: "file_download", a: 6, b: 5 }, { code: "topFile", text: "brochure.pdf", a: 4, b: 4 / 6 }]);
    const video = eventSees({ eventName: "video_start", detail: "videoTitle", times: 4, timesBefore: 0, people: 4, pageViews: 0, about: [{ label: "Our studio", times: 4 }] });
    expect(video.says[1]).toEqual({ code: "topVideo", text: "Our studio", a: 4, b: 1 });
    const own = eventSees({ eventName: "brochure_request", detail: null, times: 9, timesBefore: 12, people: 8, pageViews: 0, about: [], after: { did: 8, converted: 3 } });
    expect(own).toEqual({ says: [{ code: "times.down", text: "brochure_request", a: 9, b: 8, c: 12 }, { code: "convertedAfter", a: 3, b: 8 }], steps: [] });
    const never = eventSees({ eventName: "live_chat_event", detail: null, times: 0, timesBefore: 0, people: 0, pageViews: 0, about: [] });
    expect(never).toEqual({ says: [{ code: "neverHappened", text: "live_chat_event" }], steps: [] });
    for (const shown of [search, scroll, file, video, own, never]) expectAnalyticsWords("event", shown);
  });
});
