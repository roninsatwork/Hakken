#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  auditSittingSupportReadiness,
  formatSittingSupportReadiness,
} from "./sitting-support-readiness-audit.mjs";
import {
  auditFacingOcclusionSupportReadiness,
  formatFacingOcclusionSupportReadiness,
} from "./facing-occlusion-support-readiness-audit.mjs";
import {
  auditRootTravelSupportReadiness,
  formatRootTravelSupportReadiness,
} from "./root-travel-support-readiness-audit.mjs";
import {
  auditWalkingSupportReadiness,
  formatWalkingSupportReadiness,
} from "./walking-support-readiness-audit.mjs";
import {
  recordingGapProtocolText,
} from "./recording-gap-plan.mjs";

const DEFAULT_OUT_PATH = "tmp/movement-replay-lab/current-next-proof-readiness.json";
const DEFAULT_MARKDOWN_OUT_PATH = "tmp/movement-replay-lab/current-next-proof-readiness.md";
const NEXT_PROOF_REHEARSAL_ITEMS = JSON.parse(readFileSync(
  new URL("../../src/app/(dashboard)/demos/movements/_lib/movementNextProofRehearsalItems.json", import.meta.url),
  "utf8",
));

export const NEXT_PROOF_VALIDATION_SCRIPTS_BY_LABEL = {
  "movement-proof-facing-occlusion-recovery": "movement:proof:validate:facing-occlusion",
  "movement-proof-root-travel": "movement:proof:validate:root-travel",
  "movement-proof-seated-forward-fold": "movement:proof:validate:seated-forward-fold",
};

export const EXPECTED_NEXT_PROOF_CAPTURE_LABELS = [
  "movement-proof-root-travel",
  "movement-proof-seated-forward-fold",
];

export const NEXT_PROOF_READINESS_DEFAULT_PATHS = {
  facingOcclusion: {
    analysisPath: "tmp/movement-replay-lab/facing-occlusion-recovery-scenario-reviewed-smoke.json",
    gameVisualPlanPath: "tmp/movement-replay-lab/current-facing-occlusion-game-visual-proof-plan.json",
    manifestPath: "tmp/movement-replay-lab/facing-occlusion-recovery-scenario-reviewed-smoke.proof-manifest.json",
    recordingPlanPath: "tmp/movement-replay-lab/current-facing-occlusion-recording-plan.json",
    semanticReviewPath: "tmp/movement-replay-lab/current-facing-occlusion-game-visual-proof-review-decisions.codex-semantic-review.json",
  },
  rootTravel: {
    gameVisualPlanPath: "tmp/movement-replay-lab/current-game-visual-proof-plan.json",
    manifestPath: "tmp/movement-replay-lab/current-analysis-reviewed.proof-manifest.json",
    recordingPlanPath: "tmp/movement-replay-lab/current-expansion-preview-walking-recording-plan.json",
    semanticReviewPath: "tmp/movement-replay-lab/current-game-visual-proof-review-decisions.codex-semantic-review.json",
  },
  sitting: {
    gameVisualPlanPath: "tmp/movement-replay-lab/current-expansion-preview-sitting-game-visual-proof-plan.json",
    manifestPath: "tmp/movement-replay-lab/current-expansion-preview-sitting-analysis.validation.reviewed.proof-manifest.json",
    recordingPlanPath: "tmp/movement-replay-lab/current-expansion-preview-sitting-recording-plan.json",
    semanticReviewPath: "tmp/movement-replay-lab/current-expansion-preview-sitting-game-visual-proof-review-decisions.codex-semantic-review.json",
  },
  walking: {
    gameVisualPlanPath: "tmp/movement-replay-lab/current-expansion-preview-walking-game-visual-proof-plan.json",
    manifestPath: "tmp/movement-replay-lab/current-expansion-preview-walking-flag-smoke-analysis.proof-manifest.json",
    recordingPlanPath: "tmp/movement-replay-lab/current-expansion-preview-walking-recording-plan.json",
    semanticReviewPath: "tmp/movement-replay-lab/current-expansion-preview-walking-game-visual-proof-review-decisions.codex-semantic-review.json",
  },
};

function printHelp() {
  console.log(`Summarize the next movement proof blockers and quick validation commands.

Usage:
  npm run movement:next-proof-readiness
  npm run movement:next-proof-readiness -- --json

Options:
  --out <file>               JSON summary output. Defaults to ${DEFAULT_OUT_PATH}
  --markdown-out <file>      Markdown summary output. Defaults to ${DEFAULT_MARKDOWN_OUT_PATH}
  --no-write                 Do not write JSON/Markdown outputs or support recording plans.
  --json                     Print machine-readable JSON.
  --strict                   Exit non-zero when any family is still blocked.
  --capture-queue-strict     Exit non-zero only when the planned capture queue labels drift.
  --capture-preflight-strict Exit non-zero when any capture queue item lacks handoff details.
  --capture-queue-only       Print only the capture queue Markdown.
  --rehearsal-only           Print only the capture rehearsal checklist.
  --help                     Show this help.
`);
}

export function parseNextProofReadinessArgs(argv) {
  const args = {
    captureQueueOnly: false,
    capturePreflightStrict: false,
    captureQueueStrict: false,
    help: false,
    json: false,
    markdownOutPath: DEFAULT_MARKDOWN_OUT_PATH,
    outPath: DEFAULT_OUT_PATH,
    rehearsalOnly: false,
    strict: false,
    write: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--out") {
      args.outPath = argv[++index] || args.outPath;
    } else if (arg === "--markdown-out") {
      args.markdownOutPath = argv[++index] || args.markdownOutPath;
    } else if (arg === "--no-write") {
      args.write = false;
    } else if (arg === "--strict") {
      args.strict = true;
    } else if (arg === "--capture-queue-strict") {
      args.captureQueueStrict = true;
    } else if (arg === "--capture-preflight-strict") {
      args.capturePreflightStrict = true;
    } else if (arg === "--capture-queue-only") {
      args.captureQueueOnly = true;
    } else if (arg === "--rehearsal-only") {
      args.rehearsalOnly = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return args;
}

export function nextProofReadinessStrictFailure(summary) {
  if (summary.ready) return "";
  const blockedFamilies = summary.blockedFamilies.length > 0
    ? summary.blockedFamilies.join(", ")
    : "unknown";
  return `Movement next proof readiness is blocked for: ${blockedFamilies}.`;
}

export function nextProofCaptureQueueStrictFailure(summary, expectedLabels = EXPECTED_NEXT_PROOF_CAPTURE_LABELS) {
  const actualLabels = summary.captureQueue?.map((item) => item.freshRecordingLabel) ?? [];
  if (JSON.stringify(actualLabels) === JSON.stringify(expectedLabels)) return "";
  return `Movement next proof capture queue drifted: expected ${expectedLabels.join(", ")}, got ${actualLabels.join(", ") || "none"}.`;
}

function captureQueueItemPreflightFailures(item) {
  const failures = [];
  if (!item.freshRecordingLabel) failures.push("missing fresh recording label");
  if (!item.families?.length) failures.push("missing family list");
  if (!item.proofCases?.length) failures.push("missing proof cases");
  if (!item.quickValidationScriptCommand) failures.push("missing quick validation npm alias");
  if (!item.recordingPlanPath) failures.push("missing support recording-plan path");
  if (!item.validationOutputPath) failures.push("missing reviewed validation output path");
  if (!item.protocolText) failures.push("missing setup/movement/acceptance protocol");
  if (!item.rehearsal?.setupChecks?.length) failures.push("missing rehearsal setup checks");
  if (!item.rehearsal?.motionChecks?.length) failures.push("missing rehearsal motion checks");
  if (!item.rehearsal?.validationChecks?.length) failures.push("missing rehearsal validation checks");
  if (!item.rehearsal?.stopIf?.length) failures.push("missing rehearsal stop-if checks");
  return failures;
}

export function buildNextProofCapturePreflight(summary, expectedLabels = EXPECTED_NEXT_PROOF_CAPTURE_LABELS) {
  const captureQueue = summary.captureQueue ?? [];
  const failures = [];
  const labelFailure = nextProofCaptureQueueStrictFailure(summary, expectedLabels);
  if (labelFailure) failures.push(labelFailure);

  captureQueue.forEach((item) => {
    const itemFailures = captureQueueItemPreflightFailures(item);
    if (itemFailures.length === 0) return;
    failures.push(`${item.freshRecordingLabel || "unlabeled capture"}: ${itemFailures.join(", ")}`);
  });

  return {
    failureCount: failures.length,
    failures,
    itemCount: captureQueue.length,
    ok: failures.length === 0,
  };
}

export function nextProofCapturePreflightStrictFailure(summary) {
  if (summary.capturePreflight?.ok) return "";
  const failures = summary.capturePreflight?.failures ?? ["capture preflight summary is missing"];
  return `Movement next proof capture preflight is incomplete: ${failures.join("; ")}.`;
}

async function readJsonIfPresent(filePath) {
  if (!filePath || !existsSync(filePath)) return null;
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readRequiredJson(filePath, label) {
  const value = await readJsonIfPresent(filePath);
  if (!value) throw new Error(`Missing ${label}: ${filePath}`);
  return value;
}

function firstCaptureScenario(audit) {
  return audit.recordingGap?.captureScenarios?.[0] ?? null;
}

function familySummary(audit) {
  const scenario = firstCaptureScenario(audit);
  const quickValidationScript = scenario?.quickValidationScript ??
    NEXT_PROOF_VALIDATION_SCRIPTS_BY_LABEL[scenario?.freshRecordingLabel] ??
    "";
  return {
    family: audit.family,
    missingAnalyzerProofCases: audit.missingAnalyzerProofCases ?? [],
    missingGamePlanCases: audit.missingGamePlanCases ?? [],
    missingReadableGameCases: audit.missingReadableGameCases ?? [],
    missingRecordedEvidenceRequirements: audit.missingRecordedEvidenceRequirements ?? [],
    missingRecordedPassedProofCases: audit.missingRecordedPassedProofCases ?? [],
    nextBlockerCodes: scenario?.blockerCodes ?? [],
    nextFreshRecordingLabel: scenario?.freshRecordingLabel ?? "",
    nextReviewAction: !scenario && audit.nextActions?.length ? audit.nextActions[0] : "",
    nextProtocol: scenario?.protocol ?? null,
    nextProtocolText: recordingGapProtocolText(scenario?.protocol ?? scenario),
    nextProofCases: scenario?.proofCases ?? [],
    nextRecordingIds: scenario?.recordingIds ?? [],
    nextValidationCommand: scenario?.validationCommand ?? "",
    nextValidationOutputPath: scenario?.validationOutputPath ?? "",
    quickValidationCommand: scenario?.quickValidationCommand ?? "",
    quickValidationScript,
    quickValidationScriptCommand: scenario?.quickValidationScriptCommand ??
      (quickValidationScript ? `npm run ${quickValidationScript}` : ""),
    ready: audit.ready,
    recordedReviewCandidateIds: audit.recordedReviewCandidateIds ?? [],
    recordingPlanPath: audit.recordingGap?.planPath ?? "",
    recordingGapSummary: audit.recordingGap?.summary ?? null,
  };
}

function appendUnique(values, nextValues) {
  (nextValues ?? []).forEach((value) => {
    if (value && !values.includes(value)) values.push(value);
  });
}

function nextProofRehearsalForQueueItem(item) {
  const sharedItem = NEXT_PROOF_REHEARSAL_ITEMS.find((rehearsalItem) => (
    rehearsalItem.freshRecordingLabel === item.freshRecordingLabel ||
    rehearsalItem.proofCases?.some((proofCase) => item.proofCases?.includes(proofCase))
  ));
  if (sharedItem?.rehearsal) return sharedItem.rehearsal;

  return {
    motionChecks: [
      "Perform the target motion slowly enough for Replay frame review.",
      "Hold the strongest position briefly before returning to neutral.",
    ],
    setupChecks: [
      "Keep every body part named by the protocol visible before starting.",
      "Confirm Replay Lab start-gate labels are not reporting setup blockers.",
    ],
    stopIf: [
      "The target body parts leave frame.",
      "Replay Lab labels the setup blocked before the target motion starts.",
    ],
    validationChecks: [
      "Run the quick validation alias immediately after import.",
      "Inspect the first failing frame before repeating capture.",
    ],
  };
}

export function buildNextProofCaptureQueue(families) {
  const queueByLabel = new Map();
  families.forEach((family) => {
    if (family.ready || !family.nextFreshRecordingLabel) return;
    const label = family.nextFreshRecordingLabel;
    const existing = queueByLabel.get(label) ?? {
      blockerCodes: [],
      families: [],
      freshRecordingLabel: label,
      proofCases: [],
      protocolText: "",
      quickValidationScriptCommand: "",
      recordingPlanPath: "",
      validationOutputPath: "",
    };

    appendUnique(existing.families, [family.family]);
    appendUnique(existing.proofCases, family.nextProofCases);
    appendUnique(existing.blockerCodes, family.nextBlockerCodes);
    existing.protocolText ||= family.nextProtocolText ?? "";
    existing.quickValidationScriptCommand ||= family.quickValidationScriptCommand ?? "";
    existing.recordingPlanPath ||= family.recordingPlanPath ?? "";
    existing.validationOutputPath ||= family.nextValidationOutputPath ?? "";
    queueByLabel.set(label, existing);
  });

  return Array.from(queueByLabel.values()).map((item) => ({
    ...item,
    rehearsal: nextProofRehearsalForQueueItem(item),
  }));
}

function formatChecklistLine(label, values) {
  return `   ${label}: ${values?.length ? values.join(" | ") : "none"}`;
}

export function buildNextProofReadinessSummary({
  facingOcclusion,
  generatedAt = new Date().toISOString(),
  rootTravel,
  sitting,
  walking,
}) {
  const families = [
    ...(facingOcclusion ? [familySummary(facingOcclusion)] : []),
    ...(rootTravel ? [familySummary(rootTravel)] : []),
    familySummary(sitting),
    familySummary(walking),
  ];
  const summary = {
    blockedFamilies: families.filter((family) => !family.ready).map((family) => family.family),
    captureQueue: buildNextProofCaptureQueue(families),
    families,
    generatedAt,
    nextCommands: Array.from(new Set(families
      .map((family) => family.quickValidationScriptCommand || family.quickValidationCommand)
      .filter(Boolean))),
    ready: families.every((family) => family.ready),
  };

  return {
    ...summary,
    capturePreflight: buildNextProofCapturePreflight(summary),
  };
}

export function formatNextProofReadinessSummary(summary, {
  facingOcclusionText = "",
  rootTravelText = "",
  sittingText = "",
  walkingText = "",
} = {}) {
  const lines = [
    "# Movement Next Proof Readiness",
    "",
    `Status: ${summary.ready ? "ready" : "blocked"}`,
    `Blocked families: ${summary.blockedFamilies.length > 0 ? summary.blockedFamilies.join(", ") : "none"}`,
    "",
    "## Capture Queue",
    "",
    `Capture preflight: ${summary.capturePreflight?.ok ? "ready" : "blocked"}`,
    ...(summary.capturePreflight?.failures?.length > 0
      ? summary.capturePreflight.failures.map((failure) => `- ${failure}`)
      : []),
    "",
    ...(
      summary.captureQueue?.length > 0
        ? summary.captureQueue.flatMap((item, index) => [
          `${index + 1}. ${item.freshRecordingLabel}`,
          `   Families: ${item.families.join(", ")}`,
          `   Proof cases: ${item.proofCases.length > 0 ? item.proofCases.join(", ") : "none"}`,
          `   Quick validation: ${item.quickValidationScriptCommand || "none"}`,
          `   Recording plan: ${item.recordingPlanPath || "none"}`,
          item.protocolText ? `   Protocol: ${item.protocolText}` : "   Protocol: none",
          formatChecklistLine("Rehearsal setup", item.rehearsal?.setupChecks),
          formatChecklistLine("Rehearsal motion", item.rehearsal?.motionChecks),
          formatChecklistLine("Rehearsal validation", item.rehearsal?.validationChecks),
          formatChecklistLine("Stop if", item.rehearsal?.stopIf),
        ])
        : ["- none"]
    ),
    "",
    "## Next Commands",
    "",
    ...(
      summary.nextCommands.length > 0
        ? summary.nextCommands.map((command) => `- \`${command}\``)
        : ["- none"]
    ),
    "",
    "## Next Scenario Details",
    "",
    ...summary.families.flatMap((family) => [
      `### ${family.family}`,
      "",
      `Fresh recording: ${family.nextFreshRecordingLabel || "none"}`,
      `Review candidates: ${family.recordedReviewCandidateIds?.length ? family.recordedReviewCandidateIds.join(", ") : "none"}`,
      family.nextReviewAction ? `Review action: ${family.nextReviewAction}` : "Review action: none",
      `Proof cases: ${family.nextProofCases.length > 0 ? family.nextProofCases.join(", ") : "none"}`,
      `Recording plan: ${family.recordingPlanPath || "none"}`,
      `Validation output: ${family.nextValidationOutputPath || "none"}`,
      `Quick validation script: ${family.quickValidationScriptCommand || "none"}`,
      family.nextProtocolText ? `Protocol: ${family.nextProtocolText}` : "Protocol: none",
      "",
    ]),
    "",
    "## Facing/Occlusion",
    "",
    "```text",
    facingOcclusionText || "No facing/occlusion audit output.",
    "```",
    "",
    "## Root Travel",
    "",
    "```text",
    rootTravelText || "No root-travel audit output.",
    "```",
    "",
    "## Sitting",
    "",
    "```text",
    sittingText || "No sitting audit output.",
    "```",
    "",
    "## Walking",
    "",
    "```text",
    walkingText || "No walking audit output.",
    "```",
    "",
  ];

  return lines.join("\n");
}

export function formatNextProofCaptureQueueSummary(summary) {
  const lines = [
    "# Movement Next Proof Capture Queue",
    "",
    `Status: ${summary.ready ? "ready" : "blocked"}`,
    `Blocked families: ${summary.blockedFamilies.length > 0 ? summary.blockedFamilies.join(", ") : "none"}`,
    `Capture preflight: ${summary.capturePreflight?.ok ? "ready" : "blocked"}`,
    "",
    ...(
      summary.captureQueue?.length > 0
        ? summary.captureQueue.flatMap((item, index) => [
          `${index + 1}. ${item.freshRecordingLabel}`,
          `   Families: ${item.families.join(", ")}`,
          `   Proof cases: ${item.proofCases.length > 0 ? item.proofCases.join(", ") : "none"}`,
          `   Quick validation: ${item.quickValidationScriptCommand || "none"}`,
          `   Recording plan: ${item.recordingPlanPath || "none"}`,
          item.protocolText ? `   Protocol: ${item.protocolText}` : "   Protocol: none",
          formatChecklistLine("Rehearsal setup", item.rehearsal?.setupChecks),
          formatChecklistLine("Rehearsal motion", item.rehearsal?.motionChecks),
          formatChecklistLine("Rehearsal validation", item.rehearsal?.validationChecks),
          formatChecklistLine("Stop if", item.rehearsal?.stopIf),
        ])
        : ["- none"]
    ),
    "",
    "Quick validation aliases:",
    ...(
      summary.nextCommands.length > 0
        ? summary.nextCommands.map((command) => `- \`${command}\``)
        : ["- none"]
    ),
    "",
  ];

  return lines.join("\n");
}

export function formatNextProofRehearsalSummary(summary) {
  const lines = [
    "# Movement Next Proof Rehearsal",
    "",
    `Capture preflight: ${summary.capturePreflight?.ok ? "ready" : "blocked"}`,
    "",
    ...(
      summary.captureQueue?.length > 0
        ? summary.captureQueue.flatMap((item, index) => [
          `${index + 1}. ${item.freshRecordingLabel}`,
          `   Families: ${item.families.join(", ")}`,
          `   Proof cases: ${item.proofCases.length > 0 ? item.proofCases.join(", ") : "none"}`,
          formatChecklistLine("Setup checks", item.rehearsal?.setupChecks),
          formatChecklistLine("Motion checks", item.rehearsal?.motionChecks),
          formatChecklistLine("Validation checks", item.rehearsal?.validationChecks),
          formatChecklistLine("Stop if", item.rehearsal?.stopIf),
          `   Quick validation: ${item.quickValidationScriptCommand || "none"}`,
        ])
        : ["- none"]
    ),
    "",
  ];

  return lines.join("\n");
}

async function writeJsonFile(filePath, value) {
  if (!filePath) return;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeTextFile(filePath, value) {
  if (!filePath) return;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, "utf8");
}

export function supportRecordingPlansByPath(audits) {
  const planByPath = new Map();
  audits.forEach((audit) => {
    const planPath = audit.recordingGap?.planPath;
    const plan = audit.recordingGap?.plan;
    if (!planPath || !plan) return;
    const existing = planByPath.get(planPath);
    const existingRows = existing?.summary?.totalRows ?? 0;
    const nextRows = plan?.summary?.totalRows ?? 0;
    if (!existing || nextRows >= existingRows) {
      planByPath.set(planPath, plan);
    }
  });

  return planByPath;
}

async function writeSupportRecordingPlans(audits) {
  await Promise.all(Array.from(supportRecordingPlansByPath(audits).entries()).map(([planPath, plan]) => (
    writeJsonFile(planPath, plan)
  )));
}

async function main() {
  const args = parseNextProofReadinessArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const paths = NEXT_PROOF_READINESS_DEFAULT_PATHS;
  const facingOcclusion = auditFacingOcclusionSupportReadiness({
    analysis: await readJsonIfPresent(paths.facingOcclusion.analysisPath) ?? [],
    gameVisualPlan: await readJsonIfPresent(paths.facingOcclusion.gameVisualPlanPath) ?? {},
    manifest: await readJsonIfPresent(paths.facingOcclusion.manifestPath) ?? {},
    recordingPlanPath: paths.facingOcclusion.recordingPlanPath,
    semanticReview: await readJsonIfPresent(paths.facingOcclusion.semanticReviewPath) ?? {},
  });
  const rootTravel = auditRootTravelSupportReadiness({
    gameVisualPlan: await readJsonIfPresent(paths.rootTravel.gameVisualPlanPath) ?? {},
    manifest: await readRequiredJson(paths.rootTravel.manifestPath, "root-travel proof manifest"),
    recordingPlanPath: paths.rootTravel.recordingPlanPath,
    semanticReview: await readJsonIfPresent(paths.rootTravel.semanticReviewPath) ?? {},
  });
  const sitting = auditSittingSupportReadiness({
    gameVisualPlan: await readJsonIfPresent(paths.sitting.gameVisualPlanPath) ?? {},
    manifest: await readRequiredJson(paths.sitting.manifestPath, "sitting proof manifest"),
    recordingPlanPath: paths.sitting.recordingPlanPath,
    semanticReview: await readJsonIfPresent(paths.sitting.semanticReviewPath) ?? {},
  });
  const walking = auditWalkingSupportReadiness({
    gameVisualPlan: await readJsonIfPresent(paths.walking.gameVisualPlanPath) ?? {},
    manifest: await readRequiredJson(paths.walking.manifestPath, "walking proof manifest"),
    recordingPlanPath: paths.walking.recordingPlanPath,
    semanticReview: await readJsonIfPresent(paths.walking.semanticReviewPath) ?? {},
  });
  const facingOcclusionText = formatFacingOcclusionSupportReadiness(facingOcclusion);
  const rootTravelText = formatRootTravelSupportReadiness(rootTravel);
  const sittingText = formatSittingSupportReadiness(sitting);
  const walkingText = formatWalkingSupportReadiness(walking);
  const summary = buildNextProofReadinessSummary({ facingOcclusion, rootTravel, sitting, walking });
  const markdown = formatNextProofReadinessSummary(summary, {
    facingOcclusionText,
    rootTravelText,
    sittingText,
    walkingText,
  });

  if (args.write) {
    await writeSupportRecordingPlans([facingOcclusion, rootTravel, sitting, walking]);
    await writeJsonFile(args.outPath, summary);
    await writeTextFile(args.markdownOutPath, markdown);
  }

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(
      args.rehearsalOnly
        ? formatNextProofRehearsalSummary(summary)
        : args.captureQueueOnly
          ? formatNextProofCaptureQueueSummary(summary)
          : markdown,
    );
    if (args.write) {
      console.log(`Wrote ${args.outPath}`);
      console.log(`Wrote ${args.markdownOutPath}`);
    }
  }

  const captureQueueFailure = args.captureQueueStrict
    ? nextProofCaptureQueueStrictFailure(summary)
    : "";
  if (captureQueueFailure) {
    console.error(captureQueueFailure);
    process.exitCode = 1;
  }
  const capturePreflightFailure = args.capturePreflightStrict
    ? nextProofCapturePreflightStrictFailure(summary)
    : "";
  if (capturePreflightFailure) {
    console.error(capturePreflightFailure);
    process.exitCode = 1;
  }
  if (args.strict && !summary.ready) {
    console.error(nextProofReadinessStrictFailure(summary));
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
