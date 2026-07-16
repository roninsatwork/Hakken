#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { movementPipelineFingerprint } from "./lib/movementPipelineFingerprint.mjs";
import { RENDERED_FIDELITY_POLICY } from "../../src/lib/movements/renderedFidelityPolicy.mjs";

const defaultAnalysisPath = "tmp/movement-replay-lab/current-analysis-with-captures.json";
const defaultManifestPath = "tmp/movement-replay-lab/current-analysis-with-captures.proof-manifest.json";
const defaultFixLogPath = "tmp/movement-replay-lab/current-avatar-follow-fix-log.json";
const defaultFixLogMarkdownPath = "tmp/movement-replay-lab/current-avatar-follow-fix-log.md";

export const DEFAULT_AVATAR_FOLLOW_THRESHOLDS = {
  maxActiveLegDirectionError: 0.12,
  maxLowerBodyDirectionError: 0.22,
  maxMirrorSideDirectionError: 0.18,
  maxOwnerTransitionsPerSecond: 1.25,
  maxPlantedFootClearance: 0.08,
  maxUpperBodyDirectionError: RENDERED_FIDELITY_POLICY.passMax,
  minVisualMatchScore: 0.85,
};

const ignoredStatuses = new Set([
  "covered-by-other-recording",
  "product-scope-limitation",
  "source-data-limitation",
]);

const hardVisualProofCases = new Set([
  "root-turn",
  "seated-neutral",
  "seated-twist",
  "seated-forward-fold",
  "seated-leg-lift",
  "chair-contact",
]);
const legRaiseProofCases = new Set(["left-leg-raise", "right-leg-raise"]);
const standingLegProofCases = new Set(["left-leg-raise", "mirror-side-ownership", "right-leg-raise"]);
const maxReplayStudioFrameFailuresPerRecording = 3;

function printHelp() {
  console.log(`Gate Replay avatar-follow proof from analysis and recorded proof manifest JSON.

Usage:
  npm run movement:avatar-follow-gate -- --analysis tmp/movement-replay-lab/current-analysis-with-captures.json --manifest tmp/movement-replay-lab/current-analysis-with-captures.proof-manifest.json

Options:
  --analysis <file>                    Replay analysis JSON. Defaults to ${defaultAnalysisPath}
  --manifest <file>                    Recorded proof manifest JSON. Defaults to ${defaultManifestPath}
  --min-visual-match <n>               Minimum analysis visual match score. Defaults to ${DEFAULT_AVATAR_FOLLOW_THRESHOLDS.minVisualMatchScore}
  --max-active-leg-direction-error <n> Maximum leg-raise capture lower-body direction error. Defaults to ${DEFAULT_AVATAR_FOLLOW_THRESHOLDS.maxActiveLegDirectionError}
  --max-lower-body-direction-error <n> Maximum average lower-body direction error. Defaults to ${DEFAULT_AVATAR_FOLLOW_THRESHOLDS.maxLowerBodyDirectionError}
  --max-mirror-side-direction-error <n> Maximum mirror-side capture lower-body direction error. Defaults to ${DEFAULT_AVATAR_FOLLOW_THRESHOLDS.maxMirrorSideDirectionError}
  --max-upper-body-direction-error <n> Maximum average upper-body direction error. Defaults to ${DEFAULT_AVATAR_FOLLOW_THRESHOLDS.maxUpperBodyDirectionError}
  --max-owner-transitions-per-second <n>
                                      Maximum lower-body owner transitions per second. Defaults to ${DEFAULT_AVATAR_FOLLOW_THRESHOLDS.maxOwnerTransitionsPerSecond}
  --max-planted-foot-clearance <n>    Maximum capture-backed planted-foot clearance above floor. Defaults to ${DEFAULT_AVATAR_FOLLOW_THRESHOLDS.maxPlantedFootClearance}
  --fix-log-out <file>                Write compact JSON fix log. Defaults to ${defaultFixLogPath} when supplied without value.
  --fix-log-md-out <file>             Write Markdown fix log. Defaults to ${defaultFixLogMarkdownPath} when supplied without value.
  --json                               Print JSON summary.
  --help                               Show this help.
`);
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseArgs(argv) {
  const args = {
    analysisPath: defaultAnalysisPath,
    fixLogMarkdownPath: null,
    fixLogPath: null,
    json: false,
    manifestPath: defaultManifestPath,
    thresholds: { ...DEFAULT_AVATAR_FOLLOW_THRESHOLDS },
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--analysis") {
      args.analysisPath = argv[++index] || args.analysisPath;
    } else if (arg === "--manifest") {
      args.manifestPath = argv[++index] || args.manifestPath;
    } else if (arg === "--fix-log-out") {
      const next = argv[index + 1];
      if (next && !next.startsWith("--")) {
        args.fixLogPath = next;
        index += 1;
      } else {
        args.fixLogPath = defaultFixLogPath;
      }
    } else if (arg === "--fix-log-md-out") {
      const next = argv[index + 1];
      if (next && !next.startsWith("--")) {
        args.fixLogMarkdownPath = next;
        index += 1;
      } else {
        args.fixLogMarkdownPath = defaultFixLogMarkdownPath;
      }
    } else if (arg === "--min-visual-match") {
      args.thresholds.minVisualMatchScore = parseNumber(argv[++index], args.thresholds.minVisualMatchScore);
    } else if (arg === "--max-active-leg-direction-error") {
      args.thresholds.maxActiveLegDirectionError = parseNumber(
        argv[++index],
        args.thresholds.maxActiveLegDirectionError,
      );
    } else if (arg === "--max-lower-body-direction-error") {
      args.thresholds.maxLowerBodyDirectionError = parseNumber(
        argv[++index],
        args.thresholds.maxLowerBodyDirectionError,
      );
    } else if (arg === "--max-mirror-side-direction-error") {
      args.thresholds.maxMirrorSideDirectionError = parseNumber(
        argv[++index],
        args.thresholds.maxMirrorSideDirectionError,
      );
    } else if (arg === "--max-upper-body-direction-error") {
      args.thresholds.maxUpperBodyDirectionError = Math.min(
        RENDERED_FIDELITY_POLICY.passMax,
        parseNumber(argv[++index], args.thresholds.maxUpperBodyDirectionError),
      );
    } else if (arg === "--max-owner-transitions-per-second") {
      args.thresholds.maxOwnerTransitionsPerSecond = parseNumber(
        argv[++index],
        args.thresholds.maxOwnerTransitionsPerSecond,
      );
    } else if (arg === "--max-planted-foot-clearance") {
      args.thresholds.maxPlantedFootClearance = parseNumber(
        argv[++index],
        args.thresholds.maxPlantedFootClearance,
      );
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return args;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(resolve(filePath), "utf8"));
}

function isSupportedAvatarFollowRow(row) {
  return Boolean(
    row &&
    !row.acceptedProductLimitation &&
    !ignoredStatuses.has(row.status) &&
    (
      row.status === "passed" ||
      row.status === "manual-review" ||
      row.automatedStatus === "passed"
    ) &&
    Number(row.evidenceFrameCount || 0) > 0
  );
}

function weightedAverage(entries) {
  const totalCount = entries.reduce((sum, entry) => sum + entry.count, 0);
  if (totalCount === 0) return null;
  return entries.reduce((sum, entry) => sum + entry.average * entry.count, 0) / totalCount;
}

function errorEntries(rows, key) {
  return rows.flatMap((row) => {
    const summary = row.visualCaptureDiagnostics?.[key];
    if (
      typeof summary?.average !== "number" ||
      !Number.isFinite(summary.average) ||
      typeof summary?.count !== "number" ||
      summary.count <= 0
    ) {
      return [];
    }
    return [{ average: summary.average, count: summary.count }];
  });
}

function captureSummaryForRows(rows) {
  const frames = new Set();
  rows.forEach((row) => {
    if (Array.isArray(row.visualCaptureFrames)) {
      row.visualCaptureFrames.forEach((frame) => frames.add(frame));
    }
  });

  return {
    averageAvatarLowerBodyDirectionError: weightedAverage(errorEntries(rows, "avatarLowerError")),
    averageAvatarUpperBodyDirectionError: weightedAverage(errorEntries(rows, "avatarUpperError")),
    maxAvatarPlantedFootClearance: Math.max(
      0,
      ...rows.flatMap((row) => {
        const max = row.visualCaptureDiagnostics?.avatarPlantedFootClearance?.max;
        return typeof max === "number" && Number.isFinite(max) ? [max] : [];
      }),
    ),
    visualCaptureFrameCount: frames.size,
  };
}

function replayStudioReviewResolvedByRenderedProof({
  analysis,
  hasCleanCaptureBackedAvatarProof,
  minVisualMatchScore,
  replayStudioSession,
  visualMatchScore,
}) {
  if (!hasCleanCaptureBackedAvatarProof || replayStudioSession?.status !== "review") return false;
  if (visualMatchScore < minVisualMatchScore) return false;
  if (replayStudioSession.blockedFrameCount > 0 || replayStudioSession.reviewedFrameCount > 0) return false;
  if ((replayStudioSession.worstFrames ?? []).length > 0) return false;

  const unframedFailures = Array.isArray(analysis?.failures)
    ? analysis.failures.filter((failure) => typeof failure?.frameIndex !== "number")
    : [];
  return unframedFailures.length > 0 && unframedFailures.every((failure) => (
    failure?.code === "visual_match_low" && failure?.severity === "warning"
  ));
}

function avatarFollowScopeForRows(rows) {
  const supportedRows = rows.filter(isSupportedAvatarFollowRow);
  if (supportedRows.length > 0) {
    return {
      reason: "supported avatar-follow proof rows are present",
      status: "supported",
      supportedRows,
    };
  }

  const statuses = Array.from(new Set(rows.map((row) => row?.status).filter(Boolean))).sort();
  const hasOnlyKnownNonSupportedRows = rows.length > 0 && rows.every((row) => (
    row?.acceptedProductLimitation ||
    ignoredStatuses.has(row?.status) ||
    row?.status === "missing-proof" ||
    row?.automatedStatus === "covered-by-other-recording" ||
    row?.automatedStatus === "missing-proof" ||
    row?.automatedStatus === "source-data-limitation" ||
    row?.automatedStatus === "product-scope-limitation"
  ));

  return {
    reason: hasOnlyKnownNonSupportedRows
      ? `no supported avatar-follow proof rows; manifest statuses: ${statuses.join(", ") || "none"}`
      : `no supported avatar-follow proof rows; inspect manifest statuses: ${statuses.join(", ") || "none"}`,
    status: "not-supported",
    supportedRows,
  };
}

function errorSummaryForRow(row, key) {
  const summary = row?.visualCaptureDiagnostics?.[key];
  return typeof summary?.count === "number" && summary.count > 0
    ? summary
    : null;
}

function isDiagnosticAvatarFollowRow(row) {
  return Boolean(
    row &&
    !row.acceptedProductLimitation &&
    (
      row.status !== "covered-by-other-recording" ||
      Number(row.visualCaptureFrameCount || 0) > 0 ||
      (Array.isArray(row.visualCaptureFrames) && row.visualCaptureFrames.length > 0)
    ) &&
    row.status !== "product-scope-limitation" &&
    row.status !== "source-data-limitation" &&
    row.status !== "missing-proof" &&
    Number(row.evidenceFrameCount || 0) > 0
  );
}

function analysisBySession(analyses) {
  return new Map(analyses.map((analysis) => [analysis.sessionId, analysis]));
}

function rowsByRecording(rows) {
  const grouped = new Map();
  rows.forEach((row) => {
    if (!grouped.has(row.recordingId)) grouped.set(row.recordingId, []);
    grouped.get(row.recordingId).push(row);
  });
  return grouped;
}

function round(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value * 1000) / 1000
    : value;
}

function compactReplayStudioWorstFrames(session) {
  if (!session || !Array.isArray(session.worstFrames)) return [];
  return session.worstFrames.slice(0, 12).map((frame) => ({
    actual: frame.actual,
    expected: frame.expected,
    failures: Array.isArray(frame.failures)
      ? frame.failures.map((failure) => ({
        code: failure.code,
        detail: failure.detail,
        evidenceStatus: failure.evidenceStatus,
        focusedTests: failure.focusedTests,
        likelyFiles: failure.likelyFiles,
        nextFixArea: failure.nextFixArea,
        repairStage: failure.repairStage,
        severity: failure.severity,
      }))
      : [],
    frameIndex: frame.frameIndex,
    source: frame.source,
    status: frame.status,
  }));
}

function sideForProofCase(proofCase, frame) {
  const combined = `${proofCase ?? ""} ${frame?.lowerOwner ?? ""} ${frame?.lowerLabel ?? ""}`.toLowerCase();
  if (combined.includes("left")) return "left";
  if (combined.includes("right")) return "right";
  if (combined.includes("squat") || combined.includes("mirror")) return "both";
  return null;
}

function compactGamePathFrameForRow({
  analysis,
  failureCode,
  failureDetail,
  lowerSummary,
  row,
  severity = "error",
  upperSummary,
}) {
  const visualCaptureFrame = Array.isArray(row.visualCaptureFrames)
    ? row.visualCaptureFrames.find((frameIndex) => Number.isInteger(frameIndex))
    : null;
  if (!analysis?.gamePath || typeof visualCaptureFrame !== "number") return null;

  const frame = analysis.gamePath.frames?.[visualCaptureFrame];
  const sourceFrame = analysis.gamePath.sourceFrames?.[visualCaptureFrame];
  if (!frame) return null;

  return {
    actual: {
      comparedLowerBodySegments: null,
      comparedUpperBodySegments: null,
      feetOwner: frame.feetOwner ?? "unknown",
      lowerBodyDirectionError: round(lowerSummary?.average),
      lowerBodyDirectionErrorMax: round(lowerSummary?.max),
      lowerOwner: frame.lowerOwner ?? "unknown",
      supportIntent: frame.supportIntentKey ?? "unknown",
      supportPresentation: frame.supportPresentationOwner ?? "unknown",
      upperBodyDirectionError: round(upperSummary?.average),
      upperBodyDirectionErrorMax: round(upperSummary?.max),
    },
    expected: {
      motion: frame.lowerLabel ?? row.proofCase ?? "unknown",
      owner: frame.lowerOwner ?? "unknown",
      proofCase: row.proofCase ?? null,
      side: sideForProofCase(row.proofCase, frame),
    },
    failures: [{
      code: failureCode,
      detail: failureDetail,
      nextFixArea: fixAreaForFailureCode(failureCode),
      severity,
    }],
    frameIndex: visualCaptureFrame,
    source: {
      readiness: sourceFrame?.startReadinessState ?? "unknown",
      sourceQuality: round(frame.sourceQuality),
      visibleBodyParts: sourceFrame?.visibleBodyParts ?? [],
      weakestGroup: sourceFrame?.truthSkeletonWeakestGroup,
    },
    status: severity === "error" ? "blocked" : "review",
  };
}

function firstGamePathFrameForRow(analysis, row) {
  const visualCaptureFrame = Array.isArray(row.visualCaptureFrames)
    ? row.visualCaptureFrames.find((frameIndex) => Number.isInteger(frameIndex))
    : null;
  return typeof visualCaptureFrame === "number"
    ? analysis?.gamePath?.frames?.[visualCaptureFrame] ?? null
    : null;
}

function isStandingLegProofContextMismatch(analysis, row) {
  if (!standingLegProofCases.has(row.proofCase)) return false;
  const frame = firstGamePathFrameForRow(analysis, row);
  if (!frame) return false;
  return String(frame.supportIntentKey ?? "").startsWith("seat") ||
    String(frame.supportPresentationOwner ?? "").includes("seated") ||
    String(frame.exercisePoseKey ?? "").includes("seated") ||
    String(frame.exercisePoseKey ?? "").includes("chair");
}

function pushFailure(failures, code, detail, context = {}) {
  failures.push({
    code,
    context,
    detail,
  });
}

function primaryReplayStudioFrameFailure(frame) {
  if (!Array.isArray(frame?.failures) || frame.failures.length === 0) return null;
  return frame.failures.find((failure) => failure.code !== "source-not-trustworthy") ?? frame.failures[0];
}

function fixAreaForFailureCode(code) {
  if (code === "avatar-arm-pose-diverged" || code === "avatar_arm_pose_diverged") {
    return "upper-arm/lower-arm retarget application";
  }
  if (code === "avatar-head-alignment-diverged" || code === "avatar_head_alignment_diverged") {
    return "head tracking application / head-spine coordination";
  }
  if (code === "avatar-planted-foot-diverged" || code === "avatar_planted_foot_diverged") {
    return "foot lock / planted-foot support application";
  }
  if (code === "avatar-spine-angle-diverged" || code === "avatar_spine_angle_diverged") {
    return "spine drive / torso orientation application";
  }
  if (code === "avatar-not-following-leg") return "VRM lower-body application / leg-retarget output";
  if (code === "avatar-wrong-side") return "mirror mapping / side ownership";
  if (code === "standing-leg-proof-context-mismatch") return "Replay proof window selection / standing leg isolation";
  if (code === "avatar-upper-body-diverged") return "upper-body retarget / shoulder-scapula application";
  if (code === "replay-studio-session-blocked" || code === "replay-studio-blocked-frame") {
    return "Replay Studio judged frame";
  }
  if (code === "replay-studio-session-review" || code === "replay-studio-review-frame") {
    return "Replay Studio review frame";
  }
  if (code.includes("visual") || code.includes("capture")) return "Replay visual proof capture / avatar-follow gate";
  if (code.includes("flicker")) return "lower-body owner smoothing / hysteresis";
  if (code.includes("direction-error")) return "avatar visual direction matching";
  return "Replay avatar-follow observability";
}

function fixLogSeverityForFailure(failure) {
  return failure.code === "avatar-not-following-leg" ||
    failure.code === "avatar-wrong-side" ||
    failure.code === "replay-studio-session-blocked" ||
    failure.code === "replay-studio-blocked-frame"
    ? "error"
    : "warning";
}

function fixLogEntryForFailure(failure, index) {
  const context = failure.context ?? {};
  const frame = context.frame;
  const primaryFrameFailure = primaryReplayStudioFrameFailure(frame);
  return {
    code: failure.code,
    detail: failure.detail,
    expected: frame?.expected ?? null,
    actual: frame?.actual ?? null,
    doNotPatch: primaryFrameFailure?.doNotPatch ?? [],
    evidenceStatus: primaryFrameFailure?.evidenceStatus ?? null,
    frameIndex: typeof context.frameIndex === "number"
      ? context.frameIndex
      : typeof frame?.frameIndex === "number"
        ? frame.frameIndex
        : null,
    focusedTests: primaryFrameFailure?.focusedTests ?? [],
    likelyFiles: primaryFrameFailure?.likelyFiles ?? [],
    index,
    nextFixArea: primaryFrameFailure?.nextFixArea ?? fixAreaForFailureCode(failure.code),
    proofCase: context.proofCase ?? null,
    recordingId: context.recordingId ?? null,
    repairStage: primaryFrameFailure?.repairStage ?? null,
    severity: primaryFrameFailure?.severity ?? fixLogSeverityForFailure(failure),
    source: frame?.source ?? null,
    status: context.status ?? frame?.status ?? null,
    visualCaptureFrames: context.visualCaptureFrames ?? [],
  };
}

function buildFixLog(result) {
  const entries = result.failures
    .map(fixLogEntryForFailure)
    .sort((left, right) => (
      (left.severity === "error" ? 0 : 1) - (right.severity === "error" ? 0 : 1) ||
      String(left.recordingId ?? "").localeCompare(String(right.recordingId ?? "")) ||
      String(left.proofCase ?? "").localeCompare(String(right.proofCase ?? "")) ||
      (left.frameIndex ?? Number.MAX_SAFE_INTEGER) - (right.frameIndex ?? Number.MAX_SAFE_INTEGER)
    ));
  return {
    entries,
    generatedAt: new Date().toISOString(),
    issueCount: entries.length,
    recordingCount: result.recordingCount,
    status: result.status,
    thresholds: result.thresholds,
  };
}

function formatFixLogMarkdown(fixLog) {
  const lines = [
    "# Replay Avatar-Follow Fix Log",
    "",
    `Status: ${fixLog.status}`,
    `Issues: ${fixLog.issueCount}`,
    `Generated: ${fixLog.generatedAt}`,
    "",
  ];

  fixLog.entries.slice(0, 80).forEach((entry) => {
    const location = [
      entry.recordingId,
      entry.proofCase,
      typeof entry.frameIndex === "number" ? `frame ${entry.frameIndex}` : null,
    ].filter(Boolean).join(" / ");
    lines.push(`## ${entry.severity.toUpperCase()} ${entry.code}`);
    lines.push("");
    if (location) lines.push(`Location: ${location}`);
    lines.push(`Fix area: ${entry.nextFixArea}`);
    lines.push(`Detail: ${entry.detail}`);
    if (Array.isArray(entry.visualCaptureFrames) && entry.visualCaptureFrames.length > 0) {
      lines.push(`Visual capture frames: ${entry.visualCaptureFrames.join(", ")}`);
    }
    lines.push("");
  });

  if (fixLog.entries.length > 80) {
    lines.push(`_Truncated ${fixLog.entries.length - 80} additional issue(s)._`);
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

function writeOutputFile(filePath, contents) {
  const resolved = resolve(filePath);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, contents);
  return resolved;
}

export function evaluateAvatarFollowGate({
  analyses,
  expectedMotionPipelineFingerprint = movementPipelineFingerprint(),
  manifest,
  thresholds = DEFAULT_AVATAR_FOLLOW_THRESHOLDS,
}) {
  if (!Array.isArray(analyses)) {
    throw new Error("analysis JSON must be an array of replay analyses");
  }
  if (!manifest || !Array.isArray(manifest.rows)) {
    throw new Error("manifest JSON must contain a rows array");
  }

  const analysisMap = analysisBySession(analyses);
  const groupedRows = rowsByRecording(manifest.rows);
  const failures = [];
  const recordingSummaries = [];
  const proofFingerprints = Array.isArray(manifest.motionPipelineFingerprints)
    ? manifest.motionPipelineFingerprints.filter((value) => typeof value === "string")
    : [];

  if (proofFingerprints.length === 0) {
    pushFailure(
      failures,
      "motion-pipeline-fingerprint-missing",
      "Replay visual proof has no motion-pipeline fingerprint and must be recaptured.",
      { expectedMotionPipelineFingerprint },
    );
  } else if (
    proofFingerprints.length !== 1 ||
    proofFingerprints[0] !== expectedMotionPipelineFingerprint
  ) {
    pushFailure(
      failures,
      "motion-pipeline-fingerprint-mismatch",
      "Replay visual proof was captured with different motion-pipeline code and must be recaptured.",
      {
        actualMotionPipelineFingerprints: proofFingerprints,
        expectedMotionPipelineFingerprint,
      },
    );
  }

  for (const [recordingId, rows] of groupedRows.entries()) {
    const avatarFollowScope = avatarFollowScopeForRows(rows);
    const supportedRows = avatarFollowScope.supportedRows;
    const diagnosticRows = rows.filter(isDiagnosticAvatarFollowRow);
    const analysis = analysisMap.get(recordingId);
    const captureSummary = captureSummaryForRows(supportedRows);
    const analysisAvatarVisualFrameCount = Number(analysis?.metrics?.avatarVisualFrameCount || 0);
    const combinedAvatarVisualFrameCount =
      analysisAvatarVisualFrameCount + captureSummary.visualCaptureFrameCount;
    const lowerError = captureSummary.averageAvatarLowerBodyDirectionError ??
      (analysisAvatarVisualFrameCount > 0
        ? Number(analysis?.metrics?.averageAvatarLowerBodyDirectionError ?? 0)
        : null);
    const upperError = captureSummary.averageAvatarUpperBodyDirectionError;
    const visualMatchScore = Number(analysis?.metrics?.visualMatchScore ?? 0);
    const ownerTransitionsPerSecond = Number(analysis?.metrics?.ownerTransitionsPerSecond ?? 0);
    const lowerBodyOwnerTransitions = Number(analysis?.metrics?.lowerBodyOwnerTransitions ?? 0);
    const replayStudioSession = analysis?.replayStudio?.session;
    const replayStudioWorstFrames = compactReplayStudioWorstFrames(replayStudioSession);
    const visualMatchBasis = analysisAvatarVisualFrameCount > 0
      ? "analyzer-avatar-telemetry"
      : captureSummary.visualCaptureFrameCount > 0
        ? "replay-visual-captures"
        : "source-heuristic-only";
    const replayStudioReviewFrames = replayStudioWorstFrames.filter((frame) => frame.status !== "pass");
    const hasCleanCaptureBackedAvatarProof =
      captureSummary.visualCaptureFrameCount > 0 &&
      typeof lowerError === "number" &&
      Number.isFinite(lowerError) &&
      lowerError <= thresholds.maxLowerBodyDirectionError &&
      (
        typeof upperError !== "number" ||
        !Number.isFinite(upperError) ||
        upperError <= thresholds.maxUpperBodyDirectionError
      );
    const replayStudioReviewResolvedByCaptures = replayStudioReviewResolvedByRenderedProof({
      analysis,
      hasCleanCaptureBackedAvatarProof,
      minVisualMatchScore: thresholds.minVisualMatchScore,
      replayStudioSession,
      visualMatchScore,
    });
    const replayStudioRequiresReview =
      replayStudioSession?.status === "review" && !replayStudioReviewResolvedByCaptures;
    const replayStudioStatus = replayStudioReviewResolvedByCaptures
      ? "pass"
      : replayStudioSession?.status;
    const shouldBlockLowVisualMatch =
      supportedRows.length > 0 &&
      visualMatchScore < thresholds.minVisualMatchScore;
    const acceptanceStatus = supportedRows.length === 0
      ? "not-supported"
      : replayStudioStatus === "blocked"
        ? "blocked"
        : replayStudioRequiresReview
          ? "review-only"
          : shouldBlockLowVisualMatch
            ? "blocked"
            : "accepted";

    const summary = {
      acceptanceStatus,
      analysisAvatarVisualFrameCount,
      averageAvatarLowerBodyDirectionError: round(lowerError),
      averageAvatarUpperBodyDirectionError: round(upperError),
      avatarFollowScopeReason: avatarFollowScope.reason,
      avatarFollowScopeStatus: avatarFollowScope.status,
      combinedAvatarVisualFrameCount,
      lowerBodyOwnerTransitions,
      maxAvatarPlantedFootClearance: round(captureSummary.maxAvatarPlantedFootClearance),
      ownerTransitionsPerSecond: round(ownerTransitionsPerSecond),
      recordingId,
      replayStudio: replayStudioSession
        ? {
          blockedFrameCount: replayStudioSession.blockedFrameCount,
          failureCount: replayStudioSession.failureCount,
          analysisStatus: replayStudioSession.status,
          renderedProofResolvedReview: replayStudioReviewResolvedByCaptures,
          reviewedFrameCount: replayStudioSession.reviewedFrameCount,
          status: replayStudioStatus,
          worstFrames: replayStudioWorstFrames,
        }
        : null,
      supportedProofRowCount: supportedRows.length,
      visualCaptureFrameCount: captureSummary.visualCaptureFrameCount,
      visualMatchBasis,
      visualMatchScore: round(visualMatchScore),
    };
    recordingSummaries.push(summary);

    if (supportedRows.length === 0) {
      continue;
    }

    if (combinedAvatarVisualFrameCount === 0) {
      pushFailure(
        failures,
        "avatar-visual-frame-count-zero",
        `${recordingId} has supported proof rows but no avatar visual telemetry or capture frames.`,
        summary,
      );
    }

    diagnosticRows.forEach((row) => {
      const lowerSummary = errorSummaryForRow(row, "avatarLowerError");
      const plantedFootClearanceSummary = errorSummaryForRow(row, "avatarPlantedFootClearance");
      const upperSummary = errorSummaryForRow(row, "avatarUpperError");
      const lowerSignal = Math.max(
        Number(lowerSummary?.average ?? 0),
        Number(lowerSummary?.max ?? 0),
      );
      const plantedFootClearanceSignal = Math.max(
        Number(plantedFootClearanceSummary?.average ?? 0),
        Number(plantedFootClearanceSummary?.max ?? 0),
      );
      const upperSignal = Math.max(
        Number(upperSummary?.average ?? 0),
        Number(upperSummary?.max ?? 0),
      );

      if (isStandingLegProofContextMismatch(analysis, row)) {
        const detail = `${recordingId}:${row.proofCase} selected a seated/support frame for standing leg proof.`;
        pushFailure(
          failures,
          "standing-leg-proof-context-mismatch",
          detail,
          {
            averageAvatarLowerBodyDirectionError: round(lowerSummary?.average),
            frame: compactGamePathFrameForRow({
              analysis,
              failureCode: "standing-leg-proof-context-mismatch",
              failureDetail: detail,
              lowerSummary,
              row,
              severity: "warning",
              upperSummary,
            }),
            maxAvatarLowerBodyDirectionError: round(lowerSummary?.max),
            proofCase: row.proofCase,
            recordingId,
            status: row.status,
            visualCaptureFrames: row.visualCaptureFrames ?? [],
          },
        );
        return;
      }

      if (legRaiseProofCases.has(row.proofCase) && lowerSignal > thresholds.maxActiveLegDirectionError) {
        const detail = `${recordingId}:${row.proofCase} capture lower-body error ${round(lowerSignal)} is above ${thresholds.maxActiveLegDirectionError}.`;
        pushFailure(
          failures,
          "avatar-not-following-leg",
          detail,
          {
            averageAvatarLowerBodyDirectionError: round(lowerSummary?.average),
            frame: compactGamePathFrameForRow({
              analysis,
              failureCode: "avatar-not-following-leg",
              failureDetail: detail,
              lowerSummary,
              row,
              upperSummary,
            }),
            maxAvatarLowerBodyDirectionError: round(lowerSummary?.max),
            proofCase: row.proofCase,
            recordingId,
            status: row.status,
            visualCaptureFrames: row.visualCaptureFrames ?? [],
          },
        );
      }

      if (plantedFootClearanceSignal > thresholds.maxPlantedFootClearance) {
        const detail = `${recordingId}:${row.proofCase} capture planted-foot clearance ${round(plantedFootClearanceSignal)} is above ${thresholds.maxPlantedFootClearance}.`;
        pushFailure(
          failures,
          "avatar-planted-foot-diverged",
          detail,
          {
            averageAvatarPlantedFootClearance: round(plantedFootClearanceSummary?.average),
            frame: compactGamePathFrameForRow({
              analysis,
              failureCode: "avatar-planted-foot-diverged",
              failureDetail: detail,
              lowerSummary,
              row,
              upperSummary,
            }),
            maxAvatarPlantedFootClearance: round(plantedFootClearanceSummary?.max),
            proofCase: row.proofCase,
            recordingId,
            status: row.status,
            visualCaptureFrames: row.visualCaptureFrames ?? [],
          },
        );
      }

      if (row.proofCase === "mirror-side-ownership" && lowerSignal > thresholds.maxMirrorSideDirectionError) {
        const detail = `${recordingId}:${row.proofCase} capture lower-body error ${round(lowerSignal)} is above ${thresholds.maxMirrorSideDirectionError}.`;
        pushFailure(
          failures,
          "avatar-wrong-side",
          detail,
          {
            averageAvatarLowerBodyDirectionError: round(lowerSummary?.average),
            frame: compactGamePathFrameForRow({
              analysis,
              failureCode: "avatar-wrong-side",
              failureDetail: detail,
              lowerSummary,
              row,
              upperSummary,
            }),
            maxAvatarLowerBodyDirectionError: round(lowerSummary?.max),
            proofCase: row.proofCase,
            recordingId,
            status: row.status,
            visualCaptureFrames: row.visualCaptureFrames ?? [],
          },
        );
      }

      if (
        row.proofCase === "shoulder-scapula-control" &&
        upperSignal > thresholds.maxUpperBodyDirectionError
      ) {
        const detail = `${recordingId}:${row.proofCase} capture upper-body error ${round(upperSignal)} is above ${thresholds.maxUpperBodyDirectionError}.`;
        pushFailure(
          failures,
          "avatar-upper-body-diverged",
          detail,
          {
            averageAvatarUpperBodyDirectionError: round(upperSummary?.average),
            frame: compactGamePathFrameForRow({
              analysis,
              failureCode: "avatar-upper-body-diverged",
              failureDetail: detail,
              lowerSummary,
              row,
              severity: "warning",
              upperSummary,
            }),
            maxAvatarUpperBodyDirectionError: round(upperSummary?.max),
            proofCase: row.proofCase,
            recordingId,
            status: row.status,
            visualCaptureFrames: row.visualCaptureFrames ?? [],
          },
        );
      }
    });

    if (replayStudioSession?.status === "blocked") {
      pushFailure(
        failures,
        "replay-studio-session-blocked",
        `${recordingId} Replay Studio judge is blocked with ${replayStudioSession.blockedFrameCount} blocked frame(s).`,
        summary,
      );
    }

    if (replayStudioRequiresReview && replayStudioReviewFrames.length === 0) {
      pushFailure(
        failures,
        "visual-acceptance-review-session",
        `${recordingId} Replay Studio judge is review-only; review sessions are not accepted proof.`,
        {
          ...summary,
          acceptanceStatus: "review-only",
        },
      );
    }

    replayStudioReviewFrames
      .slice(0, maxReplayStudioFrameFailuresPerRecording)
      .forEach((frame) => {
        const primaryFailure = primaryReplayStudioFrameFailure(frame);
        const failureCode = frame.status === "blocked"
          ? "replay-studio-blocked-frame"
          : "replay-studio-review-frame";
        pushFailure(
          failures,
          failureCode,
          `${recordingId} frame ${frame.frameIndex} ${frame.status}: ${primaryFailure?.code ?? "unknown"} (${primaryFailure?.nextFixArea ?? "review motion pipeline"}).`,
          {
            frame,
            recordingId,
          },
        );
      });

    supportedRows
      .filter((row) => Number(row.visualCaptureFrameCount || 0) === 0)
      .forEach((row) => {
        pushFailure(
          failures,
          "supported-row-missing-visual-capture",
          `${recordingId}:${row.proofCase} has supported analyzer proof but no Replay visual capture frame.`,
          {
            proofCase: row.proofCase,
            recordingId,
            status: row.status,
          },
        );
      });

    supportedRows
      .filter((row) => (
        row.status === "passed" &&
        hardVisualProofCases.has(row.proofCase) &&
        Number(row.visualCaptureFrameCount || 0) === 0
      ))
      .forEach((row) => {
        pushFailure(
          failures,
          "hard-case-passed-without-visual-capture",
          `${recordingId}:${row.proofCase} cannot pass on analyzer/source-quality proxy alone.`,
          {
            proofCase: row.proofCase,
            recordingId,
          },
        );
      });

    if (shouldBlockLowVisualMatch) {
      pushFailure(
        failures,
        "visual-match-below-threshold",
        `${recordingId} avatar visual match ${round(visualMatchScore)} is below ${thresholds.minVisualMatchScore} using ${visualMatchBasis}.`,
        {
          ...summary,
          acceptanceStatus: "blocked",
        },
      );
    }

    if (typeof lowerError !== "number" || !Number.isFinite(lowerError)) {
      pushFailure(
        failures,
        "lower-body-direction-error-missing",
        `${recordingId} has no lower-body avatar direction error measurement.`,
        summary,
      );
    } else if (lowerError > thresholds.maxLowerBodyDirectionError) {
      pushFailure(
        failures,
        "lower-body-direction-error-above-threshold",
        `${recordingId} lower-body direction error ${round(lowerError)} is above ${thresholds.maxLowerBodyDirectionError}.`,
        summary,
      );
    }

    if (
      typeof upperError === "number" &&
      Number.isFinite(upperError) &&
      upperError > thresholds.maxUpperBodyDirectionError
    ) {
      pushFailure(
        failures,
        "upper-body-direction-error-above-threshold",
        `${recordingId} upper-body direction error ${round(upperError)} is above ${thresholds.maxUpperBodyDirectionError}.`,
        summary,
      );
    }

    if (
      ownerTransitionsPerSecond > thresholds.maxOwnerTransitionsPerSecond &&
      lowerBodyOwnerTransitions >= 2
    ) {
      pushFailure(
        failures,
        "lower-body-owner-flicker-above-threshold",
        `${recordingId} lower-body owner flicker ${round(ownerTransitionsPerSecond)}/s is above ${thresholds.maxOwnerTransitionsPerSecond}/s.`,
        summary,
      );
    }
  }

  const result = {
    expectedMotionPipelineFingerprint,
    failureCount: failures.length,
    failures,
    proofMotionPipelineFingerprints: proofFingerprints,
    recordingCount: recordingSummaries.length,
    recordings: recordingSummaries.sort((left, right) => left.recordingId.localeCompare(right.recordingId)),
    status: failures.length === 0 ? "passed" : "blocked",
    thresholds,
  };
  return {
    ...result,
    fixLog: buildFixLog(result),
  };
}

function formatTextSummary(result) {
  const lines = [
    result.status === "passed"
      ? "Movement avatar-follow acceptance passed."
      : `Movement avatar-follow acceptance blocked by ${result.failureCount} issue(s).`,
    `Recordings checked: ${result.recordingCount}.`,
  ];

  result.recordings.forEach((recording) => {
    lines.push(
      `- ${recording.recordingId}: visual frames ${recording.combinedAvatarVisualFrameCount} ` +
      `(captures ${recording.visualCaptureFrameCount}, telemetry ${recording.analysisAvatarVisualFrameCount}), ` +
      `scope ${recording.avatarFollowScopeStatus}, ` +
      `acceptance ${recording.acceptanceStatus}, ` +
      `match ${Math.round(recording.visualMatchScore * 100)}%, ` +
      `lower error ${recording.averageAvatarLowerBodyDirectionError ?? "n/a"}, ` +
      `upper error ${recording.averageAvatarUpperBodyDirectionError ?? "n/a"}, ` +
      `owner flicker ${recording.ownerTransitionsPerSecond}/s` +
      (recording.replayStudio
        ? `, replay judge ${recording.replayStudio.status}` +
          (recording.replayStudio.worstFrames[0]
            ? ` worst frame ${recording.replayStudio.worstFrames[0].frameIndex}`
            : "")
        : ""),
    );
  });

  if (result.failures.length > 0) {
    lines.push("", "Failures:");
    result.failures.forEach((failure) => {
      lines.push(`- ${failure.code}: ${failure.detail}`);
    });
  }

  return lines.join("\n");
}

export function runAvatarFollowGateCli(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return 0;
  }

  const result = evaluateAvatarFollowGate({
    analyses: readJson(args.analysisPath),
    manifest: readJson(args.manifestPath),
    thresholds: args.thresholds,
  });

  if (args.fixLogPath) {
    const outPath = writeOutputFile(args.fixLogPath, `${JSON.stringify(result.fixLog, null, 2)}\n`);
    console.log(`Wrote ${outPath}`);
  }
  if (args.fixLogMarkdownPath) {
    const outPath = writeOutputFile(args.fixLogMarkdownPath, formatFixLogMarkdown(result.fixLog));
    console.log(`Wrote ${outPath}`);
  }

  console.log(args.json ? JSON.stringify(result, null, 2) : formatTextSummary(result));
  return result.status === "passed" ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = runAvatarFollowGateCli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
