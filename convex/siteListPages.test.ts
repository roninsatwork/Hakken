import { describe, expect, test } from "vitest";
import { heldTo, newestPerKey, pageOfList } from "./siteListPages";
import { wordStartMatcher, wordsOf } from "./utils/wordStarts";

/** The pieces every exact Sites page is cut with (docs/plans/active/sites-table-pages-plan.md §5). */
describe("one exact page of a list", () => {
  const list = Array.from({ length: 130 }, (_, index) => index + 1);

  test("answers the page, the total and the page count", () => {
    expect(pageOfList(list, 2, 50)).toEqual({ rows: list.slice(50, 100), total: 130, page: 2, pages: 3, size: 50, cut: null, preparing: false });
    expect(pageOfList(list, 3, 50).rows).toEqual(list.slice(100));
  });

  test("answers the last page for a page past the end, and the first for nonsense", () => {
    expect(pageOfList(list, 99, 25).page).toBe(6);
    expect(pageOfList(list, 0, 25).page).toBe(1);
    expect(pageOfList(list, Number.NaN, 25).page).toBe(1);
    expect(pageOfList([], 4, 25)).toEqual({ rows: [], total: 0, page: 1, pages: 1, size: 25, cut: null, preparing: false });
  });

  test("never hands over more than 100 rows, however many are asked for", () => {
    expect(pageOfList(list, 1, 1_000).size).toBe(100);
    expect(pageOfList(list, 1, 1_000).rows).toHaveLength(100);
    expect(pageOfList(list, 1, 0).size).toBe(1);
  });

  test("says where a list was held to a limit", () => {
    expect(heldTo([1, 2, 3], 3)).toEqual({ rows: [1, 2, 3], cut: null });
    expect(heldTo([1, 2, 3, 4], 3)).toEqual({ rows: [1, 2, 3], cut: 3 });
    expect(pageOfList([1, 2, 3], 1, 25, 3).cut).toBe(3);
  });
});

describe("the newest list's rows, once each", () => {
  const row = (pullId: string, at: number, name: string) => ({ pullId, _creationTime: at, name });

  test("takes every row of the newest list and an older list's only where the newest has none", () => {
    const rows = [
      row("old", 1, "a.com"), row("old", 1, "b.com"), row("old", 1, "gone.com"),
      row("new", 5, "a.com"), row("new", 5, "b.com"), row("new", 6, "c.com"),
    ];
    const kept = newestPerKey(rows, (entry) => entry.name);
    expect(kept.map((entry) => `${entry.pullId}:${entry.name}`).sort()).toEqual(["new:a.com", "new:b.com", "new:c.com", "old:gone.com"]);
  });

  test("keeps two rows alike within one list", () => {
    const rows = [row("new", 5, "a.com"), row("new", 5, "a.com"), row("old", 1, "a.com")];
    expect(newestPerKey(rows, (entry) => entry.name)).toHaveLength(2);
  });
});

describe("word-start search (T8)", () => {
  test("splits on anything that is not a letter or a digit, in any language", () => {
    expect(wordsOf("https://kordatackle.com/products/kaizen-green")).toEqual(["https", "kordatackle", "com", "products", "kaizen", "green"]);
    expect(wordsOf("Perché  CANNE da carpa")).toEqual(["perché", "canne", "da", "carpa"]);
  });

  test("needs every word typed to start a word in the row", () => {
    const matches = wordStartMatcher("carp ro");
    expect(matches?.("carp rods")).toBe(true);
    expect(matches?.("rod carp")).toBe(true);
    expect(matches?.("carp products")).toBe(false);
    expect(wordStartMatcher("rod")?.("products")).toBe(false);
    expect(wordStartMatcher("kaizen")?.("korda", "/products/kaizen-green")).toBe(true);
  });

  test("gives each word typed a word of its own", () => {
    const address = wordStartMatcher("c.com");
    expect(address?.("c.com", "https://c.com/post")).toBe(true);
    expect(address?.("b.com", "https://b.com/post")).toBe(false);
    expect(wordStartMatcher("com c")?.("b.com")).toBe(false);
    expect(wordStartMatcher("rod rods")?.("carp rods")).toBe(false);
    expect(wordStartMatcher("rod rods")?.("rod pod rods")).toBe(true);
  });

  test("narrows nothing when nothing is typed", () => {
    expect(wordStartMatcher("")).toBeNull();
    expect(wordStartMatcher("  -- ")).toBeNull();
    expect(wordStartMatcher(undefined)).toBeNull();
  });
});
