import { describe, expect, test } from "vitest";
import { checkCanvasNotes, checkDrawing, selectorFor } from "./check-drawing.mjs";
import { checkWordStyle, styleFaultsOf } from "./check-word-style.mjs";
import { isPeriodChoice, saidTwice, sentencesOf, styleFaults } from "./word-style.mjs";

const rules = (line) => styleFaults(line).map((fault) => fault.rule);

describe("a month left unnamed", () => {
  test("the month, week, year, days or span before, and the last days, fail", () => {
    for (const line of ["▼ 7% on the month before", "Clicks against the week before", "The days before", "Up on the year before", "Against the span before", "The last days"]) {
      expect(rules(line)).toContain("named-month");
    }
  });

  test("a named month or a counted span passes", () => {
    expect(rules("▼ 7% fewer than September")).toEqual([]);
    expect(rules("Clicks in the 30 days before the check")).toEqual([]);
    expect(rules("Than the day before")).toEqual([]);
    expect(rules("No change since September")).toEqual([]);
  });
});

describe("a colon joining two ideas", () => {
  test("words on both sides fail", () => {
    expect(rules("You're all set: your first report is on its way")).toContain("colon");
    expect(rules("The chart shows this: clicks and impressions each day")).toContain("colon");
    expect(rules("The chart: Show and Compare with, both on the card.")).toContain("colon");
  });

  test("a label, a term with its meaning, a time or an address passes", () => {
    expect(rules("Show:")).toEqual([]);
    expect(rules("Dates: Last month")).toEqual([]);
    expect(rules("Last checked: 17 Nov 2026")).toEqual([]);
    expect(rules("Impressions: the times Google showed it")).toEqual([]);
    expect(rules("Updated 18/11/2026, 04:01:56 and saved for you today")).toEqual([]);
    expect(rules("It came from https://www.morehandles.co.uk and nowhere else at all")).toEqual([]);
  });
});

describe("a dash joining two ideas", () => {
  test("words on both sides fail, whichever dash it is", () => {
    expect(rules("The voice isn't available right now — here's the reply as text.")).toContain("dash");
    expect(rules("Pages count every country - devices count only yours")).toContain("dash");
    expect(rules("Pages count every country – devices count only yours")).toContain("dash");
  });

  test("a date range, a number range or a short pair passes", () => {
    expect(rules("Clicks from 1 Oct – 31 Oct 2026 in every country")).toEqual([]);
    expect(rules("Showing 1-25 of 222")).toEqual([]);
    expect(rules("Pages at positions 1–3 on Google")).toEqual([]);
  });
});

describe("Hakken talking about itself", () => {
  test("a sentence that says Hakken fails", () => {
    expect(rules("All the figures are from what Hakken has saved for you.")).toContain("hakken");
  });

  test("a short label, or the name of Ask Hakken or Hakken tasks, passes", () => {
    expect(rules("Hakken")).toEqual([]);
    expect(rules("Ask Hakken about this page and its figures")).toEqual([]);
    expect(rules("Open Hakken tasks to see what runs next week")).toEqual([]);
  });
});

describe("words in quote marks are someone else's", () => {
  test("quoting a bad line to point at it passes", () => {
    expect(rules("The chart's key says “The days before” and “The last days”. It means September.")).toEqual([]);
    expect(rules("The key says \"The days before\" for September.")).toEqual([]);
  });
});

describe("the same sentence twice", () => {
  test("a full sentence of six words or more said twice is found once", () => {
    const line = "Pages count clicks from every country, not just yours.";
    expect(saidTwice([line, "Each square is 1 in every 100.", line])).toEqual([line]);
  });

  test("a short line, a name without a full stop, or a number's point doesn't count", () => {
    expect(saidTwice(["Clicks", "Clicks"])).toEqual([]);
    expect(saidTwice(["70,000 impressions or more, and 0.8 or more clicks for every 100", "70,000 impressions or more, and 0.8 or more clicks for every 100"])).toEqual([]);
    expect(sentencesOf("Under 0.8 clicks for every 100. Higher up.")).toEqual(["Under 0.8 clicks for every 100.", "Higher up."]);
  });
});

describe("Compare with is only for a period", () => {
  test("a month, a year, the same days, the days before or no comparison is a period", () => {
    for (const choice of ["September", "No comparison", "The same days last year", "2025", "The days before", "Sept 2026"]) expect(isPeriodChoice(choice)).toBe(true);
  });

  test("a figure isn't", () => {
    for (const choice of ["Clicks", "Pages", "Impressions"]) expect(isPeriodChoice(choice)).toBe(false);
  });
});

describe("check:words", () => {
  const messages = {
    live: { fine: "▼ {change} fewer than {before}", unnamed: "▲ {change} on the month before", colon: "You're all set: your first report is on its way" },
    admin: { unnamed: "on the month before" },
  };

  test("reads every client line by rule, and leaves out the platform's own admin screens", () => {
    const found = styleFaultsOf(messages);
    expect([...found["named-month"].keys()]).toEqual(["live.unnamed"]);
    expect([...found.colon.keys()]).toEqual(["live.colon"]);
  });

  test("a new fault fails, naming its rule", () => {
    const { fresh, stale } = checkWordStyle(messages, { "named-month": ["live.unnamed"] });
    expect(fresh.map((fault) => `${fault.rule} ${fault.key}`)).toEqual(["colon live.colon"]);
    expect(stale).toEqual([]);
  });

  test("the list may only shrink: an entry that's been fixed or gone must come off", () => {
    const { fresh, stale } = checkWordStyle({ live: { unnamed: "on the month before", fixed: "fewer than September" } }, { "named-month": ["live.unnamed", "live.fixed", "live.gone"] });
    expect(fresh).toEqual([]);
    expect(stale.map((entry) => entry.key)).toEqual(["live.fixed", "live.gone"]);
  });
});

describe("a board's words", () => {
  const kitCss = selectorFor("text-foreground");
  const check = (html) => checkDrawing(html, { kitCss, colours: new Set() });

  test("a month left unnamed fails the board, and a named one passes", () => {
    expect(check('<p class="text-foreground">▼ 7% fewer than September</p>')).toEqual([]);
    expect(check('<p class="text-foreground">▼ 7% on the month before</p>')).toEqual([expect.stringContaining("Name the month")]);
  });

  test("a table's rows are the website's own words, so they aren't judged", () => {
    expect(check('<table><tbody><tr><td class="text-foreground">Door handles - how to fit them - our blog</td></tr></tbody></table>')).toEqual([]);
  });

  test("a sentence said twice fails once", () => {
    const line = "These figures count every country, as your pages do.";
    expect(check(`<p class="text-foreground">${line}</p><p class="text-foreground">${line}</p>`)).toEqual([expect.stringContaining("said more than once")]);
  });

  test("a Compare with menu that offers figures fails, and one of periods passes", () => {
    expect(check('<select aria-label="Compare with"><option>September</option><option>No comparison</option></select>')).toEqual([]);
    expect(check('<select aria-label="Compare with"><option>Clicks</option><option>Pages</option></select>')).toEqual([expect.stringContaining("only for a period")]);
  });

  test("a board copied from the app is let through, as those are today's words", () => {
    expect(check('<head><!-- copied-from-app --></head><p class="text-foreground">▼ 7% on the month before</p><select aria-label="Compare with"><option>Clicks</option></select>')).toEqual([]);
  });
});

describe("a canvas's notes", () => {
  test("each sticky's paragraphs are held to the same rules, and a title or a drawn shape isn't", () => {
    const problems = checkCanvasNotes({
      notes: {
        title: { kind: "title1", text: "Indexing: three ways to draw it for you" },
        shape: { kind: "rect", text: "the month before" },
        today: { text: "This is today's page.\n\nThe chart: Show and Compare with, both on the card.\n\nAll the figures are from what Hakken has saved." },
        fine: { text: "Way 1, tick pages to draw them.\n\nCompare with adds September as dashed lines." },
      },
    });
    expect(problems).toEqual([expect.stringMatching(/^note "today": A colon/), expect.stringMatching(/^note "today": Screens talk about people/)]);
  });

  test("a canvas with no notes has nothing to fix", () => {
    expect(checkCanvasNotes({ boards: {} })).toEqual([]);
  });
});
