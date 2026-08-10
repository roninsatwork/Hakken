"use client";

import { useEffect, useState, type MutableRefObject, type RefObject } from "react";
import type { MovementMotionFrame } from "../../../_lib/movementMotionFrame";
import { getMovementCameraConfidenceRecoveryCue } from "../../../_lib/movementSourceFrame";
import { getMovementStartReadinessMessage } from "../../../_lib/movementSetupRecoveryCue";
import {
  buildMovementSpineModel,
  evaluateMovementSpineReadiness,
} from "../../../_lib/movementSpineMetrics";
import {
  getMovementTruthSkeletonRecoveryCue,
  summarizeMovementTruthSkeleton,
} from "../../../_lib/movementTruthSkeleton";
import type {
  MovementCalibration,
  MovementTrackingDebugState,
} from "../../../_lib/movementTrackingCalibration";
import { getMovementTrackingHealthSummary } from "../../../_lib/movementTrackingCalibration";
import {
  MOVEMENT_MINT,
  MOVEMENT_SALMON,
} from "../../../_lib/movementPalette";

type MovementTrackingDebugOverlayProps = {
  calibration: MovementCalibration | null;
  debugRole?: "instructor" | "player";
  debugRef: MutableRefObject<MovementTrackingDebugState | null>;
  isEnabled: boolean;
  motionFrameRef?: RefObject<MovementMotionFrame | null | undefined>;
  placement?: "left" | "right";
  title?: string;
};

function formatAngle(value?: number) {
  if (value === undefined) return "0.00";
  return value.toFixed(2);
}

function formatConfidence(value?: number) {
  return (value ?? 0).toFixed(2);
}

function formatPercent(value?: number) {
  return `${Math.round((value ?? 0) * 100)}%`;
}

function formatCameraValue(value?: number) {
  return value === undefined ? "?" : Math.round(value).toString();
}

function formatBoundsValue(value?: number) {
  return value === undefined || !Number.isFinite(value) ? "?" : value.toFixed(2);
}

function formatAge(updatedAt?: number, now?: number) {
  if (updatedAt === undefined || now === undefined || now <= 0) return "waiting";
  return `${Math.max(0, (now - updatedAt) / 1000).toFixed(1)}s`;
}

function formatMotionContacts(motionFrame: MovementMotionFrame) {
  const activeContacts = motionFrame.contacts
    .filter((contact) => contact.state !== "rejected")
    .map((contact) => `${contact.point}:${contact.surface}`);

  if (activeContacts.length === 0) return "none";
  return activeContacts.slice(0, 3).join(" ");
}

function getHealthToneClass(level: string) {
  if (level === "ready") return "border-green-300/30 bg-green-400/15 text-green-100";
  if (level === "watch") return "border-yellow-300/30 bg-yellow-400/15 text-yellow-100";
  return "border-red-300/30 bg-red-400/15 text-red-100";
}

export default function MovementTrackingDebugOverlay({
  calibration,
  debugRole,
  debugRef,
  isEnabled,
  motionFrameRef,
  placement = "left",
  title = "Posture Diagnostics",
}: MovementTrackingDebugOverlayProps) {
  const [debugState, setDebugState] = useState<MovementTrackingDebugState | null>(null);
  const [motionFrame, setMotionFrame] = useState<MovementMotionFrame | null>(null);
  const [debugNow, setDebugNow] = useState(0);

  useEffect(() => {
    if (!isEnabled) return undefined;

    const interval = window.setInterval(() => {
      setDebugState(debugRef.current);
      setMotionFrame(motionFrameRef?.current ?? null);
      setDebugNow(performance.now());
    }, 250);

    return () => window.clearInterval(interval);
  }, [debugRef, isEnabled, motionFrameRef]);

  if (!isEnabled) return null;

  const confidence = debugState?.bodyConfidence;
  const camera = debugState?.camera;
  const poseBounds = debugState?.poseBounds;
  const retarget = debugState?.retarget;
  const healthSummary = getMovementTrackingHealthSummary(debugState, { now: debugNow });
  const healthToneClass = getHealthToneClass(healthSummary.level);
  const calibrationQuality = calibration?.quality ?? debugState?.calibrationQuality;
  const spineReadiness = motionFrame
    ? evaluateMovementSpineReadiness(buildMovementSpineModel(motionFrame.source.landmarks?.pose))
    : null;
  const cameraConfidence = motionFrame?.cameraConfidence ?? motionFrame?.source.cameraConfidence ?? null;
  const cameraRecoveryCue = cameraConfidence
    ? getMovementCameraConfidenceRecoveryCue(cameraConfidence)
    : null;
  const startReadiness = motionFrame?.source.startReadiness ?? null;
  const startReadinessMessage = startReadiness
    ? getMovementStartReadinessMessage({
        cameraRecoveryCue,
        readiness: startReadiness,
      })
    : null;
  const truthSummary = motionFrame
    ? summarizeMovementTruthSkeleton(motionFrame.truthSkeleton)
    : null;
  const truthRecoveryCue = truthSummary
    ? getMovementTruthSkeletonRecoveryCue(truthSummary)
    : null;
  const confidenceRows = [
    ["Torso", confidence?.torso],
    ["L arm", Math.max(confidence?.leftWrist ?? 0, confidence?.leftHand ?? 0)],
    ["R arm", Math.max(confidence?.rightWrist ?? 0, confidence?.rightHand ?? 0)],
    ["L foot", confidence?.leftFoot],
    ["R foot", confidence?.rightFoot],
  ] as const;
  const placementClass = placement === "right" ? "right-6" : "left-6";

  return (
    <aside
      className={`pointer-events-none absolute ${placementClass} top-28 z-20 max-h-[calc(100vh-9rem)] w-80 overflow-y-auto rounded-2xl border border-[${MOVEMENT_MINT}]/20 bg-black/75 p-4 text-xs text-[#edf7f0] shadow-2xl backdrop-blur-2xl`}
      data-movement-avatar-expressions={JSON.stringify(debugState?.avatarExpressions ?? null)}
      data-movement-avatar-head={JSON.stringify(debugState?.avatarHead ?? null)}
      data-movement-avatar-hands={JSON.stringify(debugState?.avatarHands ?? null)}
      data-movement-avatar-role={debugRole}
      data-movement-avatar-root={JSON.stringify(debugState?.avatarRoot ?? null)}
      data-movement-avatar-spine={JSON.stringify(debugState?.avatarSpine ?? null)}
      data-movement-avatar-visual={JSON.stringify(debugState?.avatarVisual ?? null)}
      data-movement-head-applied={JSON.stringify(debugState?.headApplied ?? null)}
      data-movement-side-map={motionFrame
        ? `${motionFrame.display.mirrorMode} L->${motionFrame.display.sideMap.sourceLeft} R->${motionFrame.display.sideMap.sourceRight}`
        : "waiting"}
      data-movement-spine-drive={JSON.stringify(debugState?.spineDrive ?? null)}
    >
      <div className="flex items-center justify-between gap-3">
        <div className={`font-black uppercase tracking-[0.18em] text-[${MOVEMENT_MINT}]`}>{title}</div>
        <div className={`rounded-full border px-2 py-1 font-mono text-[10px] ${healthToneClass}`}>
          {healthSummary.label}
        </div>
      </div>

      <div className={`mt-3 rounded-xl border p-3 ${healthToneClass}`}>
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] opacity-75">
              Readiness
            </div>
            <div className="font-mono text-3xl font-black leading-none">
              {healthSummary.score}%
            </div>
          </div>
          <div className="text-right font-mono text-[11px] opacity-80">
            <div>Age {formatAge(debugState?.updatedAt, debugNow)}</div>
            <div>Cal {calibrationQuality !== undefined ? calibrationQuality.toFixed(2) : "none"}</div>
          </div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/30">
          <div
            className="h-full rounded-full bg-current transition-[width]"
            style={{ width: `${healthSummary.score}%` }}
          />
        </div>
        <div className="mt-2 font-mono text-[11px] font-bold">
          Tune: {healthSummary.primaryAction}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] text-white/70">
        <span>Profile</span>
        <span className="truncate">{debugState?.profileName ?? "waiting"}</span>
        <span>Head source</span>
        <span>{debugState?.headRaw.source ?? "none"}</span>
        <span>Pitch raw/applied</span>
        <span>
          {formatAngle(debugState?.headRaw.pitch)} / {formatAngle(debugState?.headApplied.pitch)}
        </span>
        <span>Yaw raw/applied</span>
        <span>
          {formatAngle(debugState?.headRaw.yaw)} / {formatAngle(debugState?.headApplied.yaw)}
        </span>
        <span>Roll raw/applied</span>
        <span>
          {formatAngle(debugState?.headRaw.roll)} / {formatAngle(debugState?.headApplied.roll)}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-5 gap-1 font-mono text-[10px] text-white/75">
        {confidenceRows.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1">
            <div className="text-white/40">{label}</div>
            <div className="text-white">{formatConfidence(value)}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-2 font-mono text-[11px] text-white/65">
        <div className={`mb-1 font-black uppercase tracking-[0.16em] text-[${MOVEMENT_MINT}]`}>
          Camera / Bounds
        </div>
        <div>
          Camera {formatCameraValue(camera?.trackWidth ?? camera?.videoWidth)}x{formatCameraValue(camera?.trackHeight ?? camera?.videoHeight)}
          {camera?.aspectRatio ? ` ar ${camera.aspectRatio.toFixed(2)}` : ""}
          {camera?.frameRate ? ` ${camera.frameRate.toFixed(0)}fps` : ""}
        </div>
        <div>
          Video {formatCameraValue(camera?.videoWidth)}x{formatCameraValue(camera?.videoHeight)}
        </div>
        <div>
          Bounds x {formatBoundsValue(poseBounds?.minX)}..{formatBoundsValue(poseBounds?.maxX)}
          {" "}y {formatBoundsValue(poseBounds?.minY)}..{formatBoundsValue(poseBounds?.maxY)}
          {" "}out {poseBounds?.outOfFrameCount ?? 0}
        </div>
        {camera?.deviceLabel ? (
          <div className="truncate text-white/45">{camera.deviceLabel}</div>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg border border-white/10 bg-white/5 p-2 font-mono text-[11px] text-white/60">
        <span>Baseline</span>
        <span>{debugState?.fallbacks.baseline ?? "waiting"}</span>
        <span>Head</span>
        <span>{debugState?.fallbacks.head ?? "waiting"}</span>
        <span>Head motion</span>
        <span>{debugState?.fallbacks.headMotion ?? "waiting"}</span>
        <span>Arms</span>
        <span>
          {debugState?.fallbacks.leftArm ?? "waiting"} / {debugState?.fallbacks.rightArm ?? "waiting"}
        </span>
        <span>Knees</span>
        <span>
          {debugState?.fallbacks.leftKnee ?? "waiting"} / {debugState?.fallbacks.rightKnee ?? "waiting"}
        </span>
        <span>Feet</span>
        <span>
          {debugState?.fallbacks.leftFoot ?? "waiting"} / {debugState?.fallbacks.rightFoot ?? "waiting"}
        </span>
        <span>Lower body</span>
        <span>{debugState?.fallbacks.lowerBody ?? "waiting"}</span>
        <span>Floor</span>
        <span>{debugState?.fallbacks.floor ?? "waiting"}</span>
        <span>Orientation</span>
        <span>
          {debugState?.bodyOrientation
            ? `${debugState.bodyOrientation.orientation} ${debugState.bodyOrientation.status}`
            : "waiting"}
        </span>
        <span>Support</span>
        <span>{debugState?.bodySupport?.supportLabel ?? "waiting"}</span>
        <span>Support intent</span>
        <span>{debugState?.supportIntent?.label ?? "waiting"}</span>
        <span>Constraint</span>
        <span>{debugState?.supportConstraint?.status ?? "waiting"}</span>
        <span>Pose</span>
        <span>{debugState?.exercisePose?.label ?? "waiting"}</span>
        <span>Transition</span>
        <span>{debugState?.exerciseTransition?.label ?? "waiting"}</span>
        <span>Owners</span>
        <span>{debugState?.fallbacks.owners ?? "waiting"}</span>
        <span>Retarget</span>
        <span>{debugState?.fallbacks.retarget ?? "waiting"}</span>
      </div>

      {retarget ? (
        <div className={`mt-3 rounded-lg border border-[${MOVEMENT_MINT}]/20 bg-[${MOVEMENT_MINT}]/10 p-2 font-mono text-[11px] text-white/70`}>
          <div className={`mb-2 font-black uppercase tracking-[0.16em] text-[${MOVEMENT_MINT}]`}>
            Retarget Metrics
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <span>Squat / hip</span>
            <span>{retarget.squatDepth.toFixed(2)} / {retarget.hipDrop.toFixed(2)}</span>
            <span>Knee lift L/R</span>
            <span>{retarget.leftKneeLift.toFixed(2)} / {retarget.rightKneeLift.toFixed(2)}</span>
            <span>Feet contact</span>
            <span>{retarget.leftFootContact ? "L" : "-"}{retarget.rightFootContact ? "R" : "-"}</span>
            <span>Upper bones</span>
            <span>{retarget.appliedUpperBody}/{retarget.totalUpperBody}</span>
            <span>Lower bones</span>
            <span>{retarget.appliedLowerBody}/{retarget.totalLowerBody}</span>
            <span>Root / IK</span>
            <span>{retarget.visualRootDrop.toFixed(2)} / {retarget.plantedSquatIkDepth.toFixed(2)}</span>
            <span>Foot lock</span>
            <span>{retarget.footLockStrength.toFixed(2)} c{retarget.footLockCorrection.toFixed(2)} d{retarget.footLockDrift.toFixed(2)}</span>
          </div>
        </div>
      ) : null}

      {motionFrameRef ? (
        <div className={`mt-3 rounded-lg border border-[${MOVEMENT_SALMON}]/20 bg-[${MOVEMENT_SALMON}]/10 p-2 font-mono text-[11px] text-white/70`}>
          <div className={`mb-2 font-black uppercase tracking-[0.16em] text-[${MOVEMENT_SALMON}]`}>
            Motion Frame
          </div>
          {motionFrame ? (
            <>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <span>Readability</span>
                <span>
                  {motionFrame.readability.state} {formatPercent(motionFrame.readability.confidence)}
                </span>
                <span>Movement</span>
                <span>
                  raw {motionFrame.readability.rawMovementStrength.toFixed(2)}
                  {" "}show {motionFrame.readability.displayedMovementStrength.toFixed(2)}
                </span>
                <span>Owners</span>
                <span>
                  lower {motionFrame.owners.lowerBody}; feet {motionFrame.owners.feet}
                </span>
                <span>Root / spine</span>
                <span>
                  {motionFrame.owners.root}; {motionFrame.owners.spine}
                </span>
                <span>Side map</span>
                <span>
                  {motionFrame.display.mirrorMode}
                  {" "}L-&gt;{motionFrame.display.sideMap.sourceLeft}
                  {" "}R-&gt;{motionFrame.display.sideMap.sourceRight}
                </span>
                <span>Spine readiness</span>
                <span>
                  {spineReadiness?.status ?? "blocked"} {spineReadiness?.score ?? 0}%
                </span>
                <span>Start gate</span>
                <span
                  className="truncate"
                  data-testid="movement-debug-start-gate"
                  title={startReadinessMessage ?? undefined}
                >
                  {startReadiness
                    ? `${startReadiness.state} - ${startReadinessMessage ?? "waiting"}`
                    : "waiting"}
                </span>
                <span>Start blockers</span>
                <span className="truncate">
                  {startReadiness?.blockedReasons.length
                    ? startReadiness.blockedReasons.join(", ")
                    : startReadiness?.promptEvents.length
                      ? startReadiness.promptEvents.join(", ")
                      : "none"}
                </span>
                <span>Camera cue</span>
                <span className="truncate">
                  {cameraRecoveryCue?.message ?? "none"}
                </span>
                <span>Support</span>
                <span>
                  {motionFrame.support.supportLabel || motionFrame.support.primarySurface}
                  {" "} / {motionFrame.supportConstraint.status}
                </span>
                <span>Contacts</span>
                <span className="truncate">{formatMotionContacts(motionFrame)}</span>
                <span>Truth</span>
                <span>
                  hips {formatPercent(motionFrame.truthSkeleton.segmentConfidence.hips)}
                  {" "}feet {formatPercent(Math.min(
                    motionFrame.truthSkeleton.segmentConfidence.leftFoot,
                    motionFrame.truthSkeleton.segmentConfidence.rightFoot,
                  ))}
                </span>
                <span>Truth readiness</span>
                <span>
                  {truthSummary?.state ?? "blocked"} {truthSummary?.weakestGroup ?? "torso"} {formatPercent(truthSummary?.weakestScore)}
                </span>
                <span>Truth cue</span>
                <span className="truncate">
                  {truthRecoveryCue?.message ?? "none"}
                </span>
                <span>Source</span>
                <span>
                  {motionFrame.source.sourceOrigin} / {motionFrame.source.sourceStatus}
                </span>
              </div>
              {motionFrame.readability.reasons.length > 0 ? (
                <div className="mt-2 truncate text-white/45">
                  {motionFrame.readability.reasons.join(", ")}
                </div>
              ) : null}
            </>
          ) : (
            <div className="text-white/55">
              waiting for shared motion-frame input
            </div>
          )}
        </div>
      ) : null}

      <div className={`mt-3 rounded-lg border border-[${MOVEMENT_MINT}]/20 bg-[${MOVEMENT_MINT}]/10 p-2 text-[11px] text-[#edf7f0]`}>
        <div className={`mb-1 font-black uppercase tracking-[0.16em] text-[${MOVEMENT_MINT}]`}>
          Health
        </div>
        {healthSummary.warnings.map((warning) => (
          <div key={warning}>{warning}</div>
        ))}
      </div>
    </aside>
  );
}
