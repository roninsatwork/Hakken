#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as THREE from "three";
import { inspectReplayTelemetryFrames } from "./lib/replay-proof-identity.mjs";
import {
  RENDERED_FIDELITY_POLICY,
  RENDERED_FIDELITY_POLICY_VERSION,
  classifyRenderedFidelitySample,
  contiguousRenderedFidelityRuns,
  isRenderedFidelityRepairOutcome,
} from "../../src/lib/movements/renderedFidelityPolicy.mjs";

const SEGMENT_THRESHOLDS = {
  leftFoot: 0.2,
  leftLowerArm: 0.12,
  leftShin: 0.15,
  leftThigh: 0.15,
  leftUpperArm: 0.12,
  rightFoot: 0.2,
  rightLowerArm: 0.12,
  rightShin: 0.15,
  rightThigh: 0.15,
  rightUpperArm: 0.12,
};
const AXIAL_THRESHOLD = 0.12;
const CONFIDENT_SOURCE_THRESHOLD = 0.45;
const PERSISTENT_DIVERGENCE_FRAMES = 3;

function parseArgs(argv) {
  const args = { out: "", strict: false, telemetry: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--telemetry") args.telemetry = argv[++index] || "";
    else if (arg === "--out") args.out = argv[++index] || "";
    else if (arg === "--strict") args.strict = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return args;
}

function round(value) {
  return Number.isFinite(value) ? Number(value.toFixed(4)) : null;
}

function vectorAngle(left, right) {
  if (!left || !right) return null;
  const leftLength = Math.hypot(left.x, left.y, left.z);
  const rightLength = Math.hypot(right.x, right.y, right.z);
  if (leftLength <= 0.000001 || rightLength <= 0.000001) return null;
  const dot = Math.max(-1, Math.min(1, (
    left.x * right.x + left.y * right.y + left.z * right.z
  ) / (leftLength * rightLength)));
  return Math.acos(dot);
}

function axialAngleDifference(axis, left, right) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  const difference = left - right;
  if (axis === "yaw") return Math.abs(Math.atan2(Math.sin(difference), Math.cos(difference)));
  return Math.abs(difference);
}

function signedAxialDifference(axis, left, right) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  const difference = left - right;
  return axis === "yaw" ? Math.atan2(Math.sin(difference), Math.cos(difference)) : difference;
}

function telemetryQuaternion(value) {
  return [value?.x, value?.y, value?.z, value?.w].every(Number.isFinite)
    ? new THREE.Quaternion(value.x, value.y, value.z, value.w).normalize()
    : null;
}

function headQuaternionAxisError(avatarHead, axis) {
  const targetWorldQuaternion = telemetryQuaternion(avatarHead?.targetWorldQuaternion);
  const appliedWorldQuaternion = telemetryQuaternion(avatarHead?.appliedWorldQuaternion);
  if (!targetWorldQuaternion || !appliedWorldQuaternion) return null;

  const delta = targetWorldQuaternion.clone().invert().multiply(appliedWorldQuaternion).normalize();
  if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w);
  const rotationError = new THREE.Euler().setFromQuaternion(delta, "YXZ");
  return Math.abs({
    pitch: rotationError.x,
    roll: rotationError.z,
    yaw: rotationError.y,
  }[axis]);
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function persistentDivergenceRuns(samples, threshold) {
  const runs = [];
  samples
    .filter((sample) => sample.difference > threshold)
    .sort((left, right) => left.frameIndex - right.frameIndex)
    .forEach((sample) => {
      const currentRun = runs.at(-1);
      if (!currentRun || sample.frameIndex !== currentRun.at(-1).frameIndex + 1) {
        runs.push([sample]);
        return;
      }
      currentRun.push(sample);
    });
  return runs.filter((run) => run.length >= PERSISTENT_DIVERGENCE_FRAMES);
}

function axialDifferences(frame) {
  const instructor = frame.avatars?.instructor;
  const player = frame.avatars?.player;
  if (!instructor || !player) return [];
  const entries = [];
  for (const axis of ["pitch", "roll", "yaw"]) {
    const renderedKey = `appliedWorld${axis[0].toUpperCase()}${axis.slice(1)}`;
    const left = Number.isFinite(instructor.avatarHead?.[renderedKey])
      ? instructor.avatarHead[renderedKey]
      : instructor.headApplied?.[axis];
    const right = Number.isFinite(player.avatarHead?.[renderedKey])
      ? player.avatarHead[renderedKey]
      : player.headApplied?.[axis];
    const difference = axialAngleDifference(axis, left, right);
    if (difference !== null) {
      entries.push({ axis: `head.${axis}`, difference });
    }
  }
  for (const bone of ["chest", "upperChest"]) {
    for (const axis of ["x", "y", "z"]) {
      const left = instructor.avatarSpine?.[bone]?.[axis];
      const right = player.avatarSpine?.[bone]?.[axis];
      if (Number.isFinite(left) && Number.isFinite(right)) {
        entries.push({ axis: `${bone}.${axis}`, difference: Math.abs(left - right) });
      }
    }
  }
  return entries;
}

function sourceFidelitySummary({ failures, frames }) {
  const roles = Object.fromEntries(["instructor", "player"].map((role) => {
    const segments = Object.fromEntries(RENDERED_FIDELITY_POLICY.requiredUpperBodySegments.map((segment) => {
      const samples = frames.map((frame, frameArrayIndex) => {
        const debug = frame.avatars?.[role];
        const visualSegment = debug?.avatarVisual?.segments?.[segment];
        const usesSpineDriveOwner = segment === "spine" &&
          typeof debug?.spineDrive?.owner === "string" &&
          debug.spineDrive.owner.includes("spine-");
        const isHeldSpineOwner = usesSpineDriveOwner &&
          debug.spineDrive.owner.endsWith("-spine-held");
        const previousDebug = frameArrayIndex > 0
          ? frames[frameArrayIndex - 1]?.avatars?.[role]
          : undefined;
        const spineRotationErrors = usesSpineDriveOwner
          ? ["spine", "chest", "upperChest"].flatMap((bone) => (
              ["x", "y", "z"].flatMap((axis) => {
                // A held drive emits zero rotations as a no-op command. Its
                // rendered target is the prior pose, not those command zeros.
                const target = isHeldSpineOwner
                  ? previousDebug?.avatarSpine?.[bone]?.[axis]
                  : debug.spineDrive?.targetRotations?.[bone]?.[axis];
                const rendered = debug.avatarSpine?.[bone]?.[axis];
                return Number.isFinite(target) && Number.isFinite(rendered)
                  ? [Math.abs(target - rendered)]
                  : [];
              })
            ))
          : [];
        const confidence = usesSpineDriveOwner ? debug.spineDrive?.confidence : visualSegment?.confidence;
        const error = usesSpineDriveOwner
          ? spineRotationErrors.length > 0 ? Math.max(...spineRotationErrors) : null
          : visualSegment?.sourceError;
        return {
          confidence,
          error,
          frameIndex: frame.frameIndex,
          outcome: classifyRenderedFidelitySample({
            confidence,
            error,
            hasProof: usesSpineDriveOwner ? spineRotationErrors.length === 9 : Boolean(visualSegment),
          }),
        };
      });
      const sorted = [...samples].sort((left, right) => (right.error ?? -1) - (left.error ?? -1));
      const repairSamples = samples.filter((sample) => isRenderedFidelityRepairOutcome(sample.outcome));
      const proofLimitedSamples = samples.filter((sample) => sample.outcome === "proof-limited");
      const severeSamples = samples.filter((sample) => sample.outcome === "severe");
      const blockedSamples = samples.filter((sample) => sample.outcome === "blocked");
      const repairRequiredSamples = samples.filter((sample) => sample.outcome === "repair-required");
      if (severeSamples.length > 0) {
        failures.push({ code: "three-party-source-fidelity-severe", count: severeSamples.length, role, segment });
      }
      if (blockedSamples.length > 0) {
        failures.push({ code: "three-party-source-fidelity-blocked", count: blockedSamples.length, role, segment });
      }
      if (repairRequiredSamples.length > 0) {
        failures.push({ code: "three-party-source-fidelity-repair-required", count: repairRequiredSamples.length, role, segment });
      }
      if (proofLimitedSamples.length > 0) {
        failures.push({ code: "three-party-source-fidelity-proof-limited", count: proofLimitedSamples.length, role, segment });
      }
      return [segment, {
        maxError: round(sorted[0]?.error),
        proofLimitedSampleCount: proofLimitedSamples.length,
        repairSampleCount: repairSamples.length,
        sampleCount: samples.length,
        sustainedRepairRuns: contiguousRenderedFidelityRuns(
          samples,
          (sample) => isRenderedFidelityRepairOutcome(sample.outcome),
        )
          .filter((run) => run.length >= RENDERED_FIDELITY_POLICY.sustainedRepairFrames)
          .slice(0, 10)
          .map((run) => ({
            frameEnd: run.at(-1).frameIndex,
            frameStart: run[0].frameIndex,
            length: run.length,
            maxError: round(Math.max(...run.map((sample) => sample.error ?? 0))),
          })),
        worstFrames: sorted.slice(0, 20).map((sample) => ({
          confidence: round(sample.confidence),
          error: round(sample.error),
          frameIndex: sample.frameIndex,
          outcome: sample.outcome,
        })),
      }];
    }));
    const head = Object.fromEntries(["pitch", "roll", "yaw"].map((axis) => {
      const targetKey = `bone${axis[0].toUpperCase()}${axis.slice(1)}`;
      const renderedKey = `appliedWorld${axis[0].toUpperCase()}${axis.slice(1)}`;
      const calibrationFrame = frames.find((frame) => {
        const debug = frame.avatars?.[role];
        return (
          (debug?.headRaw?.confidence ?? 0) >= RENDERED_FIDELITY_POLICY.trustworthyConfidence &&
          Number.isFinite(debug?.avatarHead?.[targetKey]) &&
          Number.isFinite(debug?.avatarHead?.[renderedKey])
        );
      });
      const calibrationDebug = calibrationFrame?.avatars?.[role];
      const baselineOffset = signedAxialDifference(
        axis,
        calibrationDebug?.avatarHead?.[renderedKey],
        calibrationDebug?.avatarHead?.[targetKey],
      );
      const samples = frames.flatMap((frame) => {
        const debug = frame.avatars?.[role];
        const target = debug?.avatarHead?.[targetKey];
        const rendered = debug?.avatarHead?.[renderedKey];
        const quaternionError = headQuaternionAxisError(debug?.avatarHead, axis);
        const error = Number.isFinite(quaternionError)
          ? quaternionError
          : Number.isFinite(target) && Number.isFinite(rendered) && Number.isFinite(baselineOffset)
            ? Math.abs(signedAxialDifference(axis, rendered - baselineOffset, target))
            : null;
        if (!Number.isFinite(error)) return [];
        const confidence = debug?.headRaw?.confidence;
        return [{
          confidence,
          error,
          frameIndex: frame.frameIndex,
          outcome: classifyRenderedFidelitySample({ confidence, error }),
        }];
      });
      const sorted = [...samples].sort((left, right) => right.error - left.error);
      for (const [outcome, code] of [
        ["severe", "three-party-source-head-fidelity-severe"],
        ["blocked", "three-party-source-head-fidelity-blocked"],
        ["repair-required", "three-party-source-head-fidelity-repair-required"],
      ]) {
        const count = samples.filter((sample) => sample.outcome === outcome).length;
        if (count > 0) failures.push({ code, count, role, axis });
      }
      return [axis, {
        calibrationFrameIndex: calibrationFrame?.frameIndex ?? null,
        calibrationOffsetRadians: round(baselineOffset),
        maxErrorRadians: round(sorted[0]?.error),
        repairSampleCount: samples.filter((sample) => isRenderedFidelityRepairOutcome(sample.outcome)).length,
        sampleCount: samples.length,
        thresholdRadians: RENDERED_FIDELITY_POLICY.headAxisMaxRadians,
        worstFrames: sorted.slice(0, 20).map((sample) => ({
          errorRadians: round(sample.error),
          frameIndex: sample.frameIndex,
          outcome: sample.outcome,
        })),
      }];
    }));
    return [role, { head, segments }];
  }));
  return {
    policy: RENDERED_FIDELITY_POLICY,
    policyVersion: RENDERED_FIDELITY_POLICY_VERSION,
    roles,
  };
}

function semanticAcceptanceSummary({ failures, frames }) {
  const roles = Object.fromEntries(["instructor", "player"].map((role) => {
    const directionSummary = Object.fromEntries(["torso", "headChain"].map((segment) => {
      const samples = frames.flatMap((frame) => {
        const semantic = frame.avatars?.[role]?.avatarVisual?.semantic;
        if (!semantic?.evidenceVersion) return [];
        const value = semantic[segment];
        return [{
          confidence: value?.confidence,
          error: value?.sourceError,
          frameIndex: frame.frameIndex,
          outcome: classifyRenderedFidelitySample({
            confidence: value?.confidence,
            error: value?.sourceError,
            hasProof: Boolean(value?.sourceDirection && value?.renderedDirection),
          }),
        }];
      });
      const diverged = samples.filter((sample) => isRenderedFidelityRepairOutcome(sample.outcome));
      const proofLimited = samples.filter((sample) => sample.outcome === "proof-limited");
      if (diverged.length > 0) {
        failures.push({
          code: segment === "torso"
            ? "three-party-rendered-torso-source-diverged"
            : "three-party-rendered-head-chain-source-diverged",
          count: diverged.length,
          role,
        });
      }
      if (proofLimited.length > 0) {
        failures.push({
          code: "three-party-rendered-semantic-proof-limited",
          count: proofLimited.length,
          role,
          segment,
        });
      }
      return [segment, {
        divergedSampleCount: diverged.length,
        limitedReviewSampleCount: samples.filter((sample) => sample.outcome === "limited-review").length,
        proofLimitedSampleCount: proofLimited.length,
        sampleCount: samples.length,
        sourceLimitedSampleCount: samples.filter((sample) => sample.outcome === "source-limited").length,
        worstFrames: [...samples]
          .sort((left, right) => (right.error ?? -1) - (left.error ?? -1))
          .slice(0, 20),
      }];
    }));

    const feet = frames.flatMap((frame) => {
      const debug = frame.avatars?.[role];
      const semantic = debug?.avatarVisual?.semantic;
      if (!semantic?.evidenceVersion) return [];
      const threshold = Number.isFinite(semantic.avatarScale)
        ? semantic.avatarScale * RENDERED_FIDELITY_POLICY.contactClearanceMaxAvatarScaleRatio
        : null;
      return ["left", "right"].flatMap((side) => {
        const foot = semantic.feet?.[side];
        if (!foot?.sourcePlanted) return [];
        const hasProof = threshold !== null && [
          foot.heelClearance,
          foot.soleClearance,
          foot.toeBaseClearance,
          foot.toeEndClearance,
          foot.planeAngleRadians,
        ].every(Number.isFinite);
        const rawDiverged = hasProof && (
          foot.heelClearance > threshold ||
          foot.toeBaseClearance > threshold ||
          foot.toeEndClearance > threshold ||
          Math.abs(foot.planeAngleRadians) > RENDERED_FIDELITY_POLICY.footPlaneMaxRadians ||
          debug.retarget?.[`${side}FootContact`] === false
        );
        const outcome = classifyRenderedFidelitySample({
          confidence: foot.sourceConfidence,
          error: rawDiverged ? RENDERED_FIDELITY_POLICY.blockAbove + 0.001 : 0,
          hasProof,
        });
        return [{
          confidence: foot.sourceConfidence,
          diverged: isRenderedFidelityRepairOutcome(outcome) && rawDiverged,
          frameIndex: frame.frameIndex,
          hasProof,
          outcome,
          side,
        }];
      });
    });
    const divergedFeet = feet.filter((sample) => sample.diverged);
    const proofLimitedFeet = feet.filter((sample) => sample.outcome === "proof-limited");
    if (divergedFeet.length > 0) {
      failures.push({
        code: "three-party-rendered-planted-foot-contact-contradiction",
        count: divergedFeet.length,
        role,
      });
    }
    if (proofLimitedFeet.length > 0) {
      failures.push({
        code: "three-party-rendered-semantic-proof-limited",
        count: proofLimitedFeet.length,
        role,
        segment: "feet",
      });
    }
    return [role, {
      ...directionSummary,
      feet: {
        divergedSampleCount: divergedFeet.length,
        limitedReviewSampleCount: feet.filter((sample) => sample.outcome === "limited-review").length,
        proofLimitedSampleCount: proofLimitedFeet.length,
        sampleCount: feet.length,
        sourceLimitedSampleCount: feet.filter((sample) => sample.outcome === "source-limited").length,
      },
    }];
  }));
  return { roles };
}

export function analyzeThreePartyReplay({ telemetry }) {
  const frameInspection = inspectReplayTelemetryFrames({
    frameCount: telemetry.frameCount,
    frames: telemetry.frames,
    hasDebug: () => true,
    isRendered: (frame) => Boolean(
      frame?.avatars?.instructor?.avatarVisual && frame?.avatars?.player?.avatarVisual,
    ),
  });
  const frames = frameInspection.uniqueExpectedFrames;
  const missingRoleFrames = Array.from({ length: frameInspection.frameCount }, (_, frameIndex) => {
    const frame = frames.find((candidate) => candidate.frameIndex === frameIndex);
    return !frame?.avatars?.instructor?.avatarVisual || !frame?.avatars?.player?.avatarVisual
      ? frameIndex
      : null;
  }).filter((frameIndex) => frameIndex !== null);
  const failures = [];
  if (frameInspection.frameCount === 0) {
    failures.push({ code: "three-party-frame-count-invalid", count: 1 });
  }
  if (telemetry.proofMode !== "three-party-mirror") {
    failures.push({ code: "three-party-proof-mode-missing", count: frameInspection.frameCount });
  }
  if (frameInspection.missingFrameIndexes.length > 0) {
    failures.push({ code: "three-party-rendered-frames-missing", count: frameInspection.missingFrameIndexes.length });
  }
  if (frameInspection.duplicateFrameIndexes.length > 0) {
    failures.push({ code: "three-party-frame-index-duplicate", count: frameInspection.duplicateFrameIndexes.length });
  }
  if (frameInspection.unexpectedFrameIndexes.length > 0 || frameInspection.invalidFrameEntries.length > 0) {
    failures.push({
      code: "three-party-frame-index-invalid",
      count: frameInspection.unexpectedFrameIndexes.length + frameInspection.invalidFrameEntries.length,
    });
  }
  if (frameInspection.missingRenderedFrameIndexes.length > 0) {
    failures.push({
      code: "three-party-rendered-frame-telemetry-missing",
      count: frameInspection.missingRenderedFrameIndexes.length,
    });
  }
  if (
    typeof telemetry.missingFrameCount === "number" &&
    telemetry.missingFrameCount !== frameInspection.missingFrameIndexes.length
  ) {
    failures.push({ code: "three-party-frame-accounting-mismatch", count: 1 });
  }
  if (missingRoleFrames.length > 0) {
    failures.push({ code: "three-party-rendered-role-missing", count: missingRoleFrames.length });
  }
  const sourceFidelity = sourceFidelitySummary({ failures, frames });
  const semanticAcceptance = semanticAcceptanceSummary({ failures, frames });

  const segments = Object.fromEntries(Object.entries(SEGMENT_THRESHOLDS).map(([segment, threshold]) => {
    const samples = [];
    let confidentSampleCount = 0;
    for (const frame of frames) {
      const instructor = frame.avatars?.instructor?.avatarVisual?.segments?.[segment];
      const player = frame.avatars?.player?.avatarVisual?.segments?.[segment];
      if (!instructor || !player) continue;
      const difference = vectorAngle(instructor.direction, player.direction);
      if (difference === null) continue;
      if (Math.min(instructor.confidence ?? 0, player.confidence ?? 0) >= CONFIDENT_SOURCE_THRESHOLD) {
        confidentSampleCount += 1;
      }
      samples.push({ difference, frameIndex: frame.frameIndex });
    }
    const sortedSamples = [...samples].sort((left, right) => left.difference - right.difference);
    const p95 = percentile(sortedSamples.map((sample) => sample.difference), 0.95);
    const persistentRuns = persistentDivergenceRuns(samples, threshold);
    const missingSampleCount = Math.max(0, frameInspection.frameCount - samples.length);
    if (missingSampleCount > 0) {
      failures.push({ code: "three-party-segment-render-missing", count: missingSampleCount, segment });
    } else if (p95 !== null && p95 > threshold) {
      failures.push({ code: "three-party-segment-diverged", count: samples.filter((sample) => sample.difference > threshold).length, segment });
    }
    if (persistentRuns.length > 0) {
      failures.push({
        code: "three-party-segment-sustained-divergence",
        count: persistentRuns.reduce((sum, run) => sum + run.length, 0),
        segment,
      });
    }
    return [segment, {
      confidentSampleCount,
      maxDifference: round(sortedSamples.at(-1)?.difference),
      meanDifference: round(samples.reduce((sum, sample) => sum + sample.difference, 0) / Math.max(samples.length, 1)),
      missingSampleCount,
      p95Difference: round(p95),
      persistentDivergenceRuns: persistentRuns.slice(0, 10).map((run) => ({
        frameEnd: run.at(-1).frameIndex,
        frameStart: run[0].frameIndex,
        length: run.length,
        maxDifference: round(Math.max(...run.map((sample) => sample.difference))),
      })),
      sampleCount: samples.length,
      threshold,
      worstFrames: sortedSamples.slice(-20).reverse().map((sample) => ({
        difference: round(sample.difference),
        frameIndex: sample.frameIndex,
      })),
    }];
  }));

  const axialSamples = frames.flatMap((frame) => axialDifferences(frame).map((sample) => ({
    ...sample,
    frameIndex: frame.frameIndex,
  })));
  const sortedAxialSamples = [...axialSamples].sort((left, right) => left.difference - right.difference);
  const axialP95 = percentile(sortedAxialSamples.map((sample) => sample.difference), 0.95);
  if (axialP95 !== null && axialP95 > AXIAL_THRESHOLD) {
    failures.push({
      code: "three-party-axial-diverged",
      count: axialSamples.filter((sample) => sample.difference > AXIAL_THRESHOLD).length,
    });
  }
  const axialSamplesByAxis = new Map();
  axialSamples.forEach((sample) => {
    const samples = axialSamplesByAxis.get(sample.axis) ?? [];
    samples.push(sample);
    axialSamplesByAxis.set(sample.axis, samples);
  });
  const persistentAxialRuns = Array.from(axialSamplesByAxis.entries()).flatMap(([axis, samples]) => (
    persistentDivergenceRuns(samples, AXIAL_THRESHOLD).map((run) => ({ axis, run }))
  ));
  if (persistentAxialRuns.length > 0) {
    failures.push({
      code: "three-party-axial-sustained-divergence",
      count: persistentAxialRuns.reduce((sum, entry) => sum + entry.run.length, 0),
    });
  }
  const missingAxialFrameCount = Math.max(0, frameInspection.frameCount - new Set(
    axialSamples.map((sample) => sample.frameIndex),
  ).size);
  if (missingAxialFrameCount > 0) {
    failures.push({ code: "three-party-axial-render-missing", count: missingAxialFrameCount });
  }

  return {
    axial: {
      p95Difference: round(axialP95),
      persistentDivergenceRuns: persistentAxialRuns.slice(0, 20).map(({ axis, run }) => ({
        axis,
        frameEnd: run.at(-1).frameIndex,
        frameStart: run[0].frameIndex,
        length: run.length,
        maxDifference: round(Math.max(...run.map((sample) => sample.difference))),
      })),
      sampleCount: axialSamples.length,
      threshold: AXIAL_THRESHOLD,
      worstFrames: sortedAxialSamples.slice(-20).reverse().map((sample) => ({
        ...sample,
        difference: round(sample.difference),
      })),
    },
    failures,
    frameAccounting: {
      compared: frameInspection.compared,
      complete: frameInspection.complete,
      expected: frameInspection.frameCount,
      missing: frameInspection.missingFrameIndexes.length,
      rendered: frameInspection.rendered,
    },
    frameCount: frameInspection.frameCount,
    frameIntegrity: {
      duplicateFrameIndexes: frameInspection.duplicateFrameIndexes,
      invalidFrameEntries: frameInspection.invalidFrameEntries,
      missingFrameIndexes: frameInspection.missingFrameIndexes,
      missingRenderedFrameIndexes: frameInspection.missingRenderedFrameIndexes,
      unexpectedFrameIndexes: frameInspection.unexpectedFrameIndexes,
    },
    missingFrameCount: frameInspection.missingFrameIndexes.length,
    missingRoleFrameCount: missingRoleFrames.length,
    missingRoleFrames: missingRoleFrames.slice(0, 100),
    proofMode: telemetry.proofMode ?? "unknown",
    segments,
    semanticAcceptance,
    sessionId: telemetry.sessionId,
    sourceFidelity,
    status: failures.length === 0 ? "passed" : "blocked",
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Analyze actual instructor/player rendered agreement from a three-party Replay capture.");
    return;
  }
  if (!args.telemetry) throw new Error("Pass --telemetry <file>.");
  const telemetry = JSON.parse(await readFile(path.resolve(args.telemetry), "utf8"));
  const report = analyzeThreePartyReplay({ telemetry });
  if (args.out) await writeFile(path.resolve(args.out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (args.strict && report.status !== "passed") process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
