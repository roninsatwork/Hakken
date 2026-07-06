import fs from "node:fs";
import path from "node:path";

export const DEFAULT_WATCHED_FILES = [
  {
    maxLines: 650,
    path: "src/app/(dashboard)/demos/movements/[id]/play/_components/VrmAvatar.tsx",
    reason: "avatar renderer should remain an orchestration adapter",
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
    maxLines: 180,
    path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarPipelineLowerBodyDecision.ts",
    reason: "lower-body/retarget context composition should stay focused",
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
  captureManifest: "tmp/movement-replay-lab/captures/game-visual-proof/game-visual-proof-captures-manifest.json",
  manifest: "tmp/movement-replay-lab/current-analysis-reviewed.proof-manifest.json",
  semanticReview: "tmp/movement-replay-lab/current-game-visual-proof-review-decisions.codex-semantic-review.json",
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
  captureManifest,
  files,
  manifest,
  proofExpectations = {},
  routeBypassPurityResults = [],
  semanticReview,
  sourcePurityResults = [],
}) {
  const expectedSemanticPasses = proofExpectations.semanticReadablePasses ?? 37;
  const expectedVisualProofFrames = proofExpectations.visualProofFrames ?? 37;
  const minimumParityFrames = proofExpectations.minimumScoreMessageParityFrames ?? 11000;
  const expectedUserFacingFamilies = proofExpectations.userFacingFamilies ?? ["upright"];
  const expectedInternalDemoOnlyFamilies = proofExpectations.internalDemoOnlyFamilies ?? [
    "upper-body-standing",
    "squat-knee-lift",
    "root-turn",
    "root-travel",
  ];
  const expectedProofStatusCounts = proofExpectations.proofStatusCounts ?? {
    "covered-by-other-recording": 26,
    "product-scope-limitation": 9,
    "source-data-limitation": 18,
  };
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

  return {
    coverageProductTruth,
    fileResults,
    ok: fileResults.every((file) => file.ok) &&
      sourcePurityResults.every((result) => result.ok) &&
      routeBypassPurityResults.every((result) => result.ok) &&
      proofFailures.length === 0,
    proofFailures,
    proofManifest,
    replayGameParity: parity,
    routeBypassPurityResults,
    semanticReview: semantic,
    sourcePurityResults,
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
    } else if (arg === "--manifest") {
      options.proofPaths.manifest = value;
      index += 1;
    } else if (arg === "--semantic-review") {
      options.proofPaths.semanticReview = value;
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
    captureManifest: readJson(resolve(proofPaths.captureManifest)),
    files,
    manifest: readJson(resolve(proofPaths.manifest)),
    routeBypassPurityResults,
    semanticReview: readJson(resolve(proofPaths.semanticReview)),
    sourcePurityResults,
  });
}

function formatReport(report) {
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
    console.log(formatReport(report));
    process.exit(report.ok ? 0 : 1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
