import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * New screens must take their stacking order from the scale, not invent one.
 *
 * The account menu vanishing behind a page's filter bar was the third bug of
 * its kind. Each time, two elements had picked a z-index by hand, landed on the
 * same number, and the one further down the page won. Raising a number fixed
 * that screen and set up the next one.
 *
 * So the rule is about where the number comes from, not what it is: any new
 * file that needs to stack something reads a role from `src/ui/lib/layers.ts`,
 * where the order is decided once. A screen cannot then tie with the header,
 * because `PAGE_CHROME` is defined below `HEADER`.
 *
 * A numeric rule was tried first and rejected: a dropdown nested inside a
 * filter bar legitimately uses a high number, because a positioned ancestor
 * traps it in that bar's own stacking context and it can never reach the
 * header. Deciding that statically means knowing which ancestors form a
 * context, which this cannot see. Where the number comes from, it can.
 *
 * The files listed below already hardcode one. They are frozen, not endorsed:
 * the list may shrink, never grow. Working in one of them is the moment to
 * move it onto the scale.
 */

const rootDir = process.cwd();
const scanDirs = ["src"];
const LAYERS_MODULE = path.join("src", "ui", "lib", "layers.ts");

/** Tailwind z-index utilities: `z-40`, `z-[60]`, `z-[9999]`. */
const Z_CLASS = /\bz-(?:\[\s*\d+\s*\]|\d+)/g;

/**
 * Files that hardcoded a z-index before the scale existed.
 *
 * Frozen on 2026-08-01. Adding to this list is not the fix — moving the file
 * onto `LAYER` is.
 */
const FROZEN = new Set(
  JSON.parse(
    fs.readFileSync(path.join(rootDir, "scripts", "layering-allowlist.json"), "utf8")
  ).files
);

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

/** Every file outside the frozen list that names a z-index of its own. */
export function findHardcodedLayers() {
  const offenders = [];

  for (const dir of scanDirs) {
    for (const file of listFiles(path.join(rootDir, dir))) {
      const relative = path.relative(rootDir, file);
      if (relative === LAYERS_MODULE) continue;
      if (FROZEN.has(relative)) continue;

      const text = fs.readFileSync(file, "utf8");
      const lines = text.split("\n");

      lines.forEach((line, index) => {
        // `${LAYER.HEADER}` interpolations are the point of the exercise.
        if (line.includes("LAYER.")) return;
        const matches = line.match(Z_CLASS);
        if (!matches) return;
        offenders.push({ file: relative, line: index + 1, classes: [...new Set(matches)] });
      });
    }
  }

  return offenders;
}

/** Frozen entries that no longer hardcode anything, so the list can shrink. */
export function findStaleFreezes() {
  const stale = [];
  for (const relative of FROZEN) {
    const full = path.join(rootDir, relative);
    if (!fs.existsSync(full)) {
      stale.push({ file: relative, reason: "no longer exists" });
      continue;
    }
    const text = fs.readFileSync(full, "utf8");
    const hasRaw = text
      .split("\n")
      .some((line) => !line.includes("LAYER.") && Z_CLASS.test(line));
    Z_CLASS.lastIndex = 0;
    if (!hasRaw) stale.push({ file: relative, reason: "no longer hardcodes a z-index" });
  }
  return stale;
}

function main() {
  const offenders = findHardcodedLayers();
  const stale = findStaleFreezes();

  if (offenders.length === 0 && stale.length === 0) {
    console.log(`Layering: ${FROZEN.size} files frozen, no new hardcoded z-index.`);
    return;
  }

  if (offenders.length > 0) {
    console.error("These pick a stacking order by hand instead of using the scale:\n");
    for (const offender of offenders) {
      console.error(`  ${offender.file}:${offender.line} — ${offender.classes.join(", ")}`);
    }
    console.error(
      "\nImport LAYER from src/ui/lib/layers.ts and use the role that fits — page\n" +
        "chrome, header, overlay. The order is decided there so screens cannot tie\n" +
        "with each other, which is what put the account menu behind a filter bar."
    );
    process.exitCode = 1;
  }

  if (stale.length > 0) {
    console.error("\nThese are frozen but no longer need to be. Remove them from the list:\n");
    for (const entry of stale) {
      console.error(`  ${entry.file} — ${entry.reason}`);
    }
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
