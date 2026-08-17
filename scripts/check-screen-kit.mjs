import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * New screens must take their table and their form fields from the kit, not
 * draw them again by hand.
 *
 * The kit was real and working for a long time before this check existed — 49
 * screens used its table — but it sat inside the admin folder, so the screens a
 * client actually uses could not import it. They copied it by eye instead. Two
 * governance screens copied it badly enough to pass a `<table>` into
 * `TableShell`, which draws its own, and shipped a page with a table nested
 * inside an empty one. Nobody noticed, because a screen that looks right looks
 * right.
 *
 * That is the failure this catches: not laziness, but a part being out of reach
 * at the moment someone needed it. The kit moved to `src/ui/components/screens/`
 * so it is in reach from both halves of the app; this check is what stops the
 * next screen drifting back off it.
 *
 * Two rules, both about a part that already exists:
 *
 * - A `<table>` written by hand. `TableShell` owns the shell, the overflow, the
 *   header row and cells, the loading and empty rows, and both footers.
 * - An `<input>` written by hand, for the kind of box a person types into.
 *   `Field` ties the label to the input and will not let you skip it, which is
 *   the part 88 screens were skipping — an untied label is silent to a screen
 *   reader and invisible to whoever wrote the screen.
 *
 * A tick box, a file picker, a colour swatch and a slider are deliberately not
 * covered. The kit has no replacement for them, so flagging one would be a
 * build failure with no correct fix, and a check with no correct fix is a check
 * people learn to route around.
 *
 * The files listed in the allowlist already hand-write one of these. They are
 * frozen, not endorsed: each rule's list may shrink, never grow. Working in one
 * of those files is the moment to move it onto the kit.
 */

const rootDir = process.cwd();
const SCAN_DIR = path.join("src", "app", "(dashboard)");

/**
 * Input types the kit has no part for, so the rule leaves them alone.
 *
 * Anything else — including a type computed at runtime — is treated as a box a
 * person types into. Failing closed is right here: the cost of a wrong guess is
 * one line in the frozen list, and the cost of the other wrong guess is a
 * screen that quietly ships an unlabelled field.
 */
const CONTROL_TYPES = new Set([
  "checkbox",
  "radio",
  "file",
  "color",
  "range",
  "hidden",
  "submit",
  "reset",
  "button",
  "image",
]);

const RULES = {
  tables: {
    part: "a table",
    fix:
      "Use TableShell from src/ui/components/screens/Table.tsx, with TableHeaderRow,\n" +
      "TableHeaderCell, TableLoadingRow and TableEmptyRow inside it. TableShell draws\n" +
      "the <table> itself — pass it a <thead>/<tbody>, never another <table>.",
  },
  inputs: {
    part: "a text field",
    fix:
      "Use Field from src/ui/components/screens/Field.tsx — it ties the label to the\n" +
      "input for you. TableSearchInput (screens/TableControls.tsx) for a table's search\n" +
      "box, ModalFormField (screens/ModalForm.tsx) for a field inside a modal.",
  },
};

const ALLOWLIST_FILE = path.join(rootDir, "scripts", "screen-kit-allowlist.json");

/**
 * The frozen lists as sets, keyed by rule.
 *
 * Both exported checks take this as an argument so a test can hand them a list
 * of its own. Without that, the only thing a test can say about the shrinking
 * rule is that nothing is stale today, which would pass just as well if the
 * staleness check were deleted.
 */
export function loadFrozen(source = ALLOWLIST_FILE) {
  const allowlist =
    typeof source === "string" ? JSON.parse(fs.readFileSync(source, "utf8")) : source;

  return {
    tables: new Set(allowlist.tables ?? []),
    inputs: new Set(allowlist.inputs ?? []),
  };
}

function listFiles(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      found.push(...listFiles(full));
      continue;
    }
    if (/\.(tsx|ts)$/.test(entry.name) && !entry.name.includes(".test.")) found.push(full);
  }
  return found;
}

/**
 * The opening tag starting at `start`, brace- and quote-aware.
 *
 * Stopping at the first `>` does not work: `onChange={(event) => …}` is an
 * arrow function, and reading its arrow as the end of the tag loses every
 * attribute after it — including the type, which is what decides the rule.
 */
function readOpeningTag(text, start) {
  let depth = 0;
  let quote = null;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];

    if (quote) {
      if (char === quote && text[i - 1] !== "\\") quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    else if (char === ">" && depth === 0) return text.slice(start, i + 1);
  }

  return text.slice(start);
}

const TYPE_ATTRIBUTE = /\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/;

/** True when this `<input>` is a box a person types into. */
function isTextEntry(openingTag) {
  const match = TYPE_ATTRIBUTE.exec(openingTag);
  if (!match) return true; // no type at all is a text input

  const literal = match[1] ?? match[2];
  if (literal === undefined) return true; // computed at runtime — assume text

  return !CONTROL_TYPES.has(literal.trim());
}

/** Every line where a screen draws a part the kit already owns. */
function findInFile(relative, text) {
  const found = [];
  const lineStarts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") lineStarts.push(i + 1);
  }
  const lineOf = (index) => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (lineStarts[mid] <= index) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  };

  const tables = /<table\b/g;
  let match;
  while ((match = tables.exec(text))) {
    found.push({ rule: "tables", file: relative, line: lineOf(match.index) });
  }

  const inputs = /<input\b/g;
  while ((match = inputs.exec(text))) {
    if (!isTextEntry(readOpeningTag(text, match.index))) continue;
    found.push({ rule: "inputs", file: relative, line: lineOf(match.index) });
  }

  return found;
}

/**
 * Every screen outside the frozen lists that hand-writes a part of the kit.
 *
 * A file is frozen per rule, not outright. A screen frozen for its table can
 * still fail on a hand-written field, which is the point — otherwise one old
 * table would buy a screen a permanent exemption from the other rule.
 */
export function findHandWrittenParts(frozen = loadFrozen()) {
  const offenders = [];

  for (const file of listFiles(path.join(rootDir, SCAN_DIR))) {
    const relative = path.relative(rootDir, file);
    const text = fs.readFileSync(file, "utf8");

    for (const hit of findInFile(relative, text)) {
      if (frozen[hit.rule].has(relative)) continue;
      offenders.push(hit);
    }
  }

  return offenders;
}

/** Frozen entries that no longer hand-write anything, so the lists can shrink. */
export function findStaleFreezes(frozen = loadFrozen()) {
  const stale = [];

  for (const rule of Object.keys(RULES)) {
    for (const relative of frozen[rule]) {
      const full = path.join(rootDir, relative);
      if (!fs.existsSync(full)) {
        stale.push({ rule, file: relative, reason: "no longer exists" });
        continue;
      }
      const text = fs.readFileSync(full, "utf8");
      const stillOffends = findInFile(relative, text).some((hit) => hit.rule === rule);
      if (!stillOffends) {
        stale.push({ rule, file: relative, reason: `no longer hand-writes ${RULES[rule].part}` });
      }
    }
  }

  return stale;
}

function main() {
  const frozen = loadFrozen();
  const offenders = findHandWrittenParts(frozen);
  const stale = findStaleFreezes(frozen);

  if (offenders.length === 0 && stale.length === 0) {
    console.log(
      `Screen kit: ${frozen.tables.size} tables and ${frozen.inputs.size} fields frozen, ` +
        "no new hand-written ones."
    );
    return;
  }

  for (const rule of Object.keys(RULES)) {
    const forRule = offenders.filter((offender) => offender.rule === rule);
    if (forRule.length === 0) continue;

    console.error(`\nThese draw ${RULES[rule].part} by hand instead of using the kit:\n`);
    for (const offender of forRule) {
      console.error(`  ${offender.file}:${offender.line}`);
    }
    console.error(`\n${RULES[rule].fix}`);
    process.exitCode = 1;
  }

  if (stale.length > 0) {
    console.error("\nThese are frozen but no longer need to be. Remove them from the list:\n");
    for (const entry of stale) {
      console.error(`  ${entry.rule}: ${entry.file} — ${entry.reason}`);
    }
    process.exitCode = 1;
  }

  if (process.exitCode === 1) {
    console.error(
      "\nThe allowlist in scripts/screen-kit-allowlist.json freezes what was already\n" +
        "there. It may shrink, never grow — adding to it is not the fix.\n"
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
