import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Every word a screen asks for must exist.
 *
 * `useTranslations` fails at run time, not at build time: ask for a key that
 * was never written and the screen throws, or prints the key path at a reader.
 * Nothing in the build noticed. On 2026-08-17 a new label was added to the
 * platform users list with a key that did not exist; lint passed, the types
 * passed, 5,306 tests passed, all four guards passed, and the screen was blank
 * with an error boundary on it. It was found by opening the page.
 *
 * So this reads what the screens actually ask for and checks each one resolves
 * in `messages/en.json`.
 *
 * **What it cannot check, and why that is honest rather than lazy.** A key built
 * at run time — `t(`kind.${entry.kind}`)` — has no literal to look up, and
 * guessing at the possible values would either miss cases or invent them. Those
 * are skipped and counted, so the number is visible rather than silent. The
 * literal keys are the ones a person types by hand and therefore the ones a
 * person mistypes.
 */

const rootDir = process.cwd();
const SCAN_DIRS = [path.join("src", "app"), path.join("src", "ui")];
const MESSAGES = path.join(rootDir, "messages", "en.json");

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      found.push(...listFiles(full));
      continue;
    }
    if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")) found.push(full);
  }
  return found;
}

/** Walks a dotted path, so `admin.users.table.empty` finds the leaf string. */
function resolve(messages, dotted) {
  let node = messages;
  for (const part of dotted.split(".")) {
    if (node === undefined || node === null || typeof node !== "object") return undefined;
    node = node[part];
  }
  return node;
}

/**
 * Namespaces bound to a name in this file, as `{ t: "admin.users" }`.
 *
 * Both `const t = useTranslations("x")` and the no-argument form are matched;
 * the latter binds to the root, which is what next-intl does.
 */
function namespacesIn(text) {
  const bound = {};
  const pattern = /const\s+(\w+)\s*=\s*useTranslations\(\s*(?:["'`]([^"'`]*)["'`])?\s*\)/g;
  let match;
  while ((match = pattern.exec(text))) {
    // A file can bind the same name twice — one component's `t` is
    // "admin.users.profilePage", another's is "…profilePage.costs". Without
    // tracking every binding this reported the whole of the first component as
    // missing, which is a guard nobody would keep.
    (bound[match[1]] ??= []).push(match[2] ?? "");
  }
  return bound;
}

export function findMissingMessages() {
  const messages = JSON.parse(fs.readFileSync(MESSAGES, "utf8"));
  const missing = [];
  let checked = 0;
  let skipped = 0;

  for (const dir of SCAN_DIRS) {
    for (const file of listFiles(path.join(rootDir, dir))) {
      const text = fs.readFileSync(file, "utf8");
      const bound = namespacesIn(text);
      if (Object.keys(bound).length === 0) continue;

      const relative = path.relative(rootDir, file);
      const lineStarts = [0];
      for (let i = 0; i < text.length; i += 1) if (text[i] === "\n") lineStarts.push(i + 1);
      const lineOf = (index) => lineStarts.findLastIndex((start) => start <= index) + 1;

      for (const [name, namespaces] of Object.entries(bound)) {
        // A literal key only. `t(\`a.${b}\`)` is counted as skipped below.
        const calls = new RegExp(`\\b${name}\\(\\s*["']([^"']+)["']`, "g");
        let call;
        while ((call = calls.exec(text))) {
          checked += 1;
          // Missing only if it resolves under none of this name's namespaces.
          const candidates = namespaces.map((ns) => (ns ? `${ns}.${call[1]}` : call[1]));
          if (!candidates.some((dotted) => typeof resolve(messages, dotted) === "string")) {
            missing.push({ file: relative, line: lineOf(call.index), key: candidates[0] });
          }
        }

        const dynamic = new RegExp(`\\b${name}\\(\\s*\``, "g");
        while (dynamic.exec(text)) skipped += 1;
      }
    }
  }

  return { missing, checked, skipped };
}

function main() {
  const { missing, checked, skipped } = findMissingMessages();

  if (missing.length === 0) {
    console.log(
      `Messages: ${checked} wording keys checked against messages/en.json, all present ` +
        `(${skipped} built at run time and not checkable).`
    );
    return;
  }

  console.error("\nThese screens ask for wording that does not exist:\n");
  for (const entry of missing) console.error(`  ${entry.file}:${entry.line} — ${entry.key}`);
  console.error(
    "\nAdd the key to messages/en.json (and its translations), or correct the spelling.\n" +
      "A missing key throws on the screen at run time and passes every other check.\n"
  );
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
