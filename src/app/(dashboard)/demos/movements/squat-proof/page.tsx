"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import MovementMatchScene from "../[id]/play/_components/MovementMatchScene";
import MovementSourceSkeleton from "../[id]/play/_components/MovementSourceSkeleton";
import VrmAvatar from "../[id]/play/_components/VrmAvatar";
import {
  makeMovementAvatarProofMotionPayload,
  makeMovementAvatarProofPose,
  MOVEMENT_AVATAR_PROOF_LABELS,
  MOVEMENT_AVATAR_PROOF_MODES,
  toMovementAvatarProofMode,
  type MovementAvatarProofMode,
} from "../_lib/movementAvatarProofFixtures";
import { buildMovementRetargetSourceModel } from "../_lib/movementRetargeting";
import {
  buildMovementCalibration,
  type MovementTrackingDebugState,
} from "../_lib/movementTrackingCalibration";
import type { VrmMotionPayload } from "../_lib/vrmRigging";

function toProofMode(value: string | null): MovementAvatarProofMode {
  return toMovementAvatarProofMode(value) ?? "squat";
}

export default function MovementSquatProofPage() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<MovementAvatarProofMode>(() => toProofMode(searchParams.get("mode")));
  const trackingDebugRef = useRef<MovementTrackingDebugState | null>(null);
  const [debugState, setDebugState] = useState<MovementTrackingDebugState | null>(null);
  const neutralPose = makeMovementAvatarProofPose("standing");
  const trackingCalibration = buildMovementCalibration({ poseLandmarks: neutralPose });
  const retargetSourceModel = buildMovementRetargetSourceModel({ poseLandmarks: neutralPose });
  const usesExplicitCalibration = mode !== "upper-body-auto" && mode !== "upper-body-auto-rejected";
  const livePoseRef = useRef<VrmMotionPayload>({
    ...makeMovementAvatarProofMotionPayload(mode),
  });

  useEffect(() => {
    trackingDebugRef.current = null;
    setDebugState(null);
    livePoseRef.current = {
      ...makeMovementAvatarProofMotionPayload(mode),
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

  const changeMode = (nextMode: MovementAvatarProofMode) => {
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
          {MOVEMENT_AVATAR_PROOF_MODES.map((proofMode) => (
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
              {MOVEMENT_AVATAR_PROOF_LABELS[proofMode]}
            </button>
          ))}
        </div>
        <div className="mt-4 space-y-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#a8d5ba]">
          <p data-testid="proof-current-mode">Current proof state: {MOVEMENT_AVATAR_PROOF_LABELS[mode]}</p>
          <p data-testid="proof-debug-baseline">Baseline: {debugState?.fallbacks.baseline ?? "pending"}</p>
          <p data-testid="proof-debug-spine">Spine: {debugState?.fallbacks.spine ?? "pending"}</p>
          <p data-testid="proof-debug-arm-depth">Arms: {debugState?.fallbacks.armDepth ?? "pending"}</p>
          <p data-testid="proof-debug-owners">Owners: {debugState?.fallbacks.owners ?? "pending"}</p>
        </div>
      </div>
    </div>
  );
}
