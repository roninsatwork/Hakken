import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * A single NUL byte in a source file makes git treat the whole file as binary.
 *
 * Nothing else objects. TypeScript compiles it, ESLint lints it, Vitest runs
 * it, and the byte is invisible in an editor — but `git diff` stops showing
 * changes and prints `Bin` instead, so the file lands in a commit with its
 * edits unreviewable, and every later diff of it is blind too. It happened to
 * a `.tsx` file during the sales data work and was only caught by eye.
 *
 * git decides by looking for a NUL in the first 8000 bytes, so this checks the
 * same thing on the same window, over tracked files whose extension says they
 * are text. Genuinely binary tracked files — models, images, fonts — are not
 * listed here and are not checked.
 *
 * See docs/plans/active/workspace-sales-data-plan.md ("Two things that bit").
 */

const rootDir = process.cwd();

/** Extensions whose contents must be text. Anything else is left alone. */
const TEXT_EXTENSIONS = new Set([
  ".css",
  ".cjs",
  ".html",
  ".ini",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".mts",
  ".py",
  ".sh",
  ".svg",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
  ".zsh",
]);

/** The window git itself inspects before calling a file binary. */
const SNIFF_BYTES = 8000;

/**
 * Tracked files plus new ones not yet added, minus anything gitignored. A file
 * written this minute is exactly the one at risk, so waiting until it is staged
 * to look at it would miss the case this guard exists for.
 */
function trackedFiles() {
  const output = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: rootDir,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return [...new Set(output.split("\0").filter(Boolean))];
}

function firstNulOffset(filePath) {
  let handle;
  try {
    handle = fs.openSync(filePath, "r");
  } catch {
    // Listed by git but not on disk — a deleted file mid-change, not our problem.
    return -1;
  }

  try {
    const buffer = Buffer.alloc(SNIFF_BYTES);
    const read = fs.readSync(handle, buffer, 0, SNIFF_BYTES, 0);
    return buffer.subarray(0, read).indexOf(0);
  } finally {
    fs.closeSync(handle);
  }
}

/** Tracked text files holding a NUL byte, with where in the file it sits. */
export function findBinaryTextFiles(files = trackedFiles(), baseDir = rootDir) {
  const offenders = [];

  for (const file of files) {
    if (!TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
    const offset = firstNulOffset(path.join(baseDir, file));
    if (offset !== -1) offenders.push({ file, offset });
  }

  return offenders;
}

function main() {
  const files = trackedFiles().filter((file) => TEXT_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const offenders = findBinaryTextFiles(files);

  if (offenders.length === 0) {
    console.log(`Text encoding: ${files.length} tracked source files checked, none read as binary.`);
    return;
  }

  console.error("These source files contain a NUL byte, so git treats them as binary and diffs them as `Bin`:\n");
  for (const { file, offset } of offenders) {
    console.error(`  ${file} — first NUL at byte ${offset}`);
  }
  console.error("\nStrip the byte before committing, or the changes in these files land unreviewable.");
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
