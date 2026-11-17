import { describe, expect, test } from "vitest";
import { allowedColours, checkDrawing, selectorFor } from "./check-drawing.mjs";

// A sliver of the app's stylesheet, and the look's colours.
const kitCss = `${selectorFor("text-foreground")}{} ${selectorFor("bg-brand/5")}{} ${selectorFor("hover:text-info")}:hover{} ${selectorFor("border-[#161616]")}{}`;
const colours = allowedColours({ darkBg: "#222224", brandColorHex: "#E8E4DC" }, "export const CHART_SERIES_ORANGE = \"#f97316\";");
const check = (html) => checkDrawing(html, { kitCss, colours });

describe("check:drawing", () => {
  test("a drawing made of the app's classes and colours passes", () => {
    expect(check(`<style>.hk-own{}</style><div class="text-foreground bg-brand/5 hover:text-info {{row.cls}} hk-own"><svg stroke="#f97316"></svg><span style="color: #E8E4DC">x</span></div>`)).toEqual([]);
  });

  test("a class the app does not have fails, once however often it is used", () => {
    expect(check(`<div class="kit-figure"></div><div class="kit-figure"></div>`)).toEqual([
      `class "kit-figure" is not in the app's stylesheet — take the part from parts.html`,
    ]);
  });

  test("a colour outside the look fails; the app's own arbitrary class does not", () => {
    expect(check(`<div class="border-[#161616]" style="color: #ff5a1f"></div>`)).toEqual([
      "colour #ff5a1f is not in hakken.theme.json or the chart palette — use a theme class",
    ]);
    expect(check(`<a href="#add" style="background: rgba(255,90,31,0.05)"></a>`)).toEqual([
      "colour rgba(255,90,31,0.05) is not in hakken.theme.json or the chart palette — use a theme class",
    ]);
    // The chart palette's orange, as a browser writes it back.
    expect(check(`<span style="color: rgb(249, 115, 22)"></span>`)).toEqual([]);
  });

  test("the app's fonts pass; any other fails", () => {
    expect(check(`<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=JetBrains+Mono:wght@400">`)).toEqual([]);
    expect(check(`<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400">`)).toEqual(["font Roboto is not the app's — words are Inter, numbers JetBrains Mono"]);
    expect(check(`<div style="font-family: Georgia, serif"></div>`)).toEqual(["font Georgia is not the app's — words are Inter, numbers JetBrains Mono"]);
  });

  test("a table that would scroll sideways on a laptop fails; the kit's phone-only minimum does not", () => {
    expect(check(`<div style="min-width: 900px"></div>`)).toEqual(["min-width 900px — tables fit the page; size number columns to their headings"]);
    const laptop = checkDrawing(`<table class="min-w-[900px]"></table>`, { kitCss: `${selectorFor("min-w-[900px]")}{}`, colours });
    expect(laptop).toEqual(["min-w-[900px] — tables fit the page; size number columns to their headings"]);
    const phoneOnly = checkDrawing(`<table class="min-w-[720px] lg:min-w-0"></table>`, { kitCss: `${selectorFor("min-w-[720px]")}{} ${selectorFor("lg:min-w-0")}{}`, colours });
    expect(phoneOnly).toEqual([]);
    expect(check(`<div style="min-width: 240px"></div>`)).toEqual([]);
  });

  test("a class written escaped in HTML is read as the class it is", () => {
    const css = `${selectorFor("[&>p]:mb-0")}{}`;
    expect(checkDrawing(`<div class="[&amp;&gt;p]:mb-0"></div>`, { kitCss: css, colours })).toEqual([]);
  });

  test("the one table approved to scroll sideways says so and is let through", () => {
    const css = `${selectorFor("min-w-[1100px]")}{}`;
    expect(checkDrawing(`<table class="min-w-[1100px]"></table>`, { kitCss: css, colours })).toHaveLength(1);
    expect(checkDrawing(`<!-- tables-fit: approved sideways scroll (Content gap, 2026-09-30) --><table class="min-w-[1100px]"></table>`, { kitCss: css, colours })).toEqual([]);
  });

  test("the chart library's class names, and the app's own markers, are not invented parts", () => {
    expect(checkDrawing(`<g class="recharts-layer xAxis"></g><div class="custom-scrollbar"></div>`, { kitCss, colours, appSource: "className=\"custom-scrollbar\"" })).toEqual([]);
    expect(checkDrawing(`<div class="made-up-part"></div>`, { kitCss, colours, appSource: "" })).toHaveLength(1);
  });

  test("a canvas repeat inside a table fails; outside one it is fine", () => {
    expect(check(`<table><tbody><sc-for list="{{rows}}" as="row"><tr><td>{{row.name}}</td></tr></sc-for></tbody></table>`)).toEqual([
      "<sc-for> inside a table — a browser moves it out; write the rows out, with holes for what changes",
    ]);
    expect(check(`<sc-for list="{{rows}}" as="row"><div>{{row.name}}</div></sc-for><table><tbody><tr><td>{{rows.r0.name}}</td></tr></tbody></table>`)).toEqual([]);
  });

  test("a cluttered table fails: more than the name and five more columns, a tick box for the chart left out", () => {
    const head = (cells) => `<table><thead><tr>${cells.map((cell) => `<th>${cell}</th>`).join("")}</tr></thead><tbody><tr><td>x</td></tr></tbody></table>`;
    const tick = `<span class="sr-only">On the chart</span>`;
    const check = (html) => checkDrawing(html, { kitCss: `${kitCss} ${selectorFor("sr-only")}{}`, colours });
    const lean = ["Keyword", "Clicks", "Up or down", "Shown", "Position", "Pages"];
    expect(check(head([tick, ...lean]))).toEqual([]);
    expect(check(head([tick, ...lean, "Top page"]))).toEqual([
      "a table of 7 columns, and the most is 6: the name and 5 more, besides a tick box for the chart — put the rest on the row's own screen",
    ]);
    // A column of buttons with no heading at the end still counts: only a first column's tick box doesn't.
    expect(check(head([...lean, `<span class="sr-only">Actions</span>`]))).toHaveLength(1);
    // Headings over groups of columns come first: the last heading row is the one counted.
    expect(check(`<table><thead><tr><th colspan="7">Group</th></tr><tr>${[tick, ...lean].map((cell) => `<th>${cell}</th>`).join("")}</tr></thead></table>`)).toEqual([]);
  });

  test("the lean table's look: short headings, one line a row, the name cut to one line", () => {
    const check = (html) => checkDrawing(html, { kitCss: `${kitCss} ${selectorFor("sr-only")}{} ${selectorFor("truncate")}{} ${selectorFor("flex-col")}{}`, colours });
    const table = (headings, cells) => `<table><thead><tr>${headings.map((cell) => `<th>${cell}</th>`).join("")}</tr></thead><tbody><tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr></tbody></table>`;
    const tick = `<span class="sr-only">On the chart</span>`;
    const name = `<a class="truncate">antique brass kitchen handles</a>`;
    // The lean Keywords board: Shown with Impressions on hover, the move alone, the keyword cut.
    expect(check(table([tick, "Keyword", "Clicks", "Up or down", `<span title="Impressions">Shown</span>`, "CTR", "Position"], ["", name, "13", "▲ 2", "1,709", "0.8%", "7.7"]))).toEqual([]);
    // "impressions is to long a heading": 11 letters.
    expect(check(table(["Keyword", "Impressions"], [name, "1,709"]))).toEqual([
      'heading "Impressions" has 11 letters, and the most is 10 — use a shorter word, with the full one on hover (title)',
    ]);
    // "its the two lines thats not good": a share under the move.
    expect(check(table(["Keyword", "Up or down"], [name, `<span class="flex-col"><span>▲ 2</span><span>18.2%</span></span>`]))).toEqual([
      "a cell with two lines — each row is one line: a move is its own Up or down column, shown alone, and the rest goes on the row's own screen",
    ]);
    // A keyword left to wrap a word to a line.
    expect(check(table(["Keyword", "Clicks"], ["antique brass kitchen handles", "13"]))).toEqual([
      'the name column wraps — cut it to one line with "…", whole on hover (RecordLinkCell\'s `cut`), with min-w-[160px] on the column',
    ]);
    // A row across the whole table (loading, empty, an opened row's detail) isn't a row of cells.
    expect(check(`<table><thead><tr><th>Keyword</th><th>Clicks</th></tr></thead><tbody><tr><td colspan="2"><span class="flex-col">Nothing yet</span></td></tr></tbody></table>`)).toEqual([]);
  });

  test("a board copied from the app, and a chart's score strip, aren't held to the table rule", () => {
    const check = (html) => checkDrawing(html, { kitCss: `${kitCss} ${selectorFor("w-full")}{}`, colours });
    const wide = `<table><thead><tr>${["Keyword", "Clicks", "Impressions", "CTR", "Position", "Pages", "Top page"].map((cell) => `<th>${cell}</th>`).join("")}</tr></thead></table>`;
    expect(check(wide)).toHaveLength(2);
    // Today's page, copied to be redrawn.
    expect(check(`<!-- copied-from-app: today's words -->\n${wide}`)).toEqual([]);
    // DaysChart's score strip is a CompactList: "Than the day before" heads a readout, not a list.
    expect(check(`<div data-part="compact-list" class="w-full"><table><thead><tr><th>Up or down</th><th>Than the day before</th></tr></thead></table></div>`)).toEqual([]);
  });
});
