"use client";

import { useEffect, useRef, useState } from "react";
import { FaceLandmarker, FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { buildMovementDeepCaptureFaceEvidence } from "../../movements/_lib/movementDeepCaptureEvidence";
import {
  mapMovementDeepCaptureCropLandmarksToSourceFrame,
  resolveMovementDeepCaptureFaceRefinementRegion,
  resolveMovementDeepCaptureRefinementInputSize,
} from "../../movements/_lib/movementDeepCaptureRefinement";
import { MOVEMENT_PLAYER_INPUT_CONTRACT } from "../../movements/_lib/movementPlayerInputContract";
import { drawMovementFaceOverlay } from "../../movements/_lib/movementSkeleton";
import type { MovementLandmark } from "../../movements/_lib/movementTypes";

type ProofState = {
  blendshapeCount: number;
  coarseFaceCount: number;
  error: string | null;
  facialTransformCount: number;
  gazeCount: number;
  imagePointCount: number;
  irisPointCount: number;
  landmarks: MovementLandmark[];
  posePointCount: number;
  poseSource: string;
  roiSource: string;
  status: "failed" | "loading" | "passed";
};

const INITIAL_STATE: ProofState = {
  blendshapeCount: 0,
  coarseFaceCount: 0,
  error: null,
  facialTransformCount: 0,
  gazeCount: 0,
  imagePointCount: 0,
  irisPointCount: 0,
  landmarks: [],
  posePointCount: 0,
  poseSource: "missing",
  roiSource: "missing",
  status: "loading",
};

function loadFixtureImage() {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The face fixture could not be loaded."));
    image.src = `/api/e2e-fixture/face-proof?proof=${Date.now()}`;
  });
}

function capturedPoseFaceFixture(scale: number) {
  const landmarks = Array.from({ length: 33 }, () => ({
    visibility: 0,
    x: 0.5,
    y: 0.5,
    z: 0,
  }));
  const point = (x: number, y: number) => ({ visibility: 0.95, x: x * scale, y: y * scale, z: 0 });
  landmarks[0] = point(0.463, 0.408);
  landmarks[1] = point(0.447, 0.36);
  landmarks[2] = point(0.439, 0.355);
  landmarks[3] = point(0.428, 0.36);
  landmarks[4] = point(0.482, 0.36);
  landmarks[5] = point(0.493, 0.357);
  landmarks[6] = point(0.504, 0.362);
  landmarks[7] = point(0.401, 0.385);
  landmarks[8] = point(0.535, 0.388);
  landmarks[9] = point(0.445, 0.458);
  landmarks[10] = point(0.486, 0.462);
  landmarks[11] = point(0.31, 0.59);
  landmarks[12] = point(0.59, 0.63);
  return landmarks;
}

export default function FaceModelProofClient() {
  const [proof, setProof] = useState<ProofState>(INITIAL_STATE);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let active = true;
    let coarseFaceLandmarker: FaceLandmarker | null = null;
    let faceRefiner: FaceLandmarker | null = null;
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
        coarseFaceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { delegate: "GPU", modelAssetPath: detector.faceModelUrl },
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
          runningMode: "VIDEO",
        });
        faceRefiner = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { delegate: "GPU", modelAssetPath: detector.faceModelUrl },
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
          runningMode: "IMAGE",
        });

        const camera = { frameHeight: image.naturalHeight, frameWidth: image.naturalWidth };
        const actualPose = poseLandmarker.detect(proofFrame).landmarks[0] ?? [];
        const actualRegion = resolveMovementDeepCaptureFaceRefinementRegion({
          camera,
          poseLandmarks: actualPose,
          primaryCrop: null,
        });
        const poseLandmarks = actualRegion ? actualPose : capturedPoseFaceFixture(fixtureScale);
        const poseSource = actualRegion ? "actual-full-frame-pose" : "captured-pose-face-fixture";
        const region = actualRegion ?? resolveMovementDeepCaptureFaceRefinementRegion({
          camera,
          poseLandmarks,
          primaryCrop: null,
        });
        if (!region) throw new Error("Trustworthy Pose face evidence did not produce a fallback ROI.");

        const coarseResult = coarseFaceLandmarker.detectForVideo(proofFrame, 0);
        const cropCanvas = document.createElement("canvas");
        const inputSize = resolveMovementDeepCaptureRefinementInputSize({
          crop: region.crop,
          minimumShortEdgePixels: 256,
        });
        cropCanvas.width = inputSize.width;
        cropCanvas.height = inputSize.height;
        const cropContext = cropCanvas.getContext("2d");
        if (!cropContext) throw new Error("The native face crop canvas is unavailable.");
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

        const refinedResult = faceRefiner.detect(cropCanvas);
        const cropLandmarks = refinedResult.faceLandmarks[0];
        if (!cropLandmarks || cropLandmarks.length !== 478) {
          throw new Error("The native face refiner returned no complete 478-point face evidence.");
        }
        const mappedLandmarks = mapMovementDeepCaptureCropLandmarksToSourceFrame(
          cropLandmarks,
          region.crop,
        );
        const evidence = buildMovementDeepCaptureFaceEvidence({
          camera,
          capturedAt: Date.now(),
          faceResults: { ...refinedResult, faceLandmarks: [mappedLandmarks] },
          sourceTimestampMs: 0,
        });
        if (!evidence) throw new Error("The refined face did not satisfy the evidence contract.");
        const blendshapeCount = refinedResult.faceBlendshapes[0]?.categories.length ?? 0;
        const facialTransformCount = evidence.facialTransformationMatrix?.length ?? 0;
        const gazeCount = [evidence.gaze.left, evidence.gaze.right].filter(Boolean).length;
        const passed = coarseResult.faceLandmarks.length === 0 &&
          region.source === "pose-face-fallback" &&
          mappedLandmarks.length === 478 &&
          evidence.irisLandmarkCount === 10 &&
          blendshapeCount > 0 &&
          facialTransformCount === 16 &&
          gazeCount === 2;
        if (!active) return;
        setProof({
          blendshapeCount,
          coarseFaceCount: coarseResult.faceLandmarks.length,
          error: passed ? null : "Coarse detection did not miss, or refined face evidence was incomplete.",
          facialTransformCount,
          gazeCount,
          imagePointCount: mappedLandmarks.length,
          irisPointCount: evidence.irisLandmarkCount,
          landmarks: mappedLandmarks,
          posePointCount: Array.from({ length: 13 }, (_, index) => index).filter(
            (index) => (poseLandmarks[index]?.visibility ?? 0) >= 0.35,
          ).length,
          poseSource,
          roiSource: region.source,
          status: passed ? "passed" : "failed",
        });
      } catch (error) {
        if (!active) return;
        setProof({
          ...INITIAL_STATE,
          error: error instanceof Error ? error.message : "Actual face-model proof failed.",
          status: "failed",
        });
      }
    }

    void run();
    return () => {
      active = false;
      coarseFaceLandmarker?.close();
      faceRefiner?.close();
      poseLandmarker?.close();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.fillStyle = "#090910";
    context.fillRect(0, 0, canvas.width, canvas.height);
    drawMovementFaceOverlay(context, proof.landmarks, canvas.width, canvas.height, "all");
  }, [proof.landmarks]);

  return (
    <div
      className="grid gap-5"
      data-blendshape-count={proof.blendshapeCount}
      data-coarse-face-count={proof.coarseFaceCount}
      data-facial-transform-count={proof.facialTransformCount}
      data-gaze-count={proof.gazeCount}
      data-image-point-count={proof.imagePointCount}
      data-iris-point-count={proof.irisPointCount}
      data-pose-point-count={proof.posePointCount}
      data-pose-source={proof.poseSource}
      data-roi-source={proof.roiSource}
      data-status={proof.status}
      data-testid="actual-face-model-proof"
    >
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Actual face model assertions">
        {[
          ["Full-frame detector (20% source)", proof.status === "loading" ? "RUNNING" : `${proof.coarseFaceCount} faces`],
          ["Fallback refiner", proof.status === "loading" ? "RUNNING" : `${proof.imagePointCount} points`],
          ["Iris and gaze", proof.status === "loading" ? "RUNNING" : `${proof.irisPointCount} / ${proof.gazeCount}`],
          ["Expression / transform", proof.status === "loading" ? "RUNNING" : `${proof.blendshapeCount} / ${proof.facialTransformCount}`],
        ].map(([label, value]) => (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4" key={label}>
            <p className="text-xs uppercase tracking-wide text-white/45">{label}</p>
            <p className="mt-2 text-lg font-semibold text-white">{value}</p>
          </div>
        ))}
      </section>

      <canvas
        aria-label="Actual MediaPipe fallback face overlay"
        className="h-auto w-full rounded-2xl border border-violet-300/25 bg-[#090910]"
        data-testid="actual-face-model-overlay"
        height={600}
        ref={canvasRef}
        width={960}
      />

      <div className={`rounded-2xl border px-5 py-4 text-sm ${
        proof.status === "passed"
          ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
          : proof.status === "failed"
            ? "border-red-300/25 bg-red-300/10 text-red-100"
            : "border-violet-300/25 bg-violet-300/10 text-violet-100"
      }`}>
        {proof.status === "loading"
          ? "Running the real browser-local pose, full-frame face and native-crop face models…"
          : proof.status === "passed"
            ? `PASSED — the 20%-scale full-frame lane returned 0 faces; ${proof.poseSource} drove a ${proof.roiSource} ROI; the real crop refiner recovered ${proof.imagePointCount} face points, ${proof.irisPointCount} iris points, ${proof.gazeCount} gaze vectors, ${proof.blendshapeCount} blendshapes and a ${proof.facialTransformCount}-value transform.`
            : `FAILED — ${proof.error}`}
      </div>
    </div>
  );
}
