import { describe, expect, test } from "vitest";
import { compareTerms, isTermToken, recordFor, termToken, tokenPlace } from "./searchConsoleTerms";

/** A keyword's or page's place in its build's book, as the list screens carry it (core-data-normalisation-plan.md §5.1). */
describe("a book's tokens", () => {
  test("a token says its book and place, and text is told apart and left as it is", () => {
    expect(tokenPlace(termToken("query", 1_234))).toEqual({ kind: "query", place: 1_234 });
    expect(tokenPlace(termToken("page", 0))).toEqual({ kind: "page", place: 0 });
    expect(isTermToken(termToken("query", 7))).toBe(true);
    expect(isTermToken("door handles")).toBe(false);
    expect(tokenPlace("door handles")).toBeNull();
  });

  test("tokens of one book sort as their places, the order the screens sort text in", () => {
    const tokens = [termToken("query", 120), termToken("query", 3), termToken("query", 45)];
    expect([...tokens].sort(compareTerms)).toEqual([termToken("query", 3), termToken("query", 45), termToken("query", 120)]);
  });

  test("a text is found in the record whose first entry is the last at or before it", () => {
    const firsts = ["apple", "door", "lever", "sash"];
    expect(recordFor(firsts, "brass")).toBe(0);
    expect(recordFor(firsts, "door")).toBe(1);
    expect(recordFor(firsts, "knob")).toBe(1);
    expect(recordFor(firsts, "zinc")).toBe(3);
    expect(recordFor(firsts, "aaa")).toBe(0);
  });
});
