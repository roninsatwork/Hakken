function countBy(rows, key) {
  return rows.reduce((counts, row) => {
    const value = row[key] ?? "unknown";
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function formatAmplitude(value) {
  return Number.isFinite(value) ? value.toFixed(3) : "n/a";
}

function formatFrameWindow(window) {
  if (!window || typeof window !== "object") return "n/a";
  const start = Number.isFinite(window.startFrame) ? window.startFrame : "n/a";
  const end = Number.isFinite(window.endFrame) ? window.endFrame : "n/a";
  return `${start}-${end}`;
}

function protocolRequiredAmplitude(row) {
  if (Number.isFinite(row.expectedMinimumAmplitude)) return row.expectedMinimumAmplitude;
  if (row.proofCase === "mirror-side-ownership") return 0.18;
  return null;
}

const reviewedValidationPaths = {
  controllingManifestPath: "tmp/movement-replay-lab/current-analysis-reviewed.proof-manifest.json",
  latestExportPointerPath: "tmp/movement-replay-lab/runs/latest-export-path.txt",
  recordingPlanPath: "tmp/movement-replay-lab/current-proof-recording-plan.reviewed.json",
  reviewDecisionsPath: "tmp/movement-replay-lab/current-proof-review-decisions.codex-visual-review.json",
  scenarioValidationMarkdownSummaryPath: "tmp/movement-replay-lab/current-scenario-validation-summary.md",
  scenarioValidationSummaryPath: "tmp/movement-replay-lab/current-scenario-validation-summary.json",
  sourceLimitationDecisionsPath: "tmp/movement-replay-lab/current-proof-source-limitations.codex-product-limitations.json",
  visualCapturesPath: "tmp/movement-replay-lab/captures/current-proof-set",
};

export function recordingGapAmplitudeRatioForRow(row) {
  const required = protocolRequiredAmplitude(row);
  if (!Number.isFinite(row.candidateAmplitude) || !Number.isFinite(required) || required <= 0) return null;
  return row.candidateAmplitude / required;
}

export function recordingGapTriageDispositionForRow(row) {
  if (row.status === "source-data-limitation") {
    return row.acceptedProductLimitation ? "accepted-product-limitation" : "product-decision-needed";
  }

  switch (row.proofBlockerCode) {
    case "far-camera-source-quality":
      return "wrong-capture-condition";
    case "mirror-side-not-isolated":
      return "side-isolation-rerecord";
    case "missing-analyzer-evidence":
    case "missing-proof-layer":
      return "proof-definition-needed";
    case "candidate-below-threshold": {
      const ratio = recordingGapAmplitudeRatioForRow(row);
      if (ratio === null || ratio <= 0.05) return "no-readable-motion-rerecord";
      if (ratio >= 0.95) return "near-threshold-review-or-rerecord";
      if (ratio >= 0.5) return "stronger-amplitude-rerecord";
      return "full-rerecord";
    }
    case "no-candidate-amplitude":
      return "no-readable-motion-rerecord";
    default:
      return "recording-review";
  }
}

function captureScenarioForRow(row) {
  switch (row.proofCase) {
    case "left-leg-raise":
    case "right-leg-raise":
    case "mirror-side-ownership":
      return {
        acceptance: "Analyzer should find left-only and right-only knee-lift windows where exactly one anatomical side exceeds 0.180.",
        id: "front-leg-isolation",
        movement: "Record left-only knee lifts, pause in neutral, then right-only knee lifts; use 3 clear reps per side with brief holds.",
        setup: "Full body facing camera, both knees and feet visible, planted support foot, no squats, no rapid alternating.",
        title: "Front leg isolation and mirror side ownership",
      };
    case "root-travel":
      return {
        acceptance: "Analyzer should observe root path travel >= 0.160 while tracking remains stable.",
        id: "root-travel",
        movement: "Take large deliberate side steps or forward/back steps across the camera view, pausing at each end.",
        setup: "Full body visible with enough floor space to move across frame.",
        title: "Root travel",
      };
    case "seated-forward-fold":
      return {
        acceptance: "Analyzer should observe seated forward-fold amplitude while chair contact remains stable.",
        id: "seated-forward-fold",
        movement: "Start seated neutral, fold forward from the hips with head and shoulders clearly moving toward the knees, hold briefly, then return to seated neutral and repeat 2-3 times.",
        setup: "Camera sees the seated body, chair, head, shoulders, hips, knees, feet, and chair contact throughout.",
        title: "Seated forward fold",
      };
    case "root-turn":
      return {
        acceptance: "Analyzer should observe root/torso turn amplitude >= 0.650 without losing tracking.",
        id: "root-turn",
        movement: "Turn torso and hips clearly left and right with brief holds, returning to center between turns.",
        setup: "Stand centered and visible; avoid only turning the head.",
        title: "Root turn",
      };
    case "side-bend":
      return {
        acceptance: "Analyzer should observe side-bend amplitude >= 0.120 in the expected direction.",
        id: "side-bend",
        movement: "Bend clearly from the waist to one side, hold briefly, return to center, and repeat with larger readable bends.",
        setup: "Face camera with torso and hips visible; keep feet planted and avoid rotating.",
        title: "Side bend",
      };
    case "far-squat":
      return {
        acceptance: "Analyzer should observe squat/hip-drop amplitude >= 0.180 and far-camera source quality below 0.650.",
        id: "far-camera-squat",
        movement: "From the far-camera position, perform clear squats with a visible hip drop and a brief bottom hold.",
        setup: "Move far enough from the camera to satisfy far-camera source quality while keeping the full body visible.",
        title: "Far-camera squat",
      };
    default:
      return {
        acceptance: "Analyzer should find the missing proof window for this proof case.",
        id: row.proofCase || "misc-proof",
        movement: "Repeat the target movement with larger, clearer amplitude and brief holds.",
        setup: "Keep the body parts required for this proof case visible.",
        title: row.proofCase || "Misc proof",
      };
  }
}

export function recordingGapActionForRow(row) {
  if (row.status === "source-data-limitation") {
    return row.acceptedProductLimitation
      ? "No action; source limitation is already accepted."
      : "Get product-owner source-limitation decision, or capture a stronger recording if this should be supported.";
  }

  switch (row.proofBlockerCode) {
    case "candidate-below-threshold":
      return "Capture a recording with larger, clearer movement amplitude for this proof case.";
    case "no-candidate-amplitude":
      return "Capture a recording with clear visible movement for this proof case; the current export had no measurable candidate amplitude.";
    case "mirror-side-not-isolated":
      return "Capture isolated left-side and right-side movement windows so mirror ownership can be proved without mixed-leg evidence.";
    case "far-camera-source-quality":
      return "Capture a far-camera recording that satisfies the source-quality requirement instead of reusing a normal high-quality squat.";
    case "missing-analyzer-evidence":
      return "Add an expected proof window or saved recording that produces analyzer evidence before visual review.";
    case "missing-proof-layer":
      return "Add the missing proof layer called out by the manifest before accepting this row.";
    default:
      return row.nextAction || "Add stronger recorded proof before accepting this row.";
  }
}

export function recordingGapCaptureProtocolForRow(row) {
  if (row.status === "source-data-limitation") {
    return {
      acceptance: "A product owner must accept the limitation, or engineering must replace it with a stronger source recording before claiming support.",
      movement: "Do not rerecord unless the product should support this source-limited case.",
      setup: "Review the source limitation and the current user-facing support promise.",
    };
  }

  const required = formatAmplitude(protocolRequiredAmplitude(row));

  switch (row.proofCase) {
    case "left-leg-raise":
      return {
        acceptance: `Analyzer should observe anatomical left knee lift >= ${required} while right-leg lift stays below the isolation threshold.`,
        movement: "Raise only the child's anatomical left knee clearly toward the torso, hold near the top for about one second, lower, and repeat 3 times.",
        setup: "Stand facing the camera with head, torso, hips, knees, and feet visible; keep the right foot planted and avoid squatting.",
      };
    case "right-leg-raise":
      return {
        acceptance: `Analyzer should observe anatomical right knee lift >= ${required} while left-leg lift stays below the isolation threshold.`,
        movement: "Raise only the child's anatomical right knee clearly toward the torso, hold near the top for about one second, lower, and repeat 3 times.",
        setup: "Stand facing the camera with head, torso, hips, knees, and feet visible; keep the left foot planted and avoid squatting.",
      };
    case "mirror-side-ownership":
      return {
        acceptance: `Exactly one anatomical side should exceed ${required} in each proof window; mixed or simultaneous leg evidence should stay below threshold.`,
        movement: "Record separate isolated left-only and right-only knee-lift windows, with a neutral pause between sides.",
        setup: "Stand facing the camera with both legs visible; do not alternate rapidly or lift both knees in the same proof window.",
      };
    case "root-travel":
      return {
        acceptance: `Analyzer should observe root path travel >= ${required} while the body stays visible and trackable.`,
        movement: "Take large, deliberate side steps or forward/back steps across the camera view, pause at each end, and repeat 2-3 times.",
        setup: "Start centered with the full body visible; leave enough floor space so the root visibly travels instead of just swaying.",
      };
    case "seated-forward-fold":
      return {
        acceptance: `Analyzer should observe seated forward-fold amplitude${required === "n/a" ? "" : ` >= ${required}`} while chair contact remains stable.`,
        movement: "Start seated neutral, fold forward from the hips with head and shoulders clearly moving toward the knees, hold briefly, then return to seated neutral and repeat 2-3 times.",
        setup: "Sit on a stable chair with head, shoulders, torso, hips, knees, feet, and the chair visible; keep the camera steady and avoid standing up during the fold.",
      };
    case "root-turn":
      return {
        acceptance: `Analyzer should observe root/torso turn amplitude >= ${required} without losing tracking.`,
        movement: "Turn the torso and hips clearly left and right, hold each turned position briefly, and return to center between turns.",
        setup: "Stand centered and visible; avoid stepping out of frame or only turning the head.",
      };
    case "side-bend":
      return {
        acceptance: `Analyzer should observe side-bend amplitude >= ${required} in the expected direction while feet stay planted.`,
        movement: "Bend the torso clearly to one side from the waist, hold briefly, return to center, then repeat with a larger readable bend.",
        setup: "Face the camera with torso and hips visible; keep feet planted and avoid rotating instead of bending sideways.",
      };
    case "far-squat":
      return {
        acceptance: `Analyzer should observe squat/hip-drop amplitude >= ${required} and far-camera source quality below 0.650.`,
        movement: "From the far-camera position, perform clear squats with a visible hip drop, hold the bottom briefly, and return to standing.",
        setup: "Move far enough from the camera to satisfy the far-camera source-quality condition while keeping the full body visible.",
      };
    default:
      if (row.proofBlockerCode === "mirror-side-not-isolated") {
        return {
          acceptance: "Exactly one anatomical side should exceed the side-isolation threshold in each proof window.",
          movement: "Record isolated one-sided movement with a neutral pause before changing sides.",
          setup: "Keep the full body visible and avoid mixed-side movement in the same proof window.",
        };
      }
      if (row.proofBlockerCode === "far-camera-source-quality") {
        return {
          acceptance: "Analyzer should see the target movement while source quality satisfies the far-camera threshold.",
          movement: "Repeat the target movement from a farther camera distance with a clear hold at the peak.",
          setup: "Move farther from the camera while keeping the body visible enough to track.",
        };
      }
      return {
        acceptance: `Analyzer should observe the required proof window${required === "n/a" ? "" : ` with amplitude >= ${required}`}.`,
        movement: "Repeat the target motion with larger, clearer amplitude and brief holds at the peak positions.",
        setup: "Keep the body parts required for the proof case visible throughout the recording.",
      };
  }
}

export function recordingGapOwnerForRow(row) {
  if (row.status === "source-data-limitation") return "product";
  if (row.proofBlockerCode === "missing-analyzer-evidence") return "engineering";
  return "recording";
}

export function recordingGapPriorityForRow(row) {
  if (row.status === "source-data-limitation") return "product-decision";

  switch (row.proofBlockerCode) {
    case "candidate-below-threshold":
    case "no-candidate-amplitude":
    case "mirror-side-not-isolated":
    case "far-camera-source-quality":
      return "recording-high";
    case "missing-analyzer-evidence":
    case "missing-proof-layer":
      return "proof-definition";
    default:
      return "recording";
  }
}

export function recordingGapFreshRecordingLabelForScenario(scenario) {
  return scenario.freshRecordingLabel || `movement-proof-${scenario.id || "scenario"}`;
}

export function recordingGapScenarioValidationCommand(scenario, options = {}) {
  return [
    "npx -p node@22.13.0 npm run movement:replay:analyze --",
    ...recordingGapScenarioValidationArgs(scenario, options),
  ].join(" ");
}

export function recordingGapScenarioValidationOutputPath(scenario) {
  const label = recordingGapFreshRecordingLabelForScenario(scenario);
  const outStem = label.replace(/^movement-proof-/, "");
  return `tmp/movement-replay-lab/${outStem}-scenario-reviewed-smoke.json`;
}

export function recordingGapScenarioQuickValidationCommand(scenario, options = {}) {
  const label = recordingGapFreshRecordingLabelForScenario(scenario);
  const shouldIncludeRecordingPlan = options.omitRecordingPlanInQuickValidationCommand !== true;
  return [
    "npx -p node@22.13.0 npm run movement:replay:validate-scenario --",
    shouldIncludeRecordingPlan && options.recordingPlanPath ? `--recording-plan ${options.recordingPlanPath}` : "",
    `--scenario ${label}`,
    "--quiet",
  ].filter(Boolean).join(" ");
}

export function recordingGapScenarioQuickValidationSpec(scenario, options = {}) {
  const label = recordingGapFreshRecordingLabelForScenario(scenario);
  return {
    argvTemplate: [
      ...(options.recordingPlanPath ? ["--recording-plan", options.recordingPlanPath] : []),
      "--scenario",
      label,
      "--quiet",
    ],
    command: "npm run movement:replay:validate-scenario --",
    nodeVersion: "22.13.0",
    recordingScenario: label,
  };
}

export function recordingGapAllScenariosQuickValidationCommand(options = {}) {
  return [
    "npx -p node@22.13.0 npm run movement:replay:validate-scenario --",
    "--all",
    "--quiet",
    options.recordingPlanPath ? `--recording-plan ${options.recordingPlanPath}` : "",
    `--controlling-manifest ${reviewedValidationPaths.controllingManifestPath}`,
    `--summary-out ${reviewedValidationPaths.scenarioValidationSummaryPath}`,
    `--summary-markdown-out ${reviewedValidationPaths.scenarioValidationMarkdownSummaryPath}`,
  ].filter(Boolean).join(" ");
}

export function recordingGapAllScenariosQuickValidationSpec(options = {}) {
  return {
    argvTemplate: [
      "--all",
      "--quiet",
      ...(options.recordingPlanPath ? ["--recording-plan", options.recordingPlanPath] : []),
      "--controlling-manifest",
      reviewedValidationPaths.controllingManifestPath,
      "--summary-out",
      reviewedValidationPaths.scenarioValidationSummaryPath,
      "--summary-markdown-out",
      reviewedValidationPaths.scenarioValidationMarkdownSummaryPath,
    ],
    command: "npm run movement:replay:validate-scenario --",
    nodeVersion: "22.13.0",
    outputPaths: {
      markdownSummaryPath: reviewedValidationPaths.scenarioValidationMarkdownSummaryPath,
      summaryPath: reviewedValidationPaths.scenarioValidationSummaryPath,
    },
    reviewedInputPaths: {
      controllingManifestPath: reviewedValidationPaths.controllingManifestPath,
      recordingPlanPath: options.recordingPlanPath ?? reviewedValidationPaths.recordingPlanPath,
    },
  };
}

export function recordingGapScenarioValidationSpec(scenario, options = {}) {
  const label = recordingGapFreshRecordingLabelForScenario(scenario);
  const outputPath = recordingGapScenarioValidationOutputPath(scenario);
  const recordingPlanPath = options.recordingPlanPath ?? reviewedValidationPaths.recordingPlanPath;

  return {
    argvTemplate: [
      "--export",
      "<latest-export-path>",
      "--recording-plan",
      recordingPlanPath,
      "--recording-scenario",
      label,
      "--visual-captures",
      reviewedValidationPaths.visualCapturesPath,
      "--review-decisions",
      reviewedValidationPaths.reviewDecisionsPath,
      "--source-limitation-decisions",
      reviewedValidationPaths.sourceLimitationDecisionsPath,
      "--out",
      outputPath,
    ],
    command: "npm run movement:replay:analyze --",
    latestExportPointerPath: reviewedValidationPaths.latestExportPointerPath,
    nodeVersion: "22.13.0",
    outputPath,
    recordingScenario: label,
    reviewedInputPaths: {
      recordingPlanPath,
      reviewDecisionsPath: reviewedValidationPaths.reviewDecisionsPath,
      sourceLimitationDecisionsPath: reviewedValidationPaths.sourceLimitationDecisionsPath,
      visualCapturesPath: reviewedValidationPaths.visualCapturesPath,
    },
  };
}

export function recordingGapScenarioValidationArgs(scenario, options = {}) {
  const label = recordingGapFreshRecordingLabelForScenario(scenario);
  const recordingPlanPath = options.recordingPlanPath ?? reviewedValidationPaths.recordingPlanPath;
  return [
    `--export "$(cat ${reviewedValidationPaths.latestExportPointerPath})"`,
    `--recording-plan ${recordingPlanPath}`,
    `--recording-scenario ${label}`,
    `--visual-captures ${reviewedValidationPaths.visualCapturesPath}`,
    `--review-decisions ${reviewedValidationPaths.reviewDecisionsPath}`,
    `--source-limitation-decisions ${reviewedValidationPaths.sourceLimitationDecisionsPath}`,
    `--out ${recordingGapScenarioValidationOutputPath(scenario)}`,
  ];
}

export function recordingGapRowsForRows(rows) {
  return (rows ?? [])
    .filter((row) => (
      row.status === "missing-proof" ||
      (row.status === "source-data-limitation" && !row.acceptedProductLimitation)
    ))
    .sort((left, right) => {
      const statusOrder = ["missing-proof", "source-data-limitation"];
      const statusCompare = statusOrder.indexOf(left.status) - statusOrder.indexOf(right.status);
      if (statusCompare !== 0) return statusCompare;
      const blockerCompare = String(left.proofBlockerCode ?? "").localeCompare(String(right.proofBlockerCode ?? ""));
      if (blockerCompare !== 0) return blockerCompare;
      const proofCaseCompare = String(left.proofCase).localeCompare(String(right.proofCase));
      if (proofCaseCompare !== 0) return proofCaseCompare;
      return String(left.recordingId).localeCompare(String(right.recordingId));
    });
}

export function recordingGapRowsForManifest(manifest) {
  return recordingGapRowsForRows(manifest?.rows ?? []);
}

function recordingGapPlanRowForRow(row) {
  const amplitudeRatio = recordingGapAmplitudeRatioForRow(row);

  return {
    amplitudeRatio,
    avatarSide: row.avatarSide,
    blockerCode: row.proofBlockerCode,
    bodyPartMotion: row.bodyPartMotion,
    candidateAmplitude: row.candidateAmplitude,
    candidateRejectionCode: row.candidateRejectionCode,
    candidateRejectionReason: row.candidateRejectionReason,
    directionSign: row.directionSign,
    expectedFrameWindow: row.expectedFrameWindow,
    expectedMinimumAmplitude: row.expectedMinimumAmplitude,
    missingLayers: row.missingLayers ?? [],
    nextAction: row.nextAction,
    owner: recordingGapOwnerForRow(row),
    priority: recordingGapPriorityForRow(row),
    protocol: recordingGapCaptureProtocolForRow(row),
    proofCase: row.proofCase,
    recommendedAction: recordingGapActionForRow(row),
    recordingId: row.recordingId,
    requiredLayers: row.requiredLayers ?? [],
    scoringOrMessageEvent: row.scoringOrMessageEvent ?? null,
    sourceSide: row.sourceSide,
    status: row.status,
    statusReason: row.statusReason,
    triageDisposition: recordingGapTriageDispositionForRow(row),
    visualCaptureFrameCount: row.visualCaptureFrameCount ?? 0,
  };
}

function groupKeyForPlanRow(row) {
  return [
    row.owner,
    row.priority,
    row.status,
    row.blockerCode || "n/a",
    row.proofCase,
    row.triageDisposition,
    row.recommendedAction,
    row.protocol?.setup,
    row.protocol?.movement,
    row.protocol?.acceptance,
  ].join("\u001f");
}

function recordingGapActionGroupsForRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = groupKeyForPlanRow(row);
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.recordingIds.push(row.recordingId);
      continue;
    }

    groups.set(key, {
      blockerCode: row.blockerCode,
      count: 1,
      owner: row.owner,
      priority: row.priority,
      protocol: row.protocol,
      proofCase: row.proofCase,
      recommendedAction: row.recommendedAction,
      recordingIds: [row.recordingId],
      status: row.status,
      triageDisposition: row.triageDisposition,
    });
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      recordingIds: group.recordingIds.sort((left, right) => String(left).localeCompare(String(right))),
    }))
    .sort((left, right) => {
      const ownerCompare = left.owner.localeCompare(right.owner);
      if (ownerCompare !== 0) return ownerCompare;
      const priorityCompare = left.priority.localeCompare(right.priority);
      if (priorityCompare !== 0) return priorityCompare;
      const blockerCompare = String(left.blockerCode ?? "").localeCompare(String(right.blockerCode ?? ""));
      if (blockerCompare !== 0) return blockerCompare;
      return String(left.proofCase).localeCompare(String(right.proofCase));
    });
}

function recordingGapCaptureScenariosForRows(rows, options = {}) {
  const scenarios = new Map();
  for (const row of rows) {
    if (row.owner !== "recording") continue;
    const scenario = captureScenarioForRow(row);
    const existing = scenarios.get(scenario.id);
    const proofCases = new Set(existing?.proofCases ?? []);
    const blockerCodes = new Set(existing?.blockerCodes ?? []);
    const recordingIds = new Set(existing?.recordingIds ?? []);
    proofCases.add(row.proofCase);
    if (row.blockerCode) blockerCodes.add(row.blockerCode);
    if (row.recordingId) recordingIds.add(row.recordingId);
    const freshRecordingLabel = `movement-proof-${scenario.id}`;

    scenarios.set(scenario.id, {
      ...scenario,
      blockerCodes: Array.from(blockerCodes).sort((left, right) => String(left).localeCompare(String(right))),
      estimatedRowsClosed: (existing?.rowCount ?? 0) + 1,
      freshRecordingLabel,
      proofCases: Array.from(proofCases).sort((left, right) => String(left).localeCompare(String(right))),
      quickValidation: recordingGapScenarioQuickValidationSpec({
        ...scenario,
        freshRecordingLabel,
      }, options),
      quickValidationCommand: recordingGapScenarioQuickValidationCommand({
        ...scenario,
        freshRecordingLabel,
      }, options),
      recordingIds: Array.from(recordingIds).sort((left, right) => String(left).localeCompare(String(right))),
      rowCount: (existing?.rowCount ?? 0) + 1,
      validationArgs: recordingGapScenarioValidationArgs({
        ...scenario,
        freshRecordingLabel,
      }, options),
      validationCommand: recordingGapScenarioValidationCommand({
        ...scenario,
        freshRecordingLabel,
      }, options),
      validation: recordingGapScenarioValidationSpec({
        ...scenario,
        freshRecordingLabel,
      }, options),
      validationOutputPath: recordingGapScenarioValidationOutputPath({
        ...scenario,
        freshRecordingLabel,
      }),
    });
  }

  return Array.from(scenarios.values()).sort((left, right) => {
    if (right.rowCount !== left.rowCount) return right.rowCount - left.rowCount;
    return String(left.id).localeCompare(String(right.id));
  });
}

export function recordingGapPlanForRows(rows, options = {}) {
  const actionRows = recordingGapRowsForRows(rows).map(recordingGapPlanRowForRow);
  const actionGroups = recordingGapActionGroupsForRows(actionRows);
  const captureScenarios = recordingGapCaptureScenariosForRows(actionRows, options);
  const recordingIds = Array.from(new Set(
    actionRows
      .map((row) => row.recordingId)
      .filter(Boolean),
  )).sort((left, right) => String(left).localeCompare(String(right)));
  const summary = {
    allScenariosQuickValidation: recordingGapAllScenariosQuickValidationSpec(options),
    allScenariosQuickValidationCommand: recordingGapAllScenariosQuickValidationCommand(options),
    byBlockerCode: countBy(actionRows, "blockerCode"),
    byOwner: countBy(actionRows, "owner"),
    byProofCase: countBy(actionRows, "proofCase"),
    byPriority: countBy(actionRows, "priority"),
    byStatus: countBy(actionRows, "status"),
    byTriageDisposition: countBy(actionRows, "triageDisposition"),
    captureScenarioCount: captureScenarios.length,
    minimumFreshRecordingCount: captureScenarios.length,
    recordingIds,
    recordingIdCount: recordingIds.length,
    totalRows: actionRows.length,
  };
  summary.topActionGroups = recordingGapTopGroups({ actionGroups }, 5);

  return {
    actionGroups,
    captureScenarios,
    rows: actionRows,
    summary,
  };
}

export function recordingGapPlanForManifest(manifest, options = {}) {
  return recordingGapPlanForRows(manifest?.rows ?? [], options);
}

export function formatRecordingGapCounts(counts) {
  const entries = Object.entries(counts ?? {})
    .filter(([, count]) => Number(count) > 0)
    .sort(([left], [right]) => left.localeCompare(right));

  return entries.length > 0
    ? entries.map(([key, count]) => `${key}:${count}`).join(", ")
    : "none";
}

export function recordingGapPlanSummaryText(plan) {
  return [
    `${plan.summary?.totalRows ?? 0} row(s)`,
    `${plan.actionGroups?.length ?? 0} action group(s)`,
    `${plan.captureScenarios?.length ?? plan.summary?.captureScenarioCount ?? 0} capture scenario(s)`,
    `${plan.summary?.minimumFreshRecordingCount ?? plan.captureScenarios?.length ?? 0} fresh recording(s) minimum`,
    `owners ${formatRecordingGapCounts(plan.summary?.byOwner)}`,
    `priorities ${formatRecordingGapCounts(plan.summary?.byPriority)}`,
    `triage ${formatRecordingGapCounts(plan.summary?.byTriageDisposition)}`,
  ].join("; ");
}

export function recordingGapProtocolText(protocol) {
  if (!protocol) return "";
  return [
    protocol.setup ? `Setup: ${protocol.setup}` : "",
    protocol.movement ? `Movement: ${protocol.movement}` : "",
    protocol.acceptance ? `Acceptance: ${protocol.acceptance}` : "",
  ].filter(Boolean).join(" ");
}

export function recordingGapProofContextText(row) {
  return [
    row.bodyPartMotion ? `Motion: ${row.bodyPartMotion}` : "",
    `Window: ${formatFrameWindow(row.expectedFrameWindow)}`,
    `Source/avatar side: ${row.sourceSide ?? "unknown"} / ${row.avatarSide ?? "unknown"}`,
    `Direction: ${row.directionSign ?? "unknown"}`,
    row.requiredLayers?.length ? `Required layers: ${row.requiredLayers.join(", ")}` : "",
    row.missingLayers?.length ? `Missing layers: ${row.missingLayers.join(", ")}` : "",
    row.scoringOrMessageEvent ? `Scoring/message event: ${row.scoringOrMessageEvent}` : "",
  ].filter(Boolean).join(" ");
}

export function recordingGapTopGroups(plan, limit = 5) {
  return [...(plan.actionGroups ?? [])]
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      const ownerCompare = String(left.owner).localeCompare(String(right.owner));
      if (ownerCompare !== 0) return ownerCompare;
      const priorityCompare = String(left.priority).localeCompare(String(right.priority));
      if (priorityCompare !== 0) return priorityCompare;
      const blockerCompare = String(left.blockerCode ?? "").localeCompare(String(right.blockerCode ?? ""));
      if (blockerCompare !== 0) return blockerCompare;
      return String(left.proofCase).localeCompare(String(right.proofCase));
    })
    .slice(0, limit);
}

export function recordingGapTopGroupsText(plan, limit = 5) {
  const groups = recordingGapTopGroups(plan, limit);
  if (groups.length === 0) return "none";

  return groups.map((group) => (
    `${group.owner}/${group.priority}/${group.proofCase}/${group.blockerCode || "n/a"}:${group.count}`
  )).join("; ");
}
