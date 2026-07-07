#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const MOVEMENT_EXPANSION_HANDOFF_SCHEMA = "sonae-movement-expansion-preview-handoff/v1";

export const MOVEMENT_EXPANSION_HANDOFFS = {
  sitting: {
    analysisFlags: [
      "--include-seated-targets",
      "--include-seated-product-scope-proof",
    ],
    family: "sitting",
    finalAuditScript: "movement:sitting-support-audit",
    label: "Sitting",
    previewAuditCase: {
      expectedFamily: "sitting",
      mode: "seated-twist",
    },
    requiredGameProofCases: [
      "strongest-seated-chair-contact",
      "strongest-seated-twist",
      "strongest-seated-forward-fold",
      "strongest-seated-leg-lift",
    ],
    requiredRecordedProofCases: [
      "seated-neutral",
      "seated-twist",
      "seated-forward-fold",
      "seated-leg-lift",
      "chair-contact",
    ],
    recordingChecklist: [
      "Camera sees full seated body, chair, head, shoulders, hands, hips, knees, and feet.",
      "Start with neutral seated posture for at least 2 seconds.",
      "Twist torso left and right while hips stay seated.",
      "Fold forward from seated posture with shoulders and head visibly moving.",
      "Lift one leg while staying seated, then return to neutral.",
      "Keep the chair/contact setup stable and visible throughout.",
    ],
    scopeRule: "Internal preview only until recorded proof, Game visual captures, semantic review, and architecture guard all agree.",
  },
  walking: {
    analysisFlags: [
      "--include-walking-product-scope-proof",
    ],
    family: "walking",
    finalAuditScript: "movement:walking-support-audit",
    label: "Walking and stepping",
    previewAuditCase: {
      expectedFamily: "walking",
      mode: "root-travel-forward",
    },
    requiredGameProofCases: [
      "strongest-root-travel",
    ],
    requiredRecordedProofCases: [
      "root-travel",
    ],
    recordingChecklist: [
      "Camera sees full body, hips, knees, ankles, heels, toes, and floor contact throughout.",
      "Start standing neutral for at least 2 seconds.",
      "Walk or step forward for at least 3 deliberate left/right steps.",
      "Keep both feet visible during release and landing.",
      "Return to neutral standing after the walking sequence.",
      "Avoid turning or jumping during the walking proof take.",
    ],
    scopeRule: "Internal preview only until recorded root-travel/walking proof, Game visual captures, semantic review, full gait IK, and architecture guard all agree.",
  },
};

const DEFAULT_FAMILY = "sitting";
const DEFAULT_OUT = "tmp/movement-replay-lab/current-expansion-preview-sitting-handoff.json";
const DEFAULT_GUIDE_OUT = "tmp/movement-replay-lab/current-expansion-preview-sitting-handoff.md";
const DEFAULT_GAME_VISUAL_PLAN = "tmp/movement-replay-lab/current-expansion-preview-sitting-game-visual-proof-plan.json";

function printHelp() {
  console.log(`Write a movement expansion preview handoff contract.

Usage:
  node scripts/movement-debug/movement-expansion-preview-handoff.mjs --family sitting

Options:
  --family <family>      Preview family to hand off. Currently: ${Object.keys(MOVEMENT_EXPANSION_HANDOFFS).join(", ")}. Defaults to ${DEFAULT_FAMILY}
  --out <file>           JSON contract output. Defaults to ${DEFAULT_OUT}
  --guide-out <file>     Markdown checklist output. Defaults to ${DEFAULT_GUIDE_OUT}
  --game-visual-plan <file>
                         Read a generated Game visual plan and report missing cases.
                         Defaults to ${DEFAULT_GAME_VISUAL_PLAN} when --readiness or --recording-id-from-best-partial is used.
  --recording-id <id>    Optional saved recording id to bind into generated commands.
  --recording-id-from-best-partial
                         Bind commands to the best partial candidate from the Game visual plan.
  --readiness            Print/read/write readiness status against the Game visual plan.
  --help                 Show this help.
`);
}

export function parseMovementExpansionPreviewHandoffArgs(argv) {
  const args = {
    family: DEFAULT_FAMILY,
    gameVisualPlan: DEFAULT_GAME_VISUAL_PLAN,
    guideOut: DEFAULT_GUIDE_OUT,
    help: false,
    out: DEFAULT_OUT,
    readiness: false,
    recordingId: "<new-recording-id>",
    recordingIdFromBestPartial: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--family") {
      args.family = argv[++index] || args.family;
    } else if (arg === "--out") {
      args.out = argv[++index] || args.out;
    } else if (arg === "--guide-out") {
      args.guideOut = argv[++index] || args.guideOut;
    } else if (arg === "--game-visual-plan") {
      args.gameVisualPlan = argv[++index] || args.gameVisualPlan;
    } else if (arg === "--recording-id") {
      args.recordingId = argv[++index] || args.recordingId;
    } else if (arg === "--recording-id-from-best-partial") {
      args.recordingIdFromBestPartial = true;
    } else if (arg === "--readiness") {
      args.readiness = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!MOVEMENT_EXPANSION_HANDOFFS[args.family]) {
    throw new Error(`Unsupported preview family: ${args.family}`);
  }
  if (args.recordingIdFromBestPartial && args.recordingId !== "<new-recording-id>") {
    throw new Error("Use either --recording-id or --recording-id-from-best-partial, not both.");
  }

  return args;
}

function commandListForHandoff({
  family,
  recordingId,
}) {
  const handoff = MOVEMENT_EXPANSION_HANDOFFS[family];
  const outputBase = `tmp/movement-replay-lab/current-expansion-preview-${family}`;
  const analysisPath = `${outputBase}-analysis.validation.json`;
  const manifestPath = `${outputBase}-analysis.validation.proof-manifest.json`;
  const replaySessionPath = `${outputBase}-replay-session.json`;
  const replayCapturePath = `tmp/movement-replay-lab/captures/current-expansion-preview-${family}-replay-proof-set`;
  const replayReviewPath = `${outputBase}-replay-proof-review.md`;
  const replayReviewDecisionsPath = `${outputBase}-replay-proof-review-decisions.json`;
  const reviewedAnalysisPath = `${outputBase}-analysis.validation.reviewed.json`;
  const reviewedManifestPath = `${outputBase}-analysis.validation.reviewed.proof-manifest.json`;
  const gameVisualPlanPath = `${outputBase}-game-visual-proof-plan.json`;
  const gameVisualCapturePath = `tmp/movement-replay-lab/captures/current-expansion-preview-${family}-game-visual-proof`;
  const gameVisualReviewPath = `${outputBase}-game-visual-proof-review.md`;
  const gameVisualReviewDecisionsPath = `${outputBase}-game-visual-proof-review-decisions.codex-semantic-review.json`;
  const gameProofArgs = handoff.requiredGameProofCases
    .map((proofCase) => `--proof-case ${proofCase}`)
    .join(" ");
  const analysisFlags = handoff.analysisFlags.join(" ");
  const analysisFlagParts = analysisFlags ? [analysisFlags] : [];

  return [
    {
      command: "npm run movement:expansion-preview-audit",
      id: "preview-audit",
      purpose: "Confirm the family is internally preview-ready before recording work starts.",
    },
    {
      command: [
        "npm run movement:replay:analyze --",
        "--export tmp/movement-replay-lab/runs/limit100-movement-recordings.convex-export.zip",
        `--recording-ids ${recordingId}`,
        ...analysisFlagParts,
        `--out ${analysisPath}`,
        `--manifest-out ${manifestPath}`,
      ].join(" "),
      id: "recorded-analysis",
      purpose: `Analyze the saved recording and emit ${family} proof targets.`,
    },
    {
      command: [
        "npm run movement:replay:export-session --",
        "--export tmp/movement-replay-lab/runs/limit100-movement-recordings.convex-export.zip",
        `--recording-id ${recordingId}`,
        `--out ${replaySessionPath}`,
      ].join(" "),
      id: "replay-session-export",
      purpose: "Export the saved recording into a Replay Lab fixture for browser proof capture.",
    },
    {
      command: [
        "npm run movement:replay:proof-set --",
        `--analysis ${analysisPath}`,
        `--manifest ${manifestPath}`,
        `--out ${replayCapturePath}`,
        `--debug-session-json ${replaySessionPath}`,
      ].join(" "),
      id: "replay-proof-set",
      purpose: "Capture Replay visual proof rows for seated manual-review cases.",
    },
    {
      command: [
        "npm run movement:replay:review --",
        `--manifest ${manifestPath}`,
        `--captures ${replayCapturePath}`,
        `--out ${replayReviewPath}`,
        `--decisions-out ${replayReviewDecisionsPath}`,
      ].join(" "),
      id: "replay-review",
      purpose: "Generate the seated Replay visual review checklist and decision template.",
    },
    {
      command: [
        "npm run movement:replay:analyze --",
        "--export tmp/movement-replay-lab/runs/limit100-movement-recordings.convex-export.zip",
        `--recording-ids ${recordingId}`,
        ...analysisFlagParts,
        `--visual-captures ${replayCapturePath}`,
        `--review-decisions ${replayReviewDecisionsPath}`,
        `--out ${reviewedAnalysisPath}`,
        `--manifest-out ${reviewedManifestPath}`,
      ].join(" "),
      id: "reviewed-analysis",
      purpose: `Rerun ${family} analysis with accepted Replay visual-review decisions attached.`,
    },
    {
      command: [
        "npm run movement:game-visual-plan --",
        `--analysis ${reviewedAnalysisPath}`,
        `--out ${gameVisualPlanPath}`,
        gameProofArgs,
      ].join(" "),
      id: "game-visual-plan",
      purpose: "Create the focused Game Studio frame list for visual capture.",
    },
    {
      command: [
        "npm run movement:game-visual-capture --",
        "--base-url http://localhost:3100",
        `--plan ${gameVisualPlanPath}`,
        `--out ${gameVisualCapturePath}`,
        "--local-test-auth",
        "--secret sonae-local-test-auth",
      ].join(" "),
      id: "game-visual-capture",
      purpose: `Capture focused Game Studio screenshots for the ${family} proof cases.`,
    },
    {
      command: [
        "npm run movement:game-visual-review --",
        `--manifest ${gameVisualCapturePath}/game-visual-proof-captures-manifest.json`,
        `--out ${gameVisualReviewPath}`,
        `--decisions-out ${gameVisualReviewDecisionsPath}`,
      ].join(" "),
      id: "game-visual-review",
      purpose: `Generate the ${family} Game visual semantic-review checklist and decision template.`,
    },
    {
      command: [
        `npm run ${handoff.finalAuditScript} --`,
        `--manifest ${reviewedManifestPath}`,
        `--game-visual-plan ${gameVisualPlanPath}`,
        `--semantic-review ${gameVisualReviewDecisionsPath}`,
        "--strict",
      ].join(" "),
      id: `${family}-support-audit`,
      purpose: `Hard-fail until the ${family} recorded proof and Game visual review are ready for promotion.`,
    },
  ];
}

export function buildMovementExpansionPreviewHandoff({
  family = DEFAULT_FAMILY,
  generatedAt = new Date().toISOString(),
  recordingId = "<new-recording-id>",
} = {}) {
  const handoff = MOVEMENT_EXPANSION_HANDOFFS[family];
  if (!handoff) throw new Error(`Unsupported preview family: ${family}`);

  return {
    commands: commandListForHandoff({ family, recordingId }),
    family,
    generatedAt,
    label: handoff.label,
    previewAuditCase: handoff.previewAuditCase,
    recordingChecklist: handoff.recordingChecklist,
    recordingId,
    requiredGameProofCases: handoff.requiredGameProofCases,
    requiredRecordedProofCases: handoff.requiredRecordedProofCases,
    schema: MOVEMENT_EXPANSION_HANDOFF_SCHEMA,
    scopeRule: handoff.scopeRule,
    supportClaimStatus: "internal-preview-needs-recorded-proof",
  };
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

export function summarizeMovementExpansionPreviewReadiness({
  contract,
  gameVisualPlan,
}) {
  const plannedCases = uniqueSorted(
    (gameVisualPlan?.sessions ?? []).flatMap((session) => session.proofCases ?? []),
  );
  const requiredGameProofCases = contract.requiredGameProofCases ?? [];
  const missingGameProofCases = requiredGameProofCases.filter((proofCase) => !plannedCases.includes(proofCase));
  const sessionSummaries = (gameVisualPlan?.sessions ?? []).map((session) => {
    const proofCases = uniqueSorted(session.proofCases ?? []);
    const matchedRequiredCaseCount = proofCases.filter((proofCase) => (
      requiredGameProofCases.includes(proofCase)
    )).length;

    return {
      matchedRequiredCaseCount,
      proofCases,
      recordingId: session.recordingId,
      targetFrameCount: session.targetFrameCount ?? 0,
    };
  });
  const bestPartialCandidates = [...sessionSummaries]
    .filter((session) => session.matchedRequiredCaseCount > 0)
    .sort((left, right) => (
      right.matchedRequiredCaseCount - left.matchedRequiredCaseCount ||
      right.targetFrameCount - left.targetFrameCount ||
      String(left.recordingId).localeCompare(String(right.recordingId))
    ));

  return {
    bestPartialCandidates,
    coveredGameProofCases: plannedCases.filter((proofCase) => requiredGameProofCases.includes(proofCase)),
    family: contract.family,
    missingGameProofCases,
    ok: missingGameProofCases.length === 0,
    requiredGameProofCases,
    selectedSessionCount: gameVisualPlan?.summary?.selectedSessionCount ?? sessionSummaries.length,
    sessionSummaries,
    targetFrameCount: gameVisualPlan?.summary?.targetFrameCount ?? sessionSummaries.reduce((sum, session) => (
      sum + session.targetFrameCount
    ), 0),
  };
}

export function selectMovementExpansionPreviewBestPartialRecordingId({
  contract,
  gameVisualPlan,
}) {
  const readiness = summarizeMovementExpansionPreviewReadiness({ contract, gameVisualPlan });
  const bestCandidate = readiness.bestPartialCandidates[0];
  if (!bestCandidate?.recordingId) {
    throw new Error(`No partial ${contract.family} recording candidates found in the Game visual plan.`);
  }

  return {
    readiness,
    recordingId: bestCandidate.recordingId,
  };
}

export function formatMovementExpansionPreviewHandoffGuide(contract) {
  const lines = [
    `# Movement Expansion Preview Handoff: ${contract.label}`,
    "",
    `Status: ${contract.supportClaimStatus}`,
    `Recording id: \`${contract.recordingId}\``,
    "",
    "## Scope Rule",
    "",
    contract.scopeRule,
    "",
    "## Recording Checklist",
    "",
    ...contract.recordingChecklist.map((item) => `- [ ] ${item}`),
    "",
    "## Required Recorded Proof Cases",
    "",
    ...contract.requiredRecordedProofCases.map((proofCase) => `- \`${proofCase}\``),
    "",
    "## Required Game Visual Proof Cases",
    "",
    ...contract.requiredGameProofCases.map((proofCase) => `- \`${proofCase}\``),
    "",
    "## Commands",
    "",
    ...contract.commands.flatMap((entry) => [
      `### ${entry.id}`,
      "",
      entry.purpose,
      "",
      "```bash",
      entry.command,
      "```",
      "",
    ]),
  ];

  return `${lines.join("\n").trim()}\n`;
}

export function formatMovementExpansionPreviewReadiness(readiness) {
  const lines = [
    `Movement expansion preview readiness: ${readiness.family}`,
    `Status: ${readiness.ok ? "ready" : "needs-recording"}`,
    `Covered Game proof cases: ${readiness.coveredGameProofCases.join(", ") || "none"}`,
    `Missing Game proof cases: ${readiness.missingGameProofCases.join(", ") || "none"}`,
    `Target frames: ${readiness.targetFrameCount}`,
    `Selected sessions: ${readiness.selectedSessionCount}`,
  ];

  if (readiness.bestPartialCandidates.length > 0) {
    lines.push("Best partial candidates:");
    readiness.bestPartialCandidates.slice(0, 5).forEach((candidate, index) => {
      lines.push(
        `${index + 1}. ${candidate.recordingId}: ${candidate.matchedRequiredCaseCount}/${readiness.requiredGameProofCases.length} required Game cases (${candidate.proofCases.join(", ")})`,
      );
    });
  }

  return lines.join("\n");
}

function writeOutput(filePath, content) {
  mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  writeFileSync(path.resolve(filePath), content);
}

export function writeMovementExpansionPreviewHandoff({
  family,
  generatedAt,
  guideOut,
  out,
  recordingId,
}) {
  const contract = buildMovementExpansionPreviewHandoff({ family, generatedAt, recordingId });
  writeOutput(out, `${JSON.stringify(contract, null, 2)}\n`);
  writeOutput(guideOut, formatMovementExpansionPreviewHandoffGuide(contract));
  return contract;
}

function main() {
  const args = parseMovementExpansionPreviewHandoffArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  let gameVisualPlan = null;
  let selectedBestPartial = null;
  if (args.recordingIdFromBestPartial) {
    const placeholderContract = buildMovementExpansionPreviewHandoff({
      family: args.family,
      recordingId: args.recordingId,
    });
    gameVisualPlan = JSON.parse(readFileSync(path.resolve(args.gameVisualPlan), "utf8"));
    selectedBestPartial = selectMovementExpansionPreviewBestPartialRecordingId({
      contract: placeholderContract,
      gameVisualPlan,
    });
    args.recordingId = selectedBestPartial.recordingId;
  }

  const contract = writeMovementExpansionPreviewHandoff(args);
  console.log(
    `Movement expansion preview handoff: ${contract.family}, recorded cases ${contract.requiredRecordedProofCases.length}, Game cases ${contract.requiredGameProofCases.length}.`,
  );
  if (selectedBestPartial) {
    console.log(`Bound best partial recording id: ${selectedBestPartial.recordingId}`);
  }
  console.log(`Wrote ${path.resolve(args.out)}`);
  console.log(`Wrote ${path.resolve(args.guideOut)}`);

  if (args.readiness) {
    gameVisualPlan ??= JSON.parse(readFileSync(path.resolve(args.gameVisualPlan), "utf8"));
    const readiness = summarizeMovementExpansionPreviewReadiness({ contract, gameVisualPlan });
    console.log(formatMovementExpansionPreviewReadiness(readiness));
    if (!readiness.ok) process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
