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
 *   by file: 387 raw buttons existed the day `Button` (src/ui/components/screens/Button.tsx)
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
 * - A switch drawn from toggle glyphs. Added 2026-08-23, and it is the tick box
 *   rule one day older, found in the place the tick box rule did not reach.
 *   Three system settings screens — masking, developer diagnostics,
 *   self-improvement — each drew a list of on/off rows as bordered cards with a
 *   `ToggleLeft`/`ToggleRight` glyph on the right. No rule caught them: they
 *   wrote no `<table>`, no `<input>`, no tick box, and their raw buttons were
 *   frozen. Anthony, with the three open: *"there are new tables in the system
 *   settings that look hand drawn and need to be standardised."* They were
 *   tables — a name, what it does, and whether it is on — wearing a shape the
 *   kit has no part for. `Checkbox` in a `DataTable` column is what they are
 *   now, and what this rule points at. Four files are frozen here at the moment
 *   it was written: the retention modal's status switch, which is one control in
 *   a dialog rather than a list, and the three schedule screens.
 *
 * - A component declared under a name the kit already exports. Added
 *   2026-08-23, and it is the first rule here about two screens copying *each
 *   other* rather than either of them copying the kit. That is why nothing
 *   caught it: every rule above asks "did this screen redraw a shared part?",
 *   and a private copy of `SettingSwitch` answers no — it redrew a part the
 *   screen next door had already redrawn. Two screens held one, identical to the
 *   kit's character for character except that one used `py-3` where the kit and
 *   the other copy used `py-4`. A third screen declared its own `StatusPill`,
 *   which was not a copy at all but something different wearing a familiar name.
 *   The kit's exported names are read from the kit itself, so adding a component
 *   protects its name the same day. **This list starts empty**: all three were
 *   fixed the day the rule was written, and any entry added later is a
 *   deliberate act rather than inherited debt.
 *
 * - A divided list drawn by hand. Added 2026-08-23, alongside the rule above and
 *   for the same reason: `last:border-0` on a mapped row is a screen saying out
 *   loud that it is drawing its own list, because "except the last one" is only
 *   something you say about a repetition. Twelve files carried it when the sweep
 *   began. Three were the leaderboard rows, which became one shared part; three
 *   more were panel lists — a script's run history, an audit entry's changes, a
 *   wiki page's backlinks — that moved onto `CompactList`. The six left are
 *   frozen. Each hand-drawn copy had got the same three things slightly
 *   differently: the divider, the row rhythm, and what the list said when it was
 *   empty.
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
  path.join("src", "ui", "components", "screens", "Button.tsx"),
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
      "Use Button from src/ui/components/screens/Button.tsx — pick the variant whose look the screen\n" +
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
  dividers: {
    part: "a divided list",
    headline: "These draw their own list of divided rows:",
    fix:
      "`last:border-0` on a mapped row means the screen is drawing its own list, because\n" +
      "\"except the last one\" is only something you say about a repetition. Use CompactList\n" +
      "(src/ui/components/screens/CompactList.tsx) for a run of rows inside a panel that has\n" +
      "already introduced itself — a run history, a list of changes, a page's backlinks — or\n" +
      "DataTable for a screen's own records. Both own the divider, the row rhythm and the\n" +
      "empty state, which are the three things every hand-drawn copy got slightly differently.",
  },
  shadows: {
    part: "a component the kit already exports",
    headline: "These declare a component under a name the kit already uses:",
    fix:
      "Import it from src/ui/components/screens/ instead of declaring\n" +
      "your own. Two screens each held a private copy of SettingSwitch, identical to the\n" +
      "kit's character for character except that one used py-3 where the others used\n" +
      "py-4 — three switches, already a row-height apart, and no rule saw it because\n" +
      "neither screen had copied the kit. They had copied each other.\n" +
      "If yours is genuinely a different component, give it a different name: a reader\n" +
      "who sees a familiar name and gets something else has been misled by the file.\n" +
      "If it wraps the kit's — a run status turned into a tone, say — name it for what\n" +
      "it adds (RunStatusPill) and render the kit's part inside it.",
  },
  switches: {
    part: "an on/off switch",
    headline: "These draw an on/off switch out of toggle glyphs:",
    fix:
      "There are two right answers, and which one you want depends on what the screen is.\n" +
      "\n" +
      "A LIST of things that are on or off is a table: what it is, what it does, and\n" +
      "whether it is switched on. Use DataTable (src/ui/components/screens/DataTable.tsx)\n" +
      "with Checkbox (screens/Checkbox.tsx) in the last column, as System Security and\n" +
      "Self-Improvement do.\n" +
      "\n" +
      "A SINGLE setting inside a form is not a list, and forcing a one-row table on it\n" +
      "would be its own kind of wrong. Use SettingSwitch (screens/SettingsCard.tsx) inside\n" +
      "a SettingsCard, as the agent settings and API Keys screens do.\n" +
      "\n" +
      "Either way, a ToggleLeft/ToggleRight pair is not a shared part — it is a switch\n" +
      "redrawn by eye, and it says its state in colour alone, which is unreadable to\n" +
      "anyone who cannot separate the two colours it picked.",
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
  controls: {
    part: "a table with no footer",
    headline: "These render a DataTable with no footer:",
    fix:
      "A list screen reads title, then description, then the search box, then the table,\n" +
      "then its footer. The rule above checks the header end of that sentence; this one\n" +
      "checks the other end, because a screen can put its header in exactly the right\n" +
      "place and still hand the reader a list with no second page and no count.\n" +
      "\n" +
      "Pass `footer` to DataTable (src/ui/components/screens/DataTable.tsx). It has three\n" +
      "modes: `paged` for a list whose length is known, `cursor` for one too big to\n" +
      "count, `loadMore` for one that grows. Pick the one that matches how the data is\n" +
      "actually read.\n" +
      "\n" +
      "The footer also carries the empty state's wording, so a table without one says\n" +
      "nothing when it has nothing to show.\n" +
      "\n" +
      "**The search box is deliberately not checked here.** It is the standard for a\n" +
      "list screen and it is what a reader reaches for first, but 28 of this codebase's\n" +
      "66 tables are paged with no search box — summaries, skeletons and sub-tables on\n" +
      "detail pages among them — so a rule demanding one would be inventing a standard\n" +
      "rather than holding an existing one. It stays a question for review: if a reader\n" +
      "could plausibly be hunting for one row, the table wants a search box.",
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
    switches: new Set(allowlist.switches ?? []),
    shadows: new Set(allowlist.shadows ?? []),
    dividers: new Set(allowlist.dividers ?? []),
    anatomy: new Set(allowlist.anatomy ?? []),
    controls: new Set(allowlist.controls ?? []),
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

/**
 * Where the kit's components live, for the rule about redeclaring one.
 *
 * The kit only. `src/ui/components/feedback` and the rest of `src/ui`
 * are app chrome rather than the screen kit, and a screen declaring its own
 * `ChatMessage` is not the fault this is about.
 */
const KIT_DIRS = [path.join("src", "ui", "components", "screens")];

/**
 * A top-level declaration of a component: `function Name`, `const Name =`,
 * either exported or not, at any indentation. Uppercase only — a component. A
 * comment line cannot match, because `//` and `*` sit before the keyword.
 */
const COMPONENT_DECLARATION = /^[ \t]*(?:export\s+)?(?:function|const)\s+([A-Z]\w*)\b/gm;

let kitNamesCache = null;

/**
 * Every component name the kit exports.
 *
 * Read from the kit itself rather than listed here, so the rule cannot fall
 * behind the parts: adding a component to the kit immediately protects its name.
 */
function kitComponentNames() {
  if (kitNamesCache) return kitNamesCache;

  const names = new Set();
  for (const dir of KIT_DIRS) {
    const full = path.join(rootDir, dir);
    if (!fs.existsSync(full)) continue;
    for (const file of listFiles(full)) {
      const text = readIfPresent(file);
      if (text === null) continue;
      for (const match of text.matchAll(/^export\s+(?:function|const)\s+([A-Z]\w*)\b/gm)) {
        names.add(match[1]);
      }
    }
  }

  kitNamesCache = names;
  return names;
}

/**
 * A switch drawn by hand, as the glyph pair that always gives it away.
 *
 * Matched as the rendered element rather than the import, so a file that pulls
 * `ToggleRight` in to sit beside a heading as decoration is left alone: it is
 * the pair used as a control that this is about.
 */
const TOGGLE_GLYPHS = /<Toggle(Left|Right)\b/;

/**
 * A divided list drawn by hand, as the class that always gives it away.
 *
 * `last:border-0` and `last:border-b-0` only mean anything on a repeated
 * element — you do not write "except the last one" about a single box. So the
 * class is not a style choice, it is a screen saying out loud that it is drawing
 * its own list of rows. `CompactList` and `DataTable` both own their dividers,
 * so a screen on the kit never needs to write it.
 */
const HAND_DRAWN_DIVIDER = /\blast:border-(?:b-)?0\b/;

/** Every file the buttons rule reads, already relative to the root it was given. */
function listButtonFiles(root = rootDir) {
  const files = [];
  for (const dir of BUTTON_SCAN_DIRS) {
    const full = path.join(root, dir);
    if (!fs.existsSync(full)) continue;
    for (const file of listFiles(full)) {
      const relative = path.relative(root, file);
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

  // One hit per file: a list has many rows and they are one fault.
  const dividerAt = text.search(HAND_DRAWN_DIVIDER);
  if (dividerAt >= 0) {
    found.push({ rule: "dividers", file: relative, line: lineOf(dividerAt) });
  }

  const kitNames = kitComponentNames();
  const declarations = new RegExp(COMPONENT_DECLARATION.source, "gm");
  while ((match = declarations.exec(text))) {
    if (!kitNames.has(match[1])) continue;
    found.push({ rule: "shadows", file: relative, line: lineOf(match.index), name: match[1] });
  }

  // One hit per file: a single switch draws both glyphs, one for each state, so
  // counting them would report every switch twice.
  const switchAt = text.search(TOGGLE_GLYPHS);
  if (switchAt >= 0) {
    found.push({ rule: "switches", file: relative, line: lineOf(switchAt) });
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

    // The other end of the same sentence. A screen can put its header in exactly
    // the right place and still hand the reader a list with no second page, no
    // count, and nothing to say when it is empty.
    if (!/\bfooter=\{/.test(text)) {
      found.push({ rule: "controls", file: relative, line: lineOf(tableAt) });
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
 *
 * `root` is the tree whose screens are read — the repo, unless a test hands it
 * a scratch copy. The tests' probes used to be written into the real
 * `src/app`, so for the moment each one existed every other check walking the
 * tree could see it: on 2026-09-22 the fence checker listed a probe, it was
 * deleted, and the read failed. The kit's own component names still come from
 * the real `src/ui`, because a probe is checked against the real kit.
 */
export function findHandWrittenParts(frozen = loadFrozen(), root = rootDir) {
  const offenders = [];

  for (const file of listFiles(path.join(root, SCAN_DIR))) {
    const relative = path.relative(root, file);
    const text = readIfPresent(file);
    if (text === null) continue;

    for (const hit of findInFile(relative, text)) {
      if (frozen[hit.rule].has(relative)) continue;
      offenders.push(hit);
    }
  }

  // The buttons rule reads wider and counts rather than lists: a file may keep
  // the raw buttons it already had, and fails the moment it draws one more.
  for (const relative of listButtonFiles(root)) {
    const text = readIfPresent(path.join(root, relative));
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
  for (const file of listFiles(path.join(root, SCAN_DIR))) {
    const relative = path.relative(root, file);
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
export function findStaleFreezes(frozen = loadFrozen(), root = rootDir) {
  const stale = [];

  for (const relative of frozen.buttons.keys()) {
    const full = path.join(root, relative);
    if (!fs.existsSync(full)) {
      stale.push({ rule: "buttons", file: relative, reason: "no longer exists" });
      continue;
    }
    if (countRawButtons(fs.readFileSync(full, "utf8")) === 0) {
      stale.push({ rule: "buttons", file: relative, reason: "no longer hand-writes a raw <button>" });
    }
  }

  for (const relative of frozen.headings.keys()) {
    const full = path.join(root, relative);
    if (!fs.existsSync(full)) {
      stale.push({ rule: "headings", file: relative, reason: "no longer exists" });
      continue;
    }
    if (countHandWrittenHeadings(fs.readFileSync(full, "utf8")) === 0) {
      stale.push({ rule: "headings", file: relative, reason: "no longer draws a heading by hand" });
    }
  }

  for (const rule of [
    "tables",
    "inputs",
    "assembled",
    "checkboxes",
    "switches",
    "shadows",
    "dividers",
    "anatomy",
    "controls",
    "headerRule",
  ]) {
    for (const relative of frozen[rule]) {
      const full = path.join(root, relative);
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
        `${frozen.checkboxes.size} tick boxes, ${frozen.switches.size} switches, ` +
        `${frozen.shadows.size} shadowed kit names, ${frozen.dividers.size} hand-drawn lists, ` +
        `${frozen.anatomy.size} headerless tables, ` +
        `${frozen.controls.size} footerless tables, ` +
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
