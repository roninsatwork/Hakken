import { describe, expect, test } from "vitest";
import en from "../../../messages/en.json";
import it from "../../../messages/it.json";
import { NEW_LOST_EYE_NEWEST } from "../searchConsoleViews";
import { MEASURES } from "./measures";

/** Every figure a finding may speak of has its words in the panel, in English and Italian (sees-every-page-plan). */
describe("the measures' words", () => {
  test("each measure is worded in both languages", () => {
    for (const field of Object.keys(MEASURES)) {
      expect((en.ui.hakkenSees.measures as Record<string, string>)[field], field).toBeTruthy();
      expect((it.ui.hakkenSees.measures as Record<string, string>)[field], field).toBeTruthy();
    }
  });

  // New and lost's first-page shares are of the newest NEW_LOST_EYE_NEWEST, and the panel says the number: if the limit
  // moves, its words move with it (search-console-new-and-lost-audit-2026-11-19.md).
  test("the newest searches' words name the limit they're counted from", () => {
    for (const field of ["newestLost", "newestGained"]) {
      expect(MEASURES[field]?.words, field).toContain(String(NEW_LOST_EYE_NEWEST));
      expect((en.ui.hakkenSees.measures as Record<string, string>)[field], field).toContain(String(NEW_LOST_EYE_NEWEST));
      expect((it.ui.hakkenSees.measures as Record<string, string>)[field], field).toContain(String(NEW_LOST_EYE_NEWEST));
    }
  });
});
