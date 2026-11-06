import { describe, expect, test } from "vitest";
import { checkDrawing, selectorFor } from "./check-drawing.mjs";
import { checkReadingAge, linesOverTheAge } from "./check-reading-age.mjs";
import { drawingLines, readingAge, readOut, tooHard } from "./reading-age.mjs";

const EASY = "Google doesn't know where 6 in 100 visits came from.";
const HARD = "Comprehensive attribution methodologies necessitate considerable organisational understanding of measurement infrastructure.";

describe("readingAge", () => {
  test("plain words read young, and long words and sentences read old", () => {
    expect(readingAge(EASY)).toBeLessThan(10);
    expect(readingAge(HARD)).toBeGreaterThan(20);
  });

  test("a name a reader knows isn't a hard word", () => {
    const named = "Your figures come from Google Analytics every morning at seven.";
    expect(readingAge(named)).toBe(readingAge(named.replace("Google Analytics", "Google")));
  });

  test("an address or a code name isn't read as words", () => {
    expect(readingAge("It came from staging.morehandles.co.uk and add_to_cart today.")).toBe(readingAge("It came from and today."));
  });

  test("nothing to read has no age", () => {
    expect(readingAge("")).toBeNull();
    expect(readingAge("www.morehandles.co.uk")).toBeNull();
  });
});

describe("tooHard", () => {
  test("a long hard line is too hard, and an easy one isn't", () => {
    expect(tooHard(HARD)).toBe(true);
    expect(tooHard(EASY)).toBe(false);
  });

  test("a short line isn't judged, as one long word would swing it", () => {
    expect(tooHard("Comprehensive attribution methodologies")).toBe(false);
  });
});

describe("readOut", () => {
  test("a plural or a choice reads as its other", () => {
    expect(readOut("{count, plural, =1 {one campaign} other {# campaigns}} left")).toBe("5 campaigns left");
    expect(readOut("By {by, select, age {age} other {interest}}")).toBe("By interest");
  });

  test("one inside another reads the same way", () => {
    expect(readOut("{a, plural, =1 {one} other {{b, select, x {ex} other {why}} and #}}")).toBe("why and 5");
  });

  test("a placeholder reads as a short word, and tags go", () => {
    expect(readOut("Up from {before} to <figure>{now}</figure>.")).toBe("Up from it to it.");
  });
});

describe("check:reading", () => {
  const messages = {
    live: { easy: EASY, hard: HARD, plural: `{n, plural, =1 {one} other {${HARD}}}` },
    admin: { hard: HARD },
    billingAdmin: { deep: { hard: HARD } },
  };

  test("reads every client line, and leaves out the platform's own admin screens", () => {
    expect([...linesOverTheAge(messages).keys()]).toEqual(["live.hard", "live.plural"]);
  });

  test("a new line over the age fails, naming it", () => {
    const { fresh, stale } = checkReadingAge(messages, ["live.plural"]);
    expect(fresh.map((line) => line.key)).toEqual(["live.hard"]);
    expect(stale).toEqual([]);
  });

  test("the list may only shrink: an entry that's been fixed or gone must come off", () => {
    const { fresh, stale } = checkReadingAge({ live: { hard: HARD, fixed: EASY } }, ["live.hard", "live.fixed", "live.gone"]);
    expect(fresh).toEqual([]);
    expect(stale).toEqual(["live.fixed", "live.gone"]);
  });
});

describe("a drawing's words", () => {
  const kitCss = selectorFor("text-foreground");
  const check = (html) => checkDrawing(html, { kitCss, colours: new Set() });

  test("reads what's on the board, not its styles, scripts or a closed menu", () => {
    const lines = drawingLines(`<head><title>${HARD}</title></head><style>a{}</style><p class="text-foreground">Fish &amp; chips</p><select><option>${HARD}</option></select><script>${HARD}</script><svg><text>${HARD}</text></svg>`);
    expect(lines).toEqual(["Fish & chips"]);
  });

  test("a line over the age fails the board, and an easy one passes", () => {
    expect(check(`<p class="text-foreground">${EASY}</p>`)).toEqual([]);
    expect(check(`<p class="text-foreground">${HARD}</p>`)).toEqual([expect.stringContaining("Say it more simply")]);
  });

  test("a board copied from the app is let through, as those are today's words", () => {
    expect(check(`<head><!-- copied-from-app --></head><p class="text-foreground">${HARD}</p>`)).toEqual([]);
  });
});
