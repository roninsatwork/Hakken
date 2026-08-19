import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Turn the `template:remove` fence markers back into a working template build.
 *
 * Shared files carry fences — a `template:remove` start comment naming a
 * vertical, and a matching end — around the lines a vertical unavoidably leaves in
 * the schema, the HTTP router, the workflow engine, the sidebar. The original
 * build that read them (`scripts/build-template.mjs`, driven by
 * `template.manifest.json`) was removed on 2026-08-09, which left the markers
 * as decoration: a promise in the code that nothing kept. A marker nothing
 * executes is worse than no marker, because people maintain it believing it
 * does something.
 *
 * This script is the executor and the keeper, in one file so they cannot
 * drift apart:
 *
 *   node scripts/strip-verticals.mjs --keep base,salesData --out <dir>
 *     Copies the repo into <dir> with every fenced block for a vertical NOT
 *     in --keep removed. The working tree is never touched. Only fenced
 *     blocks are removed — no file-level markers exist today, so whole
 *     vertical directories stay put and the report at the end says so.
 *
 *   node scripts/strip-verticals.mjs --check
 *     Validates every fence without copying anything: each start has an end,
 *     nesting closes in order, and each start names a real vertical. Runs in
 *     check:guards so a half-typed fence fails the build the day it is
 *     written, not the day someone builds a template.
 *
 * The vertical names are not hardcoded here: the module-owning ones are read
 * from COMPANY_MODULES in convex/utils/companyModules.ts, so a new vertical
 * registered there is known here for free. `movement` and `arcade` are demos
 * with no module key, so they are the one list this file owns.
 */

const MARKER = /template:remove:(start|end)(?:[ \t]+([A-Za-z0-9_]+))?/;

/** Demo verticals that have fences but no company-module key. */
const MODULELESS_VERTICALS = ["movement", "arcade"];

/** Directories never scanned and never copied into a template. */
const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".claude",
  "tmp",
  "coverage",
  "out",
  "build",
  "dist",
  "playwright-report",
  "test-results",
]);

/** Only code files carry real fences; docs mention them in prose. */
const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

/**
 * The verticals a fence may name, read from the module registry so the two
 * lists cannot disagree. "base" is registered there but is the platform
 * itself — a fence trying to remove it is a mistake, so it is not returned.
 */
export function loadKnownVerticals(root) {
  const registry = path.join(root, "convex", "utils", "companyModules.ts");
  const text = fs.readFileSync(registry, "utf8");
  const names = new Set(MODULELESS_VERTICALS);
  for (const match of text.matchAll(/vertical:\s*"([A-Za-z0-9_]+)"/g)) {
    if (match[1] !== "base") names.add(match[1]);
  }
  return names;
}

/**
 * Walk one file's lines with a fence stack. Returns the validation errors
 * and, when `remove` is given, the surviving text. Fences nest (the sidebar
 * wraps salesReports inside salesData), so a line dies if any open fence
 * around it is being removed. Markers for kept fences survive, so a template
 * can itself be stripped again later.
 */
export function stripFences(text, file, known, remove = new Set()) {
  const errors = [];
  const kept = [];
  const stack = [];
  const lines = text.split("\n");

  lines.forEach((line, index) => {
    const at = `${file}:${index + 1}`;
    const match = line.match(MARKER);
    const insideRemoved = stack.some((fence) => fence.removing);

    if (match && match[1] === "start") {
      const name = match[2];
      if (!name) {
        errors.push(`${at}: start fence names no vertical`);
      } else if (!known.has(name)) {
        errors.push(
          `${at}: unknown vertical "${name}" — known: ${[...known].sort().join(", ")}`
        );
      }
      const removing = insideRemoved || (name !== undefined && remove.has(name));
      stack.push({ name: name ?? "?", removing, at });
      if (!removing) kept.push(line);
      return;
    }

    if (match && match[1] === "end") {
      if (stack.length === 0) {
        errors.push(`${at}: end fence with no open start`);
        kept.push(line);
        return;
      }
      const fence = stack.pop();
      if (!fence.removing) kept.push(line);
      return;
    }

    if (!insideRemoved) kept.push(line);
  });

  for (const fence of stack) {
    errors.push(`${fence.at}: start fence for "${fence.name}" never closed`);
  }

  return { errors, text: kept.join("\n") };
}

/** Every code file under root, as paths relative to root. */
function* walk(root, dir = "") {
  const entries = fs.readdirSync(path.join(root, dir), { withFileTypes: true });
  for (const entry of entries) {
    const relative = dir ? path.join(dir, entry.name) : entry.name;
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) yield* walk(root, relative);
    } else if (entry.isFile()) {
      yield relative;
    }
  }
}

/** Validate every fence in the tree. Returns the flat error list. */
export function checkTree(root) {
  const known = loadKnownVerticals(root);
  const errors = [];
  let fenced = 0;

  for (const relative of walk(root)) {
    if (!CODE_EXTENSIONS.has(path.extname(relative))) continue;
    const text = fs.readFileSync(path.join(root, relative), "utf8");
    if (!text.includes("template:remove")) continue;
    fenced += 1;
    errors.push(...stripFences(text, relative, known).errors);
  }

  return { errors, fenced, known };
}

/**
 * Copy the repo into `out`, removing every fenced block whose vertical is not
 * kept. Never writes inside the working tree; refuses an `out` inside root.
 */
export function buildTemplate(root, keep, out) {
  const known = loadKnownVerticals(root);
  const keepSet = new Set(keep);
  keepSet.add("base");

  for (const name of keepSet) {
    if (name !== "base" && !known.has(name)) {
      throw new Error(`--keep names unknown vertical "${name}" — known: ${[...known].sort().join(", ")}`);
    }
  }

  const resolvedOut = path.resolve(out);
  const resolvedRoot = path.resolve(root);
  if (resolvedOut === resolvedRoot || resolvedOut.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`--out must be outside the repo, got ${resolvedOut}`);
  }

  const remove = new Set([...known].filter((name) => !keepSet.has(name)));
  const { errors } = checkTree(root);
  if (errors.length > 0) {
    return { errors, remove, copied: 0, changed: 0 };
  }

  let copied = 0;
  let changed = 0;

  for (const relative of walk(root)) {
    const source = path.join(root, relative);
    const target = path.join(resolvedOut, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });

    const isCode = CODE_EXTENSIONS.has(path.extname(relative));
    if (isCode) {
      const text = fs.readFileSync(source, "utf8");
      if (text.includes("template:remove")) {
        const stripped = stripFences(text, relative, known, remove).text;
        fs.writeFileSync(target, stripped);
        if (stripped !== text) changed += 1;
        copied += 1;
        continue;
      }
    }

    fs.copyFileSync(source, target);
    copied += 1;
  }

  return { errors: [], remove, copied, changed };
}

function main() {
  const root = process.cwd();
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const keepArg = args[args.indexOf("--keep") + 1];
  const outArg = args[args.indexOf("--out") + 1];

  if (checkOnly) {
    const { errors, fenced, known } = checkTree(root);
    if (errors.length > 0) {
      console.error("Broken template fences:\n");
      for (const error of errors) console.error(`  ${error}`);
      console.error(
        "\nEvery start fence needs a matching end and a vertical registered in\n" +
          "convex/utils/companyModules.ts (or movement/arcade)."
      );
      process.exitCode = 1;
      return;
    }
    console.log(
      `Template fences: ${fenced} fenced files balanced, verticals: ${[...known].sort().join(", ")}.`
    );
    return;
  }

  if (!args.includes("--keep") || !args.includes("--out") || !keepArg || !outArg) {
    console.error(
      "Usage: node scripts/strip-verticals.mjs --keep base,salesData --out <dir>\n" +
        "       node scripts/strip-verticals.mjs --check"
    );
    process.exitCode = 1;
    return;
  }

  const keep = keepArg.split(",").map((name) => name.trim()).filter(Boolean);
  const result = buildTemplate(root, keep, outArg);

  if (result.errors.length > 0) {
    console.error("Refusing to build from broken fences:\n");
    for (const error of result.errors) console.error(`  ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Template written to ${path.resolve(outArg)}: ${result.copied} files, ` +
      `${result.changed} had fenced blocks removed ` +
      `(stripped: ${[...result.remove].sort().join(", ") || "nothing"}).`
  );
  console.log(
    "Fenced blocks only — no file-level markers exist, so each stripped\n" +
      "vertical's own files are still in the tree and must be deleted by hand."
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
