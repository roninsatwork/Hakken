import { describe, expect, test } from "vitest";
import en from "@/messages/en.json";
import it from "@/messages/it.json";
import {
  AUTOMATIC_EVENTS,
  EVENT_DETAIL,
  LIKELY_CONVERSIONS,
  MEASURED_EVENTS,
  NEVER_TICKED,
  RECOMMENDED_EVENTS,
  SHOP_EVENTS,
  eventKind,
  tickedAtFirst,
} from "./analyticsEvents";

/**
 * Which key events Hakken ticks as conversions when a website first connects
 * (docs/plans/active/google-analytics-plan.md GA5, §16), and that each has a
 * name people can read in every language (GA19).
 */
describe("the events ticked at first", () => {
  test("Ronins' own conversions are ticked, its scrolls are not", () => {
    // Ronins' key events on 2026-10-10: only Purchase was ticked, and it never fired.
    const ronins = ["purchase", "form_submission", "live_chat_event", "phone_number_click", "email_link_click"];
    expect(ronins.filter(tickedAtFirst)).toEqual(ronins);
    expect(tickedAtFirst("scroll")).toBe(false);
    expect(tickedAtFirst("brochure_request")).toBe(false);
  });

  test("nothing is both a likely conversion and never ticked", () => {
    expect([...LIKELY_CONVERSIONS].filter((name) => NEVER_TICKED.has(name))).toEqual([]);
  });

  test("every likely conversion has its own name in English and Italian", () => {
    for (const messages of [en, it]) {
      const names = messages.googleAnalytics.events as Record<string, string>;
      expect([...LIKELY_CONVERSIONS].filter((name) => !names[name])).toEqual([]);
    }
  });
});

describe("every event Google records (GA30)", () => {
  test("each of Google's own events has its name in English and Italian", () => {
    const google = [...AUTOMATIC_EVENTS, ...MEASURED_EVENTS, ...SHOP_EVENTS, ...RECOMMENDED_EVENTS];
    for (const messages of [en, it]) {
      const names = messages.googleAnalytics.events as Record<string, string>;
      expect(google.filter((name) => !names[name])).toEqual([]);
    }
  });

  test("an event's kind: a conversion when it counts, else who records it", () => {
    expect(eventKind("form_submission", true)).toBe("conversion");
    expect(eventKind("page_view", false)).toBe("automatic");
    expect(eventKind("scroll", false)).toBe("measured");
    expect(eventKind("add_to_cart", false)).toBe("shop");
    expect(eventKind("brochure_request", false)).toBe("own");
    // What each event was about is asked only for Google's own.
    expect(Object.keys(EVENT_DETAIL).every((name) => MEASURED_EVENTS.has(name))).toBe(true);
  });
});
