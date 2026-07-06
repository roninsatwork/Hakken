#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  recordingGapActionForRow,
  recordingGapPlanForManifest,
  recordingGapRowsForManifest,
  recordingGapPlanSummaryText,
  recordingGapProtocolText,
  recordingGapTopGroupsText,
} from "./recording-gap-plan.mjs";
import {
  proofQueueSummariesForManifest,
  proofQueueSummaryText,
} from "./proof-queue-summary.mjs";
import {
  recordingGuideMarkdownForPlan,
  recordingScenarioQuickValidationCommand,
  recordingScenarioValidationCommand,
} from "./write-replay-proof-review.mjs";

export {
  recordingGapActionForRow,
  recordingGapPlanForManifest,
  recordingGapRowsForManifest,
};

const defaultRunsDir = "tmp/movement-replay-lab/runs";
const latestPointerName = "latest-analysis-path.txt";
const latestExportPointerName = "latest-export-path.txt";
const latestRecordingGuidePointerName = "latest-recording-guide-path.txt";
const latestRecordingPlanPointerName = "latest-recording-plan-path.txt";
const latestReportPointerName = "latest-report-path.txt";
const latestSummaryPointerName = "latest-summary-path.txt";

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
  --recording-ids <ids>
                    Analyze only comma/space/newline separated recording or debug-session ids.
  --recording-ids-file <path>
                    Read exact recording/debug-session ids from a text file.
  --recording-plan <path>
                    Read exact recording/debug-session ids from a generated recording-plan JSON.
  --recording-scenario <id>
                    With --recording-plan, analyze only one capture scenario by id,
                    fresh recording label, title, or proof case. Can repeat.
  --before <path>   Compare against a specific earlier analysis JSON.
  --label <name>    Human-readable run label used in filenames.
  --out-dir <dir>   Directory for timestamped run files. Defaults to ${defaultRunsDir}
  --visual-captures <path>
                    Forward Replay Lab capture manifests/directories to movement:replay:analyze. Can repeat.
  --review-decisions <path>
                    Forward manual review decisions to movement:replay:analyze.
  --source-limitation-decisions <path>
                    Forward explicit source-limitation decisions to movement:replay:analyze.
  --strict          Forward strict mode to movement:replay:analyze.
  --strict-manifest Forward strict manifest proof mode to movement:replay:analyze.
  --strict-proof-regression
                    Fail comparison when proof manifest blocker counts regress.
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
    recordingIdPath: "",
    recordingIds: [],
    recordingPlanPath: "",
    recordingScenarioIds: [],
    refreshExport: false,
    reviewDecisionPath: "",
    sourceLimitationDecisionPath: "",
    source: "recordings",
    strict: false,
    strictManifest: false,
    strictProofRegression: false,
    visualCapturePaths: [],
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
    } else if (arg === "--recording-ids" || arg === "--session-ids") {
      args.recordingIds.push(argv[++index] || "");
    } else if (arg === "--recording-ids-file" || arg === "--session-ids-file") {
      args.recordingIdPath = argv[++index] || "";
    } else if (arg === "--recording-plan") {
      args.recordingPlanPath = argv[++index] || "";
    } else if (arg === "--recording-scenario") {
      args.recordingScenarioIds.push(argv[++index] || "");
    } else if (arg === "--before") {
      args.before = argv[++index] || "";
    } else if (arg === "--label") {
      args.label = argv[++index] || "current";
    } else if (arg === "--out-dir") {
      args.outDir = argv[++index] || defaultRunsDir;
    } else if (arg === "--visual-captures") {
      args.visualCapturePaths.push(argv[++index] || "");
    } else if (arg === "--review-decisions") {
      args.reviewDecisionPath = argv[++index] || "";
    } else if (arg === "--source-limitation-decisions") {
      args.sourceLimitationDecisionPath = argv[++index] || "";
    } else if (arg === "--strict") {
      args.strict = true;
    } else if (arg === "--strict-manifest") {
      args.strictManifest = true;
    } else if (arg === "--strict-proof-regression") {
      args.strictProofRegression = true;
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

export function iterationPointerPaths(runsDir) {
  return {
    latestAnalysisPath: path.join(runsDir, latestPointerName),
    latestExportPath: path.join(runsDir, latestExportPointerName),
    latestRecordingGuidePath: path.join(runsDir, latestRecordingGuidePointerName),
    latestRecordingPlanPath: path.join(runsDir, latestRecordingPlanPointerName),
    latestReportPath: path.join(runsDir, latestReportPointerName),
    latestSummaryPath: path.join(runsDir, latestSummaryPointerName),
  };
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

function proofTrendForComparison(comparison) {
  const countDeltas = comparison.proofManifest?.deltas?.counts ?? {};
  const regressions = [
    "blockingRowCount",
    "failedCount",
    "manualReviewCount",
    "missingProofCount",
    "sourceDataLimitationCount",
  ].some((key) => (countDeltas[key]?.delta ?? 0) > 0) || [
    "acceptedProductLimitationCount",
    "passedCount",
    "visualCaptureFrameCount",
    "visualCaptureRowCount",
  ].some((key) => (countDeltas[key]?.delta ?? 0) < 0);

  if (regressions) return "regressed";
  return comparison.proofManifest?.improvementReasons?.length ? "improved" : "unchanged";
}

function summarizeAnalyses(analyses) {
  const coverageSummary = analyses[0]?.coverage?.summary ?? null;

  return {
    coverageInternalDemoOnly: coverageSummary?.internalDemoOnlyCount ?? 0,
    coverageMissingProof: coverageSummary?.missingProofCount ?? 0,
    coverageUserFacing: coverageSummary?.userFacingCount ?? 0,
    errors: analyses.reduce((sum, analysis) => sum + countFailures(analysis, "error"), 0),
    failed: analyses.filter((analysis) => !analysis.pass).length,
    sessions: analyses.length,
    warnings: analyses.reduce((sum, analysis) => sum + countFailures(analysis, "warning"), 0),
  };
}

function proofManifestPathForAnalysis(analysisPath) {
  return analysisPath.endsWith(".json")
    ? analysisPath.replace(/\.json$/, ".proof-manifest.json")
    : `${analysisPath}.proof-manifest.json`;
}

function summarizeProofManifest(manifest) {
  if (!manifest?.summary) return null;

  return {
    failed: manifest.summary.failedCount ?? 0,
    manualReview: manifest.summary.manualReviewCount ?? 0,
    appliedManualReviewDecision: manifest.summary.appliedManualReviewDecisionCount ?? 0,
    missingProof: manifest.summary.missingProofCount ?? 0,
    passed: manifest.summary.passedCount ?? 0,
    productScopeLimitation: manifest.summary.productScopeLimitationCount ?? 0,
    sourceDataLimitation: manifest.summary.sourceDataLimitationCount ?? 0,
    acceptedProductLimitation: manifest.summary.acceptedProductLimitationCount ?? 0,
    appliedSourceLimitationDecision: manifest.summary.appliedSourceLimitationDecisionCount ?? 0,
    total: manifest.summary.totalRows ?? 0,
    visualCaptureRows: manifest.summary.visualCaptureRowCount ?? 0,
  };
}

export function iterationRunSummary({
  analysisPath,
  analyses,
  comparison,
  comparisonPath,
  generatedAt,
  label,
  previousPath,
  proofManifest,
  proofManifestPath,
  proofQueueSummary,
  recordingGuidePath,
  recordingGapPlan,
  recordingGapPlanPath,
  reportPath,
  reviewDecisionPath,
  sourceLimitationDecisionPath,
  visualCapturePaths,
}) {
  const analysisSummary = summarizeAnalyses(analyses);
  const proofSummary = summarizeProofManifest(proofManifest);

  return {
    analysisPath,
    analysisSummary,
    comparisonPath: comparisonPath || null,
    generatedAt,
    inputs: {
      previousAnalysisPath: previousPath || null,
      reviewDecisionPath: reviewDecisionPath || null,
      sourceLimitationDecisionPath: sourceLimitationDecisionPath || null,
      visualCapturePaths,
    },
    label,
    proofManifestPath,
    proofSummary,
    proofTrend: comparison?.proofManifest ? proofTrendForComparison(comparison) : "missing",
    queues: {
      manualReview: proofQueueSummary.manualReviewQueueSummary,
      recordingGap: recordingGapPlan.summary,
      sourceLimitation: proofQueueSummary.sourceLimitationQueueSummary,
    },
    recordingGuidePath,
    recordingGapPlanPath,
    reportPath,
  };
}

function escapeMarkdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function formatOptionalAmplitude(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? formatNumber(value)
    : "n/a";
}

function formatCountSummary(counts) {
  return Object.entries(counts || {})
    .filter(([, count]) => typeof count === "number" && count > 0)
    .sort(([, leftCount], [, rightCount]) => rightCount - leftCount)
    .map(([key, count]) => `${key}:${count}`)
    .join(", ") || "none";
}

function countBlockingProofCases(rows) {
  return rows.reduce((summary, row) => ({
    ...summary,
    [row.proofCase]: (summary[row.proofCase] ?? 0) + 1,
  }), {});
}

function countBlockingMissingLayers(rows) {
  return rows.reduce((summary, row) => {
    for (const layer of row.missingLayers || []) {
      summary[layer] = (summary[layer] ?? 0) + 1;
    }
    return summary;
  }, {});
}

function countBlockingStatuses(rows) {
  return rows.reduce((summary, row) => ({
    ...summary,
    [row.status]: (summary[row.status] ?? 0) + 1,
  }), {});
}

function countBlockingProofBlockers(rows) {
  return rows.reduce((summary, row) => {
    if (!row.proofBlockerCode) return summary;
    summary[row.proofBlockerCode] = (summary[row.proofBlockerCode] ?? 0) + 1;
    return summary;
  }, {});
}

function countBlockingCandidateRejections(rows) {
  return rows.reduce((summary, row) => {
    if (!row.candidateRejectionCode) return summary;
    summary[row.candidateRejectionCode] = (summary[row.candidateRejectionCode] ?? 0) + 1;
    return summary;
  }, {});
}

function blockingStatusSummary(manifest, rows) {
  return formatCountSummary(
    manifest?.summary?.blockingRowsByStatus ?? countBlockingStatuses(rows),
  );
}

function blockingProofBlockerSummary(manifest, rows) {
  return formatCountSummary(
    manifest?.summary?.blockingRowsByProofBlockerCode ?? countBlockingProofBlockers(rows),
  );
}

function blockingProofCaseSummary(manifest, rows) {
  return formatCountSummary(
    manifest?.summary?.blockingRowsByProofCase ?? countBlockingProofCases(rows),
  );
}

function blockingMissingLayerSummary(manifest, rows) {
  return formatCountSummary(
    manifest?.summary?.blockingRowsByMissingLayer ?? countBlockingMissingLayers(rows),
  );
}

function blockingCandidateRejectionSummary(manifest, rows) {
  return formatCountSummary(
    manifest?.summary?.blockingRowsByCandidateRejectionCode ?? countBlockingCandidateRejections(rows),
  );
}

function renderBlockingProofRows(manifest, limit = 16) {
  if (!manifest?.rows?.length) {
    return [
      "## Blocking Proof Rows",
      "",
      "Proof manifest is missing or empty.",
    ];
  }

  const blockingRows = manifest.rows
    .filter((row) => row.status !== "passed" && !row.acceptedProductLimitation)
    .sort((left, right) => {
      const statusOrder = ["failed", "missing-proof", "manual-review", "source-data-limitation"];
      const leftStatus = statusOrder.indexOf(left.status);
      const rightStatus = statusOrder.indexOf(right.status);
      if (leftStatus !== rightStatus) return leftStatus - rightStatus;
      const caseCompare = String(left.proofCase).localeCompare(String(right.proofCase));
      if (caseCompare !== 0) return caseCompare;
      return String(left.recordingId).localeCompare(String(right.recordingId));
    });

  if (blockingRows.length === 0) {
    return [
      "## Blocking Proof Rows",
      "",
      "None. The recorded proof manifest gate is clear.",
    ];
  }

  const visibleRows = blockingRows.slice(0, limit);
  const blockingRowCount = manifest.summary?.blockingRowCount ?? blockingRows.length;
  const lines = [
    "## Blocking Proof Rows",
    "",
    `Showing ${visibleRows.length} of ${blockingRowCount} blocking proof row(s).`,
    `Blocking proof statuses: ${blockingStatusSummary(manifest, blockingRows)}`,
    `Blocking proof blocker codes: ${blockingProofBlockerSummary(manifest, blockingRows)}`,
    `Blocking proof cases: ${blockingProofCaseSummary(manifest, blockingRows)}`,
    `Blocking missing layers: ${blockingMissingLayerSummary(manifest, blockingRows)}`,
    `Blocking candidate rejections: ${blockingCandidateRejectionSummary(manifest, blockingRows)}`,
    "",
    "| Status | Blocker | Proof Case | Recording | Observed / Candidate / Required | Candidate Rejection | Missing / Required Layers | Next Action | Reason |",
    "| --- | --- | --- | --- | ---: | --- | --- | --- | --- |",
    ...visibleRows.map((row) => `| ${[
      row.status,
      row.proofBlockerCode || "n/a",
      row.proofCase,
      row.recordingId,
      `${formatOptionalAmplitude(row.observedAmplitude)} / ${formatOptionalAmplitude(row.candidateAmplitude)} / ${formatOptionalAmplitude(row.expectedMinimumAmplitude)}`,
      row.candidateRejectionCode
        ? `${row.candidateRejectionCode}: ${row.candidateRejectionReason || "n/a"}`
        : "n/a",
      `${row.missingLayers?.join(", ") || "none"} / ${row.requiredLayers?.join(", ") || "unknown"}`,
      row.nextAction,
      row.statusReason,
    ].map(escapeMarkdownCell).join(" | ")} |`),
  ];

  if (blockingRowCount > visibleRows.length) {
    lines.push("", `${blockingRowCount - visibleRows.length} more blocking row(s) are in the proof manifest JSON.`);
  }

  return lines;
}

export function renderRecordingGapActions(manifest, limit = 20) {
  const plan = recordingGapPlanForManifest(manifest);
  const rows = plan.rows;

  if (rows.length === 0) {
    return [
      "## Recording Gap Actions",
      "",
      "None. Visual review and existing source limitations account for all current rows.",
    ];
  }

  const visibleRows = rows.slice(0, limit);
  const lines = [
    "## Recording Gap Actions",
    "",
    `Showing ${visibleRows.length} of ${rows.length} missing-proof/source-limitation row(s) that visual review cannot close.`,
    "",
    "### Capture Scenarios",
    "",
    "| Scenario | Fresh Recording Label | Estimated Rows Closed | Proof Cases | Blockers | Setup | Movement | Acceptance | Quick Validation | Analyzer Validation Command |",
    "| --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- |",
    ...plan.captureScenarios.map((scenario) => `| ${[
      scenario.title,
      scenario.freshRecordingLabel || `movement-proof-${scenario.id || "scenario"}`,
      scenario.estimatedRowsClosed ?? scenario.rowCount,
      (scenario.proofCases ?? []).join(", "),
      (scenario.blockerCodes ?? []).join(", "),
      scenario.setup,
      scenario.movement,
      scenario.acceptance,
      `\`${recordingScenarioQuickValidationCommand(scenario)}\``,
      `\`${recordingScenarioValidationCommand(scenario)}\``,
    ].map(escapeMarkdownCell).join(" | ")} |`),
    "",
    "### Grouped Actions",
    "",
    "| Owner | Priority | Triage | Status | Blocker | Proof Case | Count | Recommended Action | Capture Protocol |",
    "| --- | --- | --- | --- | --- | --- | ---: | --- | --- |",
    ...plan.actionGroups.map((group) => `| ${[
      group.owner,
      group.priority,
      group.triageDisposition || "n/a",
      group.status,
      group.blockerCode || "n/a",
      group.proofCase,
      group.count,
      group.recommendedAction,
      recordingGapProtocolText(group.protocol),
    ].map(escapeMarkdownCell).join(" | ")} |`),
    "",
    "### Action Rows",
    "",
    "| Owner | Priority | Triage | Status | Blocker | Proof Case | Recording | Candidate / Required | Recommended Action | Capture Protocol |",
    "| --- | --- | --- | --- | --- | --- | --- | ---: | --- | --- |",
    ...visibleRows.map((row) => `| ${[
      row.owner,
      row.priority,
      row.triageDisposition || "n/a",
      row.status,
      row.blockerCode || "n/a",
      row.proofCase,
      row.recordingId,
      `${formatOptionalAmplitude(row.candidateAmplitude)} / ${formatOptionalAmplitude(row.expectedMinimumAmplitude)}`,
      row.recommendedAction,
      recordingGapProtocolText(row.protocol),
    ].map(escapeMarkdownCell).join(" | ")} |`),
  ];

  if (rows.length > visibleRows.length) {
    lines.push("", `${rows.length - visibleRows.length} more recording/action row(s) are in the proof manifest JSON.`);
  }

  return lines;
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

export function renderComparison(comparison) {
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

  if (comparison.proofManifest) {
    const proofTrend = proofTrendForComparison(comparison);
    const changedProofCounts = Object.entries(comparison.proofManifest.deltas.counts ?? {})
      .filter(([, count]) => count.delta !== 0);
    if (changedProofCounts.length > 0) {
      lines.push("", "### Proof-Manifest Deltas", "", `Proof trend: ${proofTrend}.`);
      if (comparison.proofManifest.improvementReasons?.length) {
        lines.push(`Improvements: ${comparison.proofManifest.improvementReasons.join("; ")}.`);
      }
      lines.push("", "| Count | Before | After | Delta |", "| --- | ---: | ---: | ---: |");
      for (const [key, count] of changedProofCounts) {
        lines.push(`| ${key} | ${count.before} | ${count.after} | ${formatDelta(count.delta, 0)} |`);
      }
    }

    const changedBlockers = Object.entries(comparison.proofManifest.deltas.blockingRowsByProofBlockerCode ?? {})
      .filter(([, count]) => count.delta !== 0);
    if (changedBlockers.length > 0) {
      lines.push("", "### Proof-Blocker Deltas", "", "| Blocker | Before | After | Delta |", "| --- | ---: | ---: | ---: |");
      for (const [key, count] of changedBlockers) {
        lines.push(`| ${key} | ${count.before} | ${count.after} | ${formatDelta(count.delta, 0)} |`);
      }
    }
  }

  return lines;
}

export function renderProofQueueSummaryLines(manifest) {
  const {
    manualReviewQueueSummary,
    sourceLimitationQueueSummary,
  } = proofQueueSummariesForManifest(manifest);

  return {
    lines: [
      `- Manual review queue: ${proofQueueSummaryText(manualReviewQueueSummary)}`,
      `- Source limitation queue: ${proofQueueSummaryText(sourceLimitationQueueSummary)}`,
    ],
    manualReviewQueueSummary,
    sourceLimitationQueueSummary,
  };
}

async function writeMarkdownReport({
  analysisPath,
  comparisonPath,
  label,
  previousPath,
  reportPath,
  recordingGuidePath,
  recordingGapPlanPath,
  summaryPath,
  reviewDecisionPath,
  sourceLimitationDecisionPath,
  visualCapturePaths,
}) {
  const analyses = await readJson(analysisPath);
  const comparison = comparisonPath && await fileExists(comparisonPath)
    ? await readJson(comparisonPath)
    : null;
  const proofManifestPath = proofManifestPathForAnalysis(analysisPath);
  const proofManifest = await fileExists(proofManifestPath)
    ? await readJson(proofManifestPath)
    : null;
  const recordingGapPlan = recordingGapPlanForManifest(proofManifest);
  const proofQueueSummary = renderProofQueueSummaryLines(proofManifest);
  const summary = summarizeAnalyses(analyses);
  const proofSummary = summarizeProofManifest(proofManifest);
  const generatedAt = new Date().toISOString();
  const lines = [
    `# Movement Replay Iteration: ${label}`,
    "",
    `Created: ${generatedAt}`,
    "",
    "## Summary",
    "",
    `- Sessions: ${summary.sessions}`,
    `- Failed sessions: ${summary.failed}`,
    `- Errors: ${summary.errors}`,
    `- Warnings: ${summary.warnings}`,
    `- Coverage product truth: ${summary.coverageUserFacing} user-facing, ${summary.coverageInternalDemoOnly} internal-demo-only, ${summary.coverageMissingProof} missing-proof`,
    `- Analysis JSON: ${analysisPath}`,
    `- Proof manifest JSON: ${proofManifestPath}`,
    recordingGapPlanPath
      ? `- Recording gap plan JSON: ${recordingGapPlanPath}`
      : "- Recording gap plan JSON: none",
    recordingGuidePath
      ? `- Recording guide Markdown: ${recordingGuidePath}`
      : "- Recording guide Markdown: none",
    visualCapturePaths.length > 0
      ? `- Visual captures: ${visualCapturePaths.join(", ")}`
      : "- Visual captures: none supplied",
    reviewDecisionPath
      ? `- Review decisions: ${reviewDecisionPath}`
      : "- Review decisions: none supplied",
    sourceLimitationDecisionPath
      ? `- Source limitation decisions: ${sourceLimitationDecisionPath}`
      : "- Source limitation decisions: none supplied",
    ...proofQueueSummary.lines,
    `- Recording gap plan: ${recordingGapPlanSummaryText(recordingGapPlan)}`,
    `- Recording gap top groups: ${recordingGapTopGroupsText(recordingGapPlan)}`,
    proofSummary
      ? `- Proof manifest: ${proofSummary.passed}/${proofSummary.total} passed, ${proofSummary.failed} failed, ${proofSummary.missingProof} missing-proof, ${proofSummary.manualReview} manual-review, ${proofSummary.productScopeLimitation} product-scope-limitation, ${proofSummary.sourceDataLimitation} source-data-limitation, ${proofSummary.acceptedProductLimitation} accepted product-limitation, ${proofSummary.visualCaptureRows} visual-capture row(s)`
      : "- Proof manifest: missing",
    proofSummary
      ? `- Applied decisions: ${proofSummary.appliedManualReviewDecision} manual-review, ${proofSummary.appliedSourceLimitationDecision} source-limitation`
      : "- Applied decisions: n/a",
    `- Previous analysis: ${previousPath || "none"}`,
    comparisonPath ? `- Comparison JSON: ${comparisonPath}` : "- Comparison JSON: none",
    "",
    ...renderBlockingProofRows(proofManifest),
    "",
    ...renderRecordingGapActions(proofManifest),
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

  if (recordingGapPlanPath) {
    await writeFile(
      recordingGapPlanPath,
      `${JSON.stringify({
        analysisPath,
        generatedAt,
        proofManifestPath,
        ...recordingGapPlan,
      }, null, 2)}\n`,
    );
  }

  if (recordingGuidePath) {
    await writeFile(
      recordingGuidePath,
      `${recordingGuideMarkdownForPlan(recordingGapPlan, {
        generatedAt,
        manifestPath: proofManifestPath,
      })}\n`,
    );
  }

  if (summaryPath) {
    await writeFile(
      summaryPath,
      `${JSON.stringify(iterationRunSummary({
        analysisPath,
        analyses,
        comparison,
        comparisonPath: comparisonPath || "",
        generatedAt,
        label,
        previousPath,
        proofManifest,
        proofManifestPath,
        proofQueueSummary,
        recordingGuidePath,
        recordingGapPlan,
        recordingGapPlanPath,
        reportPath,
        reviewDecisionPath,
        sourceLimitationDecisionPath,
        visualCapturePaths,
      }), null, 2)}\n`,
    );
  }

  return {
    manualReviewQueueSummary: proofQueueSummary.manualReviewQueueSummary,
    recordingGapPlan,
    sourceLimitationQueueSummary: proofQueueSummary.sourceLimitationQueueSummary,
  };
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
  const recordingGuidePath = path.join(runsDir, `${runName}.recording-guide.md`);
  const recordingGapPlanPath = path.join(runsDir, `${runName}.recording-plan.json`);
  const summaryPath = path.join(runsDir, `${runName}.summary.json`);
  const {
    latestAnalysisPath: pointerPath,
    latestExportPath: exportPointerPath,
    latestRecordingGuidePath: recordingGuidePointerPath,
    latestRecordingPlanPath: recordingGapPlanPointerPath,
    latestReportPath: reportPointerPath,
    latestSummaryPath: summaryPointerPath,
  } = iterationPointerPaths(runsDir);
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
  for (const recordingIds of args.recordingIds) {
    if (recordingIds) analyzeArgs.push("--recording-ids", recordingIds);
  }
  if (args.recordingIdPath) analyzeArgs.push("--recording-ids-file", args.recordingIdPath);
  if (args.recordingPlanPath) analyzeArgs.push("--recording-plan", args.recordingPlanPath);
  for (const recordingScenarioId of args.recordingScenarioIds) {
    if (recordingScenarioId) analyzeArgs.push("--recording-scenario", recordingScenarioId);
  }
  for (const visualCapturePath of args.visualCapturePaths) {
    if (visualCapturePath) analyzeArgs.push("--visual-captures", visualCapturePath);
  }
  if (args.reviewDecisionPath) analyzeArgs.push("--review-decisions", args.reviewDecisionPath);
  if (args.sourceLimitationDecisionPath) {
    analyzeArgs.push("--source-limitation-decisions", args.sourceLimitationDecisionPath);
  }
  if (args.strict) analyzeArgs.push("--strict");
  if (args.strictManifest) analyzeArgs.push("--strict-manifest");

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
    const compareArgs = [
      "--before",
      previousPath,
      "--after",
      analysisPath,
      "--out",
      comparisonPath,
    ];
    if (args.strictProofRegression) compareArgs.push("--strict-proof-regression");
    runNodeScript("scripts/movement-debug/compare-replay-analysis.mjs", compareArgs);
  } else {
    console.log("");
    console.log("No previous analysis found; comparison skipped for this first run.");
  }

  const reportSummary = await writeMarkdownReport({
    analysisPath,
    comparisonPath: previousPath ? comparisonPath : "",
    label,
    previousPath,
    recordingGuidePath,
    recordingGapPlanPath,
    reportPath,
    summaryPath,
    reviewDecisionPath: args.reviewDecisionPath,
    sourceLimitationDecisionPath: args.sourceLimitationDecisionPath,
    visualCapturePaths: args.visualCapturePaths.filter(Boolean),
  });
  await writeFile(pointerPath, `${analysisPath}\n`);
  await writeFile(recordingGuidePointerPath, `${recordingGuidePath}\n`);
  await writeFile(recordingGapPlanPointerPath, `${recordingGapPlanPath}\n`);
  await writeFile(reportPointerPath, `${reportPath}\n`);
  await writeFile(summaryPointerPath, `${summaryPath}\n`);
  if (exportPath) await writeFile(exportPointerPath, `${exportPath}\n`);

  console.log("");
  console.log("Replay iteration files:");
  console.log(`  analysis: ${analysisPath}`);
  if (previousPath) console.log(`  comparison: ${comparisonPath}`);
  console.log(`  report: ${reportPath}`);
  console.log(`  recording guide: ${recordingGuidePath}`);
  console.log(`  recording gap plan: ${recordingGapPlanPath}`);
  console.log(`  summary: ${summaryPath}`);
  console.log(`  manual review queue: ${proofQueueSummaryText(reportSummary.manualReviewQueueSummary)}`);
  console.log(`  source limitation queue: ${proofQueueSummaryText(reportSummary.sourceLimitationQueueSummary)}`);
  console.log(`  recording gap summary: ${recordingGapPlanSummaryText(reportSummary.recordingGapPlan)}`);
  console.log(`  recording gap top groups: ${recordingGapTopGroupsText(reportSummary.recordingGapPlan)}`);
  console.log(`  latest pointer: ${pointerPath}`);
  console.log(`  latest report pointer: ${reportPointerPath}`);
  console.log(`  latest recording guide pointer: ${recordingGuidePointerPath}`);
  console.log(`  latest recording gap plan pointer: ${recordingGapPlanPointerPath}`);
  console.log(`  latest summary pointer: ${summaryPointerPath}`);
  if (exportPath) console.log(`  latest export pointer: ${exportPointerPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
