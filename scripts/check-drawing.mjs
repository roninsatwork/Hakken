// npm run check:drawing -- <board.dc.html> [...] (docs/plans/active/design-drift-plan.md, D2)
//
// Fails a drawing that strays from the app: a class the app's stylesheet does
// not have, a colour outside the record of the look and the chart palette, a
// font the app does not use, or a table that would scroll sideways. Run it on
// every board before a canvas is published; build the kit first
// (`npm run drawing-kit`).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT, readThemeRecord } from "./theme-record.mjs";

const KIT_CSS = path.join(ROOT, "docs/design/drawing-kit/build/kit.css");
const CHART_PALETTE = path.join(ROOT, "src/ui/components/charts/chartPalette.ts");

/** Class names a drawing may use that no stylesheet defines. */
const MARKERS = new Set(["group", "peer", "dark", "lucide"]);
/** Wider than this, a fixed minimum width makes a table scroll on a 1440px screen beside the menus. */
const WIDEST_FIXED = 360;

/** A class as Tailwind writes it in a selector. */
export function selectorFor(className) {
  return `.${className.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`)}`;
}

export function allowedColours(theme, paletteSource) {
  const colours = new Set(["#fff", "#ffffff", "#000", "#000000"]);
  for (const value of Object.values(theme)) if (typeof value === "string" && value.startsWith("#")) colours.add(value.toLowerCase());
  for (const match of paletteSource.matchAll(/#[0-9a-fA-F]{6}\b/g)) colours.add(match[0].toLowerCase());
  return colours;
}

/** The problems in one drawing, each a line a person can act on. */
export function checkDrawing(html, { kitCss, colours }) {
  const problems = [];
  const own = new Set();
  for (const style of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    for (const match of style[1].matchAll(/\.([A-Za-z_][\w-]*)/g)) own.add(match[1]);
  }

  const unknown = new Set();
  for (const match of html.matchAll(/\sclass="([^"]*)"/g)) {
    for (const token of match[1].replace(/\{\{[^}]*\}\}/g, " ").split(/\s+/).filter(Boolean)) {
      if (MARKERS.has(token) || own.has(token) || token.startsWith("lucide-")) continue;
      if (!kitCss.includes(selectorFor(token))) unknown.add(token);
    }
  }
  for (const token of unknown) problems.push(`class "${token}" is not in the app's stylesheet — take the part from parts.html`);

  // Classes are checked above (the app's own `border-[#161616]` is the app's);
  // links point at anchors, not colours.
  const withoutClasses = html.replace(/\s(class|href)="[^"]*"/g, " ");
  const offTheme = new Set();
  for (const match of withoutClasses.matchAll(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g)) {
    const hex = match[0].toLowerCase();
    if (!colours.has(hex)) offTheme.add(hex);
  }
  for (const hex of offTheme) problems.push(`colour ${hex} is not in hakken.theme.json or the chart palette — use a theme class`);
  for (const match of withoutClasses.matchAll(/\b(rgba?|hsla?)\(\s*\d[^)]*\)/g)) problems.push(`colour ${match[0]} is written by hand — use a theme class`);

  // The app's fonts: Inter for words, JetBrains Mono for numbers.
  for (const link of html.matchAll(/fonts\.googleapis\.com\/css2\?([^"'\s>]+)/g)) {
    for (const family of link[1].matchAll(/family=([^:&]+)/g)) {
      if (!["Inter", "JetBrains+Mono"].includes(family[1])) problems.push(`font ${family[1].replace(/\+/g, " ")} is not the app's — words are Inter, numbers JetBrains Mono`);
    }
  }
  for (const match of html.matchAll(/font-family:\s*([^;"}]+)/g)) {
    const first = match[1].split(",")[0].trim().replace(/['"]/g, "");
    if (!["Inter", "JetBrains Mono", "inherit", "var(--font-sans)", "var(--font-mono)"].includes(first)) problems.push(`font ${first} is not the app's — words are Inter, numbers JetBrains Mono`);
  }

  for (const match of html.matchAll(/min-width:\s*(\d+)px/g)) {
    if (Number(match[1]) > WIDEST_FIXED) problems.push(`min-width ${match[1]}px — tables fit the page; size number columns to their headings`);
  }
  for (const match of html.matchAll(/\bmin-w-\[(\d+)px\]/g)) {
    if (Number(match[1]) > WIDEST_FIXED) problems.push(`min-w-[${match[1]}px] — tables fit the page; size number columns to their headings`);
  }
  if (/overflow-x:\s*(auto|scroll)|\boverflow-x-(auto|scroll)\b/.test(html)) problems.push("sideways scrolling — tables fit the page");

  const counted = new Map();
  for (const problem of problems) counted.set(problem, (counted.get(problem) ?? 0) + 1);
  return [...counted].map(([problem, times]) => (times > 1 ? `${problem} (${times} times)` : problem));
}

function main(files) {
  if (files.length === 0) {
    console.error("Usage: npm run check:drawing -- <board.dc.html> [...]");
    process.exit(2);
  }
  if (!existsSync(KIT_CSS)) {
    console.error("check:drawing: no kit yet — run `npm run drawing-kit` first.");
    process.exit(2);
  }
  const kitCss = readFileSync(KIT_CSS, "utf8");
  const colours = allowedColours(readThemeRecord(), readFileSync(CHART_PALETTE, "utf8"));
  let failed = 0;
  for (const file of files) {
    const problems = checkDrawing(readFileSync(file, "utf8"), { kitCss, colours });
    if (problems.length === 0) {
      console.log(`✓ ${file}`);
    } else {
      failed++;
      console.error(`✗ ${file}`);
      for (const problem of problems) console.error(`    ${problem}`);
    }
  }
  if (failed) {
    console.error(`check:drawing: ${failed} of ${files.length} drawing(s) stray from the app.`);
    process.exit(1);
  }
  console.log(`check:drawing: ${files.length} drawing(s) drawn from the app.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main(process.argv.slice(2));
