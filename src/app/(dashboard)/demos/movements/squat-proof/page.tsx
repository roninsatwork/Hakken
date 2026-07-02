"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import MovementMatchScene from "../[id]/play/_components/MovementMatchScene";
import MovementSourceSkeleton from "../[id]/play/_components/MovementSourceSkeleton";
import VrmAvatar from "../[id]/play/_components/VrmAvatar";
import { buildMovementRetargetSourceModel } from "../_lib/movementRetargeting";
import {
  buildMovementCalibration,
  type MovementTrackingDebugState,
} from "../_lib/movementTrackingCalibration";
import type { VrmHandsPayload, VrmMotionPayload, VrmPoseLandmark } from "../_lib/vrmRigging";

type ProofMode =
  | "far-left-leg-raise"
  | "far-right-leg-raise"
  | "far-squat"
  | "hands-front"
  | "left-leg-raise"
  | "right-leg-raise"
  | "side-bend"
  | "squat"
  | "standing"
  | "upper-body-auto"
  | "upper-body-auto-rejected";

const PROOF_MODES: ProofMode[] = [
  "standing",
  "side-bend",
  "hands-front",
  "squat",
  "far-squat",
  "left-leg-raise",
  "far-left-leg-raise",
  "right-leg-raise",
  "far-right-leg-raise",
  "upper-body-auto",
  "upper-body-auto-rejected",
];

const PROOF_LABELS: Record<ProofMode, string> = {
  "far-left-leg-raise": "Far left leg raise",
  "far-right-leg-raise": "Far right leg raise",
  "far-squat": "Far squat",
  "hands-front": "Hands front",
  "left-leg-raise": "Left leg raise",
  "right-leg-raise": "Right leg raise",
  "side-bend": "Side bend",
  squat: "Squat",
  standing: "Standing",
  "upper-body-auto": "Upper-body auto baseline",
  "upper-body-auto-rejected": "Upper-body auto rejected",
};

function landmark(x: number, y: number, z = 0, visibility = 0.92): VrmPoseLandmark {
  return { x, y, z, visibility };
}

function getBaseProofMode(mode: ProofMode): ProofMode {
  if (mode === "far-squat") return "squat";
  if (mode === "far-left-leg-raise") return "left-leg-raise";
  if (mode === "far-right-leg-raise") return "right-leg-raise";
  if (mode === "upper-body-auto") return "standing";
  if (mode === "upper-body-auto-rejected") return "side-bend";
  return mode;
}

function isFarProofMode(mode: ProofMode) {
  return mode === "far-squat" || mode === "far-left-leg-raise" || mode === "far-right-leg-raise";
}

function scaleLandmarkAround(
  point: VrmPoseLandmark,
  centerX: number,
  centerY: number,
  scale: number,
  visibility: number,
): VrmPoseLandmark {
  return landmark(
    centerX + (point.x - centerX) * scale,
    centerY + (point.y - centerY) * scale,
    (point.z ?? 0) * scale,
    visibility,
  );
}

function makeProofPose(mode: ProofMode): VrmPoseLandmark[] {
  const pose = Array.from({ length: 33 }, () => landmark(0.5, 0.5, 0, 0.9));
  const baseMode = getBaseProofMode(mode);
  const isSquatMode = baseMode === "squat";

  pose[0] = landmark(0.5, isSquatMode ? 0.3 : 0.24);
  pose[7] = landmark(0.46, isSquatMode ? 0.32 : 0.27);
  pose[8] = landmark(0.54, isSquatMode ? 0.32 : 0.27);
  pose[11] = landmark(0.38, isSquatMode ? 0.46 : 0.42);
  pose[12] = landmark(0.62, isSquatMode ? 0.46 : 0.42);
  pose[13] = landmark(0.32, isSquatMode ? 0.58 : 0.56);
  pose[14] = landmark(0.68, isSquatMode ? 0.58 : 0.56);
  pose[15] = landmark(0.3, isSquatMode ? 0.72 : 0.7);
  pose[16] = landmark(0.7, isSquatMode ? 0.72 : 0.7);

  if (baseMode === "side-bend") {
    pose[0] = landmark(0.66, 0.25);
    pose[7] = landmark(0.62, 0.27);
    pose[8] = landmark(0.7, 0.27);
    pose[11] = landmark(0.54, 0.42);
    pose[12] = landmark(0.76, 0.42);
    pose[13] = landmark(0.58, 0.56);
    pose[14] = landmark(0.8, 0.56);
    pose[15] = landmark(0.62, 0.7);
    pose[16] = landmark(0.84, 0.7);
  }

  if (baseMode === "hands-front") {
    pose[13] = landmark(0.37, 0.5, -0.08);
    pose[14] = landmark(0.63, 0.5, -0.08);
    pose[15] = landmark(0.46, 0.48, -0.16);
    pose[16] = landmark(0.54, 0.48, -0.16);
  }

  if (isSquatMode) {
    pose[0] = landmark(0.5, 0.34);
    pose[7] = landmark(0.46, 0.35);
    pose[8] = landmark(0.54, 0.35);
    pose[11] = landmark(0.38, 0.5);
    pose[12] = landmark(0.62, 0.5);
    pose[13] = landmark(0.35, 0.56, -0.08);
    pose[14] = landmark(0.65, 0.56, -0.08);
    pose[15] = landmark(0.43, 0.5, -0.18, 0.42);
    pose[16] = landmark(0.57, 0.52, -0.18, 0.42);
    pose[23] = landmark(0.42, 0.78);
    pose[24] = landmark(0.58, 0.78);
    pose[25] = landmark(0.34, 0.76);
    pose[26] = landmark(0.66, 0.76);
    pose[27] = landmark(0.42, 0.96);
    pose[28] = landmark(0.58, 0.96);
    pose[29] = landmark(0.4, 0.97);
    pose[30] = landmark(0.6, 0.97);
    pose[31] = landmark(0.36, 0.98);
    pose[32] = landmark(0.64, 0.98);
  } else if (baseMode === "left-leg-raise") {
    pose[23] = landmark(0.42, 0.66);
    pose[24] = landmark(0.58, 0.66);
    pose[25] = landmark(0.42, 0.52);
    pose[26] = landmark(0.56, 0.8);
    pose[27] = landmark(0.38, 0.66);
    pose[28] = landmark(0.56, 0.94);
    pose[29] = landmark(0.38, 0.67);
    pose[30] = landmark(0.57, 0.95);
    pose[31] = landmark(0.36, 0.68);
    pose[32] = landmark(0.58, 0.96);
  } else if (baseMode === "right-leg-raise") {
    pose[23] = landmark(0.42, 0.66);
    pose[24] = landmark(0.58, 0.66);
    pose[25] = landmark(0.44, 0.8);
    pose[26] = landmark(0.58, 0.52);
    pose[27] = landmark(0.44, 0.94);
    pose[28] = landmark(0.62, 0.66);
    pose[29] = landmark(0.43, 0.95);
    pose[30] = landmark(0.62, 0.67);
    pose[31] = landmark(0.42, 0.96);
    pose[32] = landmark(0.64, 0.68);
  } else {
    pose[23] = landmark(0.42, 0.66);
    pose[24] = landmark(0.58, 0.66);
    pose[25] = landmark(0.44, 0.8);
    pose[26] = landmark(0.56, 0.8);
    pose[27] = landmark(0.44, 0.94);
    pose[28] = landmark(0.56, 0.94);
    pose[29] = landmark(0.43, 0.95);
    pose[30] = landmark(0.57, 0.95);
    pose[31] = landmark(0.42, 0.96);
    pose[32] = landmark(0.58, 0.96);
  }

  if (isFarProofMode(mode)) {
    return pose.map((point, index) => {
      const lowerBodyPoint = index >= 23 && index <= 32;
      const visibility = lowerBodyPoint ? 0.4 : 0.56;

      return scaleLandmarkAround(point, 0.5, 0.62, 0.78, visibility);
    });
  }

  if (mode === "upper-body-auto" || mode === "upper-body-auto-rejected") {
    return pose.map((point, index) => {
      const lowerBodyPoint = index >= 25 && index <= 32;
      return lowerBodyPoint ? { ...point, visibility: 0.1 } : point;
    });
  }

  return pose;
}

function makeProofHandLandmarks(wrist: VrmPoseLandmark): VrmPoseLandmark[] {
  return Array.from({ length: 21 }, (_, index) => {
    if (index === 0) return wrist;

    const finger = index % 4;
    const row = Math.floor(index / 4);
    return landmark(
      wrist.x + (finger - 1.5) * 0.006,
      wrist.y - row * 0.006,
      (wrist.z ?? 0) - 0.01,
      wrist.visibility,
    );
  });
}

function makeProofHands(mode: ProofMode): VrmHandsPayload | undefined {
  if (mode !== "squat" && mode !== "far-squat") return undefined;

  const leftWrist = mode === "far-squat"
    ? scaleLandmarkAround(landmark(0.44, 0.42, -0.2), 0.5, 0.62, 0.78, 0.68)
    : landmark(0.44, 0.42, -0.2, 0.94);
  const rightWrist = mode === "far-squat"
    ? scaleLandmarkAround(landmark(0.56, 0.44, -0.2), 0.5, 0.62, 0.78, 0.68)
    : landmark(0.56, 0.44, -0.2, 0.94);

  return {
    left: { landmarks: makeProofHandLandmarks(leftWrist) },
    right: { landmarks: makeProofHandLandmarks(rightWrist) },
  };
}

function toProofMode(value: string | null): ProofMode {
  return PROOF_MODES.find((mode) => mode === value) ?? "squat";
}

export default function MovementSquatProofPage() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<ProofMode>(() => toProofMode(searchParams.get("mode")));
  const trackingDebugRef = useRef<MovementTrackingDebugState | null>(null);
  const [debugState, setDebugState] = useState<MovementTrackingDebugState | null>(null);
  const neutralPose = makeProofPose("standing");
  const trackingCalibration = buildMovementCalibration({ poseLandmarks: neutralPose });
  const retargetSourceModel = buildMovementRetargetSourceModel({ poseLandmarks: neutralPose });
  const usesExplicitCalibration = mode !== "upper-body-auto" && mode !== "upper-body-auto-rejected";
  const livePoseRef = useRef<VrmMotionPayload>({
    landmarks: makeProofPose(mode),
    hands: makeProofHands(mode),
  });

  useEffect(() => {
    livePoseRef.current = {
      landmarks: makeProofPose(mode),
      hands: makeProofHands(mode),
    };
  }, [mode]);

  useEffect(() => {
    setMode(toProofMode(searchParams.get("mode")));
  }, [searchParams]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setDebugState(trackingDebugRef.current);
    }, 160);

    return () => window.clearInterval(intervalId);
  }, []);

  const changeMode = (nextMode: ProofMode) => {
    setMode(nextMode);
    window.history.replaceState(null, "", `?mode=${nextMode}`);
  };

  return (
    <div className="fixed inset-0 z-[9999] overflow-hidden bg-[#07070b]">
      <style>{`nextjs-portal { display: none !important; }`}</style>
      <MovementMatchScene>
        <VrmAvatar
          landmarksRef={livePoseRef}
          positionOffset={[4.2, 0, 0]}
          isPlayer
          isPlaying
          trackingCalibration={usesExplicitCalibration ? trackingCalibration : null}
          trackingDebugRef={trackingDebugRef}
          retargetSourceModel={retargetSourceModel}
          vrmUrl="/models/VIPE_Hero__949.vrm"
          name="Player avatar"
        />
        <MovementSourceSkeleton
          color="#a8d5ba"
          landmarksRef={livePoseRef}
          positionOffset={[-4.2, 0, 0]}
        />
      </MovementMatchScene>

      <div className="pointer-events-none absolute left-[264px] top-6 z-20 w-[400px] rounded-lg border border-white/10 bg-[#111018]/90 p-5 shadow-[0_30px_90px_rgba(0,0,0,0.35)] backdrop-blur">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#f6ccbe]">Avatar Proof</p>
        <h1 className="mt-2 text-2xl font-black text-white">Synthetic player camera poses</h1>
        <p className="mt-3 text-sm leading-6 text-white/62">
          Left is the camera skeleton. Right is the player avatar using the same live-avatar path as practice.
        </p>
        <div className="pointer-events-auto mt-5 grid grid-cols-2 gap-3">
          {PROOF_MODES.map((proofMode) => (
            <button
              key={proofMode}
              className={`rounded-lg px-3 py-3 text-sm font-bold transition ${
                mode === proofMode
                  ? "bg-[#f6ccbe] text-[#17131d]"
                  : "border border-white/15 bg-white/5 text-white"
              }`}
              data-testid={`proof-mode-${proofMode}`}
              onClick={() => changeMode(proofMode)}
            >
              {PROOF_LABELS[proofMode]}
            </button>
          ))}
        </div>
        <div className="mt-4 space-y-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#a8d5ba]">
          <p data-testid="proof-current-mode">Current proof state: {PROOF_LABELS[mode]}</p>
          <p data-testid="proof-debug-baseline">Baseline: {debugState?.fallbacks.baseline ?? "pending"}</p>
          <p data-testid="proof-debug-spine">Spine: {debugState?.fallbacks.spine ?? "pending"}</p>
          <p data-testid="proof-debug-arm-depth">Arms: {debugState?.fallbacks.armDepth ?? "pending"}</p>
          <p data-testid="proof-debug-owners">Owners: {debugState?.fallbacks.owners ?? "pending"}</p>
        </div>
      </div>
    </div>
  );
}
