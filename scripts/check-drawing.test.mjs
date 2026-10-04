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
      "colour rgba(255,90,31,0.05) is written by hand — use a theme class",
    ]);
  });

  test("the app's fonts pass; any other fails", () => {
    expect(check(`<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=JetBrains+Mono:wght@400">`)).toEqual([]);
    expect(check(`<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400">`)).toEqual(["font Roboto is not the app's — words are Inter, numbers JetBrains Mono"]);
    expect(check(`<div style="font-family: Georgia, serif"></div>`)).toEqual(["font Georgia is not the app's — words are Inter, numbers JetBrains Mono"]);
  });

  test("a table that would scroll sideways fails", () => {
    expect(check(`<div style="min-width: 900px"></div>`)).toEqual(["min-width 900px — tables fit the page; size number columns to their headings"]);
    expect(check(`<div class="overflow-x-auto"></div>`)).toContain("sideways scrolling — tables fit the page");
    expect(check(`<div style="min-width: 240px"></div>`)).toEqual([]);
  });
});
