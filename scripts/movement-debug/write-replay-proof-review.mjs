#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  recordingGapFreshRecordingLabelForScenario,
  recordingGapPlanForRows as recordingPlanForRows,
  recordingGapPlanSummaryText,
  recordingGapProofContextText,
  recordingGapProtocolText,
  recordingGapScenarioValidationCommand,
  recordingGapTopGroupsText,
} from "./recording-gap-plan.mjs";
import {
  proofQueueSummaryForRows as reviewQueueSummaryForRows,
  proofQueueSummariesForManifest,
  proofQueueSummaryText as reviewQueueSummaryText,
} from "./proof-queue-summary.mjs";

export { recordingPlanForRows };
export { reviewQueueSummaryForRows, reviewQueueSummaryText };

const defaultManifest = "tmp/movement-replay-lab/current-analysis-with-captures.proof-manifest.json";
const defaultCaptures = "tmp/movement-replay-lab/captures/current-proof-set";
const defaultOut = "tmp/movement-replay-lab/current-proof-visual-review.md";

function printHelp() {
  console.log(`Write a Movement Replay visual proof review checklist.

Usage:
  npm run movement:replay:review -- --manifest tmp/movement-replay-lab/current-analysis-with-captures.proof-manifest.json --captures tmp/movement-replay-lab/captures/current-proof-set

Options:
  --manifest <file>          Recorded proof manifest JSON. Defaults to ${defaultManifest}
  --captures <dir>           Replay proof-set capture directory. Defaults to ${defaultCaptures}
  --decisions <file>         Existing decision JSON to summarize/validate against review rows.
  --decisions-out <file>     Optional JSON template for manual review decisions.
  --passed-visual-audit-decisions <file>
                             Existing decision JSON for passed visual-audit rows.
  --passed-visual-audit-decisions-out <file>
                             Optional JSON template for passed visual-audit rows.
  --source-limitation-decisions <file>
                             Existing source-limitation decision JSON to summarize/validate.
  --source-limitation-decisions-out <file>
                             Optional JSON template for explicit product-limitation decisions.
  --recording-plan-out <file>
                             Optional JSON action plan for missing-proof/source-limited rows.
  --recording-guide-out <file>
                             Optional concise Markdown guide for the recording owner.
  --summary-out <file>       Optional compact JSON summary of review, decision, and recording-gap queues.
  --out <file>               Markdown review checklist path. Defaults to ${defaultOut}
  --max-frames-per-row <n>   Image pairs to include per proof row. Defaults to 3.
  --include-all-statuses     Include passed/missing/source-limited rows as well as manual-review.
  --strict-decisions         Exit non-zero if decisions are missing, TODO, invalid, or duplicated.
  --strict-source-limitations
                             Exit non-zero if source-limitation decisions are missing, TODO, invalid, duplicated, missing-context, or stale.
  --help                     Show this help.
`);
}

function parseArgs(argv) {
  const args = {
    captureDir: defaultCaptures,
    decisionsPath: "",
    decisionsOutPath: "",
    includeAllStatuses: false,
    manifestPath: defaultManifest,
    maxFramesPerRow: 3,
    outPath: defaultOut,
    passedVisualAuditDecisionsOutPath: "",
    passedVisualAuditDecisionsPath: "",
    recordingGuideOutPath: "",
    recordingPlanOutPath: "",
    sourceLimitationDecisionsOutPath: "",
    sourceLimitationDecisionsPath: "",
    summaryOutPath: "",
    strictDecisions: false,
    strictSourceLimitations: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--manifest") {
      args.manifestPath = argv[++index] || args.manifestPath;
    } else if (arg === "--captures") {
      args.captureDir = argv[++index] || args.captureDir;
    } else if (arg === "--decisions") {
      args.decisionsPath = argv[++index] || "";
    } else if (arg === "--decisions-out") {
      args.decisionsOutPath = argv[++index] || "";
    } else if (arg === "--passed-visual-audit-decisions") {
      args.passedVisualAuditDecisionsPath = argv[++index] || "";
    } else if (arg === "--passed-visual-audit-decisions-out") {
      args.passedVisualAuditDecisionsOutPath = argv[++index] || "";
    } else if (arg === "--source-limitation-decisions") {
      args.sourceLimitationDecisionsPath = argv[++index] || "";
    } else if (arg === "--source-limitation-decisions-out") {
      args.sourceLimitationDecisionsOutPath = argv[++index] || "";
    } else if (arg === "--recording-plan-out") {
      args.recordingPlanOutPath = argv[++index] || "";
    } else if (arg === "--recording-guide-out") {
      args.recordingGuideOutPath = argv[++index] || "";
    } else if (arg === "--summary-out") {
      args.summaryOutPath = argv[++index] || "";
    } else if (arg === "--out") {
      args.outPath = argv[++index] || args.outPath;
    } else if (arg === "--max-frames-per-row") {
      const parsed = Number.parseInt(argv[++index] || "", 10);
      args.maxFramesPerRow = Number.isFinite(parsed) && parsed > 0 ? parsed : args.maxFramesPerRow;
    } else if (arg === "--include-all-statuses") {
      args.includeAllStatuses = true;
    } else if (arg === "--strict-decisions") {
      args.strictDecisions = true;
    } else if (arg === "--strict-source-limitations") {
      args.strictSourceLimitations = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return args;
}

const validDecisionResults = new Set([
  "readable-pass",
  "readable-fail",
  "source-data-limitation",
  "needs-stronger-automated-assertion",
]);

const validSourceLimitationResults = new Set([
  "accepted-product-limitation",
  "needs-better-recording",
]);

function decisionKey(recordingId, proofCase) {
  return `${recordingId}:${proofCase}`;
}

export function reviewContextForRow(row) {
  return {
    automatedStatus: row.automatedStatus,
    blockerCode: row.proofBlockerCode,
    candidateAmplitude: row.candidateAmplitude,
    candidateRejectionCode: row.candidateRejectionCode,
    candidateRejectionReason: row.candidateRejectionReason,
    directionSign: row.directionSign,
    evidenceFrameCount: row.evidenceFrameCount,
    expectedFrameWindow: row.expectedFrameWindow,
    expectedMinimumAmplitude: row.expectedMinimumAmplitude,
    missingLayers: row.missingLayers,
    nextAction: row.nextAction,
    observedAmplitude: row.observedAmplitude,
    sourceSide: row.sourceSide,
    status: row.status,
    statusReason: row.statusReason,
    visualCaptureDiagnostics: row.visualCaptureDiagnostics,
    visualCaptureFrameCount: row.visualCaptureFrameCount,
    visualCaptureFrames: row.visualCaptureFrames,
  };
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function readDecisionEntries(decisionsPath, collectionKey = "decisions") {
  if (!decisionsPath) return [];

  const parsed = JSON.parse(await readFile(path.resolve(decisionsPath), "utf8"));
  return Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.[collectionKey]) ? parsed[collectionKey] : [];
}

export function summarizeDecisions(reviewRows, decisions, validResults = validDecisionResults) {
  const rowsByKey = new Map(reviewRows.map((row) => [decisionKey(row.recordingId, row.proofCase), row]));
  const requiredKeys = new Set(rowsByKey.keys());
  const seen = new Set();
  const duplicateKeys = new Set();
  let contextMismatch = 0;
  let invalid = 0;
  let missingContext = 0;
  let todo = 0;
  let unknown = 0;
  let valid = 0;

  for (const decision of decisions) {
    const key = decisionKey(decision?.recordingId, decision?.proofCase);
    if (!requiredKeys.has(key)) {
      unknown += 1;
      continue;
    }
    if (seen.has(key)) duplicateKeys.add(key);
    seen.add(key);

    if (!decision?.reviewContext) {
      missingContext += 1;
    } else {
      if (stableStringify(decision.reviewContext) !== stableStringify(reviewContextForRow(rowsByKey.get(key)))) {
        contextMismatch += 1;
      }
    }

    if (decision?.result === "TODO" || !decision?.result) {
      todo += 1;
    } else if (validResults.has(decision.result)) {
      valid += 1;
    } else {
      invalid += 1;
    }
  }

  return {
    contextMismatch,
    duplicate: duplicateKeys.size,
    invalid,
    missing: reviewRows.length - seen.size,
    missingContext,
    required: reviewRows.length,
    todo,
    unknown,
    valid,
  };
}

export function decisionTemplateForRows(rows) {
  return {
    summary: reviewQueueSummaryForRows(rows),
    decisions: rows.map((row) => ({
      notes: "",
      proofCase: row.proofCase,
      recordingId: row.recordingId,
      result: "TODO",
      reviewContext: reviewContextForRow(row),
      reviewedAt: "",
      reviewer: "",
      validResults: [
        "readable-pass",
        "readable-fail",
        "source-data-limitation",
        "needs-stronger-automated-assertion",
      ],
    })),
  };
}

function validDecisionMap(decisions, rows, validResults = validDecisionResults) {
  const rowsByKey = new Map(rows.map((row) => [decisionKey(row.recordingId, row.proofCase), row]));
  const mapped = new Map();

  for (const decision of decisions) {
    const key = decisionKey(decision?.recordingId, decision?.proofCase);
    const row = rowsByKey.get(key);
    if (!row || !validResults.has(decision?.result)) continue;
    if (!decision.reviewContext) continue;
    if (stableStringify(decision.reviewContext) !== stableStringify(reviewContextForRow(row))) continue;
    mapped.set(key, decision);
  }

  return mapped;
}

export function unresolvedPassedVisualAuditRowsForRows(rows, decisions) {
  const decisionMap = validDecisionMap(decisions, rows);
  return rows.filter((row) => {
    const decision = decisionMap.get(decisionKey(row.recordingId, row.proofCase));
    return decision?.result !== "readable-pass";
  });
}

export function sourceLimitationTemplateForRows(rows) {
  return {
    summary: reviewQueueSummaryForRows(rows),
    limitations: rows.map((row) => ({
      notes: "",
      proofCase: row.proofCase,
      recordingId: row.recordingId,
      result: "TODO",
      reviewContext: reviewContextForRow(row),
      reviewedAt: "",
      reviewer: "",
      validResults: [
        "accepted-product-limitation",
        "needs-better-recording",
      ],
    })),
  };
}

function strictSummaryFailed(summary) {
  return (
    summary.valid !== summary.required ||
    summary.todo > 0 ||
    summary.missing > 0 ||
    summary.invalid > 0 ||
    summary.duplicate > 0 ||
    summary.missingContext > 0 ||
    summary.contextMismatch > 0 ||
    summary.unknown > 0
  );
}

export function strictDecisionSummaryText(summary) {
  return `${summary.valid}/${summary.required} valid, ${summary.todo} TODO, ${summary.missing} missing, ${summary.invalid} invalid, ${summary.duplicate} duplicate, ${summary.missingContext} missing context, ${summary.contextMismatch} stale context, ${summary.unknown} unknown row`;
}

export function reviewStatusSummary({
  decisionSummary,
  manifest,
  passedVisualAuditDecisionSummary = {
    contextMismatch: 0,
    duplicate: 0,
    invalid: 0,
    missing: 0,
    missingContext: 0,
    required: 0,
    todo: 0,
    unknown: 0,
    valid: 0,
  },
  passedVisualAuditRows = [],
  passedVisualAuditSummary = reviewQueueSummaryForRows(passedVisualAuditRows),
  proofGapRows,
  recordingPlan,
  reviewQueueSummary,
  reviewRows,
  sourceLimitationDecisionSummary,
  sourceLimitationQueueSummary,
}) {
  const rows = Array.isArray(manifest?.rows) ? manifest.rows : [];
  return {
    decisionProgress: {
      manualReview: decisionSummary,
      passedVisualAudit: passedVisualAuditDecisionSummary,
      sourceLimitation: sourceLimitationDecisionSummary,
    },
    manifestSummary: {
      acceptedProductLimitationCount: manifest?.summary?.acceptedProductLimitationCount ?? 0,
      failedCount: manifest?.summary?.failedCount ?? 0,
      manualReviewCount: manifest?.summary?.manualReviewCount ?? 0,
      missingProofCount: manifest?.summary?.missingProofCount ?? 0,
      passedCount: manifest?.summary?.passedCount ?? 0,
      sourceDataLimitationCount: manifest?.summary?.sourceDataLimitationCount ?? 0,
      totalRows: manifest?.summary?.totalRows ?? rows.length,
      visualCaptureFrameCount: manifest?.summary?.visualCaptureFrameCount ?? 0,
      visualCaptureRowCount: manifest?.summary?.visualCaptureRowCount ?? 0,
    },
    passedVisualAuditRowCount: passedVisualAuditRows.length,
    proofGapRowCount: proofGapRows.length,
    queues: {
      manualReview: reviewQueueSummary,
      passedVisualAudit: passedVisualAuditSummary,
      recordingGap: recordingPlan.summary,
      sourceLimitation: sourceLimitationQueueSummary,
    },
    reportRowCount: reviewRows.length,
    strictReady: {
      manualReviewDecisions: !strictSummaryFailed(decisionSummary),
      passedVisualAuditDecisions: !strictSummaryFailed(passedVisualAuditDecisionSummary),
      sourceLimitationDecisions: !strictSummaryFailed(sourceLimitationDecisionSummary),
    },
  };
}

async function findFiles(root, predicate) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findFiles(entryPath, predicate));
    } else if (predicate(entryPath)) {
      files.push(entryPath);
    }
  }

  return files;
}

async function loadCaptureIndex(captureDir) {
  const files = await findFiles(captureDir, (filePath) => filePath.endsWith("-manifest.json"));
  const index = new Map();

  for (const filePath of files) {
    const manifest = JSON.parse(await readFile(filePath, "utf8"));
    const sessionId = manifest.sessionId;
    if (!sessionId || !Array.isArray(manifest.captures)) continue;

    for (const capture of manifest.captures) {
      const frame = Number(capture.frame);
      if (!Number.isFinite(frame)) continue;
      index.set(`${sessionId}:${frame}`, {
        avatarPath: capture.avatarPath,
        diagnostics: capture.diagnostics ?? {},
        sourcePath: capture.sourcePath,
      });
    }
  }

  return index;
}

function countBy(rows, key) {
  return rows.reduce((counts, row) => {
    const value = row[key] ?? "unknown";
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function markdownTable(entries) {
  const rows = Object.entries(entries).sort(([left], [right]) => left.localeCompare(right));
  if (rows.length === 0) return "_None._";
  return [
    "| Value | Count |",
    "| --- | ---: |",
    ...rows.map(([value, count]) => `| ${value} | ${count} |`),
  ].join("\n");
}

function proofBlockerCounts(rows, manifest) {
  const summaryCounts = manifest.summary?.blockingRowsByProofBlockerCode;
  if (summaryCounts && Object.keys(summaryCounts).length > 0) return summaryCounts;
  return countBy(rows.filter((row) => row.proofBlockerCode), "proofBlockerCode");
}

function relLink(outPath, targetPath) {
  if (!targetPath) return "";
  return path.relative(path.dirname(path.resolve(outPath)), path.resolve(targetPath)).replaceAll(path.sep, "/");
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "n/a";
  const number = Number(value);
  if (!Number.isFinite(number)) return "n/a";
  return number.toFixed(3);
}

function visualErrorSummaryText(summary) {
  if (!summary || typeof summary !== "object") return "n/a";

  return `count ${summary.count ?? 0}, max ${formatNumber(summary.max)}, avg ${formatNumber(summary.average)}`;
}

function frameLine({ capture, frame, outPath }) {
  if (!capture) return `- Frame ${frame}: capture not found.`;

  const lower = formatNumber(capture.diagnostics.avatarLowerError);
  const upper = formatNumber(capture.diagnostics.avatarUpperError);
  const camera = capture.diagnostics.currentCameraState ?? "unknown";
  const owner = capture.diagnostics.lowerOwner ?? "unknown";
  const avatar = relLink(outPath, capture.avatarPath);
  const source = relLink(outPath, capture.sourcePath);

  return [
    `- Frame ${frame}: lower error ${lower}, upper error ${upper}, camera ${camera}, lower owner ${owner}`,
    avatar ? `  - ![avatar frame ${frame}](${avatar})` : "",
    source ? `  - ![source frame ${frame}](${source})` : "",
  ].filter(Boolean).join("\n");
}

function rowSection({ captureIndex, maxFramesPerRow, outPath, row }, index) {
  const frames = row.visualCaptureFrames ?? [];
  const displayedFrames = frames.slice(0, maxFramesPerRow);

  return [
    `### ${index + 1}. ${row.proofCase} / ${row.recordingId}`,
    "",
    `- Status: ${row.status} / automated: ${row.automatedStatus}`,
    `- Blocker code: ${row.proofBlockerCode || "n/a"}`,
    `- Review result: TODO - readable pass | readable fail | source-data limitation | stronger automated assertion needed`,
    `- Evidence frames: ${row.evidenceFrameCount}; visual frames: ${row.visualCaptureFrameCount}`,
    `- Expected window: ${row.expectedFrameWindow?.startFrame ?? "n/a"}-${row.expectedFrameWindow?.endFrame ?? "n/a"}`,
    `- Observed / candidate / expected amplitude: ${formatNumber(row.observedAmplitude)} / ${formatNumber(row.candidateAmplitude)} / ${formatNumber(row.expectedMinimumAmplitude)}`,
    `- Visual diagnostics: lower ${visualErrorSummaryText(row.visualCaptureDiagnostics?.avatarLowerError)}; upper ${visualErrorSummaryText(row.visualCaptureDiagnostics?.avatarUpperError)}`,
    `- Candidate rejection: ${row.candidateRejectionCode ? `${row.candidateRejectionCode}: ` : ""}${row.candidateRejectionReason || "n/a"}`,
    `- Source side / avatar side: ${row.sourceSide} / ${row.avatarSide}`,
    `- Direction: ${row.directionSign}`,
    `- Missing layers: ${(row.missingLayers ?? []).join(", ") || "none"}`,
    `- Next action: ${row.nextAction}`,
    "",
    ...displayedFrames.map((frame) => frameLine({
      capture: captureIndex.get(`${row.recordingId}:${frame}`),
      frame,
      outPath,
    })),
    frames.length > displayedFrames.length
      ? `- ${frames.length - displayedFrames.length} additional captured frame(s) omitted from this checklist section.`
      : "",
  ].filter(Boolean).join("\n");
}

function proofGapTable(rows) {
  if (rows.length === 0) return "_None._";

  return [
    "| Status | Blocker | Proof Case | Recording | Candidate / Required | Candidate Rejection | Missing Layers | Next Action |",
    "| --- | --- | --- | --- | ---: | --- | --- | --- |",
    ...rows.map((row) => [
      row.status,
      row.proofBlockerCode || "n/a",
      row.proofCase,
      row.recordingId,
      `${formatNumber(row.candidateAmplitude)} / ${formatNumber(row.expectedMinimumAmplitude)}`,
      row.candidateRejectionCode
        ? `${row.candidateRejectionCode}: ${row.candidateRejectionReason || "n/a"}`
        : "n/a",
      (row.missingLayers ?? []).join(", ") || "none",
      row.nextAction,
    ].map((value) => String(value ?? "").replace(/\|/g, "\\|")).join(" | ")).map((line) => `| ${line} |`),
  ].join("\n");
}

function passedVisualAuditTable(rows) {
  if (rows.length === 0) return "_None._";

  return [
    "| Proof Case | Recording | Visual Frames | Observed / Expected | Source / Avatar Side | Direction |",
    "| --- | --- | ---: | ---: | --- | --- |",
    ...rows.map((row) => [
      row.proofCase,
      row.recordingId,
      row.visualCaptureFrameCount,
      `${formatNumber(row.observedAmplitude)} / ${formatNumber(row.expectedMinimumAmplitude)}`,
      `${row.sourceSide ?? "unknown"} / ${row.avatarSide ?? "unknown"}`,
      row.directionSign ?? "unknown",
    ].map((value) => String(value ?? "").replace(/\|/g, "\\|")).join(" | ")).map((line) => `| ${line} |`),
  ].join("\n");
}

function recordingPlanTable(plan) {
  if (plan.rows.length === 0) return "_None._";

  return [
    "| Owner | Priority | Triage | Status | Blocker | Proof Case | Recording | Candidate / Required | Proof Context | Recommended Action | Capture Protocol |",
    "| --- | --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- |",
    ...plan.rows.map((row) => [
      row.owner,
      row.priority,
      row.triageDisposition || "n/a",
      row.status,
      row.blockerCode || "n/a",
      row.proofCase,
      row.recordingId,
      `${formatNumber(row.candidateAmplitude)} / ${formatNumber(row.expectedMinimumAmplitude)}`,
      recordingGapProofContextText(row),
      row.recommendedAction,
      recordingGapProtocolText(row.protocol),
    ].map((value) => String(value ?? "").replace(/\|/g, "\\|")).join(" | ")).map((line) => `| ${line} |`),
  ].join("\n");
}

export function recordingScenarioValidationCommand(scenario) {
  return scenario.validationCommand || recordingGapScenarioValidationCommand(scenario);
}

export function recordingScenarioQuickValidationCommand(scenario) {
  return scenario.quickValidationCommand || `npx -p node@22.13.0 npm run movement:replay:validate-scenario -- --scenario ${recordingGapFreshRecordingLabelForScenario(scenario)} --quiet`;
}

function recordingPlanCaptureScenarioTable(plan) {
  if (!plan.captureScenarios?.length) return "_None._";

  return [
    "| Scenario | Fresh Recording Label | Estimated Rows Closed | Proof Cases | Blockers | Setup | Movement | Acceptance | Quick Validation | Analyzer Validation Command |",
    "| --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- |",
    ...plan.captureScenarios.map((scenario) => [
      scenario.title,
      recordingGapFreshRecordingLabelForScenario(scenario),
      scenario.estimatedRowsClosed ?? scenario.rowCount,
      (scenario.proofCases ?? []).join(", "),
      (scenario.blockerCodes ?? []).join(", "),
      scenario.setup,
      scenario.movement,
      scenario.acceptance,
      `\`${recordingScenarioQuickValidationCommand(scenario)}\``,
      `\`${recordingScenarioValidationCommand(scenario)}\``,
    ].map((value) => String(value ?? "").replace(/\|/g, "\\|")).join(" | ")).map((line) => `| ${line} |`),
  ].join("\n");
}

function recordingPlanGroupTable(plan) {
  if (!plan.actionGroups?.length) return "_None._";

  return [
    "| Owner | Priority | Triage | Status | Blocker | Proof Case | Count | Recommended Action | Capture Protocol |",
    "| --- | --- | --- | --- | --- | --- | ---: | --- | --- |",
    ...plan.actionGroups.map((group) => [
      group.owner,
      group.priority,
      group.triageDisposition || "n/a",
      group.status,
      group.blockerCode || "n/a",
      group.proofCase,
      group.count,
      group.recommendedAction,
      recordingGapProtocolText(group.protocol),
    ].map((value) => String(value ?? "").replace(/\|/g, "\\|")).join(" | ")).map((line) => `| ${line} |`),
  ].join("\n");
}

export function recordingGuideMarkdownForPlan(plan, {
  generatedAt = new Date().toISOString(),
  manifestPath = "",
} = {}) {
  const rows = plan.rows ?? [];
  const scenarios = plan.captureScenarios ?? [];
  const scenarioSections = scenarios.flatMap((scenario, index) => [
    `### ${index + 1}. ${scenario.title}`,
    "",
    `- Fresh recording label: ${recordingGapFreshRecordingLabelForScenario(scenario)}`,
    `- Rows covered: ${scenario.rowCount}`,
    `- Estimated rows closed: ${scenario.estimatedRowsClosed ?? scenario.rowCount}`,
    `- Proof cases: ${(scenario.proofCases ?? []).join(", ") || "none"}`,
    `- Blockers: ${(scenario.blockerCodes ?? []).join(", ") || "none"}`,
    `- Setup: ${scenario.setup}`,
    `- Movement: ${scenario.movement}`,
    `- Acceptance: ${scenario.acceptance}`,
    `- Quick validation: \`${recordingScenarioQuickValidationCommand(scenario)}\``,
    `- Analyzer validation command: \`${recordingScenarioValidationCommand(scenario)}\``,
    `- Existing recording IDs: ${(scenario.recordingIds ?? []).join(", ") || "none"}`,
    "",
  ]);

  const headerLines = [
    "# Movement Replay Recording Guide",
    "",
    `Generated: ${generatedAt}`,
    ...(manifestPath ? [`Manifest: ${manifestPath}`] : []),
    "",
  ];

  return [
    ...headerLines,
    "## Summary",
    "",
    `- Recording gap plan: ${recordingGapPlanSummaryText(plan)}`,
    `- Remaining rows: ${rows.length}`,
    `- Capture scenarios: ${scenarios.length}`,
    `- Minimum fresh recordings: ${plan.summary?.minimumFreshRecordingCount ?? scenarios.length}`,
    `- Exact recording IDs: ${(plan.summary?.recordingIds ?? []).join(", ") || "none"}`,
    ...(plan.summary?.allScenariosQuickValidationCommand
      ? [`- All-scenario quick validation: \`${plan.summary.allScenariosQuickValidationCommand}\``]
      : []),
    "",
    "## Capture Scenarios",
    "",
    recordingPlanCaptureScenarioTable(plan),
    "",
    "## Scenario Details",
    "",
    ...scenarioSections,
    "## Row Details",
    "",
    recordingPlanTable(plan),
    "",
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const manifest = JSON.parse(await readFile(path.resolve(args.manifestPath), "utf8"));
  const rows = Array.isArray(manifest.rows) ? manifest.rows : [];
  const manualReviewRows = rows.filter((row) => row.status === "manual-review");
  const reviewRows = args.includeAllStatuses
    ? rows
    : manualReviewRows;
  const passedVisualAuditRows = rows
    .filter((row) => (
      row.status === "passed" &&
      !row.manualReview &&
      (row.visualCaptureFrameCount ?? 0) > 0
    ))
    .sort((left, right) => {
      const caseCompare = String(left.proofCase).localeCompare(String(right.proofCase));
      if (caseCompare !== 0) return caseCompare;
      return String(left.recordingId).localeCompare(String(right.recordingId));
    });
  const proofGapRows = rows
    .filter((row) => (
      row.status === "missing-proof" ||
      (row.status === "source-data-limitation" && !row.acceptedProductLimitation)
    ))
    .sort((left, right) => {
      const statusCompare = String(left.status).localeCompare(String(right.status));
      if (statusCompare !== 0) return statusCompare;
      const caseCompare = String(left.proofCase).localeCompare(String(right.proofCase));
      if (caseCompare !== 0) return caseCompare;
      return String(left.recordingId).localeCompare(String(right.recordingId));
    });
  const sourceLimitationRows = rows
    .filter((row) => row.status === "source-data-limitation" && !row.acceptedProductLimitation)
    .sort((left, right) => {
      const caseCompare = String(left.proofCase).localeCompare(String(right.proofCase));
      if (caseCompare !== 0) return caseCompare;
      return String(left.recordingId).localeCompare(String(right.recordingId));
    });
  const recordingPlan = recordingPlanForRows(rows);
  const {
    manualReviewQueueSummary: reviewQueueSummary,
    sourceLimitationQueueSummary,
  } = proofQueueSummariesForManifest(manifest);
  const passedVisualAuditSummary = reviewQueueSummaryForRows(passedVisualAuditRows);
  const captureIndex = await loadCaptureIndex(path.resolve(args.captureDir));
  const decisionEntries = await readDecisionEntries(args.decisionsPath);
  const decisionSummary = summarizeDecisions(reviewRows, decisionEntries);
  const sourceLimitationDecisionEntries = await readDecisionEntries(
    args.sourceLimitationDecisionsPath,
    "limitations",
  );
  const sourceLimitationDecisionSummary = summarizeDecisions(
    sourceLimitationRows,
    sourceLimitationDecisionEntries,
    validSourceLimitationResults,
  );
  const passedVisualAuditDecisionEntries = await readDecisionEntries(args.passedVisualAuditDecisionsPath);
  const passedVisualAuditDecisionSummary = summarizeDecisions(
    passedVisualAuditRows,
    passedVisualAuditDecisionEntries,
  );
  const unresolvedPassedVisualAuditRows = unresolvedPassedVisualAuditRowsForRows(
    passedVisualAuditRows,
    passedVisualAuditDecisionEntries,
  );
  const unresolvedPassedVisualAuditSummary = reviewQueueSummaryForRows(unresolvedPassedVisualAuditRows);
  const generatedAt = new Date().toISOString();
  const compactSummary = reviewStatusSummary({
    decisionSummary,
    manifest,
    passedVisualAuditDecisionSummary,
    passedVisualAuditRows: unresolvedPassedVisualAuditRows,
    passedVisualAuditSummary: unresolvedPassedVisualAuditSummary,
    proofGapRows,
    recordingPlan,
    reviewQueueSummary,
    reviewRows,
    sourceLimitationDecisionSummary,
    sourceLimitationQueueSummary,
  });

  const lines = [
    "# Movement Replay Visual Proof Review",
    "",
    `Generated: ${generatedAt}`,
    `Manifest: ${path.resolve(args.manifestPath)}`,
    `Captures: ${path.resolve(args.captureDir)}`,
    args.decisionsPath ? `Decisions: ${path.resolve(args.decisionsPath)}` : "Decisions: none supplied",
    args.passedVisualAuditDecisionsPath
      ? `Passed visual audit decisions: ${path.resolve(args.passedVisualAuditDecisionsPath)}`
      : "Passed visual audit decisions: none supplied",
    args.sourceLimitationDecisionsPath
      ? `Source limitation decisions: ${path.resolve(args.sourceLimitationDecisionsPath)}`
      : "Source limitation decisions: none supplied",
    "",
    "## Summary",
    "",
    `- Rows in report: ${reviewRows.length}`,
    `- Manifest total rows: ${manifest.summary?.totalRows ?? rows.length}`,
    `- Passed: ${manifest.summary?.passedCount ?? "n/a"}`,
    `- Manual review: ${manifest.summary?.manualReviewCount ?? "n/a"}`,
    `- Missing proof: ${manifest.summary?.missingProofCount ?? "n/a"}`,
    `- Source-data limitation: ${manifest.summary?.sourceDataLimitationCount ?? "n/a"}`,
    `- Accepted product limitations: ${manifest.summary?.acceptedProductLimitationCount ?? "n/a"}`,
    `- Visual capture rows: ${manifest.summary?.visualCaptureRowCount ?? "n/a"}`,
    `- Visual frame matches: ${manifest.summary?.visualCaptureFrameCount ?? "n/a"}`,
    `- Review decisions: ${strictDecisionSummaryText(decisionSummary)}`,
    `- Manual review queue: ${reviewQueueSummaryText(reviewQueueSummary)}`,
    `- Passed visual audit decisions: ${strictDecisionSummaryText(passedVisualAuditDecisionSummary)}`,
    `- Passed visual audit queue: ${reviewQueueSummaryText(unresolvedPassedVisualAuditSummary)}`,
    `- Source limitation decisions: ${strictDecisionSummaryText(sourceLimitationDecisionSummary)}`,
    `- Source limitation queue: ${reviewQueueSummaryText(sourceLimitationQueueSummary)}`,
    `- Recording gap plan: ${recordingGapPlanSummaryText(recordingPlan)}`,
    `- Recording gap top groups: ${recordingGapTopGroupsText(recordingPlan)}`,
    "",
    "### Rows By Proof Case",
    "",
    markdownTable(countBy(reviewRows, "proofCase")),
    "",
    "### Rows By Status",
    "",
    markdownTable(countBy(reviewRows, "status")),
    "",
    "### Rows By Blocker Code",
    "",
    markdownTable(proofBlockerCounts(rows, manifest)),
    "",
    "## Proof Gap Triage",
    "",
    "These rows cannot be accepted by visual review alone. They need stronger recordings, fuller proof windows, or an explicit product/source limitation.",
    "",
    proofGapTable(proofGapRows),
    "",
    "## Passed Visual Audit Queue",
    "",
    "These rows are currently passed, have visual captures, and do not yet have a current readable-pass visual-audit decision. Inspect them before treating automated proof as client-visible acceptance.",
    "",
    passedVisualAuditTable(unresolvedPassedVisualAuditRows),
    "",
    ...unresolvedPassedVisualAuditRows.map((row, index) => rowSection({
      captureIndex,
      maxFramesPerRow: args.maxFramesPerRow,
      outPath: args.outPath,
      row,
    }, index)),
    "",
    "## Recording Gap Action Plan",
    "",
    "Use this to capture or approve the rows that visual review cannot close.",
    "",
    "### Capture Scenarios",
    "",
    recordingPlanCaptureScenarioTable(recordingPlan),
    "",
    "### Grouped Actions",
    "",
    recordingPlanGroupTable(recordingPlan),
    "",
    "### Action Rows",
    "",
    recordingPlanTable(recordingPlan),
    "",
    "## Review Rows",
    "",
    ...reviewRows.map((row, index) => rowSection({
      captureIndex,
      maxFramesPerRow: args.maxFramesPerRow,
      outPath: args.outPath,
      row,
    }, index)),
    "",
  ];

  await mkdir(path.dirname(path.resolve(args.outPath)), { recursive: true });
  await writeFile(path.resolve(args.outPath), `${lines.join("\n")}\n`);
  console.log(`Wrote ${path.resolve(args.outPath)}`);

  if (args.decisionsOutPath) {
    await mkdir(path.dirname(path.resolve(args.decisionsOutPath)), { recursive: true });
    await writeFile(
      path.resolve(args.decisionsOutPath),
      `${JSON.stringify(decisionTemplateForRows(reviewRows), null, 2)}\n`,
    );
    console.log(`Wrote ${path.resolve(args.decisionsOutPath)}`);
  }

  if (args.passedVisualAuditDecisionsOutPath) {
    await mkdir(path.dirname(path.resolve(args.passedVisualAuditDecisionsOutPath)), { recursive: true });
    await writeFile(
      path.resolve(args.passedVisualAuditDecisionsOutPath),
      `${JSON.stringify(decisionTemplateForRows(passedVisualAuditRows), null, 2)}\n`,
    );
    console.log(`Wrote ${path.resolve(args.passedVisualAuditDecisionsOutPath)}`);
  }

  if (args.sourceLimitationDecisionsOutPath) {
    await mkdir(path.dirname(path.resolve(args.sourceLimitationDecisionsOutPath)), { recursive: true });
    await writeFile(
      path.resolve(args.sourceLimitationDecisionsOutPath),
      `${JSON.stringify(sourceLimitationTemplateForRows(sourceLimitationRows), null, 2)}\n`,
    );
    console.log(`Wrote ${path.resolve(args.sourceLimitationDecisionsOutPath)}`);
  }

  if (args.recordingPlanOutPath) {
    await mkdir(path.dirname(path.resolve(args.recordingPlanOutPath)), { recursive: true });
    await writeFile(
      path.resolve(args.recordingPlanOutPath),
      `${JSON.stringify({
        generatedAt: new Date().toISOString(),
        manifest: path.resolve(args.manifestPath),
        ...recordingPlan,
      }, null, 2)}\n`,
    );
    console.log(`Wrote ${path.resolve(args.recordingPlanOutPath)}`);
    console.log(`Recording gap plan: ${recordingGapPlanSummaryText(recordingPlan)}.`);
    console.log(`Recording gap top groups: ${recordingGapTopGroupsText(recordingPlan)}.`);
  }

  if (args.recordingGuideOutPath) {
    await mkdir(path.dirname(path.resolve(args.recordingGuideOutPath)), { recursive: true });
    await writeFile(
      path.resolve(args.recordingGuideOutPath),
      `${recordingGuideMarkdownForPlan(recordingPlan, {
        generatedAt,
        manifestPath: path.resolve(args.manifestPath),
      })}\n`,
    );
    console.log(`Wrote ${path.resolve(args.recordingGuideOutPath)}`);
  }

  if (args.summaryOutPath) {
    await mkdir(path.dirname(path.resolve(args.summaryOutPath)), { recursive: true });
    await writeFile(
      path.resolve(args.summaryOutPath),
      `${JSON.stringify({
        captures: path.resolve(args.captureDir),
        decisions: args.decisionsPath ? path.resolve(args.decisionsPath) : null,
        generatedAt,
        manifest: path.resolve(args.manifestPath),
        out: path.resolve(args.outPath),
        passedVisualAuditDecisions: args.passedVisualAuditDecisionsPath
          ? path.resolve(args.passedVisualAuditDecisionsPath)
          : null,
        sourceLimitationDecisions: args.sourceLimitationDecisionsPath
          ? path.resolve(args.sourceLimitationDecisionsPath)
          : null,
        ...compactSummary,
      }, null, 2)}\n`,
    );
    console.log(`Wrote ${path.resolve(args.summaryOutPath)}`);
  }

  if (args.decisionsPath) {
    console.log(
      `Review decisions: ${strictDecisionSummaryText(decisionSummary)}.`,
    );
  }

  console.log(`Manual review queue: ${reviewQueueSummaryText(reviewQueueSummary)}.`);
  console.log(`Passed visual audit decisions: ${strictDecisionSummaryText(passedVisualAuditDecisionSummary)}.`);
  console.log(`Passed visual audit queue: ${reviewQueueSummaryText(unresolvedPassedVisualAuditSummary)}.`);
  console.log(`Source limitation queue: ${reviewQueueSummaryText(sourceLimitationQueueSummary)}.`);

  if (args.sourceLimitationDecisionsPath) {
    console.log(
      `Source limitation decisions: ${strictDecisionSummaryText(sourceLimitationDecisionSummary)}.`,
    );
  }

  if (args.strictDecisions && strictSummaryFailed(decisionSummary)) {
    throw new Error(`Review decisions are incomplete or invalid: ${strictDecisionSummaryText(decisionSummary)}.`);
  }
  if (args.strictSourceLimitations && strictSummaryFailed(sourceLimitationDecisionSummary)) {
    throw new Error(`Source limitation decisions are incomplete or invalid: ${strictDecisionSummaryText(sourceLimitationDecisionSummary)}.`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
