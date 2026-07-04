#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

const defaultRunsDir = "tmp/movement-replay-lab/runs";
const latestPointerName = "latest-analysis-path.txt";
const latestExportPointerName = "latest-export-path.txt";

function printHelp() {
  console.log(`Run one Movement Replay Lab iteration.

Usage:
  npm run movement:replay:iteration -- --limit 5 --label after-squat-fix

Options:
  --limit <n>       Recent Convex rows to analyze. Default: 5.
  --source <kind>   Analyze saved recordings (default) or debug-sessions.
  --file <path>     Read raw Convex row JSON instead of fetching.
  --export <path>   Reuse a Convex export ZIP/directory containing _storage files.
  --refresh-export  Create a fresh Convex export with file storage for saved recordings.
  --before <path>   Compare against a specific earlier analysis JSON.
  --label <name>    Human-readable run label used in filenames.
  --out-dir <dir>   Directory for timestamped run files. Defaults to ${defaultRunsDir}
  --strict          Forward strict mode to movement:replay:analyze.
  --help            Show this help.
`);
}

function parseArgs(argv) {
  const args = {
    before: "",
    exportPath: "",
    file: "",
    label: "current",
    limit: "5",
    outDir: defaultRunsDir,
    refreshExport: false,
    source: "recordings",
    strict: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg === "--limit") {
      args.limit = argv[++index] || "5";
    } else if (arg === "--file") {
      args.file = argv[++index] || "";
    } else if (arg === "--source") {
      const source = argv[++index] || "recordings";
      if (source !== "recordings" && source !== "debug-sessions") {
        throw new Error("--source must be either recordings or debug-sessions.");
      }
      args.source = source;
    } else if (arg === "--export") {
      args.exportPath = argv[++index] || "";
    } else if (arg === "--refresh-export") {
      args.refreshExport = true;
    } else if (arg === "--before") {
      args.before = argv[++index] || "";
    } else if (arg === "--label") {
      args.label = argv[++index] || "current";
    } else if (arg === "--out-dir") {
      args.outDir = argv[++index] || defaultRunsDir;
    } else if (arg === "--strict") {
      args.strict = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return args;
}

function sanitizeLabel(value) {
  return String(value || "current")
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "current";
}

function timestampPrefix() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function fileExists(filePath) {
  try {
    await access(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function readLatestPath(runsDir) {
  const pointerPath = path.join(runsDir, latestPointerName);
  if (!(await fileExists(pointerPath))) return "";

  const candidate = (await readFile(pointerPath, "utf8")).trim();
  if (!candidate) return "";
  return await fileExists(candidate) ? candidate : "";
}

async function readLatestExportPath(runsDir) {
  const pointerPath = path.join(runsDir, latestExportPointerName);
  if (!(await fileExists(pointerPath))) return "";

  const candidate = (await readFile(pointerPath, "utf8")).trim();
  if (!candidate) return "";
  return await fileExists(candidate) ? candidate : "";
}

function runNodeScript(scriptPath, args) {
  execFileSync(process.execPath, [scriptPath, ...args], {
    env: {
      ...process.env,
      SENTRY_DSN: "",
    },
    stdio: "inherit",
  });
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function countFailures(analysis, severity) {
  return analysis.failures.filter((failure) => failure.severity === severity).length;
}

function formatNumber(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "0.00";
}

function formatDelta(value, digits = 2) {
  const formatted = formatNumber(value, digits);
  return value > 0 ? `+${formatted}` : formatted;
}

function summarizeAnalyses(analyses) {
  return {
    errors: analyses.reduce((sum, analysis) => sum + countFailures(analysis, "error"), 0),
    failed: analyses.filter((analysis) => !analysis.pass).length,
    sessions: analyses.length,
    warnings: analyses.reduce((sum, analysis) => sum + countFailures(analysis, "warning"), 0),
  };
}

function renderSessionRows(analyses) {
  return analyses.map((analysis) => {
    const errorCount = countFailures(analysis, "error");
    const warningCount = countFailures(analysis, "warning");
    const result = errorCount > 0 ? "FAIL" : warningCount > 0 ? "REVIEW" : "CLEAN";
    return `| ${[
    result,
    analysis.sessionId,
    analysis.summary.frameCount,
    `${Math.round((analysis.metrics.visualMatchScore || 0) * 100)}%`,
    analysis.metrics.avatarVisualFrameCount
      ? `${formatNumber(analysis.metrics.averageAvatarLowerBodyDirectionError)} / ${analysis.metrics.avatarVisualFrameCount}`
      : "none",
    `${formatNumber(analysis.metrics.maxRootHeadingYaw)} / ${formatNumber(analysis.metrics.maxRootPathDistance)}`,
    `${analysis.metrics.rootMotionWorldLandmarkFrameCount} / ${analysis.metrics.rootMotionSourceLimitedFrameCount}`,
    formatNumber(analysis.metrics.averageRetargetQuality),
    analysis.metrics.strongFullBodyFrameCount,
    analysis.metrics.lowerBodyOwnerTransitions,
    errorCount,
    warningCount,
  ].join(" | ")} |`;
  });
}

function renderComparison(comparison) {
  if (!comparison) {
    return [
      "## Comparison",
      "",
      "No previous replay analysis was available, so this run is the baseline.",
    ];
  }

  const lines = [
    "## Comparison",
    "",
    `- Failed sessions: ${comparison.before.failedSessionCount} -> ${comparison.after.failedSessionCount} (${formatDelta(comparison.deltas.failedSessionCount, 0)})`,
    `- Errors: ${comparison.before.errorCount} -> ${comparison.after.errorCount} (${formatDelta(comparison.deltas.errorCount, 0)})`,
    `- Warnings: ${comparison.before.warningCount} -> ${comparison.after.warningCount} (${formatDelta(comparison.deltas.warningCount, 0)})`,
    "",
    "| Metric | Delta |",
    "| --- | ---: |",
  ];

  for (const [metric, delta] of Object.entries(comparison.deltas.metrics)) {
    lines.push(`| ${metric} | ${formatDelta(delta)} |`);
  }

  const changedCodes = Object.entries(comparison.deltas.failureCountsByCode)
    .filter(([, count]) => count.delta !== 0);
  if (changedCodes.length > 0) {
    lines.push("", "### Failure-Code Deltas", "", "| Code | Before | After | Delta |", "| --- | ---: | ---: | ---: |");
    for (const [code, count] of changedCodes) {
      lines.push(`| ${code} | ${count.before} | ${count.after} | ${formatDelta(count.delta, 0)} |`);
    }
  }

  return lines;
}

async function writeMarkdownReport({
  analysisPath,
  comparisonPath,
  label,
  previousPath,
  reportPath,
}) {
  const analyses = await readJson(analysisPath);
  const comparison = comparisonPath && await fileExists(comparisonPath)
    ? await readJson(comparisonPath)
    : null;
  const summary = summarizeAnalyses(analyses);
  const lines = [
    `# Movement Replay Iteration: ${label}`,
    "",
    `Created: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `- Sessions: ${summary.sessions}`,
    `- Failed sessions: ${summary.failed}`,
    `- Errors: ${summary.errors}`,
    `- Warnings: ${summary.warnings}`,
    `- Analysis JSON: ${analysisPath}`,
    `- Previous analysis: ${previousPath || "none"}`,
    comparisonPath ? `- Comparison JSON: ${comparisonPath}` : "- Comparison JSON: none",
    "",
    ...renderComparison(comparison),
    "",
    "## Sessions",
    "",
    "| Result | Session | Frames | Visual Match | Avatar Output | Root Yaw/Path | Root World/Limited | Retarget Avg | Strong Frames | Owner Transitions | Errors | Warnings |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...renderSessionRows(analyses),
    "",
  ];

  await writeFile(reportPath, `${lines.join("\n")}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runsDir = path.resolve(args.outDir);
  await mkdir(runsDir, { recursive: true });

  const label = sanitizeLabel(args.label);
  const runName = `${timestampPrefix()}-${label}`;
  const analysisPath = path.join(runsDir, `${runName}.analysis.json`);
  const comparisonPath = path.join(runsDir, `${runName}.comparison.json`);
  const reportPath = path.join(runsDir, `${runName}.md`);
  const pointerPath = path.join(runsDir, latestPointerName);
  const exportPointerPath = path.join(runsDir, latestExportPointerName);
  const previousPath = args.before ? path.resolve(args.before) : await readLatestPath(runsDir);
  const previousExportPath = args.exportPath
    ? path.resolve(args.exportPath)
    : await readLatestExportPath(runsDir);
  const shouldCreateExport = args.source === "recordings" && (!previousExportPath || args.refreshExport);
  const exportPath = args.source === "recordings"
    ? shouldCreateExport
      ? path.join(runsDir, `${runName}.convex-export.zip`)
      : previousExportPath
    : "";

  const analyzeArgs = ["--source", args.source, "--out", analysisPath];
  if (args.file) {
    analyzeArgs.push("--file", args.file);
  } else {
    analyzeArgs.push("--limit", args.limit);
  }
  if (exportPath) analyzeArgs.push("--export", exportPath);
  if (shouldCreateExport) analyzeArgs.push("--create-export");
  if (args.strict) analyzeArgs.push("--strict");

  console.log(`Running replay iteration: ${label}`);
  if (args.source === "recordings") {
    console.log(
      shouldCreateExport
        ? `Creating Convex storage export: ${exportPath}`
        : `Reusing Convex storage export: ${exportPath}`,
    );
  }
  runNodeScript("scripts/movement-debug/analyze-sessions.mjs", analyzeArgs);

  if (previousPath && previousPath !== analysisPath) {
    console.log("");
    console.log(`Comparing against ${previousPath}`);
    runNodeScript("scripts/movement-debug/compare-replay-analysis.mjs", [
      "--before",
      previousPath,
      "--after",
      analysisPath,
      "--out",
      comparisonPath,
    ]);
  } else {
    console.log("");
    console.log("No previous analysis found; comparison skipped for this first run.");
  }

  await writeMarkdownReport({
    analysisPath,
    comparisonPath: previousPath ? comparisonPath : "",
    label,
    previousPath,
    reportPath,
  });
  await writeFile(pointerPath, `${analysisPath}\n`);
  if (exportPath) await writeFile(exportPointerPath, `${exportPath}\n`);

  console.log("");
  console.log("Replay iteration files:");
  console.log(`  analysis: ${analysisPath}`);
  if (previousPath) console.log(`  comparison: ${comparisonPath}`);
  console.log(`  report: ${reportPath}`);
  console.log(`  latest pointer: ${pointerPath}`);
  if (exportPath) console.log(`  latest export pointer: ${exportPointerPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
