// npm run check:reading: every line a client reads has a reading age of 14 or under (scripts/reading-age.mjs).
//
// Reads messages/en.json, all but the platform's own admin screens. The lines
// already over 14 the day this was added are frozen in
// scripts/reading-age-allowlist.json, which may shrink, never grow: a new line
// over 14 fails, and so does an entry that's since been fixed or gone, until it's
// taken off the list. A board is held to the same line by `npm run check:drawing`.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readingAge, readOut, tooHard } from "./reading-age.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** Read only by the people who run the platform, who may be more exact. */
const ADMIN_ONLY = new Set(["admin", "billingAdmin"]);

function* messagesOf(node, at = "") {
  for (const [key, value] of Object.entries(node)) {
    const here = at ? `${at}.${key}` : key;
    if (typeof value === "string") yield [here, value];
    else if (value && typeof value === "object") yield* messagesOf(value, here);
  }
}

/** Each client line over 14, by its key. */
export function linesOverTheAge(messages) {
  const over = new Map();
  for (const [key, message] of messagesOf(messages)) {
    if (ADMIN_ONLY.has(key.split(".")[0])) continue;
    const words = readOut(message);
    if (tooHard(words)) over.set(key, words);
  }
  return over;
}

/** What's wrong against the frozen list: lines that are new, and entries that should now come off it. */
export function checkReadingAge(messages, frozen) {
  const over = linesOverTheAge(messages);
  const held = new Set(frozen);
  const fresh = [...over].filter(([key]) => !held.has(key)).map(([key, words]) => ({ key, words, age: readingAge(words) }));
  const stale = frozen.filter((key) => !over.has(key));
  return { over: over.size, fresh, stale };
}

function main() {
  const messages = JSON.parse(readFileSync(path.join(ROOT, "messages/en.json"), "utf8"));
  const { lines } = JSON.parse(readFileSync(path.join(ROOT, "scripts/reading-age-allowlist.json"), "utf8"));
  const { over, fresh, stale } = checkReadingAge(messages, lines);
  for (const { key, words, age } of fresh) console.error(`✗ ${key}: reading age ${age.toFixed(1)}, and the most is 14. Say it more simply.\n    ${words}`);
  for (const key of stale) console.error(`✗ ${key} is on scripts/reading-age-allowlist.json but isn't over 14 any more. Take it off the list.`);
  if (fresh.length > 0 || stale.length > 0) process.exit(1);
  console.log(`check:reading: no new line over reading age 14. ${over} older ones are still on the list to fix.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
