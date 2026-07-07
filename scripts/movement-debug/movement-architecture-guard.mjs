import fs from "node:fs";
import path from "node:path";

import { auditRootTurnSupportClaim } from "./root-turn-support-claim-audit.mjs";
import { auditSittingSupportReadiness } from "./sitting-support-readiness-audit.mjs";
import { auditSquatKneeLiftSupportClaim } from "./squat-knee-lift-support-claim-audit.mjs";
import {
  auditUpperBodyStandingSupportReadiness,
  formatBroadCaptureContract,
  mergeGameVisualPlans,
  mergeSemanticReviews,
  validateBroadCaptureContractShape,
} from "./upper-body-standing-support-readiness-audit.mjs";
import { auditWalkingSupportReadiness } from "./walking-support-readiness-audit.mjs";
import { buildSupportReadinessMatrix } from "./movement-support-readiness-matrix.mjs";
import { auditMovementArchitecturePlanStatus } from "./movement-architecture-plan-status-audit.mjs";
import { buildMovementRoadmapProgressReport } from "./movement-roadmap-progress-report.mjs";
import { auditMovementOutstandingTasks } from "./movement-outstanding-tasks-audit.mjs";

export const DEFAULT_WATCHED_FILES = [
  {
    maxLines: 240,
    path: "src/app/(dashboard)/demos/movements/[id]/play/_components/VrmAvatar.tsx",
    reason: "avatar renderer should remain an orchestration adapter",
  },
  {
    maxLines: 260,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarReadyFrameOrchestrationRuntime.ts",
    reason: "ready-frame orchestration should stay a coordinator, not regain application ownership",
  },
  {
    maxLines: 280,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarReadyFrameApplicationRuntime.ts",
    reason: "ready-frame application handoff should stay focused on body/completion sequencing",
  },
  {
    maxLines: 260,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarDebugTelemetry.ts",
    reason: "debug telemetry facade should not regain tracking or visual telemetry ownership",
  },
  {
    maxLines: 430,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarTrackingDebugTelemetry.ts",
    reason: "tracking debug telemetry should stay focused on label/state composition",
  },
  {
    maxLines: 130,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarVisualTelemetry.ts",
    reason: "visual telemetry should stay focused on VRM/retarget segment comparison",
  },
  {
    maxLines: 20,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportPresentationEstimators.ts",
    reason: "support-presentation estimator entrypoint should stay a facade",
  },
  {
    maxLines: 360,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarFloorSupportPresentationEstimators.ts",
    reason: "floor/seated support estimators should stay separate from standing support logic",
  },
  {
    maxLines: 210,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarStandingSupportPresentationEstimators.ts",
    reason: "standing/yoga/athletic support estimators should stay separate from floor support logic",
  },
  {
    maxLines: 130,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarPipeline.ts",
    reason: "pipeline facade should not regain decision ownership",
  },
  {
    maxLines: 220,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarPipelineDecision.ts",
    reason: "final avatar decision assembler should stay small",
  },
  {
    maxLines: 110,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarPipelineSupportDecision.ts",
    reason: "support-context composition should stay focused",
  },
  {
    maxLines: 20,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportContactDecision.ts",
    reason: "support-contact lock decision entrypoint should stay a facade",
  },
  {
    maxLines: 60,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportContactDecisionTypes.ts",
    reason: "support-contact lock contracts should stay separate from anchor and resolver policy",
  },
  {
    maxLines: 140,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportContactAnchors.ts",
    reason: "support-contact anchor mapping should stay separate from lock resolver policy",
  },
  {
    maxLines: 220,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportContactDecisionRuntime.ts",
    reason: "support-contact lock resolver should stay separate from anchor mapping helpers",
  },
  {
    maxLines: 20,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportContactApplication.ts",
    reason: "support-contact application entrypoint should stay a facade",
  },
  {
    maxLines: 250,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportContactCorrectionApplication.ts",
    reason: "support-contact correction math should stay separate from Three.js object mutation",
  },
  {
    maxLines: 180,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportContactObjectApplication.ts",
    reason: "support-contact object mutation should stay an adapter over pure correction decisions",
  },
  {
    maxLines: 20,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarSegmentApplication.ts",
    reason: "segment application entrypoint should stay a facade",
  },
  {
    maxLines: 220,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarRestMappedSegmentApplication.ts",
    reason: "rest-mapped segment application should stay separate from IK and retarget mapping policy",
  },
  {
    maxLines: 170,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarPlantedSquatIkSegmentApplication.ts",
    reason: "planted-squat IK segment application should stay separate from generic rest-map application",
  },
  {
    maxLines: 180,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarRetargetSegmentMappingApplication.ts",
    reason: "retarget segment mapping should stay separate from IK and rest-map primitives",
  },
  {
    maxLines: 20,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarSpineApplication.ts",
    reason: "spine application entrypoint should stay a facade",
  },
  {
    maxLines: 190,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarSpineApplicationSpecs.ts",
    reason: "spine application specs should stay separate from VRM bone mutation",
  },
  {
    maxLines: 180,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarSpineApplicationVrmAdapters.ts",
    reason: "spine VRM adapters should stay adapter-only",
  },
  {
    maxLines: 20,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadApplication.ts",
    reason: "head application entrypoint should stay a facade",
  },
  {
    maxLines: 60,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadApplicationTypes.ts",
    reason: "head application contracts should stay separate from runtime and VRM adapters",
  },
  {
    maxLines: 140,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadQuaternionApplication.ts",
    reason: "head/neck quaternion application should stay separate from runtime sequencing",
  },
  {
    maxLines: 80,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadPositionApplication.ts",
    reason: "head position offset math should stay separate from quaternion and runtime sequencing",
  },
  {
    maxLines: 150,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadApplicationRuntime.ts",
    reason: "head application runtime should stay a sequencer over focused helpers",
  },
  {
    maxLines: 90,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadApplicationVrmAdapters.ts",
    reason: "head VRM adapters should stay adapter-only",
  },
  {
    maxLines: 20,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarUpperBodyPoseDecision.ts",
    reason: "upper-body pose decision entrypoint should stay a facade",
  },
  {
    maxLines: 150,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarSpinePoseDecision.ts",
    reason: "spine pose policy should stay separate from head and foot-lock decisions",
  },
  {
    maxLines: 120,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadApplicationPoseDecision.ts",
    reason: "head application pose policy should stay separate from spine and foot-lock decisions",
  },
  {
    maxLines: 90,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarFootLockDecision.ts",
    reason: "foot-lock policy should stay separate from spine and head decisions",
  },
  {
    maxLines: 20,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarPlayerDrive.ts",
    reason: "player drive entrypoint should stay a facade",
  },
  {
    maxLines: 130,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarPlayerSpineDriveShared.ts",
    reason: "player spine-drive shared helpers should stay separate from live and recorded drive policy",
  },
  {
    maxLines: 140,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarUpperBodyPlayerSpineDrive.ts",
    reason: "upper-body player spine fallback should stay separate from full-body player spine drive",
  },
  {
    maxLines: 130,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarPlayerSpineDriveRuntime.ts",
    reason: "live player spine drive should stay separate from recorded spine presentation",
  },
  {
    maxLines: 110,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarRecordedSpineDrive.ts",
    reason: "recorded spine presentation should stay separate from live player spine drive",
  },
  {
    maxLines: 180,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarPipelineLowerBodyDecision.ts",
    reason: "lower-body/retarget context composition should stay focused",
  },
  {
    maxLines: 30,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyApplicationDecision.ts",
    reason: "lower-body application decision entrypoint should stay a facade",
  },
  {
    maxLines: 170,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodySourceOwnerDecision.ts",
    reason: "lower-body source/owner decisions should stay separate from stage and visual smoothing policy",
  },
  {
    maxLines: 130,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarRetargetSegmentApplicationDecision.ts",
    reason: "retarget segment application gating should stay separate from lower-body stage decisions",
  },
  {
    maxLines: 150,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyStageDecision.ts",
    reason: "lower-body stage decisions should stay separate from source-owner and visual smoothing policy",
  },
  {
    maxLines: 120,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyVisualDecision.ts",
    reason: "lower-body visual smoothing policy should stay separate from retarget and stage decisions",
  },
  {
    maxLines: 260,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyRetargetApplicationPlan.ts",
    reason: "lower-body retarget plan should not become another application hotspot",
  },
  {
    maxLines: 210,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyApplicationVrmAdapters.ts",
    reason: "VRM lower-body adapters should stay adapter-only",
  },
  {
    maxLines: 130,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyFootPlantVrmAdapters.ts",
    reason: "foot-plant adapters should stay narrow",
  },
  {
    maxLines: 210,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyRotationVrmAdapters.ts",
    reason: "rotation adapters should stay adapter-only",
  },
];

export const DEFAULT_PROOF_PATHS = {
  analysis: "tmp/movement-replay-lab/current-analysis-reviewed.json",
  broadGameVisualPlan: "tmp/movement-replay-lab/current-game-visual-proof-plan.broad-upper-body.json",
  broadSemanticReview: "tmp/movement-replay-lab/current-game-visual-proof-review-decisions.broad-upper-body.codex-semantic-review.json",
  captureManifest: "tmp/movement-replay-lab/captures/game-visual-proof/game-visual-proof-captures-manifest.json",
  manifest: "tmp/movement-replay-lab/current-analysis-reviewed.proof-manifest.json",
  semanticReview: "tmp/movement-replay-lab/current-game-visual-proof-review-decisions.codex-semantic-review.json",
  sittingGameVisualPlan: "tmp/movement-replay-lab/current-expansion-preview-sitting-game-visual-proof-plan.json",
  sittingManifest: "tmp/movement-replay-lab/current-expansion-preview-sitting-analysis.validation.reviewed.proof-manifest.json",
  sittingSemanticReview: "tmp/movement-replay-lab/current-expansion-preview-sitting-game-visual-proof-review-decisions.codex-semantic-review.json",
};
export const DEFAULT_GAME_VISUAL_PROOF_FRAME_COUNT = 50;
export const USER_FACING_SUPPORT_AUDIT_GATES = {
  "sitting": {
    internalDemoOnlyFailure: "expected sitting support audit to stay blocked while sitting is internal-demo-only",
    mustStayBlockedWhileInternal: true,
    readinessKey: "sittingSupport.ready",
    scriptName: "movement:sitting-support-audit",
    userFacingFailure: "expected sitting support audit to pass before user-facing promotion",
  },
  "squat-knee-lift": {
    readinessKey: "squatKneeLiftSupportClaim.ok",
    scriptName: "movement:squat-knee-lift-support-audit",
    userFacingFailure: "expected squat-knee-lift support-claim audit to pass before user-facing promotion",
  },
  "root-turn": {
    readinessKey: "rootTurnSupportClaim.ok",
    scriptName: "movement:root-turn-support-audit",
    userFacingFailure: "expected root-turn support-claim audit to pass before user-facing promotion",
  },
  "standing-side-bend-head-direction": {
    readinessKey: "upperBodyStandingSupport.narrowReady",
    scriptName: "movement:upper-body-standing-support-audit",
    userFacingFailure: "expected standing side-bend/head-direction support audit to pass before user-facing promotion",
  },
  "upper-body-standing": {
    readinessKey: "upperBodyStandingSupport.broadReady",
    scriptName: "movement:upper-body-standing-support-audit",
    userFacingFailure: "expected broad upper-body standing support audit to pass before user-facing promotion",
  },
  "upright": {
    builtIn: "coverage-product-truth-and-proof-manifest",
    readinessKey: "coverageProductTruth.found",
    userFacingFailure: "expected coverage product-truth summary in reviewed analysis",
  },
  "walking": {
    internalDemoOnlyFailure: "expected walking support audit to stay blocked while walking is internal-demo-only",
    mustStayBlockedWhileInternal: true,
    readinessKey: "walkingSupport.ready",
    scriptName: "movement:walking-support-audit",
    userFacingFailure: "expected walking support audit to pass before user-facing promotion",
  },
};
export const USER_FACING_SUPPORT_AUDIT_FAMILIES = Object.keys(USER_FACING_SUPPORT_AUDIT_GATES).sort();
export const DEFAULT_PHASE_14_SCRIPT_EXPECTATIONS = {
  "movement:expansion-preview-handoff:sitting": [
    "scripts/movement-debug/movement-expansion-preview-handoff.mjs",
    "--family sitting",
    "--guide-out tmp/movement-replay-lab/current-expansion-preview-sitting-handoff.md",
  ],
  "movement:expansion-preview-handoff:sitting:best-partial": [
    "scripts/movement-debug/movement-expansion-preview-handoff.mjs",
    "--family sitting",
    "--recording-id-from-best-partial",
    "--guide-out tmp/movement-replay-lab/current-expansion-preview-sitting-handoff.best-partial.md",
  ],
  "movement:expansion-preview-handoff:walking": [
    "scripts/movement-debug/movement-expansion-preview-handoff.mjs",
    "--family walking",
    "--guide-out tmp/movement-replay-lab/current-expansion-preview-walking-handoff.md",
  ],
  "movement:expansion-preview-handoff:walking:best-partial": [
    "scripts/movement-debug/movement-expansion-preview-handoff.mjs",
    "--family walking",
    "--recording-id-from-best-partial",
    "--game-visual-plan tmp/movement-replay-lab/current-expansion-preview-walking-game-visual-proof-plan.json",
    "--guide-out tmp/movement-replay-lab/current-expansion-preview-walking-handoff.best-partial.md",
  ],
  "movement:replay:export-session": [
    "scripts/movement-debug/export-replay-session.mjs",
  ],
  "movement:sitting-support-audit": [
    "scripts/movement-debug/sitting-support-readiness-audit.mjs",
  ],
  "movement:squat-knee-lift-support-audit": [
    "scripts/movement-debug/squat-knee-lift-support-claim-audit.mjs",
  ],
  "movement:walking-support-audit": [
    "scripts/movement-debug/walking-support-readiness-audit.mjs",
  ],
  "movement:next-proof-readiness": [
    "scripts/movement-debug/next-proof-readiness.mjs",
  ],
  "movement:next-proof-readiness:strict": [
    "scripts/movement-debug/next-proof-readiness.mjs",
    "--strict",
  ],
  "movement:support-readiness-matrix": [
    "scripts/movement-debug/movement-support-readiness-matrix.mjs",
  ],
  "movement:support-readiness-matrix:strict": [
    "scripts/movement-debug/movement-support-readiness-matrix.mjs",
    "--strict",
  ],
  "movement:architecture-plan-status-audit": [
    "scripts/movement-debug/movement-architecture-plan-status-audit.mjs",
  ],
  "movement:architecture-plan-status-audit:strict": [
    "scripts/movement-debug/movement-architecture-plan-status-audit.mjs",
    "--strict",
  ],
  "movement:roadmap-progress-report": [
    "scripts/movement-debug/movement-roadmap-progress-report.mjs",
  ],
  "movement:roadmap-progress-report:strict": [
    "scripts/movement-debug/movement-roadmap-progress-report.mjs",
    "--strict",
  ],
  "movement:outstanding-tasks-audit": [
    "scripts/movement-debug/movement-outstanding-tasks-audit.mjs",
  ],
  "movement:outstanding-tasks-audit:strict": [
    "scripts/movement-debug/movement-outstanding-tasks-audit.mjs",
    "--strict",
  ],
  "movement:coverage-registry-claim-audit": [
    "src/app/(dashboard)/demos/movements/_lib/movementCoverageRegistry.test.ts",
  ],
  "movement:root-turn-support-audit": [
    "scripts/movement-debug/root-turn-support-claim-audit.mjs",
  ],
  "movement:upper-body-standing-capture-final-audit": [
    "--capture-contract tmp/movement-replay-lab/current-upper-body-standing-broad-capture-contract.json",
  ],
  "movement:upper-body-standing-capture-handoff": [
    "--candidate-review-out tmp/movement-replay-lab/current-upper-body-standing-broad-candidate-review.md",
    "--capture-guide-out tmp/movement-replay-lab/current-upper-body-standing-broad-capture-guide.md",
    "--capture-contract-out tmp/movement-replay-lab/current-upper-body-standing-broad-capture-contract.json",
  ],
  "movement:upper-body-standing-capture-handoff:top-candidate": [
    "--recording-id-from-top-candidate",
    "--candidate-review-out tmp/movement-replay-lab/current-upper-body-standing-broad-candidate-review.md",
    "--capture-guide-out tmp/movement-replay-lab/current-upper-body-standing-broad-capture-guide.md",
    "--capture-contract-out tmp/movement-replay-lab/current-upper-body-standing-broad-capture-contract.json",
  ],
  "movement:upper-body-standing-capture-preflight": [
    "--capture-contract-preflight tmp/movement-replay-lab/current-upper-body-standing-broad-capture-contract.json",
  ],
  "movement:upper-body-standing-capture-ready": [
    "--capture-contract-preflight tmp/movement-replay-lab/current-upper-body-standing-broad-capture-contract.json",
    "--strict",
  ],
  "movement:upper-body-standing-support-audit": [
    "scripts/movement-debug/upper-body-standing-support-readiness-audit.mjs",
  ],
};

export const DEFAULT_SOURCE_PURITY_RULES = [
  {
    forbiddenTerms: [
      "displayLandmarks",
      "mirrorMode",
      "solverLandmarks",
      "avatarRole",
      "debugGameFrame",
      "guidedPreview",
    ],
    path: "src/app/(dashboard)/demos/movements/_lib/movementSourceFrame.ts",
    reason: "MovementSourceFrame must stay raw source truth, not display, solver, avatar, or route state",
  },
];

export const DEFAULT_ROUTE_BYPASS_RULES = [
  {
    allowedPaths: [
      "src/app/(dashboard)/demos/movements/_lib/movementStartBypass.ts",
    ],
    forbiddenTerms: [
      "debugTracking",
      "debugGameFrame",
      "guidedPreview",
      "debugAutoBaseline",
      "manual-preview-skip",
      "debug-player-pose",
    ],
    paths: [
      "src/app/(dashboard)/demos/movements/_lib",
      "src/app/(dashboard)/demos/movements/_hooks",
    ],
    reason: "debug and preview route bypasses must not become core movement-engine branches",
  },
];

function countLines(text) {
  if (text.length === 0) return 0;
  return text.split(/\r?\n/).length - (text.endsWith("\n") ? 1 : 0);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function summarizePhase14ScriptContracts(packageJson, {
  expectations = DEFAULT_PHASE_14_SCRIPT_EXPECTATIONS,
} = {}) {
  const scripts = packageJson?.scripts ?? {};
  const scriptResults = Object.entries(expectations).map(([scriptName, requiredFragments]) => {
    const command = scripts[scriptName] ?? null;
    const missingFragments = requiredFragments.filter((fragment) => (
      typeof command !== "string" || !command.includes(fragment)
    ));

    return {
      command,
      missingFragments,
      ok: typeof command === "string" && missingFragments.length === 0,
      requiredFragments,
      scriptName,
    };
  });

  return {
    ok: scriptResults.every((script) => script.ok),
    scriptResults,
  };
}

export function summarizeUserFacingSupportAuditGates(
  packageJson,
  auditGates = USER_FACING_SUPPORT_AUDIT_GATES,
  scriptExpectations = DEFAULT_PHASE_14_SCRIPT_EXPECTATIONS,
) {
  const scripts = packageJson?.scripts ?? {};
  const gateResults = Object.entries(auditGates)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([family, gate]) => {
      const command = gate.scriptName ? scripts[gate.scriptName] : null;
      const hasBuiltIn = typeof gate.builtIn === "string" && gate.builtIn.length > 0;
      const hasInternalDemoOnlyFailure = !gate.mustStayBlockedWhileInternal || (
        typeof gate.internalDemoOnlyFailure === "string" && gate.internalDemoOnlyFailure.length > 0
      );
      const hasScriptName = typeof gate.scriptName === "string" && gate.scriptName.length > 0;
      const hasUserFacingFailure = typeof gate.userFacingFailure === "string" && gate.userFacingFailure.length > 0;
      const scriptContractTracked = !gate.scriptName || Object.hasOwn(scriptExpectations, gate.scriptName);
      return {
        builtIn: gate.builtIn ?? null,
        command,
        family,
        hasInternalDemoOnlyFailure,
        hasSingleTarget: hasBuiltIn !== hasScriptName,
        hasUserFacingFailure,
        ok: Boolean(
          (gate.builtIn || command) &&
          gate.readinessKey &&
          scriptContractTracked &&
          hasBuiltIn !== hasScriptName &&
          hasUserFacingFailure &&
          hasInternalDemoOnlyFailure
        ),
        readinessKey: gate.readinessKey ?? null,
        scriptContractTracked,
        scriptName: gate.scriptName ?? null,
      };
    });

  return {
    gateResults,
    ok: gateResults.every((gate) => gate.ok),
  };
}

export function summarizeUserFacingSupportAuditGateReadiness({
  auditGates = USER_FACING_SUPPORT_AUDIT_GATES,
  coverageProductTruth,
  expectedInternalDemoOnlyFamilies = [],
  expectedUserFacingFamilies = [],
  readinessByKey = {},
} = {}) {
  const actualInternalDemoOnlyFamilies = coverageProductTruth?.internalDemoOnlyFamilies ?? [];
  const actualMissingProofFamilies = coverageProductTruth?.missingProofFamilies ?? [];
  const actualUserFacingFamilies = coverageProductTruth?.userFacingFamilies ?? [];
  const knownCoverageFamilies = new Set([
    ...actualInternalDemoOnlyFamilies,
    ...actualMissingProofFamilies,
    ...actualUserFacingFamilies,
    ...expectedInternalDemoOnlyFamilies,
    ...expectedUserFacingFamilies,
  ]);
  const gateResults = Object.entries(auditGates)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([family, gate]) => {
      const internalDemoOnly = (
        expectedInternalDemoOnlyFamilies.includes(family) ||
        actualInternalDemoOnlyFamilies.includes(family)
      );
      const userFacing = (
        expectedUserFacingFamilies.includes(family) ||
        actualUserFacingFamilies.includes(family)
      );
      const internalGatePolicyExplicit = userFacing || !internalDemoOnly || Boolean(gate.mustStayBlockedWhileInternal);
      const readinessSignalWired = Object.hasOwn(readinessByKey, gate.readinessKey);
      const registeredFamily = knownCoverageFamilies.has(family);
      const ready = readinessSignalWired && Boolean(readinessByKey[gate.readinessKey]);
      const failures = [];
      if (!registeredFamily) {
        failures.push(`expected support audit gate family ${family} to exist in coverage product truth`);
      }
      if (!internalGatePolicyExplicit) {
        failures.push(`expected internal-demo-only support audit gate for ${family} to declare mustStayBlockedWhileInternal`);
      }
      if (!readinessSignalWired) {
        failures.push(`expected support audit gate for ${family} readiness signal ${gate.readinessKey ?? "none"} to be wired into architecture guard readiness map`);
      }
      if (userFacing && !ready) {
        failures.push(gate.userFacingFailure ?? `expected ${family} support audit to pass before user-facing promotion`);
      }
      if (gate.mustStayBlockedWhileInternal && internalDemoOnly && !userFacing && ready) {
        failures.push(gate.internalDemoOnlyFailure ?? `expected ${family} support audit to stay blocked while ${family} is internal-demo-only`);
      }

      return {
        family,
        failures,
        internalDemoOnly,
        internalGatePolicyExplicit,
        mustStayBlockedWhileInternal: Boolean(gate.mustStayBlockedWhileInternal),
        ok: failures.length === 0,
        readinessKey: gate.readinessKey ?? null,
        readinessSignalWired,
        registeredFamily,
        ready,
        userFacing,
      };
    });
  const expectedReadinessKeys = new Set(gateResults.map((gate) => gate.readinessKey).filter(Boolean));
  const unusedReadinessKeys = Object.keys(readinessByKey).filter((readinessKey) => (
    !expectedReadinessKeys.has(readinessKey)
  ));

  const internalBlockedGates = gateResults.filter((gate) => (
    gate.mustStayBlockedWhileInternal && gate.internalDemoOnly && !gate.userFacing
  ));

  return {
    gateResults,
    internalBlockedGateCount: internalBlockedGates.length,
    internalBlockedOkCount: internalBlockedGates.filter((gate) => !gate.ready).length,
    ok: gateResults.every((gate) => gate.ok) && unusedReadinessKeys.length === 0,
    promotionReadyCount: gateResults.filter((gate) => gate.ready).length,
    unusedReadinessKeys,
  };
}

function walkCodeFiles(rootPath) {
  if (!fs.existsSync(rootPath)) return [];
  const stat = fs.statSync(rootPath);
  if (stat.isFile()) return [rootPath];

  return fs.readdirSync(rootPath, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) return walkCodeFiles(entryPath);
    if (!/\.(ts|tsx|mjs|js)$/.test(entry.name)) return [];
    if (/\.(test|spec)\.(ts|tsx|mjs|js)$/.test(entry.name)) return [];
    return [entryPath];
  });
}

export function summarizeGameSemanticReview(review) {
  const decisions = Array.isArray(review?.decisions) ? review.decisions : [];
  const decisionCounts = decisions.reduce((counts, row) => {
    const decision = row.decision ?? row.status ?? "unknown";
    counts[decision] = (counts[decision] ?? 0) + 1;
    return counts;
  }, {});

  return {
    decisionCounts,
    errorCount: Array.isArray(review?.errors) ? review.errors.length : 0,
    readablePassCount: decisionCounts["readable-pass"] ?? 0,
    targetCount: decisions.length,
  };
}

function gameVisualTargetKey(capture) {
  const target = capture?.target ?? {};
  return [
    target.recordingId ?? "unknown-recording",
    target.frameIndex ?? "unknown-frame",
    Array.isArray(target.cases) ? target.cases.join("+") : "target",
  ].join(":");
}

function gameVisualAnalysisTargetKey(session, frame) {
  return [
    session?.sessionId ?? "unknown-recording",
    frame?.frameIndex ?? "unknown-frame",
    Array.isArray(frame?.cases) ? frame.cases.join("+") : "target",
  ].join(":");
}

function comparableContextFromCapture(capture) {
  const target = capture?.target ?? {};
  return {
    canvasPath: capture?.canvasPath ?? "",
    cases: Array.isArray(target.cases) ? target.cases : [],
    capturedDebugFrameIndex: capture?.capturedDebugFrameIndex ?? null,
    currentUrl: capture?.currentUrl ?? "",
    displayLowerLabel: target.displayLowerLabel ?? "unknown",
    frameIndex: target.frameIndex ?? null,
    movementId: target.movementId ?? null,
    pagePath: capture?.pagePath ?? "",
    recordingId: target.recordingId ?? "unknown-recording",
    sourceLowerLabel: target.sourceLowerLabel ?? "unknown",
    status: capture?.status ?? "unknown",
  };
}

function comparableAnalysisTargetContext(session, frame) {
  return {
    cases: Array.isArray(frame?.cases) ? frame.cases : [],
    displayLowerLabel: frame?.displayLowerLabel ?? "unknown",
    frameIndex: frame?.frameIndex ?? null,
    recordingId: session?.sessionId ?? "unknown-recording",
    sourceLowerLabel: frame?.sourceLowerLabel ?? "unknown",
  };
}

function comparableCaptureTargetContext(capture) {
  const target = capture?.target ?? {};
  return {
    cases: Array.isArray(target.cases) ? target.cases : [],
    displayLowerLabel: target.displayLowerLabel ?? "unknown",
    frameIndex: target.frameIndex ?? null,
    recordingId: target.recordingId ?? "unknown-recording",
    sourceLowerLabel: target.sourceLowerLabel ?? "unknown",
  };
}

function comparableContextFromDecision(decision) {
  const context = decision?.reviewContext ?? {};
  return {
    canvasPath: context.canvasPath ?? "",
    cases: Array.isArray(context.cases) ? context.cases : [],
    capturedDebugFrameIndex: context.capturedDebugFrameIndex ?? null,
    currentUrl: context.currentUrl ?? "",
    displayLowerLabel: context.displayLowerLabel ?? "unknown",
    frameIndex: context.frameIndex ?? null,
    movementId: context.movementId ?? null,
    pagePath: context.pagePath ?? "",
    recordingId: context.recordingId ?? "unknown-recording",
    sourceLowerLabel: context.sourceLowerLabel ?? "unknown",
    status: context.status ?? "unknown",
  };
}

export function summarizeGameVisualCaptureConsistency(analysis, captureManifest) {
  const sessions = Array.isArray(analysis) ? analysis : [];
  const analysisTargets = sessions.flatMap((session) => (
    (Array.isArray(session?.gamePath?.visualProofFrames) ? session.gamePath.visualProofFrames : [])
      .map((frame) => ({ frame, session }))
  ));
  const captures = Array.isArray(captureManifest?.captures) ? captureManifest.captures : [];
  const analysisByKey = new Map(analysisTargets.map((target) => [
    gameVisualAnalysisTargetKey(target.session, target.frame),
    target,
  ]));
  const captureByKey = new Map(captures.map((capture) => [gameVisualTargetKey(capture), capture]));
  const analysisKeys = Array.from(analysisByKey.keys()).sort();
  const captureKeys = Array.from(captureByKey.keys()).sort();
  const missingCaptureKeys = analysisKeys.filter((key) => !captureByKey.has(key));
  const staleCaptureKeys = captureKeys.filter((key) => !analysisByKey.has(key));
  const contextMismatchKeys = analysisKeys.filter((key) => {
    const analysisTarget = analysisByKey.get(key);
    const capture = captureByKey.get(key);
    if (!analysisTarget || !capture) return false;
    return JSON.stringify(comparableAnalysisTargetContext(analysisTarget.session, analysisTarget.frame)) !==
      JSON.stringify(comparableCaptureTargetContext(capture));
  });

  return {
    analysisTargetCount: analysisTargets.length,
    captureTargetCount: captures.length,
    contextMismatchCount: contextMismatchKeys.length,
    contextMismatchKeys,
    missingCaptureKeys,
    staleCaptureKeys,
  };
}

export function summarizeGameVisualReviewConsistency(review, captureManifest) {
  const decisions = Array.isArray(review?.decisions) ? review.decisions : [];
  const captures = Array.isArray(captureManifest?.captures) ? captureManifest.captures : [];
  const captureByKey = new Map(captures.map((capture) => [gameVisualTargetKey(capture), capture]));
  const decisionByKey = new Map(decisions.map((decision) => [decision.key ?? "", decision]));
  const captureKeys = Array.from(captureByKey.keys()).sort();
  const decisionKeys = Array.from(decisionByKey.keys()).sort();
  const missingDecisionKeys = captureKeys.filter((key) => !decisionByKey.has(key));
  const staleDecisionKeys = decisionKeys.filter((key) => !captureByKey.has(key));
  const contextMismatchKeys = captureKeys.filter((key) => {
    const capture = captureByKey.get(key);
    const decision = decisionByKey.get(key);
    if (!decision) return false;
    return JSON.stringify(comparableContextFromDecision(decision)) !==
      JSON.stringify(comparableContextFromCapture(capture));
  });

  return {
    captureErrorCount: Array.isArray(captureManifest?.errors) ? captureManifest.errors.length : 0,
    captureTargetCount: captures.length,
    contextMismatchCount: contextMismatchKeys.length,
    contextMismatchKeys,
    decisionTargetCount: decisions.length,
    missingDecisionKeys,
    staleDecisionKeys,
  };
}

export function summarizeBroadUpperBodyCaptureContract(contract) {
  const commands = Array.isArray(contract?.commands) ? contract.commands : [];
  const finalAuditCommand = commands.find((command) => command.id === "merged-readiness-audit")?.command ?? "";

  return {
    broadPassedProofCandidateCount: Array.isArray(contract?.broadPassedProofCandidates)
      ? contract.broadPassedProofCandidates.length
      : 0,
    broadPassingRecordingCount: Array.isArray(contract?.broadPassingRecordingIds)
      ? contract.broadPassingRecordingIds.length
      : 0,
    broadProductScopedEvidenceCandidateCount: Array.isArray(contract?.productScopedBroadEvidenceCandidates)
      ? contract.productScopedBroadEvidenceCandidates.length
      : 0,
    commandIds: commands.map((command) => command.id),
    captureWorkflowState: contract?.captureWorkflowState ?? "unknown",
    gameProofCases: Array.isArray(contract?.requiredGameProofCases)
      ? contract.requiredGameProofCases
      : [],
    hasRecordingPlaceholder: contract?.recordingIdPlaceholder === "<new-recording-id>",
    hasStrictFinalAudit: /\s--strict(?:\s|$)/.test(finalAuditCommand),
    missingBroadGamePlanCases: Array.isArray(contract?.missingBroadGamePlanCases)
      ? contract.missingBroadGamePlanCases
      : [],
    missingBroadPassedProofCases: Array.isArray(contract?.missingBroadPassedProofCases)
      ? contract.missingBroadPassedProofCases
      : [],
    missingBroadReadableGameCases: Array.isArray(contract?.missingBroadReadableGameCases)
      ? contract.missingBroadReadableGameCases
      : [],
    recordedProofCases: Array.isArray(contract?.requiredRecordedProofCases)
      ? contract.requiredRecordedProofCases
      : [],
    schema: contract?.schema ?? "unknown",
    supportClaimStatus: contract?.supportClaimStatus ?? "unknown",
  };
}

export function summarizeReplayGameParity(analysis) {
  const sessions = Array.isArray(analysis) ? analysis : [];
  return sessions.reduce((summary, session) => {
    summary.sessionCount += 1;
    summary.scoreMessageParityFrames += session.metrics?.replayGameScoreMessageFrameCount ?? 0;
    summary.scoreMessageDivergenceFrames += session.metrics?.replayGameScoreMessageDivergenceFrameCount ?? 0;
    summary.wrapperDivergenceFrames += session.metrics?.replayGameWrapperDivergenceFrameCount ?? 0;
    summary.visualProofFrames += Array.isArray(session.gamePath?.visualProofFrames)
      ? session.gamePath.visualProofFrames.length
      : 0;
    return summary;
  }, {
    scoreMessageDivergenceFrames: 0,
    scoreMessageParityFrames: 0,
    sessionCount: 0,
    visualProofFrames: 0,
    wrapperDivergenceFrames: 0,
  });
}

export function summarizeCoverageProductTruth(analysis) {
  const sessions = Array.isArray(analysis) ? analysis : [];
  const summary = sessions.find((session) => session.coverage?.summary)?.coverage?.summary ?? null;

  return {
    found: Boolean(summary),
    internalDemoOnlyFamilies: summary?.internalDemoOnlyFamilies ?? [],
    missingProofFamilies: summary?.missingProofFamilies ?? [],
    userFacingFamilies: summary?.userFacingFamilies ?? [],
  };
}

export function summarizeProofManifest(manifest) {
  const rows = Array.isArray(manifest) ? manifest : manifest?.rows ?? manifest?.manifest ?? [];
  const blockingStatuses = new Set(["blocking", "failed", "manual-review", "missing-proof"]);
  const statusCounts = rows.reduce((counts, row) => {
    const status = row.status ?? row.reviewStatus ?? row.proofStatus ?? "unknown";
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});
  const productScopeProofCaseCounts = rows.reduce((counts, row) => {
    const status = row.status ?? row.reviewStatus ?? row.proofStatus ?? "unknown";
    if (status !== "product-scope-limitation") return counts;

    const proofCase = row.proofCase ?? "unknown";
    counts[proofCase] = (counts[proofCase] ?? 0) + 1;
    return counts;
  }, {});

  return {
    acceptedProductLimitationRows: rows.filter((row) => row.acceptedProductLimitation).length,
    blockingRows: rows.filter((row) => {
      const status = row.status ?? row.reviewStatus ?? row.proofStatus ?? "unknown";
      return blockingStatuses.has(status);
    }).length,
    productScopeProofCaseCounts,
    rowCount: rows.length,
    statusCounts,
    unresolvedSourceDataLimitationRows: rows.filter((row) => {
      const status = row.status ?? row.reviewStatus ?? row.proofStatus ?? "unknown";
      return status === "source-data-limitation" && !row.acceptedProductLimitation;
    }).length,
  };
}

export function evaluateSourcePurityRule({
  content,
  forbiddenTerms,
  path: filePath,
  reason,
}) {
  const matches = forbiddenTerms.flatMap((term) => {
    const matcher = new RegExp(`\\b${term}\\b`, "g");
    return Array.from(content.matchAll(matcher), (match) => ({
      index: match.index ?? 0,
      term,
    }));
  });

  return {
    forbiddenTerms,
    matches,
    ok: matches.length === 0,
    path: filePath,
    reason,
  };
}

export function evaluateRouteBypassPurityRule({
  allowedPaths = [],
  files,
  forbiddenTerms,
  reason,
}) {
  const allowed = new Set(allowedPaths);
  const matches = files.flatMap((file) => {
    if (allowed.has(file.path)) return [];

    return forbiddenTerms.flatMap((term) => {
      const matcher = new RegExp(`\\b${term}\\b`, "g");
      return Array.from(file.content.matchAll(matcher), (match) => ({
        index: match.index ?? 0,
        path: file.path,
        term,
      }));
    });
  });

  return {
    allowedPaths,
    forbiddenTerms,
    matches,
    ok: matches.length === 0,
    reason,
    scannedFileCount: files.length,
  };
}

export function buildMovementArchitectureGuardReport({
  analysis,
  broadGameVisualPlan = null,
  broadSemanticReview = null,
  captureManifest,
  files,
  manifest,
  packageJson = null,
  planText = null,
  proofExpectations = {},
  routeBypassPurityResults = [],
  semanticReview,
  sittingGameVisualPlan = null,
  sittingManifest = null,
  sittingSemanticReview = null,
  sourcePurityResults = [],
}) {
  const expectedSemanticPasses = proofExpectations.semanticReadablePasses ?? DEFAULT_GAME_VISUAL_PROOF_FRAME_COUNT;
  const expectedVisualProofFrames = proofExpectations.visualProofFrames ?? DEFAULT_GAME_VISUAL_PROOF_FRAME_COUNT;
  const minimumParityFrames = proofExpectations.minimumScoreMessageParityFrames ?? 11000;
  const expectedUserFacingFamilies = proofExpectations.userFacingFamilies ?? [
    "upright",
    "upper-body-standing",
    "standing-side-bend-head-direction",
    "squat-knee-lift",
    "root-turn",
  ];
  const expectedInternalDemoOnlyFamilies = proofExpectations.internalDemoOnlyFamilies ?? [
    "facing-occlusion",
    "root-travel",
    "walking",
    "pivot-weight-transfer",
    "jump-hop",
    "lunges",
    "sitting",
    "kneeling",
    "lying-floor-work",
    "quadruped",
    "rolling-crawling",
    "yoga",
    "pilates",
    "props-contact",
  ];
  const expectedProofStatusCounts = proofExpectations.proofStatusCounts ?? {
    "covered-by-other-recording": 65,
    "product-scope-limitation": 9,
    "source-data-limitation": 18,
  };
  const expectedSupportAuditGates = proofExpectations.auditGates ?? USER_FACING_SUPPORT_AUDIT_GATES;
  const expectedAcceptedProductLimitationRows = proofExpectations.acceptedProductLimitationRows ?? 27;
  const expectedProductScopeProofCaseCounts = proofExpectations.productScopeProofCaseCounts ?? {
    "root-travel": 9,
  };
  const fileResults = files.map((file) => ({
    ...file,
    ok: file.lineCount <= file.maxLines,
  }));
  const semantic = summarizeGameSemanticReview(semanticReview);
  const visualCaptureConsistency = summarizeGameVisualCaptureConsistency(analysis, captureManifest);
  const visualReviewConsistency = summarizeGameVisualReviewConsistency(semanticReview, captureManifest);
  const parity = summarizeReplayGameParity(analysis);
  const coverageProductTruth = summarizeCoverageProductTruth(analysis);
  const proofManifest = summarizeProofManifest(manifest);
  const rootTurnSupportClaim = auditRootTurnSupportClaim({ manifest, semanticReview });
  const squatKneeLiftSupportClaim = auditSquatKneeLiftSupportClaim({ manifest, semanticReview });
  const upperBodyStandingGameVisualPlan = broadGameVisualPlan
    ? mergeGameVisualPlans([captureManifest, broadGameVisualPlan])
    : captureManifest;
  const upperBodyStandingSemanticReview = broadSemanticReview
    ? mergeSemanticReviews([semanticReview, broadSemanticReview])
    : semanticReview;
  const upperBodyStandingSupport = auditUpperBodyStandingSupportReadiness({
    gameVisualPlan: upperBodyStandingGameVisualPlan,
    manifest,
    semanticReview: upperBodyStandingSemanticReview,
  });
  const sittingSupport = auditSittingSupportReadiness({
    gameVisualPlan: sittingGameVisualPlan,
    manifest: sittingManifest,
    semanticReview: sittingSemanticReview,
  });
  const walkingSupport = auditWalkingSupportReadiness({
    gameVisualPlan: captureManifest,
    manifest,
    semanticReview,
  });
  const phase14ScriptContracts = summarizePhase14ScriptContracts(packageJson);
  const userFacingSupportAuditGates = summarizeUserFacingSupportAuditGates(packageJson, expectedSupportAuditGates);
  const supportAuditReadinessByKey = proofExpectations.supportAuditReadinessByKey ?? {
    "coverageProductTruth.found": coverageProductTruth.found,
    "rootTurnSupportClaim.ok": rootTurnSupportClaim.ok,
    "sittingSupport.ready": sittingSupport.ready,
    "squatKneeLiftSupportClaim.ok": squatKneeLiftSupportClaim.ok,
    "upperBodyStandingSupport.broadReady": upperBodyStandingSupport.broadReady,
    "upperBodyStandingSupport.narrowReady": upperBodyStandingSupport.narrowReady,
    "walkingSupport.ready": walkingSupport.ready,
  };
  const userFacingSupportAuditGateReadiness = summarizeUserFacingSupportAuditGateReadiness({
    auditGates: expectedSupportAuditGates,
    coverageProductTruth,
    expectedInternalDemoOnlyFamilies,
    expectedUserFacingFamilies,
    readinessByKey: supportAuditReadinessByKey,
  });
  const supportReadinessMatrix = buildSupportReadinessMatrix({
    analysis,
    broadGameVisualPlan,
    broadSemanticReview,
    gameCaptureManifest: captureManifest,
    manifest,
    semanticReview,
    sittingGameVisualPlan,
    sittingManifest,
    sittingSemanticReview,
  });
  const architecturePlanStatus = planText
    ? auditMovementArchitecturePlanStatus({
      matrix: supportReadinessMatrix,
      planText,
    })
    : {
      expected: {
        blockedUserFacingFamilies: supportReadinessMatrix.blockedUserFacingFamilies,
        internalFamilyCount: supportReadinessMatrix.internalFamilyCount,
        productionFamilySupportPercent: supportReadinessMatrix.productionFamilySupportPercent,
        userFacingCount: supportReadinessMatrix.userFacingCount,
      },
      failures: [],
      ok: true,
    };
  const roadmapProgress = planText
    ? buildMovementRoadmapProgressReport({
      matrix: supportReadinessMatrix,
      planText,
    })
    : {
      failures: [],
      ok: true,
      progress: {
        overallPercent: null,
        sectionAverageNearestFive: null,
      },
    };
  const outstandingTasks = planText
    ? auditMovementOutstandingTasks(planText)
    : {
      failures: [],
      ok: true,
      recommendedTaskCount: 0,
      uncheckedTaskCount: 0,
    };
  const defaultBroadUpperBodyCaptureContract = formatBroadCaptureContract(upperBodyStandingSupport);
  const broadUpperBodyCaptureContract = summarizeBroadUpperBodyCaptureContract(defaultBroadUpperBodyCaptureContract);
  const proofFailures = [];

  if (semantic.readablePassCount !== expectedSemanticPasses || semantic.targetCount !== expectedSemanticPasses) {
    proofFailures.push(`expected ${expectedSemanticPasses} readable Game visual passes, got ${semantic.readablePassCount}/${semantic.targetCount}`);
  }
  if (semantic.errorCount > 0) {
    proofFailures.push(`semantic review has ${semantic.errorCount} errors`);
  }
  if (visualCaptureConsistency.analysisTargetCount !== expectedVisualProofFrames) {
    proofFailures.push(`expected ${expectedVisualProofFrames} Game visual analysis targets, got ${visualCaptureConsistency.analysisTargetCount}`);
  }
  if (visualCaptureConsistency.missingCaptureKeys.length > 0) {
    proofFailures.push(`Game visual capture manifest is missing ${visualCaptureConsistency.missingCaptureKeys.length} analysis target rows`);
  }
  if (visualCaptureConsistency.staleCaptureKeys.length > 0) {
    proofFailures.push(`Game visual capture manifest has ${visualCaptureConsistency.staleCaptureKeys.length} stale target rows`);
  }
  if (visualCaptureConsistency.contextMismatchCount > 0) {
    proofFailures.push(`Game visual capture manifest has ${visualCaptureConsistency.contextMismatchCount} stale analysis target context rows`);
  }
  if (visualReviewConsistency.captureTargetCount !== expectedSemanticPasses) {
    proofFailures.push(`expected ${expectedSemanticPasses} Game visual capture targets, got ${visualReviewConsistency.captureTargetCount}`);
  }
  if (visualReviewConsistency.captureErrorCount > 0) {
    proofFailures.push(`Game visual capture manifest has ${visualReviewConsistency.captureErrorCount} errors`);
  }
  if (visualReviewConsistency.missingDecisionKeys.length > 0) {
    proofFailures.push(`semantic review is missing ${visualReviewConsistency.missingDecisionKeys.length} capture decision rows`);
  }
  if (visualReviewConsistency.staleDecisionKeys.length > 0) {
    proofFailures.push(`semantic review has ${visualReviewConsistency.staleDecisionKeys.length} stale decision rows`);
  }
  if (visualReviewConsistency.contextMismatchCount > 0) {
    proofFailures.push(`semantic review has ${visualReviewConsistency.contextMismatchCount} stale capture context rows`);
  }
  if (parity.scoreMessageParityFrames < minimumParityFrames) {
    proofFailures.push(`expected at least ${minimumParityFrames} score/message parity frames, got ${parity.scoreMessageParityFrames}`);
  }
  if (parity.scoreMessageDivergenceFrames !== 0 || parity.wrapperDivergenceFrames !== 0) {
    proofFailures.push(`expected 0 Replay/Game divergences, got score=${parity.scoreMessageDivergenceFrames}, wrapper=${parity.wrapperDivergenceFrames}`);
  }
  if (parity.visualProofFrames !== expectedVisualProofFrames) {
    proofFailures.push(`expected ${expectedVisualProofFrames} Game visual proof frames, got ${parity.visualProofFrames}`);
  }
  if (proofManifest.blockingRows !== 0) {
    proofFailures.push(`expected 0 blocking proof-manifest rows, got ${proofManifest.blockingRows}`);
  }
  Object.entries(expectedProofStatusCounts).forEach(([status, expectedCount]) => {
    const actualCount = proofManifest.statusCounts[status] ?? 0;
    if (actualCount !== expectedCount) {
      proofFailures.push(`expected proof-manifest status ${status} count ${expectedCount}, got ${actualCount}`);
    }
  });
  if (proofManifest.acceptedProductLimitationRows !== expectedAcceptedProductLimitationRows) {
    proofFailures.push(`expected ${expectedAcceptedProductLimitationRows} accepted proof limitations, got ${proofManifest.acceptedProductLimitationRows}`);
  }
  if (proofManifest.unresolvedSourceDataLimitationRows !== 0) {
    proofFailures.push(`expected 0 unresolved source-data limitation rows, got ${proofManifest.unresolvedSourceDataLimitationRows}`);
  }
  Object.entries(expectedProductScopeProofCaseCounts).forEach(([proofCase, expectedCount]) => {
    const actualCount = proofManifest.productScopeProofCaseCounts[proofCase] ?? 0;
    if (actualCount !== expectedCount) {
      proofFailures.push(`expected product-scope proof case ${proofCase} count ${expectedCount}, got ${actualCount}`);
    }
  });
  if (!coverageProductTruth.found) {
    proofFailures.push("expected coverage product-truth summary in reviewed analysis");
  }
  if (JSON.stringify(coverageProductTruth.userFacingFamilies) !== JSON.stringify(expectedUserFacingFamilies)) {
    proofFailures.push(`expected user-facing movement families ${expectedUserFacingFamilies.join(",")}, got ${coverageProductTruth.userFacingFamilies.join(",") || "none"}`);
  }
  const userFacingFamiliesWithoutSupportAudit = Array.from(new Set([
    ...expectedUserFacingFamilies,
    ...coverageProductTruth.userFacingFamilies,
  ])).filter((family) => !Object.hasOwn(expectedSupportAuditGates, family));
  if (userFacingFamiliesWithoutSupportAudit.length > 0) {
    proofFailures.push(`expected user-facing movement families to have dedicated support audit gates: ${userFacingFamiliesWithoutSupportAudit.join(",")}`);
  }
  userFacingSupportAuditGates.gateResults
    .filter((gate) => !gate.ok)
    .forEach((gate) => {
      if (!gate.command && !gate.builtIn) {
        proofFailures.push(`expected support audit gate for ${gate.family} to reference an existing npm script or built-in guard`);
      }
      if (!gate.readinessKey) {
        proofFailures.push(`expected support audit gate for ${gate.family} to define a readiness signal`);
      }
      if (!gate.scriptContractTracked) {
        proofFailures.push(`expected support audit gate for ${gate.family} to be tracked by Phase 14 script contracts`);
      }
      if (!gate.hasSingleTarget) {
        proofFailures.push(`expected support audit gate for ${gate.family} to define exactly one of npm script or built-in guard`);
      }
      if (!gate.hasUserFacingFailure) {
        proofFailures.push(`expected support audit gate for ${gate.family} to define a user-facing promotion failure message`);
      }
      if (!gate.hasInternalDemoOnlyFailure) {
        proofFailures.push(`expected support audit gate for ${gate.family} to define an internal-demo-only failure message`);
      }
    });
  userFacingSupportAuditGateReadiness.gateResults
    .flatMap((gate) => gate.failures)
    .forEach((failure) => {
      proofFailures.push(failure);
    });
  userFacingSupportAuditGateReadiness.unusedReadinessKeys.forEach((readinessKey) => {
    proofFailures.push(`expected architecture guard readiness map key ${readinessKey} to be referenced by a support audit gate`);
  });
  if (!supportReadinessMatrix.ready) {
    const blocked = supportReadinessMatrix.blockedUserFacingFamilies.join(",") || "coverage product truth";
    proofFailures.push(`expected support readiness matrix to pass for current user-facing families, blocked ${blocked}`);
  }
  if (supportReadinessMatrix.userFacingCount !== expectedUserFacingFamilies.length) {
    proofFailures.push(`expected support readiness matrix user-facing count ${expectedUserFacingFamilies.length}, got ${supportReadinessMatrix.userFacingCount}`);
  }
  architecturePlanStatus.failures.forEach((failure) => {
    proofFailures.push(`architecture plan status audit failed: ${failure}`);
  });
  roadmapProgress.failures.forEach((failure) => {
    proofFailures.push(`roadmap progress report failed: ${failure}`);
  });
  outstandingTasks.failures.forEach((failure) => {
    proofFailures.push(`outstanding tasks audit failed: ${failure}`);
  });
  const missingInternalDemoOnly = expectedInternalDemoOnlyFamilies.filter((family) => (
    !coverageProductTruth.internalDemoOnlyFamilies.includes(family)
  ));
  if (missingInternalDemoOnly.length > 0) {
    proofFailures.push(`expected internal-demo-only movement families to include ${missingInternalDemoOnly.join(",")}`);
  }
  const missingProofForInternal = expectedInternalDemoOnlyFamilies.filter((family) => (
    !coverageProductTruth.missingProofFamilies.includes(family)
  ));
  if (missingProofForInternal.length > 0) {
    proofFailures.push(`expected internal-demo-only families to remain missing full proof: ${missingProofForInternal.join(",")}`);
  }
  if (
    !expectedUserFacingFamilies.includes("walking") &&
    !coverageProductTruth.userFacingFamilies.includes("walking") &&
    (
    expectedInternalDemoOnlyFamilies.includes("walking") ||
    coverageProductTruth.internalDemoOnlyFamilies.includes("walking")
    )
  ) {
    walkingSupport.productScopedRecordedProofCases.forEach((proofCase) => {
      if (!walkingSupport.missingAnalyzerProofCases.includes(proofCase)) {
        proofFailures.push(`expected product-scoped walking proof case ${proofCase} to remain missing analyzer evidence`);
      }
    });
    const productScopedEvidenceCandidates = walkingSupport.walkingProofCandidates.filter((candidate) => (
      candidate.productScopedProofCases.some((proofCase) => candidate.evidenceProofCases.includes(proofCase))
    ));
    if (productScopedEvidenceCandidates.length > 0) {
      proofFailures.push("expected product-scoped walking proof rows not to count as analyzer evidence");
    }
  }
  validateBroadCaptureContractShape(defaultBroadUpperBodyCaptureContract).forEach((issue) => {
    proofFailures.push(`broad upper-body capture contract shape invalid: ${issue}`);
  });
  if (!broadUpperBodyCaptureContract.hasRecordingPlaceholder) {
    proofFailures.push("expected broad upper-body capture contract to keep the default recording placeholder before a saved recording id exists");
  }
  phase14ScriptContracts.scriptResults
    .filter((script) => !script.ok)
    .forEach((script) => {
      proofFailures.push(`expected Phase 14 script ${script.scriptName} to include ${script.missingFragments.join(",") || "required command"}`);
    });

  return {
    broadUpperBodyCaptureContract,
    architecturePlanStatus,
    coverageProductTruth,
    fileResults,
    ok: fileResults.every((file) => file.ok) &&
      sourcePurityResults.every((result) => result.ok) &&
      routeBypassPurityResults.every((result) => result.ok) &&
      proofFailures.length === 0,
    proofFailures,
    proofManifest,
    phase14ScriptContracts,
    replayGameParity: parity,
    rootTurnSupportClaim,
    routeBypassPurityResults,
    roadmapProgress,
    semanticReview: semantic,
    sittingSupport,
    sourcePurityResults,
    squatKneeLiftSupportClaim,
    supportReadinessMatrix,
    outstandingTasks,
    upperBodyStandingSupport,
    userFacingSupportAuditGateReadiness,
    userFacingSupportAuditGates,
    walkingSupport,
    visualCaptureConsistency,
    visualReviewConsistency,
  };
}

export function parseMovementArchitectureGuardArgs(argv) {
  const options = {
    proofPaths: { ...DEFAULT_PROOF_PATHS },
    rootDir: process.cwd(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--root") {
      options.rootDir = value;
      index += 1;
    } else if (arg === "--analysis") {
      options.proofPaths.analysis = value;
      index += 1;
    } else if (arg === "--capture-manifest") {
      options.proofPaths.captureManifest = value;
      index += 1;
    } else if (arg === "--broad-game-visual-plan") {
      options.proofPaths.broadGameVisualPlan = value;
      index += 1;
    } else if (arg === "--broad-semantic-review") {
      options.proofPaths.broadSemanticReview = value;
      index += 1;
    } else if (arg === "--manifest") {
      options.proofPaths.manifest = value;
      index += 1;
    } else if (arg === "--semantic-review") {
      options.proofPaths.semanticReview = value;
      index += 1;
    } else if (arg === "--sitting-game-visual-plan") {
      options.proofPaths.sittingGameVisualPlan = value;
      index += 1;
    } else if (arg === "--sitting-manifest") {
      options.proofPaths.sittingManifest = value;
      index += 1;
    } else if (arg === "--sitting-semantic-review") {
      options.proofPaths.sittingSemanticReview = value;
      index += 1;
    } else {
      throw new Error(`Unknown movement architecture guard argument: ${arg}`);
    }
  }

  return options;
}

export function runMovementArchitectureGuard({
  proofPaths = DEFAULT_PROOF_PATHS,
  routeBypassRules = DEFAULT_ROUTE_BYPASS_RULES,
  rootDir = process.cwd(),
  sourcePurityRules = DEFAULT_SOURCE_PURITY_RULES,
  watchedFiles = DEFAULT_WATCHED_FILES,
} = {}) {
  const resolve = (filePath) => path.resolve(rootDir, filePath);
  const relative = (filePath) => path.relative(rootDir, filePath).split(path.sep).join("/");
  const readOptionalJson = (filePath) => (
    typeof filePath === "string" && fs.existsSync(resolve(filePath))
      ? readJson(resolve(filePath))
      : null
  );
  const files = watchedFiles.map((file) => {
    const absolutePath = resolve(file.path);
    return {
      ...file,
      lineCount: countLines(fs.readFileSync(absolutePath, "utf8")),
    };
  });
  const sourcePurityResults = sourcePurityRules.map((rule) => (
    evaluateSourcePurityRule({
      ...rule,
      content: fs.readFileSync(resolve(rule.path), "utf8"),
    })
  ));
  const routeBypassPurityResults = routeBypassRules.map((rule) => {
    const filesForRule = rule.paths.flatMap((rulePath) => (
      walkCodeFiles(resolve(rulePath)).map((filePath) => ({
        content: fs.readFileSync(filePath, "utf8"),
        path: relative(filePath),
      }))
    ));

    return evaluateRouteBypassPurityRule({
      ...rule,
      files: filesForRule,
    });
  });

  return buildMovementArchitectureGuardReport({
    analysis: readJson(resolve(proofPaths.analysis)),
    broadGameVisualPlan: readOptionalJson(proofPaths.broadGameVisualPlan),
    broadSemanticReview: readOptionalJson(proofPaths.broadSemanticReview),
    captureManifest: readJson(resolve(proofPaths.captureManifest)),
    files,
    manifest: readJson(resolve(proofPaths.manifest)),
    packageJson: readJson(resolve("package.json")),
    planText: fs.readFileSync(resolve("docs/plans/active/movement-studio-best-practice-architecture-plan.md"), "utf8"),
    routeBypassPurityResults,
    semanticReview: readJson(resolve(proofPaths.semanticReview)),
    sittingGameVisualPlan: readOptionalJson(proofPaths.sittingGameVisualPlan),
    sittingManifest: readOptionalJson(proofPaths.sittingManifest),
    sittingSemanticReview: readOptionalJson(proofPaths.sittingSemanticReview),
    sourcePurityResults,
  });
}

function formatInlineList(items) {
  const uniqueItems = Array.from(new Set(items.filter(Boolean)));
  return uniqueItems.length > 0 ? uniqueItems.join(",") : "none";
}

function formatSeatedCandidate(candidate) {
  if (!candidate) return "none";
  return `${candidate.recordingId} (analyzer ${candidate.analyzerProofCaseCount}, passed ${candidate.passedProofCaseCount}, missing analyzer ${formatInlineList(candidate.missingAnalyzerProofCases)}, missing passed ${formatInlineList(candidate.missingPassedProofCases)})`;
}

function formatWalkingCandidate(candidate) {
  if (!candidate) return "none";
  return `${candidate.recordingId} (evidence ${candidate.evidenceProofCaseCount}, passed ${candidate.passedProofCaseCount}, product-scoped ${formatInlineList(candidate.productScopedProofCases)}, missing passed ${formatInlineList(candidate.missingPassedProofCases)})`;
}

function formatSupportRecordingScenario(audit) {
  const scenario = audit?.recordingGap?.captureScenarios?.[0];
  if (!scenario) return "none";
  const label = scenario.freshRecordingLabel || scenario.id || "unknown";
  return scenario.quickValidationCommand ? `${label} (${scenario.quickValidationCommand})` : label;
}

function writeSupportRecordingPlans(report) {
  [
    report.sittingSupport?.recordingGap,
    report.walkingSupport?.recordingGap,
  ].forEach((recordingGap) => {
    if (!recordingGap?.planPath || !recordingGap?.plan) return;
    fs.mkdirSync(path.dirname(recordingGap.planPath), { recursive: true });
    fs.writeFileSync(recordingGap.planPath, `${JSON.stringify(recordingGap.plan, null, 2)}\n`, "utf8");
  });
}

export function formatReport(report) {
  const supportGateCount = report.userFacingSupportAuditGates.gateResults.length;
  const supportGateSchemaOkCount = report.userFacingSupportAuditGates.gateResults.filter((gate) => (
    gate.hasInternalDemoOnlyFailure &&
    gate.hasSingleTarget &&
    gate.hasUserFacingFailure
  )).length;
  const supportGateRegisteredCount = report.userFacingSupportAuditGateReadiness.gateResults.filter((gate) => (
    gate.registeredFamily
  )).length;
  const supportGateReadinessWiredCount = report.userFacingSupportAuditGateReadiness.gateResults.filter((gate) => (
    gate.readinessSignalWired
  )).length;
  const lines = [
    `Movement architecture guard: ${report.ok ? "passed" : "failed"}`,
    "",
    "Watched files:",
    ...report.fileResults.map((file) => (
      `- ${file.ok ? "PASS" : "FAIL"} ${file.path}: ${file.lineCount}/${file.maxLines} lines (${file.reason})`
    )),
    "",
    "Source purity:",
    ...report.sourcePurityResults.map((result) => (
      `- ${result.ok ? "PASS" : "FAIL"} ${result.path}: ${result.matches.length} forbidden terms (${result.reason})`
    )),
    "",
    "Route bypass purity:",
    ...report.routeBypassPurityResults.map((result) => (
      `- ${result.ok ? "PASS" : "FAIL"} ${result.scannedFileCount} files: ${result.matches.length} forbidden terms (${result.reason})`
    )),
    "",
    `Game visual proof: ${report.semanticReview.readablePassCount}/${report.semanticReview.targetCount} readable-pass, ${report.semanticReview.errorCount} errors`,
    `Game visual capture consistency: ${report.visualCaptureConsistency.analysisTargetCount} analysis targets, ${report.visualCaptureConsistency.missingCaptureKeys.length} missing captures, ${report.visualCaptureConsistency.staleCaptureKeys.length} stale captures, ${report.visualCaptureConsistency.contextMismatchCount} context mismatches`,
    `Game visual review consistency: ${report.visualReviewConsistency.captureTargetCount} captures, ${report.visualReviewConsistency.missingDecisionKeys.length} missing decisions, ${report.visualReviewConsistency.staleDecisionKeys.length} stale decisions, ${report.visualReviewConsistency.contextMismatchCount} context mismatches`,
    `Replay/Game parity: ${report.replayGameParity.scoreMessageParityFrames} frames, score divergences ${report.replayGameParity.scoreMessageDivergenceFrames}, wrapper divergences ${report.replayGameParity.wrapperDivergenceFrames}, visual frames ${report.replayGameParity.visualProofFrames}`,
    `Coverage product truth: user-facing ${report.coverageProductTruth.userFacingFamilies.join(",") || "none"}, internal-demo-only ${report.coverageProductTruth.internalDemoOnlyFamilies.join(",") || "none"}`,
    `Support readiness matrix: ${report.supportReadinessMatrix.ready ? "ready" : "blocked"}, production families ${report.supportReadinessMatrix.userFacingCount}/${report.supportReadinessMatrix.familyCount} (${report.supportReadinessMatrix.productionFamilySupportPercent}%), blocked user-facing ${report.supportReadinessMatrix.blockedUserFacingFamilies.length}`,
    `Architecture plan status: ${report.architecturePlanStatus.ok ? "passed" : "blocked"}, current board ${report.architecturePlanStatus.expected.userFacingCount}/${report.supportReadinessMatrix.familyCount} (${report.architecturePlanStatus.expected.productionFamilySupportPercent}%), internal ${report.architecturePlanStatus.expected.internalFamilyCount}/${report.supportReadinessMatrix.familyCount}`,
    `Roadmap progress: ${report.roadmapProgress.ok ? "ready" : "blocked"}, overall ${report.roadmapProgress.progress.overallPercent ?? "missing"}%, section average about ${report.roadmapProgress.progress.sectionAverageNearestFive ?? "missing"}%, production families ${report.supportReadinessMatrix.userFacingCount}/${report.supportReadinessMatrix.familyCount} (${report.supportReadinessMatrix.productionFamilySupportPercent}%)`,
    `Outstanding tasks: ${report.outstandingTasks.ok ? "ready" : "blocked"}, unchecked ${report.outstandingTasks.uncheckedTaskCount}, recommended next ${report.outstandingTasks.recommendedTaskCount}`,
    `Root-turn support claim: ${report.rootTurnSupportClaim.ok ? "passed" : "blocked"} (${report.rootTurnSupportClaim.passingCandidateCount} reviewed bundle(s))`,
    `Squat/knee-lift support claim: ${report.squatKneeLiftSupportClaim.ok ? "passed" : "blocked"} (${report.squatKneeLiftSupportClaim.passingCandidateCount} reviewed bundle(s))`,
    `Broad upper-body capture contract: ${report.broadUpperBodyCaptureContract.recordedProofCases.length} recorded proof cases, ${report.broadUpperBodyCaptureContract.gameProofCases.length} Game proof cases, ${report.broadUpperBodyCaptureContract.commandIds.length} commands, strict final audit ${report.broadUpperBodyCaptureContract.hasStrictFinalAudit ? "yes" : "no"}, status ${report.broadUpperBodyCaptureContract.supportClaimStatus}, workflow ${report.broadUpperBodyCaptureContract.captureWorkflowState}, missing recorded passes ${report.broadUpperBodyCaptureContract.missingBroadPassedProofCases.length}, missing Game plan/readability ${report.broadUpperBodyCaptureContract.missingBroadGamePlanCases.length + report.broadUpperBodyCaptureContract.missingBroadReadableGameCases.length}, passing bundles ${report.broadUpperBodyCaptureContract.broadPassingRecordingCount}, passed-proof candidates ${report.broadUpperBodyCaptureContract.broadPassedProofCandidateCount}, product-scoped candidates ${report.broadUpperBodyCaptureContract.broadProductScopedEvidenceCandidateCount}`,
    `Sitting support audit: ${report.sittingSupport.ready ? "ready" : "blocked"}, missing analyzer ${report.sittingSupport.missingAnalyzerProofCases.length}, missing Game plan/readability ${report.sittingSupport.missingGamePlanCases.length + report.sittingSupport.missingReadableGameCases.length}, candidates ${report.sittingSupport.seatedProofCandidates.length}`,
    `Sitting support blockers: analyzer ${formatInlineList(report.sittingSupport.missingAnalyzerProofCases)}, Game plan/readability ${formatInlineList([...report.sittingSupport.missingGamePlanCases, ...report.sittingSupport.missingReadableGameCases])}`,
    `Sitting support best candidate: ${formatSeatedCandidate(report.sittingSupport.seatedProofCandidates[0])}`,
    `Sitting support next recording: ${formatSupportRecordingScenario(report.sittingSupport)}`,
    `Walking support audit: ${report.walkingSupport.ready ? "ready" : "blocked"}, missing analyzer ${report.walkingSupport.missingAnalyzerProofCases.length}, product-scoped ${report.walkingSupport.productScopedRecordedProofCases.length}, candidates ${report.walkingSupport.walkingProofCandidates.length}`,
    `Walking support blockers: analyzer ${formatInlineList(report.walkingSupport.missingAnalyzerProofCases)}, recorded passed ${formatInlineList(report.walkingSupport.missingRecordedPassedProofCases)}, Game plan/readability ${formatInlineList([...report.walkingSupport.missingGamePlanCases, ...report.walkingSupport.missingReadableGameCases])}`,
    `Walking support best candidate: ${formatWalkingCandidate(report.walkingSupport.walkingProofCandidates[0])}`,
    `Walking support next recording: ${formatSupportRecordingScenario(report.walkingSupport)}`,
    `User-facing support audit gates: ${report.userFacingSupportAuditGates.gateResults.filter((gate) => gate.ok).length}/${report.userFacingSupportAuditGates.gateResults.length} ok`,
    `User-facing support audit gate integrity: ${supportGateRegisteredCount}/${supportGateCount} registered families, ${supportGateSchemaOkCount}/${supportGateCount} schema-valid, ${supportGateReadinessWiredCount}/${supportGateCount} readiness-wired, ${report.userFacingSupportAuditGateReadiness.unusedReadinessKeys.length} unused readiness keys`,
    `User-facing support audit readiness: ${report.userFacingSupportAuditGateReadiness.promotionReadyCount}/${report.userFacingSupportAuditGateReadiness.gateResults.length} promotion-ready, ${report.userFacingSupportAuditGateReadiness.internalBlockedOkCount}/${report.userFacingSupportAuditGateReadiness.internalBlockedGateCount} internal-blocked ok`,
    `Phase 14 script contracts: ${report.phase14ScriptContracts.scriptResults.filter((script) => script.ok).length}/${report.phase14ScriptContracts.scriptResults.length} ok`,
    `Proof manifest: ${report.proofManifest.rowCount} rows, ${report.proofManifest.blockingRows} blocking, ${report.proofManifest.acceptedProductLimitationRows} accepted limitations`,
  ];

  if (report.proofFailures.length > 0) {
    lines.push("", "Proof failures:", ...report.proofFailures.map((failure) => `- ${failure}`));
  }
  const sourcePurityFailures = report.sourcePurityResults.filter((result) => !result.ok);
  if (sourcePurityFailures.length > 0) {
    lines.push(
      "",
      "Source purity failures:",
      ...sourcePurityFailures.flatMap((result) => result.matches.map((match) => (
        `- ${result.path}: forbidden term ${match.term}`
      ))),
    );
  }
  const routeBypassFailures = report.routeBypassPurityResults.filter((result) => !result.ok);
  if (routeBypassFailures.length > 0) {
    lines.push(
      "",
      "Route bypass purity failures:",
      ...routeBypassFailures.flatMap((result) => result.matches.map((match) => (
        `- ${match.path}: forbidden term ${match.term}`
      ))),
    );
  }

  return lines.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseMovementArchitectureGuardArgs(process.argv.slice(2));
    const report = runMovementArchitectureGuard(options);
    writeSupportRecordingPlans(report);
    console.log(formatReport(report));
    process.exit(report.ok ? 0 : 1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
