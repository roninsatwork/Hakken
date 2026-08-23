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
 * Four rules, each about a part that already exists:
 *
 * - A `<table>` written by hand. `TableShell` owns the shell, the overflow, the
 *   header row and cells, the loading and empty rows, and both footers.
 * - An `<input>` written by hand, for the kind of box a person types into.
 *   `Field` ties the label to the input and will not let you skip it, which is
 *   the part 88 screens were skipping — an untied label is silent to a screen
 *   reader and invisible to whoever wrote the screen.
 * - A table **assembled** from the kit's loose parts rather than taken whole
 *   from `DataTable`. Added 2026-08-17, and it is the rule the other two kept
 *   missing. Importing every shared part and wiring them together passes both
 *   the rules above and still produces a screen that does not match: the drift
 *   lives in the wiring. Thirty screens were read closely over 2026-08-16 and
 *   17 and every fault found was of that kind — a footer that appeared only
 *   when there was more to load, a search box inside a second border, a loading
 *   state written as a sentence, an empty message conditioned so it never
 *   showed when the list was actually empty. Sixty-one screens are frozen here
 *   at the moment the rule was written.
 * - A `<button>` written by hand. Added 2026-08-19, and it works by count, not
 *   by file: 387 raw buttons existed the day `Button` (src/ui/atoms/Button.tsx)
 *   did, each inventing its own padding and hover, so a file cannot be asked to
 *   reach zero in one sitting. Instead every file's count is frozen and may
 *   only fall — one more raw button than a file had is the failure. This rule
 *   alone reads all of `src/app` and `src/ui`, because buttons live in shared
 *   components as much as in screens; the movement demos are left out, frozen
 *   whole by owner decision, and so is `Button` itself, which draws the one
 *   `<button>` the rest are meant to use.
 *
 * - A tick box written by hand. Added 2026-08-22. It was the one deliberately
 *   left uncovered, because the kit had no tick box and a rule with no correct
 *   fix is a rule people route around. That held until Anthony opened the
 *   workspace Features screen: *"this is not our standard table and looks like
 *   a new style — I thought we fixed all these."* It was not a table, so no
 *   rule caught it; it was the gap where no rule was. `Checkbox`
 *   (src/ui/components/screens/Checkbox.tsx) is the fix that was missing, so
 *   the rule can exist now. Eighteen files are frozen here at the
 *   moment it was written — Features itself moved onto the kit rather than
 *   being frozen.
 *
 * - A list screen with no header above its table. Added 2026-08-22, and it is
 *   the first rule here about how a screen is *assembled* rather than which
 *   parts it uses. Every rule before it asks "did you draw this by hand?", and
 *   a screen can answer no to all of them and still be wrong: the Features
 *   screen took `DataTable` whole, drew nothing by hand, passed every check,
 *   and put its title and description inside the table instead of above the
 *   search box. Anthony, twice, with it open: *"this is still not our standard
 *   table... the table that should be above the search bar."* Then: *"why are
 *   you guessing when we have standards and rules — that's the gap we need to
 *   close."* He was right that it was a gap rather than a mistake: the order of
 *   a list screen was a habit copied between screens and written down nowhere.
 *   46 of the 55 screens rendering `DataTable` already had the header above it;
 *   the 9 that did not are sub-tables embedded in a page whose header sits in
 *   the parent, and they are frozen here.
 *
 * A file picker, a colour swatch and a slider are still deliberately not
 * covered. The kit has no replacement for them, so flagging one would be a
 * build failure with no correct fix.
 *
 * The files listed in the allowlist already hand-write one of these. They are
 * frozen, not endorsed: each rule's list may shrink, never grow. Working in one
 * of those files is the moment to move it onto the kit.
 */

const rootDir = process.cwd();
const SCAN_DIR = path.join("src", "app", "(dashboard)");

/**
 * The buttons rule reads wider than the other three: shared components under
 * src/ui hand-draw as many buttons as the screens that use them do.
 */
const BUTTON_SCAN_DIRS = [path.join("src", "app"), path.join("src", "ui")];

/** The movement demos are frozen whole by owner decision; Button draws the one <button> the rest should use. */
const BUTTON_EXEMPT = [
  path.join("src", "app", "(dashboard)", "demos") + path.sep,
  path.join("src", "ui", "atoms", "Button.tsx"),
];

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
    headline: "These draw a table by hand instead of using the kit:",
    fix:
      "Use TableShell from src/ui/components/screens/Table.tsx, with TableHeaderRow,\n" +
      "TableHeaderCell, TableLoadingRow and TableEmptyRow inside it. TableShell draws\n" +
      "the <table> itself — pass it a <thead>/<tbody>, never another <table>.",
  },
  inputs: {
    part: "a text field",
    headline: "These draw a text field by hand instead of using the kit:",
    fix:
      "Use Field from src/ui/components/screens/Field.tsx — it ties the label to the\n" +
      "input for you. TableSearchInput (screens/TableControls.tsx) for a table's search\n" +
      "box, ModalFormField (screens/ModalForm.tsx) for a field inside a modal.",
  },
  assembled: {
    part: "a table out of the kit's loose parts",
    headline: "These build a table out of the kit's loose parts instead of using DataTable:",
    fix:
      "Use DataTable from src/ui/components/screens/DataTable.tsx. Importing TableShell\n" +
      "and its friends and wiring them together is not sharing a table — it is one more\n" +
      "assembly of the same parts, and every drift found so far lived in the wiring\n" +
      "rather than the parts: a footer that only appeared when there was more to load,\n" +
      "a search box inside a second border, a loading state that was a line of text.\n" +
      "A screen should say its columns, its rows, what its empty state says, and which\n" +
      "footer it uses. Nothing else is left to arrange.",
  },
  buttons: {
    part: "a raw <button>",
    headline: "These draw more raw <button>s than their frozen count allows:",
    fix:
      "Use Button from src/ui/atoms/Button.tsx — pick the variant whose look the screen\n" +
      "wants (primary, pill, quiet, ghost, accent, destructive, icon, brand, outline)\n" +
      "and adjust size\n" +
      "through className if it must. A button whose colours or behaviour genuinely match\n" +
      "no variant may stay raw, but only inside a file's frozen count: the counts may\n" +
      "fall, never rise.",
  },
  checkboxes: {
    part: "a tick box",
    headline: "These draw a tick box by hand instead of using the kit:",
    fix:
      "Use Checkbox from src/ui/components/screens/Checkbox.tsx. It ties the label to\n" +
      "the box by id, which is the part hand-written tick boxes skip: an untied label is\n" +
      "silent to a screen reader and does not focus the box when clicked. Pass\n" +
      "`labelHidden` for a box in a table cell whose row already names it — the label\n" +
      "stays tied, only the visible text goes.",
  },
  anatomy: {
    part: "a table with no header above it",
    headline: "These put a table on the page with no header above it:",
    fix:
      "A list screen reads title, then description, then the search box, then the\n" +
      "table, then its footer. Draw the first two with PageHeader\n" +
      "(src/ui/components/screens/PageHeader.tsx), or DetailHeader for a page that opens\n" +
      "on top of a record, or DetailLayout for a section whose tabs live in a layout —\n" +
      "above the DataTable, never inside it. `cardHeader` names a table sitting inside a\n" +
      "page that already has a header; it is not where a screen's own title goes, and a\n" +
      "title placed there renders flush against the card edge while the columns stay\n" +
      "indented. If this table is a fragment whose header genuinely lives in its parent,\n" +
      "that is what the frozen list is for — but check the parent really draws one.",
  },
  headings: {
    part: "a page heading",
    headline: "These draw more page headings by hand than their frozen count allows:",
    fix:
      "Use PageHeader from src/ui/components/screens/PageHeader.tsx for a page that opens\n" +
      "on its own (add `divider` when a tab strip follows it), DetailHeader from the same\n" +
      "file for a page that opens on top of a record (it draws the back row, the title,\n" +
      "the pills and the rule), or DetailLayout (screens/DetailLayout.tsx) for a section\n" +
      "whose tabs live in a layout. All three own the same title recipe, so a heading\n" +
      "written by hand is a copy that will drift from it.",
  },
  headerRule: {
    part: "the header's rule",
    headline: "These draw the header's underline by hand:",
    fix:
      "`border-b border-border-dim pb-6` is the header components' own line. Pass\n" +
      "`divider` to PageHeader, or use DetailHeader/DetailLayout, which always draw it.\n" +
      "Drawing it by hand is how the line went missing from three AI screens and the\n" +
      "whole company section on 2026-08-22: each copy is one more place to forget it.",
  },
};

/**
 * Parts that only make sense as pieces of a table.
 *
 * Three things are deliberately absent, each because failing on it would be a
 * build error with no correct fix:
 *
 * - `SearchBar`, which a screen may legitimately put above a set of cards.
 * - `PaginationFooter` and `LoadMoreFooter`, which page a list of anything. Both
 *   chat-log screens are a scrolling column of conversations with a pager under
 *   it — no table anywhere — and this rule called them hand-assembled tables
 *   until 2026-08-18. Nothing is lost by dropping them: a table assembled by
 *   hand always has a shell, a `<thead>`, or a header cell, so it is still
 *   caught by the entries that remain.
 */
const TABLE_PARTS = [
  "TableShell",
  "TableHeaderRow",
  "TableHeaderCell",
  "TableLoadingRow",
  "TableEmptyRow",
];

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
    assembled: new Set(allowlist.assembled ?? []),
    checkboxes: new Set(allowlist.checkboxes ?? []),
    anatomy: new Set(allowlist.anatomy ?? []),
    // Unlike the lists above this freezes a count per file, because a file
    // with eleven raw buttons cannot be asked to reach zero in one sitting —
    // it is only asked never to reach twelve.
    buttons: new Map(Object.entries(allowlist.buttons ?? {})),
    // Counted per file for the same reason as buttons: a screen may carry a
    // second heading inside its body that has nothing to do with the page
    // title, so the question is never "any heading?" but "one more than it
    // had?".
    headings: new Map(Object.entries(allowlist.headings ?? {})),
    headerRule: new Set(allowlist.headerRule ?? []),
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
 * A file's text, or null when it is no longer there.
 *
 * Listing a directory and reading its files are two moments, and a file can go
 * between them: a build running while a branch is checked out, or — how this
 * was found — the layering check's test writing a probe into `src/ui` and
 * deleting it while this check is reading the same folder. A file that has
 * vanished is not an offender, and crashing the whole check over one is worse
 * than skipping it.
 */
function readIfPresent(fullPath) {
  try {
    return fs.readFileSync(fullPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
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

/** How many raw `<button>`s a file draws. `<Button` is the kit's own and does not count. */
export function countRawButtons(text) {
  return (text.match(/<button\b/g) ?? []).length;
}

/** How many headings a file draws by hand. The kit's components render their own. */
export function countHandWrittenHeadings(text) {
  return (text.match(/<h1\b/g) ?? []).length;
}

/**
 * The header's underline, exactly as the kit draws it.
 *
 * Matched as the literal recipe rather than "any bottom border": a card, a
 * table row and a modal footer all legitimately carry a border-b, and failing
 * those would be a build error with no correct fix.
 */
const HEADER_RULE_CLASSES = /border-b border-border-dim pb-6/g;

/** Every file the buttons rule reads, already relative to the repo root. */
function listButtonFiles() {
  const files = [];
  for (const dir of BUTTON_SCAN_DIRS) {
    for (const file of listFiles(path.join(rootDir, dir))) {
      const relative = path.relative(rootDir, file);
      if (BUTTON_EXEMPT.some((exempt) => relative === exempt || relative.startsWith(exempt))) {
        continue;
      }
      files.push(relative);
    }
  }
  return files;
}

/**
 * The three components that draw a screen's own title.
 *
 * All three own the same title recipe, which is why the headings rule points at
 * them too: a heading written by hand is a copy that will drift from it.
 */
const HEADER_COMPONENTS = /<(PageHeader|DetailHeader|DetailLayout)\b/;

const TYPE_ATTRIBUTE = /\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/;

/** True when this `<input>` is a box a person types into. */
function isTextEntry(openingTag) {
  const match = TYPE_ATTRIBUTE.exec(openingTag);
  if (!match) return true; // no type at all is a text input

  const literal = match[1] ?? match[2];
  if (literal === undefined) return true; // computed at runtime — assume text

  return !CONTROL_TYPES.has(literal.trim());
}

/**
 * True when this `<input>` is a tick box.
 *
 * Read as the literal type only — the opposite of `isTextEntry`, which assumes
 * text when the type is computed. A computed type is not evidence of a tick
 * box, and guessing one here would fail a screen that has none.
 */
function isTickBox(openingTag) {
  const match = TYPE_ATTRIBUTE.exec(openingTag);
  if (!match) return false;

  const literal = match[1] ?? match[2];
  return literal !== undefined && literal.trim() === "checkbox";
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

  const checkboxes = /<input\b/g;
  while ((match = checkboxes.exec(text))) {
    if (!isTickBox(readOpeningTag(text, match.index))) continue;
    found.push({ rule: "checkboxes", file: relative, line: lineOf(match.index) });
  }

  const headerRules = new RegExp(HEADER_RULE_CLASSES.source, "g");
  while ((match = headerRules.exec(text))) {
    found.push({ rule: "headerRule", file: relative, line: lineOf(match.index) });
  }

  // One hit per file: the fault is the screen's shape, not a line of it.
  const tableAt = text.search(/<DataTable\b/);
  if (tableAt >= 0) {
    const headerAt = text.search(HEADER_COMPONENTS);
    if (headerAt < 0 || headerAt > tableAt) {
      found.push({ rule: "anatomy", file: relative, line: lineOf(tableAt) });
    }
  }

  // One hit per file rather than per part: the fault is the assembly, and
  // listing nine lines of it would read as nine problems rather than one.
  if (!/<DataTable\b/.test(text)) {
    const firstPart = TABLE_PARTS
      .map((part) => text.search(new RegExp(`\\b${part}\\b`)))
      .filter((index) => index >= 0)
      .sort((left, right) => left - right)[0];
    const firstHead = text.search(/<thead\b/);
    const at = [firstPart, firstHead >= 0 ? firstHead : undefined]
      .filter((index) => index !== undefined)
      .sort((left, right) => left - right)[0];

    if (at !== undefined) found.push({ rule: "assembled", file: relative, line: lineOf(at) });
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
    const text = readIfPresent(file);
    if (text === null) continue;

    for (const hit of findInFile(relative, text)) {
      if (frozen[hit.rule].has(relative)) continue;
      offenders.push(hit);
    }
  }

  // The buttons rule reads wider and counts rather than lists: a file may keep
  // the raw buttons it already had, and fails the moment it draws one more.
  for (const relative of listButtonFiles()) {
    const text = readIfPresent(path.join(rootDir, relative));
    if (text === null) continue;
    const count = countRawButtons(text);
    if (count === 0) continue;

    const ceiling = frozen.buttons.get(relative) ?? 0;
    if (count > ceiling) {
      offenders.push({ rule: "buttons", file: relative, count, frozen: ceiling });
    }
  }

  // Headings count the same way, over the screens directory alone: the kit's
  // own components draw the heading every screen is meant to use, so a heading
  // in src/ui is the part rather than a copy of it.
  for (const file of listFiles(path.join(rootDir, SCAN_DIR))) {
    const relative = path.relative(rootDir, file);
    const headingText = readIfPresent(file);
    if (headingText === null) continue;
    const count = countHandWrittenHeadings(headingText);
    if (count === 0) continue;

    const ceiling = frozen.headings.get(relative) ?? 0;
    if (count > ceiling) {
      offenders.push({ rule: "headings", file: relative, count, frozen: ceiling });
    }
  }

  return offenders;
}

/** Frozen entries that no longer hand-write anything, so the lists can shrink. */
export function findStaleFreezes(frozen = loadFrozen()) {
  const stale = [];

  for (const relative of frozen.buttons.keys()) {
    const full = path.join(rootDir, relative);
    if (!fs.existsSync(full)) {
      stale.push({ rule: "buttons", file: relative, reason: "no longer exists" });
      continue;
    }
    if (countRawButtons(fs.readFileSync(full, "utf8")) === 0) {
      stale.push({ rule: "buttons", file: relative, reason: "no longer hand-writes a raw <button>" });
    }
  }

  for (const relative of frozen.headings.keys()) {
    const full = path.join(rootDir, relative);
    if (!fs.existsSync(full)) {
      stale.push({ rule: "headings", file: relative, reason: "no longer exists" });
      continue;
    }
    if (countHandWrittenHeadings(fs.readFileSync(full, "utf8")) === 0) {
      stale.push({ rule: "headings", file: relative, reason: "no longer draws a heading by hand" });
    }
  }

  for (const rule of ["tables", "inputs", "assembled", "checkboxes", "anatomy", "headerRule"]) {
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
    const buttonCount = [...frozen.buttons.values()].reduce((sum, count) => sum + count, 0);
    const headingCount = [...frozen.headings.values()].reduce((sum, count) => sum + count, 0);
    console.log(
      `Screen kit: ${frozen.tables.size} tables, ${frozen.inputs.size} fields, ` +
        `${frozen.checkboxes.size} tick boxes, ` +
        `${frozen.anatomy.size} headerless tables, ` +
        `${frozen.assembled.size} hand-assembled tables, ${buttonCount} raw buttons ` +
        `(across ${frozen.buttons.size} files), ${headingCount} hand-written headings ` +
        `(across ${frozen.headings.size} files) and ${frozen.headerRule.size} hand-drawn ` +
        `header rules frozen, no new ones.`
    );
    return;
  }

  for (const rule of Object.keys(RULES)) {
    const forRule = offenders.filter((offender) => offender.rule === rule);
    if (forRule.length === 0) continue;

    console.error(`\n${RULES[rule].headline}\n`);
    for (const offender of forRule) {
      if (offender.count !== undefined) {
        console.error(
          `  ${offender.file} — ${offender.count} × ${RULES[rule].part}, frozen at ${offender.frozen}`
        );
      } else {
        console.error(`  ${offender.file}:${offender.line}`);
      }
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
