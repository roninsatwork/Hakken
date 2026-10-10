import { describe, expect, test } from "vitest";
import en from "@/messages/en.json";
import it from "@/messages/it.json";
import { LIKELY_CONVERSIONS, NEVER_TICKED, tickedAtFirst } from "./analyticsEvents";

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
