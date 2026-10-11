#!/usr/bin/env node
/**
 * What Hakken sees' words for the server (search-console-volatility-plan.md
 * §8, HS5 and HS7): every box's sentences and step links, English and
 * Italian, cut from `messages/<language>.json` into
 * `convex/utils/seenWords.json`, so the server writes Ask Hakken the very
 * words a screen shows — and checks saved advice names only real sentences —
 * without bundling the whole of both language files.
 *
 *   node scripts/seen-words.mjs          writes it
 *   node scripts/seen-words.mjs --check  fails when it is out of date
 *
 * `src/seen-words-drift.test.ts` runs the check, so a box's words changed
 * without running this fails the build.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** Each section's boxes: its namespace in the language files. */
export const SEEN_NAMESPACES = ["sites.seen", "keywordResearch.seen", "googleAnalytics.seen", "searchConsole.seen"];
export const SEEN_LANGUAGES = ["en", "it"];
const OUT = path.join(root, "convex/utils/seenWords.json");

export function seenWords() {
  const out = {};
  for (const language of SEEN_LANGUAGES) {
    const messages = JSON.parse(readFileSync(path.join(root, `messages/${language}.json`), "utf8"));
    out[language] = {};
    for (const namespace of SEEN_NAMESPACES) {
      out[language][namespace] = namespace.split(".").reduce((node, part) => node?.[part], messages) ?? {};
    }
  }
  return `${JSON.stringify(out, null, 2)}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const words = seenWords();
  if (process.argv.includes("--check")) {
    if (readFileSync(OUT, "utf8") !== words) {
      console.error("convex/utils/seenWords.json is out of date with messages/: run node scripts/seen-words.mjs");
      process.exit(1);
    }
    console.log("seenWords.json matches messages/.");
  } else {
    writeFileSync(OUT, words);
    console.log(`Wrote ${path.relative(root, OUT)} (${Math.round(words.length / 1024)} KB).`);
  }
}
