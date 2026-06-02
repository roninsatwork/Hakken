import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const thresholdsPath = path.join(rootDir, "coverage-thresholds.json");
const summaryPath = path.join(rootDir, "coverage", "coverage-summary.json");
const coverageTolerance = 0.05;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function formatPercent(value) {
  return `${Number(value).toFixed(2).replace(/\.00$/, "")}%`;
}

function assertThresholdShape(name, thresholds) {
  for (const metric of ["lines", "statements", "branches", "functions"]) {
    if (typeof thresholds[metric] !== "number") {
      throw new Error(`${name}.${metric} must be a number.`);
    }
  }
}

const config = readJson(thresholdsPath);
assertThresholdShape("current", config.current);
assertThresholdShape("floor", config.floor);

const configurationFailures = [];
for (const metric of ["lines", "statements", "branches", "functions"]) {
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

const summary = readJson(summaryPath).total;
const coverageFailures = [];
const rows = [];

for (const metric of ["lines", "statements", "branches", "functions"]) {
  const actual = Number(summary[metric]?.pct ?? 0);
  const required = config.current[metric];
  const covered = summary[metric]?.covered ?? 0;
  const total = summary[metric]?.total ?? 0;
  rows.push({ metric, actual, required, covered, total });

  if (actual + coverageTolerance < required) {
    coverageFailures.push(`${metric}: ${formatPercent(actual)} is below required ${formatPercent(required)}`);
  }
}

const table = [
  "| Metric | Actual | Required | Covered |",
  "| --- | ---: | ---: | ---: |",
  ...rows.map(
    ({ metric, actual, required, covered, total }) =>
      `| ${metric} | ${formatPercent(actual)} | ${formatPercent(required)} | ${covered}/${total} |`,
  ),
].join("\n");

console.log("Coverage threshold summary:");
console.log(table);

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Coverage Summary\n\n${table}\n`);
}

if (coverageFailures.length > 0) {
  console.error("Coverage thresholds failed:");
  for (const failure of coverageFailures) console.error(`- ${failure}`);
  process.exit(1);
}
