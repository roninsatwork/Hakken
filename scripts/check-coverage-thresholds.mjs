import fs from "node:fs";
import path from "node:path";
import { metricsClearingRatchet } from "./coverageRatchet.mjs";

/**
 * Coverage gate, scoped to the platform.
 *
 * The movement demo is roughly half of non-test `src/` and is better covered
 * than the platform is, so a single repo-wide number flatters the code that
 * actually ships to customers. This script therefore splits coverage into
 * "platform" (gating) and "demo" (reported only), so the demo can stay in the
 * repo without hiding platform regressions.
 *
 * See docs/plans/active/platform-hardening-plan.md (P1.6 / P2.2).
 */

const rootDir = process.cwd();
const thresholdsPath = path.join(rootDir, "coverage-thresholds.json");
const summaryPath = path.join(rootDir, "coverage", "coverage-summary.json");
const coverageTolerance = 0.05;
const METRICS = ["lines", "statements", "branches", "functions"];

/** Files owned by the movement demo rather than the platform. */
const DEMO_PATH_PATTERNS = [
  /^src\/app\/\(dashboard\)\/demos\//,
  /^src\/lib\/movements\//,
  /^convex\/movements/,
  /^scripts\/movement-debug\//,
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function formatPercent(value) {
  return `${Number(value).toFixed(2).replace(/\.00$/, "")}%`;
}

function assertThresholdShape(name, thresholds) {
  for (const metric of METRICS) {
    if (typeof thresholds[metric] !== "number") {
      throw new Error(`${name}.${metric} must be a number.`);
    }
  }
}

function toRepoRelative(filePath) {
  const withSlash = rootDir.endsWith(path.sep) ? rootDir : `${rootDir}${path.sep}`;
  const relative = filePath.startsWith(withSlash) ? filePath.slice(withSlash.length) : filePath;
  return relative.split(path.sep).join("/");
}

function isDemoFile(relativePath) {
  return DEMO_PATH_PATTERNS.some((pattern) => pattern.test(relativePath));
}

/** Aggregate covered/total per metric across a set of per-file summary entries. */
function aggregate(entries) {
  const totals = Object.fromEntries(METRICS.map((metric) => [metric, { covered: 0, total: 0 }]));

  for (const entry of entries) {
    for (const metric of METRICS) {
      totals[metric].covered += entry[metric]?.covered ?? 0;
      totals[metric].total += entry[metric]?.total ?? 0;
    }
  }

  return Object.fromEntries(
    METRICS.map((metric) => {
      const { covered, total } = totals[metric];
      return [metric, { covered, total, pct: total === 0 ? 100 : (covered / total) * 100 }];
    }),
  );
}

const config = readJson(thresholdsPath);
assertThresholdShape("current", config.current);
assertThresholdShape("floor", config.floor);

// The ratchet only turns one way: `current` may never be lowered below `floor`.
const configurationFailures = [];
for (const metric of METRICS) {
  if (config.current[metric] < config.floor[metric]) {
    configurationFailures.push(
      `${metric}: current ${formatPercent(config.current[metric])} is below floor ${formatPercent(config.floor[metric])}`,
    );
  }
}

if (configurationFailures.length > 0) {
  console.error("Coverage threshold configuration regressed:");
  for (const failure of configurationFailures) console.error(`- ${failure}`);
  process.exit(1);
}

if (!fs.existsSync(summaryPath)) {
  console.error("Missing coverage/coverage-summary.json. Run npm run test:coverage first.");
  process.exit(1);
}

const summary = readJson(summaryPath);

// How old the numbers being judged actually are.
//
// This reads whatever `test:coverage` last wrote. In CI that is seconds old,
// because the two run back to back. Run by hand it can be anything: on
// 2026-08-26 it was reporting a month-old file as if it were today, four
// points under the floor, and said nothing about it. A threshold check that
// cannot tell you when it was measured is a number without a date on it.
const summaryAgeDays = (Date.now() - fs.statSync(summaryPath).mtimeMs) / 86_400_000;

if (summaryAgeDays >= 1) {
  console.warn(
    `Coverage data is ${Math.floor(summaryAgeDays)} day(s) old (${path.relative(rootDir, summaryPath)}). ` +
      `Run \`npm run test:coverage\` first, or these figures describe a tree that no longer exists.`,
  );
}
const platformEntries = [];
const demoEntries = [];

for (const [filePath, entry] of Object.entries(summary)) {
  if (filePath === "total") continue;
  (isDemoFile(toRepoRelative(filePath)) ? demoEntries : platformEntries).push(entry);
}

if (platformEntries.length === 0) {
  console.error("No platform files found in the coverage summary; refusing to pass vacuously.");
  process.exit(1);
}

const platform = aggregate(platformEntries);
const demo = aggregate(demoEntries);

const coverageFailures = [];
const rows = METRICS.map((metric) => {
  const actual = platform[metric].pct;
  const required = config.current[metric];

  if (actual + coverageTolerance < required) {
    coverageFailures.push(
      `${metric}: platform ${formatPercent(actual)} is below required ${formatPercent(required)}`,
    );
  }

  return { metric, actual, required, platform: platform[metric], demo: demo[metric] };
});

const table = [
  "| Metric | Platform (gated) | Required | Covered | Demo (not gated) |",
  "| --- | ---: | ---: | ---: | ---: |",
  ...rows.map(
    ({ metric, actual, required, platform: p, demo: d }) =>
      `| ${metric} | ${formatPercent(actual)} | ${formatPercent(required)} | ${p.covered}/${p.total} | ${formatPercent(d.pct)} |`,
  ),
].join("\n");

console.log("Coverage threshold summary (gate applies to platform code only):");
console.log(table);
console.log(
  `\nDemo files excluded from the gate: ${demoEntries.length} of ${demoEntries.length + platformEntries.length}.`,
);

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### Coverage Summary\n\nGate applies to platform code only; the movement demo is reported but not gated.\n\n${table}\n`,
  );
}

if (coverageFailures.length > 0) {
  console.error("Coverage thresholds failed:");
  for (const failure of coverageFailures) console.error(`- ${failure}`);
  process.exit(1);
}

// `nextRatchet` was written as the target the floors should climb to, and then
// nothing read it — the file promised a ratchet-up that never happened. When
// the measured platform coverage clears a target, say so loudly; raising
// `current` (and `floor`) in coverage-thresholds.json stays a deliberate,
// reviewed edit rather than something this script does behind anyone's back.
const ready = metricsClearingRatchet(rows, config.nextRatchet);

if (ready.length > 0) {
  const lines = ready.map(
    ({ metric, actual, target }) =>
      `- ${metric}: platform ${formatPercent(actual)} ≥ target ${formatPercent(target)} — raise current/floor in coverage-thresholds.json`,
  );

  console.log("\nCoverage has cleared its next ratchet target:");
  for (const line of lines) console.log(line);

  // Into the run summary as well as the log. This printed only to stdout, so on
  // the one day it finally fires it would have landed in raw CI output that
  // nobody opens — the table above had already learned that lesson.
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Coverage Can Ratchet Up\n\n${lines.join("\n")}\n`,
    );
  }
}
