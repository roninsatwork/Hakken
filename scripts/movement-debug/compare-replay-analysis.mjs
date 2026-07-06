#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const metricKeys = [
  "averageAvatarLowerBodyDirectionError",
  "averageHeadRootDivergence",
  "averageOutOfFrameCount",
  "averageRetargetQuality",
  "averageRootHeadingConfidence",
  "averageRootPositionConfidence",
  "avatarVisualFrameCount",
  "awayBodyFrameCount",
  "coverageApproximateCount",
  "coverageDiagnosticOnlyCount",
  "coverageExplicitStatusCount",
  "coverageFamilyCount",
  "coverageInternalDemoOnlyCount",
  "coverageMissingProofCount",
  "coverageSupportedCount",
  "coverageUnsupportedCount",
  "coverageUserFacingCount",
  "exerciseFloorRollTransitionCount",
  "exerciseLungeFrameCount",
  "exerciseRollingCrawlingFrameCount",
  "exerciseTransitionCount",
  "cameraConfidenceLostFrameCount",
  "cameraConfidencePartialFrameCount",
  "cameraConfidenceReadyFrameCount",
  "cameraConfidenceUncertainFrameCount",
  "cameraHelpEventCount",
  "cameraScoreAllowedFrameCount",
  "gameplayClearMovementEventCount",
  "gameplayScoreDeltaTotal",
  "gameplayTrackingUncertaintyEventCount",
  "headAppliedFrameCount",
  "headPoseFrameCount",
  "headRootDivergenceFrameCount",
  "lowerBodyOwnerTransitions",
  "maxOutOfFrameCount",
  "maxRootHeadingYaw",
  "maxRootPathDistance",
  "maxStandRecoveryHold",
  "ownerTransitionsPerSecond",
  "rootMotionJumpFrameCount",
  "rootMotionPivotFrameCount",
  "rootMotionSourceLimitedFrameCount",
  "rootMotionStepEventFrameCount",
  "rootMotionTravelFrameCount",
  "rootMotionTurnFrameCount",
  "rootMotionWeightTransferFrameCount",
  "rootMotionWorldLandmarkFrameCount",
  "replayGameScoreMessageDivergenceFrameCount",
  "replayGameScoreMessageFrameCount",
  "replayGameWrapperDivergenceFrameCount",
  "replayGameWrapperFrameCount",
  "startReadinessBlockedFrameCount",
  "startReadinessCanStartGameFrameCount",
  "startReadinessReadyFrameCount",
  "strongFullBodyFrameCount",
  "visualMatchScore",
  "visualMotionCoverage",
  "visualReliableFrameCount",
];

function printHelp() {
  console.log(`Compare two Movement Replay Lab analysis reports.

Usage:
  npm run movement:replay:compare -- --before tmp/movement-replay-lab/before.json --after tmp/movement-replay-lab/after.json

Options:
  --before <path>  Required. JSON written by movement:replay:analyze before a code change.
  --after <path>   Required. JSON written by movement:replay:analyze after a code change.
  --out <path>     Optional. Write a JSON comparison summary.
  --strict-proof-regression
                 Exit non-zero if sibling proof manifests show blocker regressions.
  --help           Show this help.
`);
}

function parseArgs(argv) {
  const args = {
    after: "",
    before: "",
    out: "",
    strictProofRegression: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg === "--before") {
      args.before = argv[++index] || "";
    } else if (arg === "--after") {
      args.after = argv[++index] || "";
    } else if (arg === "--out") {
      args.out = argv[++index] || "";
    } else if (arg === "--strict-proof-regression") {
      args.strictProofRegression = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!args.before || !args.after) {
    throw new Error("Both --before and --after are required.");
  }

  return args;
}

async function readAnalysisFile(filePath) {
  const parsed = JSON.parse(await readFile(resolve(filePath), "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error(`${filePath} must contain an array of replay analyses.`);
  }
  return parsed;
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(resolve(filePath), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function proofManifestPathForAnalysis(analysisPath) {
  return analysisPath.endsWith(".json")
    ? analysisPath.replace(/\.json$/, ".proof-manifest.json")
    : `${analysisPath}.proof-manifest.json`;
}

function failureCount(analysis, severity) {
  return analysis.failures.filter((failure) => failure.severity === severity).length;
}

function failureCountsByCode(analyses) {
  const counts = {};
  for (const analysis of analyses) {
    for (const failure of analysis.failures) {
      counts[failure.code] = (counts[failure.code] || 0) + 1;
    }
  }
  return counts;
}

function sumMetric(analyses, key) {
  return analyses.reduce((sum, analysis) => sum + Number(analysis.metrics?.[key] || 0), 0);
}

function averageMetric(analyses, key) {
  if (analyses.length === 0) return 0;
  return sumMetric(analyses, key) / analyses.length;
}

function summarize(analyses) {
  return {
    errorCount: analyses.reduce((sum, analysis) => sum + failureCount(analysis, "error"), 0),
    failedSessionCount: analyses.filter((analysis) => !analysis.pass).length,
    failureCountsByCode: failureCountsByCode(analyses),
    metrics: Object.fromEntries(metricKeys.map((key) => [key, averageMetric(analyses, key)])),
    sessionCount: analyses.length,
    warningCount: analyses.reduce((sum, analysis) => sum + failureCount(analysis, "warning"), 0),
  };
}

function indexBySession(analyses) {
  return new Map(analyses.map((analysis) => [analysis.sessionId, analysis]));
}

function formatDelta(delta, digits = 2) {
  const rounded = delta.toFixed(digits);
  return delta > 0 ? `+${rounded}` : rounded;
}

function compareCounts(beforeCounts, afterCounts) {
  const codes = Array.from(new Set([...Object.keys(beforeCounts), ...Object.keys(afterCounts)])).sort();
  return Object.fromEntries(
    codes.map((code) => {
      const before = beforeCounts[code] || 0;
      const after = afterCounts[code] || 0;
      return [code, {
        after,
        before,
        delta: after - before,
      }];
    }),
  );
}

function proofSummary(manifest) {
  const summary = manifest?.summary;
  if (!summary) return null;

  return {
    acceptedProductLimitationCount: summary.acceptedProductLimitationCount ?? 0,
    appliedManualReviewDecisionCount: summary.appliedManualReviewDecisionCount ?? 0,
    appliedSourceLimitationDecisionCount: summary.appliedSourceLimitationDecisionCount ?? 0,
    blockingRowCount: summary.blockingRowCount ?? 0,
    blockingRowsByProofBlockerCode: summary.blockingRowsByProofBlockerCode ?? {},
    blockingRowsByProofCase: summary.blockingRowsByProofCase ?? {},
    blockingRowsByStatus: summary.blockingRowsByStatus ?? {},
    failedCount: summary.failedCount ?? 0,
    manualReviewCount: summary.manualReviewCount ?? 0,
    missingProofCount: summary.missingProofCount ?? 0,
    passedCount: summary.passedCount ?? 0,
    productScopeLimitationCount: summary.productScopeLimitationCount ?? 0,
    sourceDataLimitationCount: summary.sourceDataLimitationCount ?? 0,
    totalRows: summary.totalRows ?? 0,
    visualCaptureFrameCount: summary.visualCaptureFrameCount ?? 0,
    visualCaptureRowCount: summary.visualCaptureRowCount ?? 0,
  };
}

function compareNumericSummary(beforeSummary, afterSummary, keys) {
  return Object.fromEntries(keys.map((key) => [
    key,
    {
      after: afterSummary?.[key] ?? 0,
      before: beforeSummary?.[key] ?? 0,
      delta: (afterSummary?.[key] ?? 0) - (beforeSummary?.[key] ?? 0),
    },
  ]));
}

function proofImprovementReasonsFromDeltas(deltas) {
  const countDeltas = deltas.counts ?? {};
  const reasons = [];
  const decreasesThatImprove = [
    "blockingRowCount",
    "failedCount",
    "manualReviewCount",
    "missingProofCount",
    "productScopeLimitationCount",
    "sourceDataLimitationCount",
  ];
  for (const key of decreasesThatImprove) {
    const delta = countDeltas[key]?.delta ?? 0;
    if (delta < 0) reasons.push(`${key} decreased by ${Math.abs(delta)}`);
  }

  const increasesThatImprove = [
    "acceptedProductLimitationCount",
    "passedCount",
    "visualCaptureFrameCount",
    "visualCaptureRowCount",
  ];
  for (const key of increasesThatImprove) {
    const delta = countDeltas[key]?.delta ?? 0;
    if (delta > 0) reasons.push(`${key} increased by ${delta}`);
  }

  return reasons;
}

export function compareProofManifests(beforeManifest, afterManifest) {
  const before = proofSummary(beforeManifest);
  const after = proofSummary(afterManifest);
  if (!before && !after) return null;
  const deltas = {
    counts: compareNumericSummary(before, after, [
      "acceptedProductLimitationCount",
      "appliedManualReviewDecisionCount",
      "appliedSourceLimitationDecisionCount",
      "blockingRowCount",
      "failedCount",
      "manualReviewCount",
      "missingProofCount",
      "passedCount",
      "sourceDataLimitationCount",
      "totalRows",
      "visualCaptureFrameCount",
      "visualCaptureRowCount",
    ]),
    blockingRowsByProofBlockerCode: compareCounts(
      before?.blockingRowsByProofBlockerCode ?? {},
      after?.blockingRowsByProofBlockerCode ?? {},
    ),
    blockingRowsByProofCase: compareCounts(
      before?.blockingRowsByProofCase ?? {},
      after?.blockingRowsByProofCase ?? {},
    ),
    blockingRowsByStatus: compareCounts(
      before?.blockingRowsByStatus ?? {},
      after?.blockingRowsByStatus ?? {},
    ),
  };
  const improvementReasons = proofImprovementReasonsFromDeltas(deltas);

  return {
    after,
    before,
    deltas,
    improvementReasons,
  };
}

export function compareAnalyses(beforeAnalyses, afterAnalyses, proofManifestComparison = null) {
  const beforeSummary = summarize(beforeAnalyses);
  const afterSummary = summarize(afterAnalyses);
  const beforeBySession = indexBySession(beforeAnalyses);
  const afterBySession = indexBySession(afterAnalyses);
  const sessionIds = Array.from(new Set([...beforeBySession.keys(), ...afterBySession.keys()])).sort();

  const sessions = sessionIds.map((sessionId) => {
    const before = beforeBySession.get(sessionId);
    const after = afterBySession.get(sessionId);

    return {
      after: after
        ? {
            errorCount: failureCount(after, "error"),
            pass: after.pass,
            warningCount: failureCount(after, "warning"),
          }
        : null,
      before: before
        ? {
            errorCount: failureCount(before, "error"),
            pass: before.pass,
            warningCount: failureCount(before, "warning"),
          }
        : null,
      metricDeltas: Object.fromEntries(metricKeys.map((key) => [
        key,
        Number(after?.metrics?.[key] || 0) - Number(before?.metrics?.[key] || 0),
      ])),
      sessionId,
    };
  });

  return {
    after: afterSummary,
    before: beforeSummary,
    deltas: {
      errorCount: afterSummary.errorCount - beforeSummary.errorCount,
      failedSessionCount: afterSummary.failedSessionCount - beforeSummary.failedSessionCount,
      failureCountsByCode: compareCounts(
        beforeSummary.failureCountsByCode,
        afterSummary.failureCountsByCode,
      ),
      metrics: Object.fromEntries(metricKeys.map((key) => [
        key,
        afterSummary.metrics[key] - beforeSummary.metrics[key],
      ])),
      warningCount: afterSummary.warningCount - beforeSummary.warningCount,
    },
    proofManifest: proofManifestComparison,
    sessions,
  };
}

export function proofRegressionReasons(comparison) {
  const proof = comparison.proofManifest;
  if (!proof) return [];

  const countDeltas = proof.deltas.counts ?? {};
  const reasons = [];
  const increasesThatRegress = [
    "blockingRowCount",
    "failedCount",
    "manualReviewCount",
    "missingProofCount",
    "sourceDataLimitationCount",
  ];
  for (const key of increasesThatRegress) {
    const delta = countDeltas[key]?.delta ?? 0;
    if (delta > 0) reasons.push(`${key} increased by ${delta}`);
  }

  const decreasesThatRegress = [
    "acceptedProductLimitationCount",
    "passedCount",
    "visualCaptureFrameCount",
    "visualCaptureRowCount",
  ];
  for (const key of decreasesThatRegress) {
    const delta = countDeltas[key]?.delta ?? 0;
    if (delta < 0) reasons.push(`${key} decreased by ${Math.abs(delta)}`);
  }

  return reasons;
}

export function hasProofRegression(comparison) {
  return proofRegressionReasons(comparison).length > 0;
}

export function proofRegressionGateReasons(comparison) {
  if (!comparison.proofManifest) {
    return ["proof manifest comparison is missing"];
  }
  return proofRegressionReasons(comparison);
}

export function proofComparisonTrend(comparison) {
  if (!comparison.proofManifest) return "missing";
  if (hasProofRegression(comparison)) return "regressed";
  return comparison.proofManifest.improvementReasons?.length > 0 ? "improved" : "unchanged";
}

function printComparison(comparison) {
  console.log("Movement replay comparison");
  console.log(
    `  sessions: ${comparison.before.sessionCount} before -> ${comparison.after.sessionCount} after`,
  );
  console.log(
    `  failed sessions: ${comparison.before.failedSessionCount} -> ${comparison.after.failedSessionCount} (${formatDelta(comparison.deltas.failedSessionCount, 0)})`,
  );
  console.log(
    `  errors: ${comparison.before.errorCount} -> ${comparison.after.errorCount} (${formatDelta(comparison.deltas.errorCount, 0)})`,
  );
  console.log(
    `  warnings: ${comparison.before.warningCount} -> ${comparison.after.warningCount} (${formatDelta(comparison.deltas.warningCount, 0)})`,
  );
  console.log("");
  console.log("Metric deltas");
  for (const key of metricKeys) {
    console.log(`  ${key}: ${formatDelta(comparison.deltas.metrics[key])}`);
  }

  const changedCodes = Object.entries(comparison.deltas.failureCountsByCode)
    .filter(([, count]) => count.delta !== 0);
  if (changedCodes.length > 0) {
    console.log("");
    console.log("Failure-code deltas");
    for (const [code, count] of changedCodes) {
      console.log(`  ${code}: ${count.before} -> ${count.after} (${formatDelta(count.delta, 0)})`);
    }
  }

  if (comparison.proofManifest) {
    const proof = comparison.proofManifest;
    console.log("");
    console.log(`Proof manifest deltas (${proofComparisonTrend(comparison)})`);
    if (proof.improvementReasons?.length) {
      console.log(`  Improvements: ${proof.improvementReasons.join("; ")}`);
    }
    for (const [key, count] of Object.entries(proof.deltas.counts)) {
      if (count.delta !== 0) {
        console.log(`  ${key}: ${count.before} -> ${count.after} (${formatDelta(count.delta, 0)})`);
      }
    }

    const changedBlockers = Object.entries(proof.deltas.blockingRowsByProofBlockerCode)
      .filter(([, count]) => count.delta !== 0);
    if (changedBlockers.length > 0) {
      console.log("  Blocking proof blocker deltas:");
      for (const [code, count] of changedBlockers) {
        console.log(`    ${code}: ${count.before} -> ${count.after} (${formatDelta(count.delta, 0)})`);
      }
    }
  }

  const changedSessions = comparison.sessions.filter((session) => {
    if (!session.before || !session.after) return true;
    return session.before.pass !== session.after.pass ||
      session.before.errorCount !== session.after.errorCount ||
      session.before.warningCount !== session.after.warningCount;
  });

  if (changedSessions.length > 0) {
    console.log("");
    console.log("Changed sessions");
    for (const session of changedSessions) {
      const before = session.before
        ? `${session.before.pass ? "PASS" : "FAIL"} e${session.before.errorCount} w${session.before.warningCount}`
        : "missing";
      const after = session.after
        ? `${session.after.pass ? "PASS" : "FAIL"} e${session.after.errorCount} w${session.after.warningCount}`
        : "missing";
      console.log(`  ${session.sessionId}: ${before} -> ${after}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const beforeAnalyses = await readAnalysisFile(args.before);
  const afterAnalyses = await readAnalysisFile(args.after);
  const proofManifestComparison = compareProofManifests(
    await readJsonIfExists(proofManifestPathForAnalysis(args.before)),
    await readJsonIfExists(proofManifestPathForAnalysis(args.after)),
  );
  const comparison = compareAnalyses(beforeAnalyses, afterAnalyses, proofManifestComparison);

  printComparison(comparison);

  if (args.out) {
    const outPath = resolve(args.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(comparison, null, 2)}\n`);
    console.log("");
    console.log(`Wrote ${outPath}`);
  }

  if (args.strictProofRegression) {
    const reasons = proofRegressionGateReasons(comparison);
    if (reasons.length > 0) {
      throw new Error(`Proof manifest regression detected: ${reasons.join("; ")}.`);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
