import {
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import {
  MOVEMENT_PLAYER_INPUT_CONTRACT,
} from "../../src/app/(dashboard)/demos/movements/_lib/movementPlayerInputContract";
import {
  resolveMovementDeepCaptureHandRefinementRegion,
  resolveMovementDeepCaptureRefinementInputSize,
  selectMovementDeepCaptureHandRefinementCandidate,
} from "../../src/app/(dashboard)/demos/movements/_lib/movementDeepCaptureRefinement";
import { drawMovementHandOverlay } from "../../src/app/(dashboard)/demos/movements/_lib/movementSkeleton";

declare global {
  interface Window {
    __runMovementHandFallbackProof?: (imageDataUrl: string) => Promise<unknown>;
  }
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
}

function canvasForImage(image: HTMLImageElement, scale = 1) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(2, Math.round(image.naturalHeight * scale));
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

window.__runMovementHandFallbackProof = async (imageDataUrl) => {
  const image = await loadImage(imageDataUrl);
  const sourceCanvas = canvasForImage(image);
  const detector = MOVEMENT_PLAYER_INPUT_CONTRACT.detector;
  const vision = await FilesetResolver.forVisionTasks(detector.wasmUrl);
  const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: { delegate: "GPU", modelAssetPath: detector.poseModelUrl },
    minPoseDetectionConfidence: detector.poseConfidence,
    minPosePresenceConfidence: detector.poseConfidence,
    numPoses: 1,
    runningMode: "IMAGE",
  });
  const coarseHandLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: { delegate: "GPU", modelAssetPath: detector.handModelUrl },
    minHandDetectionConfidence: detector.handConfidence,
    minHandPresenceConfidence: detector.handConfidence,
    numHands: 2,
    runningMode: "IMAGE",
  });
  const cropHandRefiner = await HandLandmarker.createFromOptions(vision, {
    baseOptions: { delegate: "GPU", modelAssetPath: detector.handModelUrl },
    minHandDetectionConfidence: detector.handConfidence,
    minHandPresenceConfidence: detector.handConfidence,
    numHands: 2,
    runningMode: "IMAGE",
  });

  try {
    const coarseAttempts = [0.2, 0.15, 0.1, 0.075, 0.05].map((scale) => {
      const canvas = canvasForImage(image, scale);
      const result = coarseHandLandmarker.detect(canvas);
      return { handCount: result.landmarks.length, height: canvas.height, scale, width: canvas.width };
    });
    const coarseMiss = coarseAttempts.find((attempt) => attempt.handCount === 0) ?? null;
    const poseResult = poseLandmarker.detect(sourceCanvas);
    const poseLandmarks = (poseResult.landmarks[0] ?? []) as NormalizedLandmark[];
    const refinementRegion = resolveMovementDeepCaptureHandRefinementRegion({
      camera: { frameHeight: image.naturalHeight, frameWidth: image.naturalWidth },
      poseLandmarks,
      primaryCrop: null,
      side: "left",
    });
    if (!refinementRegion) throw new Error("Pose did not produce a trustworthy anatomical-left fallback ROI.");

    const inputSize = resolveMovementDeepCaptureRefinementInputSize({
      crop: refinementRegion.crop,
      minimumShortEdgePixels: 192,
    });
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = inputSize.width;
    cropCanvas.height = inputSize.height;
    cropCanvas.getContext("2d")!.drawImage(
      image,
      refinementRegion.crop.x,
      refinementRegion.crop.y,
      refinementRegion.crop.width,
      refinementRegion.crop.height,
      0,
      0,
      inputSize.width,
      inputSize.height,
    );
    const refinementResult = cropHandRefiner.detect(cropCanvas);
    const candidate = selectMovementDeepCaptureHandRefinementCandidate({
      poseLandmarks,
      refinementRegion,
      result: refinementResult,
      side: "left",
    });
    const mappedLandmarks = candidate?.mappedLandmarks ?? [];
    const mappedWorldLandmarks = candidate?.worldLandmarks ?? [];
    const proofCanvas = document.querySelector<HTMLCanvasElement>("#proof-canvas")!;
    proofCanvas.width = image.naturalWidth;
    proofCanvas.height = image.naturalHeight;
    const ctx = proofCanvas.getContext("2d")!;
    ctx.save();
    ctx.translate(proofCanvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(image, 0, 0);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 5;
    ctx.setLineDash([14, 9]);
    ctx.strokeRect(
      proofCanvas.width - refinementRegion.crop.x - refinementRegion.crop.width,
      refinementRegion.crop.y,
      refinementRegion.crop.width,
      refinementRegion.crop.height,
    );
    ctx.restore();
    const beforeOverlay = ctx.getImageData(0, 0, proofCanvas.width, proofCanvas.height).data;
    drawMovementHandOverlay(ctx, {
      left: mappedLandmarks.length === 21 ? { landmarks: mappedLandmarks } : null,
    }, proofCanvas.width, proofCanvas.height);
    const afterOverlay = ctx.getImageData(0, 0, proofCanvas.width, proofCanvas.height).data;
    let overlayChangedPixelCount = 0;
    for (let index = 0; index < afterOverlay.length; index += 4) {
      if (
        beforeOverlay[index] !== afterOverlay[index] ||
        beforeOverlay[index + 1] !== afterOverlay[index + 1] ||
        beforeOverlay[index + 2] !== afterOverlay[index + 2] ||
        beforeOverlay[index + 3] !== afterOverlay[index + 3]
      ) overlayChangedPixelCount += 1;
    }

    const missingCanvas = canvasForImage(image);
    const missingContext = missingCanvas.getContext("2d")!;
    const beforeMissing = missingContext.getImageData(0, 0, missingCanvas.width, missingCanvas.height).data;
    drawMovementHandOverlay(missingContext, {
      left: { landmarks: mappedLandmarks.slice(0, 20) },
    }, missingCanvas.width, missingCanvas.height);
    const afterMissing = missingContext.getImageData(0, 0, missingCanvas.width, missingCanvas.height).data;
    let missingEvidenceChangedPixelCount = 0;
    for (let index = 0; index < afterMissing.length; index += 4) {
      if (
        beforeMissing[index] !== afterMissing[index] ||
        beforeMissing[index + 1] !== afterMissing[index + 1] ||
        beforeMissing[index + 2] !== afterMissing[index + 2] ||
        beforeMissing[index + 3] !== afterMissing[index + 3]
      ) missingEvidenceChangedPixelCount += 1;
    }
    const passed = Boolean(
      coarseMiss &&
      refinementRegion.source === "pose-hand-fallback" &&
      mappedLandmarks.length === 21 &&
      mappedWorldLandmarks.length === 21 &&
      overlayChangedPixelCount > 500 &&
      missingEvidenceChangedPixelCount === 0,
    );

    const report = {
      assignment: candidate?.assignment.assignment ?? null,
      coarseAttempts,
      coarseMiss,
      crop: refinementRegion.crop,
      detectorHandedness: candidate?.assignment.detector ?? null,
      fallbackSource: refinementRegion.source,
      mappedLandmarks,
      mappedImageLandmarkCount: mappedLandmarks.length,
      mappedWorldLandmarks,
      mappedWorldLandmarkCount: mappedWorldLandmarks.length,
      missingEvidenceChangedPixelCount,
      overlayChangedPixelCount,
      passed,
      poseLandmarkCount: poseLandmarks.length,
      poseLeftHandVisibility: [15, 17, 19, 21].map((index) => poseLandmarks[index]?.visibility ?? 0),
      refinedCandidateCount: refinementResult.landmarks.length,
      refinementInput: inputSize,
      source: { height: image.naturalHeight, width: image.naturalWidth },
    };
    document.querySelector("#proof-status")!.textContent = passed
      ? "PASS — coarse miss recovered 21 real browser landmarks"
      : "FAIL — fallback did not recover complete evidence";
    document.querySelector("#proof-report")!.textContent = JSON.stringify({
      ...report,
      mappedLandmarks: `${mappedLandmarks.length} browser image landmarks retained in report.json`,
      mappedWorldLandmarks: `${mappedWorldLandmarks.length} browser world landmarks retained in report.json`,
    }, null, 2);
    return report;
  } finally {
    poseLandmarker.close();
    coarseHandLandmarker.close();
    cropHandRefiner.close();
  }
};
