// npm run check:words: the style faults a machine can catch in every line a client reads (scripts/word-style.mjs,
// docs/developer/writing-guide.md).
//
// Reads messages/en.json, all but the platform's own admin screens, as check:reading does. The lines already at
// fault the day this was added are frozen in scripts/word-style-allowlist.json, by rule. The list may shrink, never
// grow: a new fault fails, and so does an entry that's since been fixed or gone, until it's taken off the list.
// A board and its canvas notes are held to the same rules by `npm run check:drawing`.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ADMIN_ONLY, messagesOf } from "./check-reading-age.mjs";
import { readOut } from "./reading-age.mjs";
import { styleFaults } from "./word-style.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const RULES = ["named-month", "colon", "dash", "em-dash", "oxford-comma", "hakken", "swap"];

/** Each client line's faults, by rule and then key: `{ rule: Map<key, { words, fix }> }`. */
export function styleFaultsOf(messages) {
  const found = Object.fromEntries(RULES.map((rule) => [rule, new Map()]));
  for (const [key, message] of messagesOf(messages)) {
    if (ADMIN_ONLY.has(key.split(".")[0])) continue;
    const words = readOut(message);
    for (const { rule, fix } of styleFaults(words)) found[rule].set(key, { words, fix });
  }
  return found;
}

/** What's wrong against the frozen list: faults that are new, and entries that should now come off it. */
export function checkWordStyle(messages, frozen) {
  const found = styleFaultsOf(messages);
  const fresh = [];
  const stale = [];
  let held = 0;
  for (const rule of RULES) {
    const kept = new Set(frozen[rule] ?? []);
    for (const [key, fault] of found[rule]) {
      if (kept.has(key)) held += 1;
      else fresh.push({ rule, key, ...fault });
    }
    for (const key of kept) if (!found[rule].has(key)) stale.push({ rule, key });
  }
  for (const rule of Object.keys(frozen)) if (!RULES.includes(rule)) stale.push({ rule, key: "(the whole rule)" });
  return { held, fresh, stale };
}

function main() {
  const messages = JSON.parse(readFileSync(path.join(ROOT, "messages/en.json"), "utf8"));
  const { rules } = JSON.parse(readFileSync(path.join(ROOT, "scripts/word-style-allowlist.json"), "utf8"));
  const { held, fresh, stale } = checkWordStyle(messages, rules);
  for (const { rule, key, words, fix } of fresh) console.error(`✗ ${key} (${rule}): ${fix}\n    ${words}`);
  for (const { rule, key } of stale) console.error(`✗ ${key} is on scripts/word-style-allowlist.json under ${rule}, but isn't at fault any more. Take it off the list.`);
  if (fresh.length > 0 || stale.length > 0) process.exit(1);
  console.log(`check:words: no new style fault. ${held} older ones are still on the list to fix.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
