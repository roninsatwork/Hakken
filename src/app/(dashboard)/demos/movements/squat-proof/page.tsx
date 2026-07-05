"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import MovementMatchScene from "../[id]/play/_components/MovementMatchScene";
import MovementSourceSkeleton from "../[id]/play/_components/MovementSourceSkeleton";
import VrmAvatar from "../[id]/play/_components/VrmAvatar";
import {
  makeMovementAvatarProofFaceLandmarks,
  makeMovementAvatarProofMotionPayload,
  makeMovementAvatarProofPose,
  makeMovementAvatarProofRootBaselinePayload,
  MOVEMENT_AVATAR_PROOF_LABELS,
  MOVEMENT_AVATAR_PROOF_MODES,
  toMovementAvatarProofMode,
  type MovementAvatarProofMode,
} from "../_lib/movementAvatarProofFixtures";
import { buildMovementRetargetSourceModel } from "../_lib/movementRetargeting";
import {
  buildMovementCalibration,
  type MovementCalibration,
  type MovementHandsForConfidence,
  type MovementTrackingDebugState,
  type TrackingLandmark,
} from "../_lib/movementTrackingCalibration";
import {
  buildMovementSourceFrame,
} from "../_lib/movementSourceFrame";
import {
  resolveMovementMotionFrame,
  type MovementMotionFrame,
} from "../_lib/movementMotionFrame";
import {
  prepareVrmSolverInput,
  type VrmMotionPayload,
} from "../_lib/vrmRigging";
import {
  createMovementAvatarSetupState,
  resolveMovementAvatarSetup,
  type MovementAvatarSetupState,
} from "../_lib/movementAvatarSetup";

function toProofMode(value: string | null): MovementAvatarProofMode {
  return toMovementAvatarProofMode(value) ?? "squat";
}

function buildProofMotionFrame({
  payload,
  retargetSourceModel,
  setupState,
  trackingCalibration,
  usesExplicitCalibration,
}: {
  payload: VrmMotionPayload;
  retargetSourceModel: ReturnType<typeof buildMovementRetargetSourceModel>;
  setupState: MovementAvatarSetupState;
  trackingCalibration: ReturnType<typeof buildMovementCalibration>;
  usesExplicitCalibration: boolean;
}): {
  activeCalibration: MovementCalibration | null;
  motionFrame: MovementMotionFrame | null;
  setupState: MovementAvatarSetupState;
} {
  const poseLandmarks = (payload.pose ?? payload.landmarks ?? []) as TrackingLandmark[];
  if (poseLandmarks.length < 33) {
    return {
      activeCalibration: null,
      motionFrame: null,
      setupState,
    };
  }
  const displayPreparedInput = prepareVrmSolverInput({
    rawLandmarks: poseLandmarks,
    payload,
    isPlayer: true,
    isPlaying: true,
    mirrorForDisplay: true,
  });
  const hasWorldPose = payload.worldLandmarks?.length === 33;
  const setupTarget = resolveMovementAvatarSetup({
    faceLandmarks: payload.faceLandmarks,
    hands: payload.hands as MovementHandsForConfidence | undefined,
    isLivePlayer: true,
    manualCalibration: usesExplicitCalibration ? trackingCalibration : null,
    poseLandmarks: displayPreparedInput.imageLandmarks,
    previousState: setupState,
    worldPoseLandmarks: hasWorldPose ? displayPreparedInput.solverLandmarks : undefined,
  });
  const activeCalibration = setupTarget.activeCalibration;

  return {
    activeCalibration,
    motionFrame: resolveMovementMotionFrame({
      avatarRole: "player",
      calibration: activeCalibration,
      displayPoseLandmarks: displayPreparedInput.imageLandmarks,
      displayWorldPoseLandmarks: hasWorldPose ? displayPreparedInput.solverLandmarks : [],
      mirrorMode: "facing-player",
      retargetSourceModel,
      sourceFrame: buildMovementSourceFrame({
        hands: payload.hands as MovementHandsForConfidence | undefined,
        poseLandmarks,
        requirements: {
          calibrationQuality: activeCalibration?.quality ?? null,
        },
        sourceOrigin: "synthetic-proof",
        sourceStatus: "synthetic",
        worldPoseLandmarks: (payload.worldLandmarks ?? []) as TrackingLandmark[],
      }),
    }),
    setupState: setupTarget.nextState,
  };
}

export default function MovementSquatProofPage() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<MovementAvatarProofMode>(() => toProofMode(searchParams.get("mode")));
  const trackingDebugRef = useRef<MovementTrackingDebugState | null>(null);
  const [debugState, setDebugState] = useState<MovementTrackingDebugState | null>(null);
  const [rootProofArmedMode, setRootProofArmedMode] = useState<MovementAvatarProofMode | null>(null);
  const neutralPose = useMemo(() => makeMovementAvatarProofPose("standing"), []);
  const trackingCalibration = useMemo(() => buildMovementCalibration({
    faceLandmarks: makeMovementAvatarProofFaceLandmarks("standing"),
    poseLandmarks: neutralPose,
  }), [neutralPose]);
  const retargetSourceModel = useMemo(
    () => buildMovementRetargetSourceModel({ poseLandmarks: neutralPose }),
    [neutralPose],
  );
  const usesExplicitCalibration = mode !== "upper-body-auto" && mode !== "upper-body-auto-rejected";
  const isRootMotionProofMode = mode.startsWith("root-");
  const initialProofPayload = useMemo(
    () => (
      isRootMotionProofMode
        ? makeMovementAvatarProofRootBaselinePayload()
        : makeMovementAvatarProofMotionPayload(mode)
    ),
    [isRootMotionProofMode, mode],
  );
  const initialMotionFrameResult = useMemo(() => buildProofMotionFrame({
    payload: initialProofPayload,
    retargetSourceModel,
    setupState: createMovementAvatarSetupState(),
    trackingCalibration,
    usesExplicitCalibration,
  }), [initialProofPayload, retargetSourceModel, trackingCalibration, usesExplicitCalibration]);
  const livePoseRef = useRef<VrmMotionPayload>({
    ...initialProofPayload,
  });
  const proofSetupStateRef = useRef<MovementAvatarSetupState>(initialMotionFrameResult.setupState);
  const motionFrameRef = useRef<MovementMotionFrame | null>(initialMotionFrameResult.motionFrame);

  useEffect(() => {
    trackingDebugRef.current = null;
    setDebugState(null);
    proofSetupStateRef.current = createMovementAvatarSetupState();
    const nextPayload = isRootMotionProofMode
      ? makeMovementAvatarProofRootBaselinePayload()
      : makeMovementAvatarProofMotionPayload(mode);
    livePoseRef.current = { ...nextPayload };
    const motionFrameResult = buildProofMotionFrame({
      payload: nextPayload,
      retargetSourceModel,
      setupState: proofSetupStateRef.current,
      trackingCalibration,
      usesExplicitCalibration,
    });
    proofSetupStateRef.current = motionFrameResult.setupState;
    motionFrameRef.current = motionFrameResult.motionFrame;
    setRootProofArmedMode(isRootMotionProofMode ? mode : null);
    return undefined;
  }, [isRootMotionProofMode, mode, retargetSourceModel, trackingCalibration, usesExplicitCalibration]);

  useEffect(() => {
    let active = true;
    let animationFrameId = 0;

    const updateProofMotionFrame = () => {
      if (!active) return;
      const motionFrameResult = buildProofMotionFrame({
        payload: livePoseRef.current,
        retargetSourceModel,
        setupState: proofSetupStateRef.current,
        trackingCalibration,
        usesExplicitCalibration,
      });
      proofSetupStateRef.current = motionFrameResult.setupState;
      motionFrameRef.current = motionFrameResult.motionFrame;
      animationFrameId = window.requestAnimationFrame(updateProofMotionFrame);
    };

    updateProofMotionFrame();

    return () => {
      active = false;
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [retargetSourceModel, trackingCalibration, usesExplicitCalibration]);

  useEffect(() => {
    if (!isRootMotionProofMode || rootProofArmedMode !== mode) return undefined;
    if (debugState?.avatarRoot?.source !== "world-landmarks") return undefined;

    const timeoutId = window.setTimeout(() => {
      const nextPayload = makeMovementAvatarProofMotionPayload(mode);
      livePoseRef.current = { ...nextPayload };
      const motionFrameResult = buildProofMotionFrame({
        payload: nextPayload,
        retargetSourceModel,
        setupState: proofSetupStateRef.current,
        trackingCalibration,
        usesExplicitCalibration,
      });
      proofSetupStateRef.current = motionFrameResult.setupState;
      motionFrameRef.current = motionFrameResult.motionFrame;
      setRootProofArmedMode(null);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [
    debugState?.avatarRoot?.source,
    isRootMotionProofMode,
    mode,
    retargetSourceModel,
    rootProofArmedMode,
    trackingCalibration,
    usesExplicitCalibration,
  ]);

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
          key={mode}
          landmarksRef={livePoseRef}
          motionFrameRef={motionFrameRef}
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

      <div className="pointer-events-none absolute left-[264px] top-6 z-20 max-h-[calc(100vh-48px)] w-[400px] overflow-y-auto rounded-lg border border-white/10 bg-[#111018]/90 p-5 shadow-[0_30px_90px_rgba(0,0,0,0.35)] backdrop-blur">
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
          <p data-testid="proof-debug-head">
            Head: tracking pitch {debugState?.avatarHead?.trackingPitch.toFixed(2) ?? "pending"} · bone pitch {debugState?.avatarHead?.bonePitch.toFixed(2) ?? "pending"} · tracking yaw {debugState?.avatarHead?.trackingYaw.toFixed(2) ?? "pending"} · bone yaw {debugState?.avatarHead?.boneYaw.toFixed(2) ?? "pending"} · applied local {debugState?.avatarHead?.appliedLocalPitch.toFixed(2) ?? "pending"}
          </p>
          <p data-testid="proof-debug-leg-raise">
            Leg raise: raw {debugState?.avatarLegRaise?.rawLeftDepth.toFixed(2) ?? "pending"} / {debugState?.avatarLegRaise?.rawRightDepth.toFixed(2) ?? "pending"} · applied {debugState?.avatarLegRaise?.appliedDepth.toFixed(2) ?? "pending"} · side {debugState?.avatarLegRaise?.side ?? "--"} · hold {debugState?.avatarLegRaise?.holdActive ? "yes" : "no"} · expires {debugState?.avatarLegRaise?.expiresInMs ?? "--"}ms
          </p>
          <p data-testid="proof-debug-root">
            Root: yaw target {debugState?.avatarRoot?.targetYaw.toFixed(2) ?? "pending"} · applied {debugState?.avatarRoot?.appliedYaw.toFixed(2) ?? "pending"} · x target {debugState?.avatarRoot?.targetX.toFixed(2) ?? "pending"} · applied {debugState?.avatarRoot?.appliedX.toFixed(2) ?? "pending"} · z target {debugState?.avatarRoot?.targetZ.toFixed(2) ?? "pending"} · applied {debugState?.avatarRoot?.appliedZ.toFixed(2) ?? "pending"} · {debugState?.avatarRoot?.source ?? "pending"}
          </p>
        </div>
      </div>
    </div>
  );
}
