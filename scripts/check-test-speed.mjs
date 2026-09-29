#!/usr/bin/env node
/**
 * The test speed budget (AGENTS.md, "Test time limits"): every test finishes
 * within five seconds on its own, or `npm run test:run` — and so
 * `npm run check` — fails here, before anything is pushed.
 *
 * GitHub runs this suite 10 to 12 times slower than a laptop: its runner is
 * small and shared, measures coverage, and starts every file at once. Its time
 * limit is three minutes (`vitest.config.ts`) and only catches a hang, so
 * speed is judged here. Before this, a slow test was found only when a push
 * failed on it: every CI run that failed in its tests from 2026-09-21 to
 * 2026-09-28 failed on a clock, one test at a time.
 *
 * Timed twice. In the full run most of a slow time is waiting — thousands of
 * tests start at once and queue to load the app's modules: a test that takes
 * 57ms on its own measured 6.4s there (2026-09-28). So a test over the budget
 * in the full run is timed again on its own, and only one still over it fails.
 *
 * A test that is slow on purpose goes on SLOW_TESTS, with why. The list may
 * shrink, never grow: make a slow test lighter rather than add it.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const BUDGET_MS = 5_000;

/** Where `npm run test:run` writes the full run's timings (Vitest's JSON reporter), and where a re-run writes its own. */
const TIMINGS = "test-results/test-timings.json";
const ALONE = "test-results/test-timings-alone.json";

/** Slow on its own, on purpose: "file › full test name" → why. May shrink, never grow. */
export const SLOW_TESTS = new Map([
  [
    "convex/sitesLoad.test.ts › a very large site every Sites query answers within the target on 50,000 keywords, 5,000 pages, 20,000 links and two years",
    "The Sites speed test: every Sites query over 50,000 keywords, about three minutes by design. Runs only here, never on GitHub.",
  ],
]);

/** Every test in a Vitest JSON report: its file, full name and time. */
export function readTimings(report, root = process.cwd()) {
  return report.testResults.flatMap((file) => {
    const relative = path.relative(root, file.name).split(path.sep).join("/");
    return file.assertionResults
      .filter((test) => test.status === "passed")
      .map((test) => ({ file: relative, name: test.fullName, key: `${relative} › ${test.fullName}`, duration: test.duration ?? 0 }));
  });
}

/** Tests over the budget that are not slow on purpose. */
export function overBudget(tests, slowTests = SLOW_TESTS, budgetMs = BUDGET_MS) {
  return tests.filter((test) => test.duration > budgetMs && !slowTests.has(test.key));
}

/** A `-t` pattern that picks exactly these tests out of their file. */
export function namePattern(names) {
  return names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
}

const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;

function timeAlone(file, tests) {
  try {
    execFileSync("npx", ["vitest", "run", file, "-t", namePattern(tests.map((test) => test.name)), "--reporter=json", `--outputFile=${ALONE}`], {
      stdio: "ignore",
    });
  } catch {
    // Failed on its own: the report still says how long each test took.
  }
  if (!fs.existsSync(ALONE)) return new Map();
  const alone = readTimings(JSON.parse(fs.readFileSync(ALONE, "utf8")));
  return new Map(alone.map((test) => [test.key, test.duration]));
}

function main() {
  if (!fs.existsSync(TIMINGS)) {
    console.error(`Test speed: no timings at ${TIMINGS}. Run it through \`npm run test:run\`, which writes them.`);
    process.exit(1);
  }
  const tests = readTimings(JSON.parse(fs.readFileSync(TIMINGS, "utf8")));
  const candidates = overBudget(tests);

  const byFile = new Map();
  for (const test of candidates) byFile.set(test.file, [...(byFile.get(test.file) ?? []), test]);
  const slow = [];
  for (const [file, list] of byFile) {
    const alone = timeAlone(file, list);
    for (const test of list) {
      const own = alone.get(test.key);
      if (own === undefined || own > BUDGET_MS) slow.push({ ...test, own });
    }
  }

  for (const [key] of SLOW_TESTS) {
    const listed = tests.find((test) => test.key === key);
    if (listed && listed.duration <= BUDGET_MS) console.log(`Test speed: "${key}" took ${seconds(listed.duration)} — it can come off SLOW_TESTS.`);
  }

  if (slow.length === 0) {
    console.log(`Test speed: ${tests.length} tests, none over ${seconds(BUDGET_MS)} on its own (${candidates.length} over it in the full run, timed again alone).`);
    return;
  }
  console.error(`Test speed: ${slow.length} test${slow.length === 1 ? "" : "s"} over ${seconds(BUDGET_MS)} on ${slow.length === 1 ? "its" : "their"} own — about a minute each on GitHub (AGENTS.md, "Test time limits"):`);
  for (const test of slow) {
    console.error(`  ${test.key}\n    ${seconds(test.duration)} in the full run, ${test.own === undefined ? "not timed alone (did it run?)" : `${seconds(test.own)} on its own`}`);
  }
  console.error("Make it lighter. Only a test that is slow on purpose goes on SLOW_TESTS in scripts/check-test-speed.mjs, with why.");
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
