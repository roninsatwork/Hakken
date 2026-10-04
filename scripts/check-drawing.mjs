// npm run check:drawing -- <board.dc.html> [...] (docs/plans/active/design-drift-plan.md, D2)
//
// Fails a drawing that strays from the app: a class the app's stylesheet does
// not have, a colour outside the record of the look and the chart palette, a
// font the app does not use, or a table that would scroll sideways. Run it on
// every board before a canvas is published; build the kit first
// (`npm run drawing-kit`).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT, readThemeRecord } from "./theme-record.mjs";

const KIT_CSS = path.join(ROOT, "docs/design/drawing-kit/build/kit.css");
const CHART_PALETTE = path.join(ROOT, "src/ui/components/charts/chartPalette.ts");
// Google's own "G", drawn in its logo colours where a chart marks a Google update.
const GOOGLE_MARK = path.join(ROOT, "src/app/(dashboard)/app/sites/_components/GoogleMark.tsx");

/** Class names a drawing may use that no stylesheet defines. */
const MARKERS = new Set(["group", "peer", "dark", "lucide"]);
/** The chart library's own class names, which a board copied from the app carries. */
const LIBRARY_CLASS = /^(recharts-|legend-item-|xAxis$|yAxis$)/;
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
export function checkDrawing(html, { kitCss, colours, appSource = "" }) {
  const problems = [];
  const own = new Set();
  for (const style of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    for (const match of style[1].matchAll(/\.([A-Za-z_][\w-]*)/g)) own.add(match[1]);
  }

  const unknown = new Set();
  for (const match of html.matchAll(/\sclass="([^"]*)"/g)) {
    // HTML writes & < > " inside an attribute escaped: `[&>p]:mb-0` arrives as `[&amp;&gt;p]:mb-0`.
    const classes = match[1].replace(/&amp;/g, "&").replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&quot;/g, '"');
    for (const token of classes.replace(/\{\{[^}]*\}\}/g, " ").split(/\s+/).filter(Boolean)) {
      if (MARKERS.has(token) || own.has(token) || token.startsWith("lucide-") || LIBRARY_CLASS.test(token)) continue;
      // A marker the app's own code writes (custom-scrollbar, google-update-markers): no style, but the app's.
      if (!kitCss.includes(selectorFor(token)) && !appSource.includes(token)) unknown.add(token);
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
  // A browser writes a colour it was given as rgb(); read it back as the colour it is.
  for (const match of withoutClasses.matchAll(/\brgba?\(\s*(\d+),\s*(\d+),\s*(\d+)[^)]*\)/g)) {
    const hex = `#${[match[1], match[2], match[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
    if (!colours.has(hex)) problems.push(`colour ${match[0]} is not in hakken.theme.json or the chart palette — use a theme class`);
  }
  for (const match of withoutClasses.matchAll(/\bhsla?\(\s*\d[^)]*\)/g)) problems.push(`colour ${match[0]} is written by hand — use a theme class`);

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
  // A minimum width that still holds on a laptop. The kit's phone-only one
  // (`min-w-[720px] lg:min-w-0`) is fine: from a laptop up it is none. A board
  // of the one table approved to scroll (Content gap, 2026-09-30) says so with
  // `<!-- tables-fit: approved sideways scroll … -->` and is let through.
  const approvedSideways = /<!--\s*tables-fit: approved sideways scroll/.test(html);
  for (const match of approvedSideways ? [] : html.matchAll(/class="([^"]*)"/g)) {
    const classes = match[1].split(/\s+/);
    if (classes.some((token) => /^(lg|xl):min-w-0$/.test(token))) continue;
    for (const token of classes) {
      const wide = token.match(/^min-w-\[(\d+)px\]$/);
      if (wide && Number(wide[1]) > WIDEST_FIXED) problems.push(`min-w-[${wide[1]}px] — tables fit the page; size number columns to their headings`);
    }
  }

  // A canvas repeat or branch inside a table: a browser lifts any element a
  // table may not hold out of it, so the rows draw above the table or not at
  // all. Write a table's rows out, with holes for what changes.
  let tableDepth = 0;
  for (const tag of html.matchAll(/<(\/?)(table|sc-for|sc-if)\b/g)) {
    if (tag[2] === "table") tableDepth += tag[1] ? -1 : 1;
    else if (!tag[1] && tableDepth > 0) problems.push(`<${tag[2]}> inside a table — a browser moves it out; write the rows out, with holes for what changes`);
  }

  const counted = new Map();
  for (const problem of problems) counted.set(problem, (counted.get(problem) ?? 0) + 1);
  return [...counted].map(([problem, times]) => (times > 1 ? `${problem} (${times} times)` : problem));
}

/** Every component's source, to tell the app's own marker classes from invented ones. */
function appSourceText(dir) {
  return readdirSync(dir).map((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return appSourceText(full);
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? readFileSync(full, "utf8") : "";
  }).join("\n");
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
  const appSource = appSourceText(path.join(ROOT, "src"));
  const colours = allowedColours(readThemeRecord(), `${readFileSync(CHART_PALETTE, "utf8")}\n${readFileSync(GOOGLE_MARK, "utf8")}`);
  let failed = 0;
  for (const file of files) {
    const problems = checkDrawing(readFileSync(file, "utf8"), { kitCss, colours, appSource });
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
