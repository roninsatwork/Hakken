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
});
