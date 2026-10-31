import { describe, expect, test } from "vitest";
import en from "../../../messages/en.json";
import it from "../../../messages/it.json";
import { MEASURES } from "./measures";

/** Every figure a finding may speak of has its words in the panel, in English and Italian (sees-every-page-plan). */
describe("the measures' words", () => {
  test("each measure is worded in both languages", () => {
    for (const field of Object.keys(MEASURES)) {
      expect((en.ui.hakkenSees.measures as Record<string, string>)[field], field).toBeTruthy();
      expect((it.ui.hakkenSees.measures as Record<string, string>)[field], field).toBeTruthy();
    }
  });
});
