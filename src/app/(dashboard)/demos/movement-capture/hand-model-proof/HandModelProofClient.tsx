"use client";

import { useEffect, useRef, useState } from "react";
import {
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";
import { buildMovementDeepCaptureHandEvidence } from "../../movements/_lib/movementDeepCaptureEvidence";
import {
  resolveMovementDeepCaptureHandRefinementRegion,
  resolveMovementDeepCaptureRefinementInputSize,
  selectMovementDeepCaptureHandRefinementCandidate,
} from "../../movements/_lib/movementDeepCaptureRefinement";
import {
  MOVEMENT_PLAYER_INPUT_CONTRACT,
} from "../../movements/_lib/movementPlayerInputContract";
import { drawMovementHandOverlay } from "../../movements/_lib/movementSkeleton";
import type { MovementLandmark } from "../../movements/_lib/movementTypes";

type ProofState = {
  assignment: string;
  coarseHandCount: number;
  detectorLabel: string;
  error: string | null;
  fingerJointCount: number;
  imagePointCount: number;
  landmarks: MovementLandmark[];
  palmFacing: string;
  posePointCount: number;
  poseSource: string;
  roiSource: string;
  status: "failed" | "loading" | "passed";
  worldPointCount: number;
};

const INITIAL_STATE: ProofState = {
  assignment: "missing",
  coarseHandCount: 0,
  detectorLabel: "missing",
  error: null,
  fingerJointCount: 0,
  imagePointCount: 0,
  landmarks: [],
  palmFacing: "missing",
  posePointCount: 0,
  poseSource: "missing",
  roiSource: "missing",
  status: "loading",
  worldPointCount: 0,
};

function loadFixtureImage() {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The near-camera hand fixture could not be loaded."));
    image.src = `/api/e2e-fixture/hand-proof?proof=${Date.now()}`;
  });
}

function capturedPoseHandFixture(scale = 1) {
  const landmarks = Array.from({ length: 33 }, () => ({
    visibility: 0,
    x: 0.5,
    y: 0.5,
    z: 0,
  }));
  // Trustworthy left wrist plus Pose pinky/index/thumb anchors visible in the
  // supplied capture. These drive only the ROI; the Hand Landmarker remains
  // the sole source of every finger point and world landmark.
  landmarks[15] = { visibility: 0.98, x: 0.255 * scale, y: 0.644 * scale, z: 0 };
  landmarks[17] = { visibility: 0.9, x: 0.23 * scale, y: 0.472 * scale, z: 0 };
  landmarks[19] = { visibility: 0.9, x: 0.274 * scale, y: 0.421 * scale, z: 0 };
  landmarks[21] = { visibility: 0.9, x: 0.303 * scale, y: 0.499 * scale, z: 0 };
  return landmarks;
}

export default function HandModelProofClient() {
  const [proof, setProof] = useState<ProofState>(INITIAL_STATE);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let active = true;
    let coarseHandLandmarker: HandLandmarker | null = null;
    let handRefiner: HandLandmarker | null = null;
    let poseLandmarker: PoseLandmarker | null = null;

    async function run() {
      try {
        const image = await loadFixtureImage();
        const fixtureScale = 0.2;
        const proofFrame = document.createElement("canvas");
        proofFrame.width = image.naturalWidth;
        proofFrame.height = image.naturalHeight;
        const proofContext = proofFrame.getContext("2d");
        if (!proofContext) throw new Error("The full-frame proof canvas is unavailable.");
        proofContext.fillStyle = "#87b9df";
        proofContext.fillRect(0, 0, proofFrame.width, proofFrame.height);
        proofContext.drawImage(
          image,
          0,
          0,
          Math.round(image.naturalWidth * fixtureScale),
          Math.round(image.naturalHeight * fixtureScale),
        );
        const { detector } = MOVEMENT_PLAYER_INPUT_CONTRACT;
        const vision = await FilesetResolver.forVisionTasks(detector.wasmUrl);
        poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { delegate: "GPU", modelAssetPath: detector.poseModelUrl },
          minPoseDetectionConfidence: detector.poseConfidence,
          minPosePresenceConfidence: detector.poseConfidence,
          numPoses: 1,
          runningMode: "IMAGE",
        });
        coarseHandLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { delegate: "GPU", modelAssetPath: detector.handModelUrl },
          minHandDetectionConfidence: detector.handConfidence,
          minHandPresenceConfidence: detector.handConfidence,
          minTrackingConfidence: detector.handConfidence,
          numHands: 2,
          runningMode: "VIDEO",
        });
        handRefiner = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { delegate: "GPU", modelAssetPath: detector.handModelUrl },
          minHandDetectionConfidence: detector.handConfidence,
          minHandPresenceConfidence: detector.handConfidence,
          numHands: 2,
          runningMode: "IMAGE",
        });

        const poseResult = poseLandmarker.detect(proofFrame);
        const actualPoseLandmarks = poseResult.landmarks[0] ?? [];
        const camera = { frameHeight: image.naturalHeight, frameWidth: image.naturalWidth };
        const actualPoseRegion = resolveMovementDeepCaptureHandRefinementRegion({
          camera,
          poseLandmarks: actualPoseLandmarks,
          primaryCrop: null,
          side: "left",
        });
        const poseLandmarks = actualPoseRegion
          ? actualPoseLandmarks
          : capturedPoseHandFixture(fixtureScale);
        const poseSource = actualPoseRegion
          ? "actual-full-frame-pose"
          : "captured-pose-hand-fixture";
        const coarseResult = coarseHandLandmarker.detectForVideo(proofFrame, 0);
        const region = actualPoseRegion ?? resolveMovementDeepCaptureHandRefinementRegion({
          camera, poseLandmarks, primaryCrop: null, side: "left",
        });
        if (!region) {
          throw new Error(
            `Pose evidence did not produce a trustworthy left-hand ROI (${camera.frameWidth}×${camera.frameHeight}; ${poseLandmarks.length} points; wrist ${JSON.stringify(poseLandmarks[15])}).`,
          );
        }

        const cropCanvas = document.createElement("canvas");
        const inputSize = resolveMovementDeepCaptureRefinementInputSize({
          crop: region.crop,
          minimumShortEdgePixels: 192,
        });
        cropCanvas.width = inputSize.width;
        cropCanvas.height = inputSize.height;
        const cropContext = cropCanvas.getContext("2d");
        if (!cropContext) throw new Error("The native hand crop canvas is unavailable.");
        cropContext.drawImage(
          proofFrame,
          region.crop.x,
          region.crop.y,
          region.crop.width,
          region.crop.height,
          0,
          0,
          inputSize.width,
          inputSize.height,
        );

        const refinedResult = handRefiner.detect(cropCanvas);
        const candidate = selectMovementDeepCaptureHandRefinementCandidate({
          poseLandmarks,
          refinementRegion: region,
          result: refinedResult,
          side: "left",
        });
        if (!candidate) throw new Error("The native hand refiner returned no complete left-hand evidence.");
        const evidence = buildMovementDeepCaptureHandEvidence({
          assignment: candidate.assignment.assignment,
          camera,
          capturedAt: Date.now(),
          detector: candidate.assignment.detector,
          landmarks: candidate.mappedLandmarks,
          side: "left",
          sourceTimestampMs: 0,
          worldLandmarks: candidate.worldLandmarks,
        });
        if (!evidence) throw new Error("The refined detector output did not satisfy the hand contract.");

        const passed = coarseResult.landmarks.length === 0 &&
          candidate.mappedLandmarks.length === 21 &&
          candidate.worldLandmarks.length === 21 &&
          Object.keys(evidence.fingerJointAngles ?? {}).length === 15;
        if (!active) return;
        setProof({
          assignment: evidence.assignment,
          coarseHandCount: coarseResult.landmarks.length,
          detectorLabel: evidence.detectorHandedness.label,
          error: passed ? null : "The full-frame detector did not miss, or refinement evidence was incomplete.",
          fingerJointCount: Object.keys(evidence.fingerJointAngles ?? {}).length,
          imagePointCount: candidate.mappedLandmarks.length,
          landmarks: candidate.mappedLandmarks,
          palmFacing: evidence.orientation?.facing ?? "unknown",
          posePointCount: [15, 17, 19, 21].filter(
            (index) => (poseLandmarks[index]?.visibility ?? 0) >= 0.35,
          ).length,
          poseSource,
          roiSource: region.source,
          status: passed ? "passed" : "failed",
          worldPointCount: candidate.worldLandmarks.length,
        });
      } catch (error) {
        if (!active) return;
        setProof({
          ...INITIAL_STATE,
          error: error instanceof Error ? error.message : "Actual hand-model proof failed.",
          status: "failed",
        });
      }
    }

    void run();
    return () => {
      active = false;
      coarseHandLandmarker?.close();
      handRefiner?.close();
      poseLandmarker?.close();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.fillStyle = "#090910";
    context.fillRect(0, 0, canvas.width, canvas.height);
    drawMovementHandOverlay(context, { left: { landmarks: proof.landmarks } }, canvas.width, canvas.height);
  }, [proof.landmarks]);

  return (
    <div
      className="grid gap-5"
      data-assignment={proof.assignment}
      data-coarse-hand-count={proof.coarseHandCount}
      data-finger-joint-count={proof.fingerJointCount}
      data-image-point-count={proof.imagePointCount}
      data-palm-facing={proof.palmFacing}
      data-pose-point-count={proof.posePointCount}
      data-pose-source={proof.poseSource}
      data-roi-source={proof.roiSource}
      data-status={proof.status}
      data-testid="actual-hand-model-proof"
      data-world-point-count={proof.worldPointCount}
    >
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Actual model assertions">
        {[
          ["Full-frame detector (20% source)", proof.status === "loading" ? "RUNNING" : `${proof.coarseHandCount} hands`],
          ["ROI Pose anchors", proof.status === "loading" ? "RUNNING" : `${proof.posePointCount} trustworthy`],
          ["Fallback refiner", proof.status === "loading" ? "RUNNING" : `${proof.imagePointCount} / ${proof.worldPointCount}`],
          ["Finger joints", proof.status === "loading" ? "RUNNING" : `${proof.fingerJointCount} / 15`],
        ].map(([label, value]) => (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4" key={label}>
            <p className="text-xs uppercase tracking-wide text-white/45">{label}</p>
            <p className="mt-2 text-lg font-semibold text-white">{value}</p>
          </div>
        ))}
      </section>

      <canvas
        aria-label="Actual MediaPipe fallback hand overlay"
        className="h-auto w-full rounded-2xl border border-sky-300/25 bg-[#090910]"
        data-testid="actual-hand-model-overlay"
        height={600}
        ref={canvasRef}
        width={960}
      />

      <div className={`rounded-2xl border px-5 py-4 text-sm ${
        proof.status === "passed"
          ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
          : proof.status === "failed"
            ? "border-red-300/25 bg-red-300/10 text-red-100"
            : "border-sky-300/25 bg-sky-300/10 text-sky-100"
      }`}>
        {proof.status === "loading"
          ? "Running the real browser-local pose, full-frame hand and native-crop hand models…"
          : proof.status === "passed"
            ? `PASSED — the 20%-scale full-frame lane returned 0 hands; ${proof.poseSource} drove the native ROI; the real crop refiner recovered ${proof.imagePointCount} image and ${proof.worldPointCount} world landmarks with ${proof.fingerJointCount} measured joints.`
            : `FAILED — ${proof.error}`}
      </div>
    </div>
  );
}
