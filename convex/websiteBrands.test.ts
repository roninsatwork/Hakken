import { describe, expect, test } from "vitest";

import {
  BRAND_NAME_MESSAGES,
  MAX_BRAND_NAMES,
  findBrandMention,
  primaryBrandName,
  readBrandNames,
} from "./websiteBrands";

/**
 * What a website calls itself, and finding those names in someone's prose.
 *
 * The storage rules are easy and the matching is not. Every test in the second
 * half is a way a wrong number reaches a screen: a citation counted twice
 * because two names matched one sentence, or a citation invented because a
 * short brand name appeared inside an unrelated word.
 */

const names = (...values: string[]) => values.map((name, index) => ({
  name,
  isPrimary: index === 0,
}));

describe("storing the names", () => {
  test("keeps the list and marks one primary", () => {
    const result = readBrandNames([
      { name: "Ronins", isPrimary: true },
      { name: "Ronins Group" },
      { name: "Ronins Agency" },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.names.map((entry) => entry.name))
      .toEqual(["Ronins", "Ronins Group", "Ronins Agency"]);
    expect(result.names.filter((entry) => entry.isPrimary)).toHaveLength(1);
  });

  test("names one primary when the caller named none", () => {
    // A screen has to print something, and refusing here would be pedantry.
    const result = readBrandNames([{ name: "Ronins" }, { name: "Ronins Group" }]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.names[0].isPrimary).toBe(true);
  });

  test("allows exactly one primary, whichever was asked for", () => {
    const result = readBrandNames([
      { name: "Ronins" },
      { name: "Ronins Group", isPrimary: true },
      { name: "Ronins Agency", isPrimary: true },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.names.filter((entry) => entry.isPrimary).map((entry) => entry.name))
      .toEqual(["Ronins Group"]);
  });

  test("refuses more than the cap", () => {
    // Enforced here rather than only in the form, because a limit living in a
    // screen is a limit the next caller does not have.
    const tooMany = Array.from({ length: MAX_BRAND_NAMES + 1 }, (_, index) => ({
      name: `Brand number ${index}`,
    }));

    expect(readBrandNames(tooMany)).toEqual({ ok: false, problem: "TOO_MANY" });
  });

  test("refuses a name too short to match safely", () => {
    expect(readBrandNames([{ name: "Ro" }])).toEqual({ ok: false, problem: "TOO_SHORT" });
  });

  test("treats differently-spaced and differently-cased names as one", () => {
    expect(readBrandNames([{ name: "Ronins Group" }, { name: "ronins  group" }]))
      .toEqual({ ok: false, problem: "DUPLICATE" });
  });

  test("drops blanks, and refuses a list that was only blanks", () => {
    const result = readBrandNames([{ name: "Ronins" }, { name: "   " }]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.names).toHaveLength(1);

    expect(readBrandNames([{ name: "  " }])).toEqual({ ok: false, problem: "EMPTY" });
  });

  test("every problem has something a person can read", () => {
    for (const message of Object.values(BRAND_NAME_MESSAGES)) {
      expect(message.length).toBeGreaterThan(10);
    }
  });
});

describe("the primary name", () => {
  test("is the marked one, or the first when none is marked", () => {
    expect(primaryBrandName(names("Ronins", "Ronins Group"))).toBe("Ronins");
    expect(primaryBrandName([
      { name: "Ronins", isPrimary: false },
      { name: "Ronins Group", isPrimary: false },
    ])).toBe("Ronins");
    expect(primaryBrandName(undefined)).toBeNull();
    expect(primaryBrandName([])).toBeNull();
  });
});

describe("finding a mention", () => {
  const ronins = names("Ronins", "Ronins Group", "Ronins Agency");

  test("finds a name in ordinary prose", () => {
    expect(findBrandMention("I would try Ronins Group for that.", ronins))
      .toMatchObject({ matched: "Ronins Group" });
  });

  test("answers once for the site, however many names matched", () => {
    // "Ronins Agency" contains "Ronins". Counting both would inflate every
    // figure on every screen, so this asks about the site, not the list.
    const found = findBrandMention("Ronins Agency are well reviewed.", ronins);

    expect(found).not.toBeNull();
    // The longest match is reported, because it is the more specific fact and
    // it is what the engine actually wrote.
    expect(found?.matched).toBe("Ronins Agency");
  });

  test("ignores a name buried inside a longer word", () => {
    // The failure this prevents: a customer called Apex cited every time an
    // engine writes "apexes", and one called Nova cited by "Nova Scotia".
    expect(findBrandMention("The apexes of the roof need work.", names("Apex"))).toBeNull();
    expect(findBrandMention("She moved to Novascotia last year.", names("Nova"))).toBeNull();
  });

  test("still matches a name against punctuation and line breaks", () => {
    expect(findBrandMention("Try these: Ronins, or someone else.", ronins))
      .toMatchObject({ matched: "Ronins" });
    expect(findBrandMention("Top pick\nRonins Agency\nRunner up", ronins))
      .toMatchObject({ matched: "Ronins Agency" });
  });

  test("does not care about case", () => {
    expect(findBrandMention("ronins group did the work", ronins))
      .toMatchObject({ matched: "Ronins Group" });
  });

  test("says nothing when nothing matched", () => {
    expect(findBrandMention("Try Acme Plumbing instead.", ronins)).toBeNull();
    expect(findBrandMention("", ronins)).toBeNull();
    expect(findBrandMention("Ronins", [])).toBeNull();
  });

  test("treats a name with regex characters as plain text", () => {
    // Brand names are user text. Turning one into a pattern means escaping it,
    // and an escaping mistake here is a silent wrong answer rather than a crash.
    expect(findBrandMention("We used C++ Solutions.", names("C++ Solutions")))
      .toMatchObject({ matched: "C++ Solutions" });
    expect(findBrandMention("Nothing here.", names("(a|b)"))).toBeNull();
  });
});

describe("a variant's kind", () => {
  test("absent reads as a correct name, so nothing saved before this moves", () => {
    const result = readBrandNames([{ name: "Ronins" }]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.names[0].kind).toBe("NAME");
  });

  test("a misspelling is kept, and reported as one when it matches", () => {
    const result = readBrandNames([
      { name: "Ronins Group" },
      { name: "Ronnins Group", kind: "MISSPELLING" },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // A citation under the wrong name is a different fact from one under the
    // right name, and it is the one a client can do something about.
    const found = findBrandMention("I'd try Ronnins Group.", result.names);
    expect(found).toMatchObject({ matched: "Ronnins Group", kind: "MISSPELLING" });
  });

  test("a misspelling is never made the primary", () => {
    // The primary is what screens print, and printing a client's name wrong on
    // their own dashboard is worse than picking a different one.
    const result = readBrandNames([
      { name: "Ronnins", kind: "MISSPELLING", isPrimary: true },
      { name: "Ronins" },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.names.find((entry) => entry.isPrimary)?.name).toBe("Ronins");
  });

  test("a list of only misspellings has nothing to print, and says so", () => {
    expect(readBrandNames([{ name: "Ronnins", kind: "MISSPELLING" }]))
      .toEqual({ ok: false, problem: "NO_PRIMARY" });
  });

  test("reports where in the text the name was found", () => {
    // Order of first appearance is the position on the citations screen: being
    // named first and being named last are different results.
    const found = findBrandMention("Acme first, then Ronins.", names("Ronins"));
    expect(found?.at).toBeGreaterThan(0);
  });
});
