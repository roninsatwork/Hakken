import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MOVEMENT_ACQUISITION_CONTRACT_PATHS = {
  capture: "src/app/(dashboard)/demos/movements/_hooks/useMovementCapture.ts",
  captureBenchmark: "src/app/(dashboard)/demos/movement-capture/benchmark/page.tsx",
  captureBenchmarkContract: "src/app/(dashboard)/demos/movements/_lib/movementDenseBenchmarkCapture.ts",
  capturePage: "src/app/(dashboard)/demos/movement-capture/MovementCaptureClient.tsx",
  captureBaseRedirect: "src/app/(dashboard)/demos/movement-capture/page.tsx",
  deepCaptureRoute: "src/app/(dashboard)/demos/movement-capture/deep/page.tsx",
  capturePreflight: "src/app/(dashboard)/demos/movements/_lib/movementCapturePreflight.ts",
  codec: "src/app/(dashboard)/demos/movements/_lib/movementFrameCodec.ts",
  commissioning: "src/app/(dashboard)/demos/movements/_lib/movementRecordingCommissioning.ts",
  contract: "src/app/(dashboard)/demos/movements/_lib/movementPlayerInputContract.ts",
  deepContract: "src/app/(dashboard)/demos/movements/_lib/movementDeepCaptureContract.ts",
  deepRefinement: "src/app/(dashboard)/demos/movements/_lib/movementDeepCaptureRefinement.ts",
  deepRendererProof: "src/app/(dashboard)/demos/movements/_lib/movementDeepCaptureReplayGameRenderer.test.ts",
  deepReviewManifest: "scripts/movement-debug/deep-capture-review-manifest.mjs",
  deepRecordingInventory: "scripts/movement-debug/check-replay-mounted-game-commissioning-eligibility.mjs",
  deepLatestProof: "scripts/movement-debug/run-latest-deep-capture-proof.mjs",
  deepLocalRecovery: "scripts/movement-debug/recover-local-movement-packet-cli.ts",
  deepLocalProof: "scripts/movement-debug/run-local-deep-capture-proof.mjs",
  deepSavePreflight: "scripts/movement-debug/schema-v3-save-replay-preflight.test.mjs",
  deepReplayValidator: "scripts/movement-debug/validate-deep-capture-replay-packet.mjs",
  denseCapture: "src/app/(dashboard)/demos/movements/_lib/movementDenseCapture.ts",
  denseCaptureBodyPix: "src/app/(dashboard)/demos/movements/_lib/movementBodyPixDenseCaptureAdapter.ts",
  denseCaptureFusion: "src/app/(dashboard)/demos/movements/_lib/movementDenseCaptureFusion.ts",
  denseCaptureProof: "src/app/(dashboard)/demos/movements/_lib/movementDenseCaptureProof.ts",
  denseCaptureBenchmark: "scripts/movement-debug/dense-capture-benchmark.mjs",
  denseCaptureBrowserBenchmark: "scripts/movement-debug/run-dense-capture-browser-benchmark.mjs",
  denseCaptureBenchmarkPrepare: "scripts/movement-debug/prepare-dense-capture-benchmark.mjs",
  denseCaptureBenchmarkIngest: "scripts/movement-debug/ingest-dense-capture-benchmark.mjs",
  denseCaptureDeviceFinish: "scripts/movement-debug/finish-dense-capture-device-review.mjs",
  denseCaptureDeviceIngest: "scripts/movement-debug/ingest-dense-capture-device-reports.mjs",
  denseCaptureDeviceReview: "scripts/movement-debug/review-dense-capture-device-reports.mjs",
  deepTierProof: "scripts/movement-debug/run-replay-mounted-game-deep-tier-proof.mjs",
  deepTierFinishGate: "scripts/movement-debug/deep-capture-tiered-finish-gate.mjs",
  captureReusePolicy: "src/app/(dashboard)/demos/movements/_lib/movementCaptureReusePolicy.ts",
  captureReuseCli: "scripts/movement-debug/check-movement-capture-reuse-cli.ts",
  cameraFingerprint: "src/app/(dashboard)/demos/movements/_lib/movementCameraDeviceFingerprint.ts",
  game: "src/app/(dashboard)/demos/movements/[id]/play/page.tsx",
  gameRuntime: "src/app/(dashboard)/demos/movements/_lib/movementGameRuntimeFrame.ts",
  liveSetup: "src/app/(dashboard)/demos/movements/_hooks/useMovementLivePlayerSetup.ts",
  mediaPipe: "src/app/(dashboard)/demos/movements/_hooks/useMediaPipeVision.ts",
  playerTracking: "src/app/(dashboard)/demos/movements/_hooks/useMovementPlayerTracking.ts",
  package: "package.json",
  packetProof: "scripts/movement-debug/run-replay-mounted-game-packet-proof.mjs",
  parityComparator: "scripts/movement-debug/compare-replay-mounted-game-checksums.mjs",
  recordingReplay: "src/app/(dashboard)/demos/movements/_lib/movementRecordingReplay.ts",
  replayExport: "scripts/movement-debug/export-replay-session-cli.ts",
  replay: "src/app/(dashboard)/demos/movements/replay-lab/page.tsx",
  saveRecording: "src/app/(dashboard)/demos/movements/_lib/saveMovementRecording.ts",
  localBackup: "src/app/(dashboard)/demos/movements/_lib/movementRecordingLocalBackup.ts",
  sourceFrame: "src/app/(dashboard)/demos/movements/_lib/movementSourceFrame.ts",
  trackingCalibration: "src/app/(dashboard)/demos/movements/_hooks/useMovementTrackingCalibration.ts",
};

function includes(content, value) {
  return typeof content === "string" && content.includes(value);
}

export function auditMovementAcquisitionContract(files) {
  const failures = [];
  const requireText = (file, text, reason) => {
    if (!includes(files[file], text)) failures.push(`${file}: ${reason}`);
  };
  const forbidText = (file, text, reason) => {
    if (includes(files[file], text)) failures.push(`${file}: ${reason}`);
  };

  requireText("contract", 'id: "movement-player-input-v1"', "missing versioned contract id");
  requireText("contract", 'id: "mediapipe-vision-v1"', "missing versioned detector profile");
  requireText("contract", "MEDIAPIPE_POSE_CONFIDENCE", "detector options are not fingerprinted");
  requireText("contract", "prefixFrameCount: 60", "setup prefix is not fixed at 60 frames");
  requireText("contract", "sampleLimit: 12", "neutral sample limit is not fixed at 12");
  requireText("deepContract", 'id: "movement-deep-capture-v1"', "missing versioned Deep Capture profile id");
  requireText("deepContract", "schemaVersion: 3", "Deep Capture schema version is not fixed at 3");
  requireText("deepContract", "minimum: 200", "Deep Capture minimum anchor target is not fixed at 200");
  requireText("deepContract", "maximum: 500", "Deep Capture maximum anchor target is not fixed at 500");
  requireText("deepContract", 'state: "observed" | "temporally-carried" | "reacquired"', "Deep Capture drops explicit occlusion/reacquisition state");
  requireText("deepContract", 'eyewear: "unknown"', "Deep Capture guesses eyewear instead of preserving model limits");
  requireText("deepRefinement", 'id: "movement-deep-capture-refinement-v1"', "missing versioned native-crop refinement profile");
  requireText("deepRefinement", "mapMovementDeepCaptureCropLandmarksToSourceFrame", "native-crop coordinates are not mapped back to the source frame");
  requireText("deepRefinement", 'origin: "temporally-tracked"', "carried refinement evidence is not labelled as temporally tracked");
  requireText("denseCapture", 'id: "movement-dense-capture-adapter-v1"', "missing versioned dense-model adapter profile");
  requireText("denseCapture", "validateMovementDenseCaptureMeasurement", "dense-model output has no shared fail-closed validator");
  requireText("denseCapture", 'origin: "temporally-tracked"', "dense-anchor carry is not labelled as temporally tracked");
  requireText("denseCapture", "if (!previous?.adapter || previous.anchors.length === 0) return null", "segmentation can silently invent dense anchors");
  requireText("denseCaptureBodyPix", "bodypix-mobilenet-v1-075-q2", "Deep Capture does not instantiate the measured lightweight candidate");
  requireText("denseCaptureBodyPix", "verifyMovementBodyPixModelArtifacts", "provisional dense inference does not verify the measured artifact hash");
  requireText("denseCaptureBodyPix", 'origin: "model-estimated"', "BodyPix semantic samples are mislabelled as observed evidence");
  requireText("denseCaptureBodyPix", "depth: null", "BodyPix adapter invents depth from semantic segmentation");
  requireText("denseCaptureBodyPix", "normal: null", "BodyPix adapter invents 3D surface normals from semantic segmentation");
  requireText("capturePage", "createMovementBodyPixDenseCaptureAdapter", "Deep Capture does not load its provisional dense adapter");
  requireText("denseCaptureFusion", 'id: "movement-dense-capture-fusion-v1"', "dense anchors have no versioned skeleton-fusion profile");
  requireText("denseCaptureFusion", "temporallyTrackedCount", "dense fusion cannot distinguish tracked anchors from current evidence");
  requireText("denseCaptureFusion", 'state: "eligible" as const', "dense fusion has no honest foot-contact candidate boundary");
  requireText("denseCaptureFusion", "insufficient-current-surface-normals", "dense fusion can manufacture twist from missing or tracked normals");
  requireText("denseCaptureProof", 'id: "movement-dense-capture-proof-v1"', "dense fusion has no versioned compact proof boundary");
  requireText("denseCaptureProof", "anchorIdentityChecksum", "dense proof drops persistent anchor identity");
  requireText("denseCaptureProof", "observationCounts", "dense proof hides observed, estimated, tracked, derived, or occluded counts");
  requireText("denseCaptureBenchmark", "DENSE_CAPTURE_REQUIRED_SCENARIOS", "dense-model benchmark has no required RGB scenario coverage");
  requireText("denseCaptureBenchmark", "auditDenseCaptureBenchmarkResults", "dense-model selection bypasses measured results");
  requireText("denseCaptureBrowserBenchmark", "bodypix-mobilenet-v1-075-q2", "browser benchmark omits the lightweight measured candidate");
  requireText("denseCaptureBrowserBenchmark", "bodypix-resnet50-q2", "browser benchmark omits the heavyweight measured candidate");
  requireText("denseCaptureBrowserBenchmark", "cacheModelArtifacts", "browser benchmark does not hash exact model artifacts");
  requireText("denseCaptureBrowserBenchmark", "runCandidateInBrowser", "browser benchmark does not execute candidate inference");
  requireText("denseCaptureBrowserBenchmark", 'anatomicalCorrespondence: "semantic-part-lattice"', "BodyPix benchmark hides its lack of persistent surface correspondence");
  requireText("denseCaptureBrowserBenchmark", 'depth: "unavailable"', "BodyPix benchmark hides its lack of depth capability");
  requireText("denseCaptureBrowserBenchmark", 'surfaceNormals: "unavailable"', "BodyPix benchmark hides its lack of 3D surface normals");
  requireText("denseCaptureBrowserBenchmark", "127.0.0.1", "private RGB benchmark is not loopback-bound");
  requireText("denseCaptureBenchmarkPrepare", "--confirm-benchmark-consent", "RGB benchmark manifest preparation has no explicit consent gate");
  requireText("denseCaptureBenchmarkPrepare", "DENSE_CAPTURE_REQUIRED_SCENARIOS", "RGB benchmark preparation can omit required scenarios");
  requireText("denseCaptureBenchmarkPrepare", "if (report.passed)", "failed RGB benchmark preparation can still write a manifest");
  requireText("denseCaptureBenchmarkIngest", "--confirm-benchmark-consent", "RGB benchmark ingest has no explicit consent gate");
  requireText("denseCaptureBenchmarkIngest", "fs.copyFileSync", "RGB benchmark ingest does not preserve source downloads by copying");
  requireText("denseCaptureBenchmarkIngest", "preservedSourcePath", "RGB benchmark ingest does not report preserved originals");
  requireText("denseCaptureDeviceIngest", "--confirm-local-device-report-copy", "device-report ingest has no explicit local-copy consent");
  requireText("denseCaptureDeviceIngest", "fs.copyFileSync", "device-report ingest does not preserve source downloads by copying");
  requireText("denseCaptureDeviceIngest", "COPYFILE_EXCL", "device-report ingest can overwrite private evidence");
  forbidText("denseCaptureDeviceIngest", "fs.renameSync", "device-report ingest must not move original downloads");
  forbidText("denseCaptureDeviceIngest", "fs.unlinkSync", "device-report ingest must not delete original downloads");
  requireText("denseCaptureDeviceReview", "physicalObservation", "device review drops the post-run physical observation");
  requireText("denseCaptureDeviceReview", "hot-or-unstable", "device review can approve hot or unstable browser evidence");
  requireText("denseCaptureDeviceReview", "MAXIMUM_TENSOR_MEMORY_GROWTH_BYTES", "device review has no TensorFlow memory-growth ceiling");
  requireText("denseCaptureDeviceFinish", "--confirm-physical-device-review", "device finish command has no explicit physical-review confirmation");
  requireText("denseCaptureDeviceFinish", "buildReviewedDenseCaptureBenchmarkResults", "device finish command bypasses strict review");
  requireText("deepTierProof", '"--deep-capture"', "tiered Replay/Game proof bypasses schema-v3 eligibility");
  requireText("deepTierProof", 'DEEP_CAPTURE_PROOF_TIERS = ["targeted", "representative", "all-nine"]', "Deep Capture proof tiers are incomplete or unordered");
  requireText("deepTierProof", "run-mounted-game-nine-proof.mjs", "Deep Capture tier proof bypasses mounted Game");
  requireText("deepTierProof", "run-replay-mounted-game-nine-comparison.mjs", "Deep Capture tier proof bypasses Replay/Game comparison");
  requireText("deepTierFinishGate", 'proofProfile !== "deep-capture-v1"', "finish gate can accept a legacy proof profile");
  requireText("deepTierFinishGate", "exactChecksumDivergenceCount", "finish gate ignores exact Replay/Game divergence");
  requireText("cameraFingerprint", 'id: "movement-camera-device-fingerprint-v1"', "camera identity is not versioned");
  requireText("captureReusePolicy", 'id: "movement-capture-reuse-policy-v1"', "capture reuse decisions are not versioned");
  requireText("captureReusePolicy", '"physical-camera"', "capture reuse policy ignores camera changes");
  requireText("captureReusePolicy", '"dense-body-model"', "capture reuse policy ignores dense-model changes");
  requireText("captureReusePolicy", '"renderer"', "capture reuse policy cannot preserve packets for renderer-only repairs");
  requireText("captureReuseCli", "evaluateMovementCaptureReuse", "capture reuse CLI bypasses the shared policy");
  forbidText("denseCaptureBenchmarkIngest", "fs.renameSync", "RGB benchmark ingest must not move original downloads");
  forbidText("denseCaptureBenchmarkIngest", "fs.unlinkSync", "RGB benchmark ingest must not delete original downloads");
  requireText("codec", "MOVEMENT_DEEP_CAPTURE_PROFILE", "schema-v3 codec bypasses the shared Deep Capture profile");
  requireText("commissioning", "MOVEMENT_DEEP_CAPTURE_PROFILE", "commissioning bypasses the shared Deep Capture profile");
  requireText("capturePage", "buildMovementDeepCaptureFrameEnvelope", "Capture has no schema-v3 packet path");
  requireText("capturePage", "validateMovementDeepCaptureEnvelope", "Capture bypasses Deep Capture validation");
  requireText("capturePage", "commissioningMode && !deepCaptureMode", "canonical Deep Capture URL can pass mutually exclusive save requirements");
  requireText("capturePage", 'pathname === "/demos/movement-capture/deep"', "Deep Capture still depends only on lossy query-string state");
  requireText("capturePage", 'data-capture-profile="schema-v3-deep-capture"', "Deep Capture mode is not visibly locked before recording");
  // The user-facing schema-v2 standard capture page was retired on 2026-07-20:
  // there is one capture surface and the base route must resolve to it.
  requireText("captureBaseRedirect", 'redirect("/demos/movement-capture/deep")', "base capture route no longer resolves to Deep Capture");
  requireText("deepCaptureRoute", 'export { default } from "../MovementCaptureClient"', "canonical query-free Deep Capture route is missing");
  requireText("captureBenchmark", "MediaRecorder", "private RGB benchmark capture has no browser-local recorder");
  requireText("captureBenchmark", "Nothing on this page uploads raw RGB video", "private RGB benchmark capture hides its privacy boundary");
  requireText("captureBenchmark", "consent", "private RGB benchmark capture has no explicit consent state");
  requireText("captureBenchmarkContract", 'id: "near-camera"', "benchmark capture omits near-camera evidence");
  requireText("captureBenchmarkContract", 'id: "loose-clothing"', "benchmark capture omits loose-clothing evidence");
  forbidText("captureBenchmark", "useMutation(", "private RGB benchmark capture must not upload through Convex");
  forbidText("captureBenchmark", "saveMovementRecording(", "private RGB clips must not enter movement packet storage");
  requireText("recordingReplay", "deepCapture: getFramePayload(frame)?.deepCapture", "Replay conversion drops frame Deep Capture evidence");
  requireText("recordingReplay", "acquisitionProfileId: getFramePayload(frame)?.acquisitionProfileId", "Replay conversion drops the frame acquisition profile");
  requireText("replayExport", "deepCaptureChannelSummary: parsed.deepCaptureChannelSummary", "Replay export drops Deep Capture channel accounting");
  requireText("replayExport", "deepCaptureProfile: parsed.deepCaptureProfile", "Replay export drops the Deep Capture profile");
  requireText("saveRecording", "validateMovementDeepCaptureEnvelope(payload)", "schema-v3 save bypasses the Deep Capture validator");
  requireText("saveRecording", '"storage-json-v3"', "schema-v3 save is not labelled with its storage format");
  requireText("deepReplayValidator", "validateDeepCaptureReplayPacket", "Replay proof has no schema-v3 Deep Capture validator");
  requireText("deepReplayValidator", "DEEP_CAPTURE_REQUIRED_BODY_REGIONS", "Replay proof does not require whole-body dense regions");
  requireText("deepReplayValidator", "200-500 dense-body anchors", "Replay proof does not enforce the dense anchor range");
  requireText("deepRendererProof", "buildMovementReplaySessionFromRecording", "Deep Capture final-writer proof bypasses recording-to-Replay conversion");
  requireText("deepRendererProof", "buildMovementGamePlayerRuntimeFrame", "Deep Capture final-writer proof bypasses the shared Game player runtime");
  requireText("deepRendererProof", "applyMovementAvatarEndFrameRuntime", "Deep Capture proof stops before actual hand/expression writers");
  requireText("deepRendererProof", "expect(replayWrites).toEqual(gameWrites)", "Deep Capture final-writer proof does not require exact Replay/Game equality");
  requireText("deepReviewManifest", 'movement-deep-capture-review-manifest-v1', "Deep Capture reviewer manifest is not versioned");
  requireText("deepRecordingInventory", "--all-recordings", "Deep Capture inventory cannot discover every saved recording");
  requireText("deepLatestProof", "selectLatestEligibleDeepCapture", "Deep Capture cannot select the newest eligible saved packet");
  requireText("deepLatestProof", '"--all-recordings"', "latest Deep Capture proof bypasses the complete recording inventory");
  requireText("deepLatestProof", '"--recording-id", selected.recordingId', "latest Deep Capture proof does not route the selected immutable id into commissioning proof");
  requireText("localBackup", "serializeMovementRecordingBackupPacket", "proof-ready capture has no local derived-packet backup");
  requireText("localBackup", 'type: "application/json"', "local backup is not constrained to derived JSON");
  requireText("deepLocalRecovery", "validateMovementDeepCaptureEnvelope", "local recovery can bypass schema-v3 validation");
  requireText("deepLocalRecovery", "buildMovementReplaySessionFromRecording", "local recovery bypasses the shared Replay conversion");
  requireText("deepLocalRecovery", "validateCompleteReplayGamePacket", "local recovery does not run the complete Replay/Game packet preflight");
  requireText("deepLocalRecovery", "Source backup preserved", "local recovery can hide whether the downloaded source was preserved");
  requireText("deepLocalProof", "recover-local-movement-packet.mjs", "local proof bypasses non-destructive packet recovery");
  requireText("deepLocalProof", "run-replay-mounted-game-packet-proof.mjs", "local proof bypasses mounted Game packet proof");
  requireText("deepLocalProof", '"--deep-capture"', "local proof can run without strict schema-v3 validation");
  requireText("deepLocalProof", "--preflight-only", "local proof cannot safely stop before browser launch");
  requireText("deepSavePreflight", "validateCompleteReplayGamePacket(replay.session", "schema-v3 browser save is not proven through Replay/Game preflight");
  requireText("deepReviewManifest", "movementPipelineFingerprint", "Deep Capture reviewer manifest drops the shared runtime fingerprint");
  requireText("deepReviewManifest", "currentWorkingTreeClean", "Deep Capture reviewer manifest can accept uncommitted code");
  requireText("deepReviewManifest", "minimumSupportedDevice", "Deep Capture reviewer manifest drops the supported-device boundary");
  requireText("deepReviewManifest", "artifactRecord", "Deep Capture reviewer manifest does not hash its source artifacts");
  requireText("packetProof", "validateDeepCaptureReplayPacket", "mounted Replay/Game proof bypasses Deep Capture validation");
  requireText("packetProof", "--deep-capture", "mounted Replay/Game proof has no explicit Deep Capture mode");
  requireText("parityComparator", 'DEEP_CAPTURE_BOUNDARY = "denseFusion"', "schema-v3 parity does not compare dense fusion independently");
  requireText("package", "movement:replay-game:deep-commissioning-proof", "Deep Capture has no one-command Replay/Game commissioning proof");
  requireText("package", "movement:replay-game:deep-commissioning-eligibility", "Deep Capture has no commissioning eligibility preflight");
  requireText("package", "movement:replay-game:deep-recording-inventory", "Deep Capture has no automatic all-recording inventory");
  requireText("package", "movement:replay-game:deep-latest-proof", "Deep Capture has no newest-eligible proof command");
  requireText("package", "movement:replay:recover-local-packet", "Deep Capture has no local packet recovery command");
  requireText("package", "movement:replay-game:deep-local-proof", "Deep Capture has no one-command local packet proof");
  requireText("package", "movement:replay-game:deep-targeted-proof", "Deep Capture has no targeted mounted proof lane");
  requireText("package", "movement:replay-game:deep-representative-proof", "Deep Capture has no representative mounted proof lane");
  requireText("package", "movement:replay-game:deep-all-nine-proof", "Deep Capture has no all-nine mounted proof lane");
  requireText("package", "movement:replay-game:deep-tiered-finish-gate", "Deep Capture tiers are not registered in the finish gate");
  requireText("package", "movement:replay-game:deep-capture-reuse", "Deep Capture has no packet reuse decision command");
  requireText("package", "movement:replay-game:deep-review-manifest", "Deep Capture has no durable reviewer manifest command");
  requireText("package", "movement:replay-game:deep-review-manifest-gate", "Deep Capture reviewer manifest is not registered as a finish gate");
  requireText("package", "movement:dense-capture:benchmark:run", "Deep Capture has no executable two-model browser benchmark");
  requireText("package", "movement:dense-capture:benchmark:soak", "Deep Capture has no sustained browser benchmark");
  requireText("package", "movement:dense-capture:benchmark:soak-gate", "Deep Capture sustained benchmark has no drift gate");
  requireText("package", "movement:dense-capture:device-finish", "Deep Capture has no one-command physical-device finish lane");
  requireText("replay", "deepCapture: frame.tracking.deepCapture", "Replay runtime drops Deep Capture evidence");
  requireText("replay", "buildMovementDenseCaptureProofSnapshot", "Replay proof does not export the shared dense-fusion boundary");
  requireText("gameRuntime", "deepCapture: payload?.deepCapture", "Game runtime drops Deep Capture evidence");
  requireText("game", "buildMovementDenseCaptureProofSnapshot", "mounted Game proof does not export the shared dense-fusion boundary");
  requireText("sourceFrame", "deepCapture?: MovementDeepCaptureFrameEvidence", "shared source frame has no Deep Capture evidence field");
  requireText("mediaPipe", "MOVEMENT_PLAYER_INPUT_CONTRACT", "MediaPipe options bypass the shared detector profile");
  requireText("mediaPipe", 'runningMode: "IMAGE"', "Deep Capture has no dedicated crop refiners");
  requireText("capture", "createMovementAcquisitionFilters", "capture does not use the shared filter factory");
  requireText("capture", "prepareMovementAcquisitionFrame", "capture does not use shared result preparation");
  requireText("capture", "MOVEMENT_DEEP_CAPTURE_REFINEMENT_PROFILE", "capture bypasses the native-crop refinement profile");
  requireText("capture", "createMovementDenseCaptureRuntime", "capture has no asynchronous dense-adapter runtime");
  requireText("capture", "denseCaptureAdapter", "capture cannot accept the selected dense adapter");
  requireText("capture", "wasOccluded", "capture cannot label refinement reacquisition after a short occlusion");
  requireText("capture", "occluded: !faceRefinementRegion", "face refinement carry still depends on a currently visible coarse face ROI");
  requireText("capture", "resolveMovementDeepCaptureHandRefinementRegion", "capture has no pose-backed fallback hand ROI");
  requireText("capture", "resolveMovementDeepCaptureFaceRefinementRegion", "capture has no pose-backed fallback face ROI");
  requireText("capture", "occluded: !handRefinementRegions[side]", "hand refinement carry ignores the resolved coarse-or-fallback ROI");
  requireText("capture", "drawMovementHandOverlay", "capture does not draw genuine 21-point hand evidence");
  requireText("capture", "drawMovementFaceOverlay", "capture does not expose genuine dense face evidence");
  requireText("capture", "drawMovementDenseBodyOverlay", "capture does not expose genuine dense-body anchors");
  requireText("capture", "trackingOverlayDetail", "capture has no lighter-default versus all-points overlay policy");
  requireText("capture", "fuseMovementDenseCaptureEvidence", "capture publishes dense anchors without shared skeleton fusion");
  requireText("capture", "resolveMovementCameraDeviceFingerprint", "Capture does not retain opaque physical-camera identity");
  requireText("capturePreflight", "movement-dense-capture-adapter-v1", "preflight calls unverified dense anchors ready");
  requireText("capturePreflight", "model SHA-256 is invalid", "preflight hides invalid dense-model identity");
  requireText("commissioning", "movement-deep-capture-refinement-v1", "commissioning does not require second-pass hand and face evidence");
  requireText("commissioning", "validateMovementDenseCaptureMeasurement", "commissioning bypasses dense-model adapter validation");
  requireText("playerTracking", "createMovementAcquisitionFilters", "Game does not use the shared filter factory");
  requireText("playerTracking", "prepareMovementAcquisitionFrame", "Game does not use shared result preparation");
  requireText("playerTracking", "resolveMovementCameraDeviceFingerprint", "live Game does not retain the same camera identity boundary");
  requireText("liveSetup", "buildMovementPlayerSetupFromPrefix", "automatic Game setup bypasses the shared setup policy");
  requireText("trackingCalibration", "buildMovementPlayerSetupFromPrefix", "explicit Game setup bypasses the shared setup policy");
  requireText("game", "recordedSourceSequence:", "recorded mounted Game proof does not enter through the tracking boundary");
  requireText("game", "automaticPlayerSetup", "recorded mounted Game proof bypasses automatic setup");
  requireText("replay", "buildMovementPlayerSetupFromPrefix", "Replay bypasses the shared setup policy");

  for (const file of ["capture", "playerTracking"]) {
    forbidText(file, "new PoseFilterWrapper", "route-local acquisition filters are forbidden");
  }
  for (const file of ["game", "liveSetup", "replay", "trackingCalibration"]) {
    forbidText(file, "buildMovementRecordedPlayerSetup(", "route-local setup construction is forbidden");
    forbidText(file, "Math.min(59", "route-local 60-frame setup literal is forbidden");
    forbidText(file, "LIVE_PLAYER_SETUP_MIN_FRAMES", "route-local setup count is forbidden");
  }

  return { failures, ok: failures.length === 0 };
}

export function runMovementAcquisitionContractGuard(rootDir = process.cwd()) {
  const files = Object.fromEntries(Object.entries(MOVEMENT_ACQUISITION_CONTRACT_PATHS).map(
    ([key, relativePath]) => [key, fs.readFileSync(path.resolve(rootDir, relativePath), "utf8")],
  ));
  return auditMovementAcquisitionContract(files);
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const report = runMovementAcquisitionContractGuard();
  if (report.ok) {
    console.log("Movement acquisition contract guard: passed");
  } else {
    console.error("Movement acquisition contract guard: failed");
    report.failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
  }
}
