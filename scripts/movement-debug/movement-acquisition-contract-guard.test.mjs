import { describe, expect, it } from "vitest";
import {
  auditMovementAcquisitionContract,
  runMovementAcquisitionContractGuard,
} from "./movement-acquisition-contract-guard.mjs";

describe("movement acquisition contract guard", () => {
  it("passes the current shared acquisition and setup contract", () => {
    expect(runMovementAcquisitionContractGuard()).toEqual({ failures: [], ok: true });
  });

  it("blocks route-local filters and setup counts", () => {
    const report = auditMovementAcquisitionContract({
      capture: "new PoseFilterWrapper createMovementDenseCaptureRuntime denseCaptureAdapter wasOccluded occluded: !faceRefinementRegion resolveMovementDeepCaptureHandRefinementRegion resolveMovementDeepCaptureFaceRefinementRegion occluded: !handRefinementRegions[side] drawMovementHandOverlay drawMovementFaceOverlay drawMovementDenseBodyOverlay trackingOverlayDetail fuseMovementDenseCaptureEvidence resolveMovementCameraDeviceFingerprint",
      cameraFingerprint: 'id: "movement-camera-device-fingerprint-v1"',
      captureReuseCli: "evaluateMovementCaptureReuse",
      captureReusePolicy: 'id: "movement-capture-reuse-policy-v1" "physical-camera" "dense-body-model" "renderer"',
      captureBenchmark: "MediaRecorder Nothing on this page uploads raw RGB video consent",
      captureBenchmarkContract: 'id: "near-camera" id: "loose-clothing"',
      capturePage: 'buildMovementDeepCaptureFrameEnvelope validateMovementDeepCaptureEnvelope createMovementBodyPixDenseCaptureAdapter commissioningMode && !deepCaptureMode pathname === "/demos/movement-capture/deep" data-capture-profile="schema-v3-deep-capture" data-capture-profile="schema-v2-standard"',
      capturePreflight: "movement-dense-capture-adapter-v1 model SHA-256 is invalid",
      codec: "MOVEMENT_DEEP_CAPTURE_PROFILE",
      commissioning: "MOVEMENT_DEEP_CAPTURE_PROFILE movement-deep-capture-refinement-v1 validateMovementDenseCaptureMeasurement",
      contract: 'id: "movement-player-input-v1"; id: "mediapipe-vision-v1"; MEDIAPIPE_POSE_CONFIDENCE; prefixFrameCount: 60; sampleLimit: 12',
      deepContract: 'id: "movement-deep-capture-v1"; schemaVersion: 3; minimum: 200; maximum: 500; state: "observed" | "temporally-carried" | "reacquired"; eyewear: "unknown"',
      deepCaptureRoute: 'export { default } from "../page"',
      deepRefinement: 'id: "movement-deep-capture-refinement-v1"; mapMovementDeepCaptureCropLandmarksToSourceFrame; origin: "temporally-tracked"',
      deepReviewManifest: "movement-deep-capture-review-manifest-v1 movementPipelineFingerprint currentWorkingTreeClean minimumSupportedDevice artifactRecord",
      deepRecordingInventory: "--all-recordings",
      deepLatestProof: 'selectLatestEligibleDeepCapture "--all-recordings" "--recording-id", selected.recordingId',
      deepLocalProof: 'recover-local-movement-packet.mjs run-replay-mounted-game-packet-proof.mjs "--deep-capture" --preflight-only',
      deepLocalRecovery: "validateMovementDeepCaptureEnvelope buildMovementReplaySessionFromRecording validateCompleteReplayGamePacket Source backup preserved",
      deepSavePreflight: "validateCompleteReplayGamePacket(replay.session",
      deepTierFinishGate: 'proofProfile !== "deep-capture-v1" exactChecksumDivergenceCount',
      deepTierProof: '"--deep-capture" DEEP_CAPTURE_PROOF_TIERS = ["targeted", "representative", "all-nine"] run-mounted-game-nine-proof.mjs run-replay-mounted-game-nine-comparison.mjs',
      deepRendererProof: "buildMovementReplaySessionFromRecording buildMovementGamePlayerRuntimeFrame applyMovementAvatarEndFrameRuntime expect(replayWrites).toEqual(gameWrites)",
      deepReplayValidator: "validateDeepCaptureReplayPacket DEEP_CAPTURE_REQUIRED_BODY_REGIONS 200-500 dense-body anchors",
      denseCapture: 'id: "movement-dense-capture-adapter-v1"; validateMovementDenseCaptureMeasurement; origin: "temporally-tracked"; if (!previous?.adapter || previous.anchors.length === 0) return null',
      denseCaptureBodyPix: 'bodypix-mobilenet-v1-075-q2 verifyMovementBodyPixModelArtifacts origin: "model-estimated" depth: null normal: null',
      denseCaptureFusion: 'id: "movement-dense-capture-fusion-v1"; temporallyTrackedCount; state: "eligible" as const; insufficient-current-surface-normals',
      denseCaptureProof: 'id: "movement-dense-capture-proof-v1"; anchorIdentityChecksum; observationCounts',
      denseCaptureBenchmark: "DENSE_CAPTURE_REQUIRED_SCENARIOS auditDenseCaptureBenchmarkResults",
      denseCaptureBrowserBenchmark: 'bodypix-mobilenet-v1-075-q2 bodypix-resnet50-q2 cacheModelArtifacts runCandidateInBrowser 127.0.0.1 anatomicalCorrespondence: "semantic-part-lattice" depth: "unavailable" surfaceNormals: "unavailable"',
      denseCaptureBenchmarkPrepare: "--confirm-benchmark-consent DENSE_CAPTURE_REQUIRED_SCENARIOS if (report.passed)",
      denseCaptureBenchmarkIngest: "--confirm-benchmark-consent fs.copyFileSync preservedSourcePath",
      denseCaptureDeviceFinish: "--confirm-physical-device-review buildReviewedDenseCaptureBenchmarkResults",
      denseCaptureDeviceIngest: "--confirm-local-device-report-copy fs.copyFileSync COPYFILE_EXCL",
      denseCaptureDeviceReview: "physicalObservation hot-or-unstable MAXIMUM_TENSOR_MEMORY_GROWTH_BYTES",
      game: "recordedSourceSequence: automaticPlayerSetup buildMovementDenseCaptureProofSnapshot",
      gameRuntime: "deepCapture: payload?.deepCapture",
      liveSetup: "buildMovementPlayerSetupFromPrefix LIVE_PLAYER_SETUP_MIN_FRAMES",
      localBackup: 'serializeMovementRecordingBackupPacket type: "application/json"',
      mediaPipe: 'MOVEMENT_PLAYER_INPUT_CONTRACT runningMode: "IMAGE"',
      package: "movement:replay:recover-local-packet movement:replay-game:deep-local-proof movement:replay-game:deep-commissioning-proof movement:replay-game:deep-commissioning-eligibility movement:replay-game:deep-recording-inventory movement:replay-game:deep-latest-proof movement:replay-game:deep-targeted-proof movement:replay-game:deep-representative-proof movement:replay-game:deep-all-nine-proof movement:replay-game:deep-tiered-finish-gate movement:replay-game:deep-capture-reuse movement:replay-game:deep-review-manifest movement:replay-game:deep-review-manifest-gate movement:dense-capture:benchmark:run movement:dense-capture:benchmark:soak movement:dense-capture:benchmark:soak-gate movement:dense-capture:device-finish",
      packetProof: "validateDeepCaptureReplayPacket --deep-capture",
      parityComparator: 'DEEP_CAPTURE_BOUNDARY = "denseFusion"',
      playerTracking: "createMovementAcquisitionFilters prepareMovementAcquisitionFrame resolveMovementCameraDeviceFingerprint",
      recordingReplay: "deepCapture: getFramePayload(frame)?.deepCapture acquisitionProfileId: getFramePayload(frame)?.acquisitionProfileId",
      replay: "buildMovementPlayerSetupFromPrefix deepCapture: frame.tracking.deepCapture buildMovementDenseCaptureProofSnapshot",
      replayExport: "deepCaptureChannelSummary: parsed.deepCaptureChannelSummary deepCaptureProfile: parsed.deepCaptureProfile",
      saveRecording: 'validateMovementDeepCaptureEnvelope(payload) "storage-json-v3"',
      sourceFrame: "deepCapture?: MovementDeepCaptureFrameEvidence",
      trackingCalibration: "buildMovementPlayerSetupFromPrefix",
    });

    expect(report.ok).toBe(false);
    expect(report.failures).toEqual(expect.arrayContaining([
      expect.stringContaining("capture does not use the shared filter factory"),
      expect.stringContaining("route-local acquisition filters"),
      expect.stringContaining("route-local setup count"),
    ]));
  });
});
