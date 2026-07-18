import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { applyMovementAvatarEndFrameRuntime } from "./movementAvatarFrameApplication";
import { makeMovementAvatarProofPose } from "./movementAvatarProofFixtures";
import { buildMovementGamePlayerRuntimeFrame } from "./movementGameRuntimeFrame";
import { buildMovementReplaySessionFromRecording } from "./movementRecordingReplay";
import { buildMovementDeepCaptureProfile } from "./movementFrameCodec";
import type { MovementFramePayload } from "./movementTypes";
import type {
  VrmBlendshapeCategory,
  VrmHandsPayload,
  VrmMotionPayload,
} from "./vrmRigging";
import { prepareVrmSolverInput } from "./vrmRigging";

const evidenceProvenance = {
  ageMs: 0,
  confidence: 0.95,
  inferenceTimestampMs: 1_000,
  origin: "model-estimated" as const,
  sourceTimestampMs: 1_000,
};
const derivedProvenance = { ...evidenceProvenance, origin: "derived" as const };

function handLandmarks(offset: number) {
  return Array.from({ length: 21 }, (_, index) => ({
    visibility: 0.98,
    x: offset + (index % 4) * 0.018,
    y: 0.68 - Math.floor(index / 4) * 0.025,
    z: -0.01 * (index % 3),
  }));
}

function handEvidence(label: "Left" | "Right", wristX: number) {
  return {
    assignment: "detector" as const,
    crop: {
      height: 240,
      sourceFrameHeight: 1080,
      sourceFrameWidth: 1920,
      width: 240,
      x: label === "Left" ? 300 : 1_300,
      y: 500,
    },
    detectorHandedness: { label, score: 0.98 },
    fingerJointAngles: Object.fromEntries(Array.from({ length: 15 }, (_, index) => [
      `joint-${index}`,
      { provenance: derivedProvenance, radians: 0.45 },
    ])),
    orientation: {
      facing: "palm-facing-camera" as const,
      palmNormal: { x: 0, y: 0, z: -1 },
      provenance: derivedProvenance,
      wristRotation: { x: 0.2, y: wristX, z: -0.1 },
    },
    provenance: evidenceProvenance,
    refinement: {
      inferenceDurationMs: 8,
      inputHeight: 192,
      inputWidth: 192,
      profileId: "movement-deep-capture-refinement-v1" as const,
      source: "native-roi-second-pass" as const,
    },
    tracking: { occluded: false, state: "reacquired" as const },
  };
}

function immutableDeepCaptureFrame(): MovementFramePayload {
  const pose = makeMovementAvatarProofPose("standing");
  const leftHand = handLandmarks(0.25);
  const rightHand = handLandmarks(0.65);

  return {
    acquisitionProfileId: "movement-deep-capture-v1",
    blendshapes: [
      { categoryName: "eyeBlinkLeft", displayName: "eyeBlinkLeft", index: 0, score: 0.2 },
      { categoryName: "eyeBlinkRight", displayName: "eyeBlinkRight", index: 1, score: 0.4 },
      { categoryName: "eyeLookOutLeft", displayName: "eyeLookOutLeft", index: 2, score: 0.8 },
      { categoryName: "eyeLookInRight", displayName: "eyeLookInRight", index: 3, score: 0.6 },
      { categoryName: "jawOpen", displayName: "jawOpen", index: 4, score: 0.7 },
      { categoryName: "mouthSmileLeft", displayName: "mouthSmileLeft", index: 5, score: 0.5 },
      { categoryName: "mouthSmileRight", displayName: "mouthSmileRight", index: 6, score: 0.7 },
    ],
    camera: { facingMode: "user", frameHeight: 1080, frameWidth: 1920 },
    capturedAt: 1_000,
    deepCapture: {
      face: {
        crop: {
          height: 320,
          sourceFrameHeight: 1080,
          sourceFrameWidth: 1920,
          width: 320,
          x: 800,
          y: 120,
        },
        eyeVisibility: { eyewear: "unknown", left: "visible", right: "visible" },
        facialTransformationMatrix: Array.from({ length: 16 }, (_, index) => index),
        gaze: {
          fused: { x: 0.1, y: 0, z: -1 },
          left: { x: 0.08, y: 0, z: -1 },
          provenance: derivedProvenance,
          right: { x: 0.12, y: 0, z: -1 },
        },
        irisLandmarkCount: 10,
        provenance: evidenceProvenance,
        refinement: {
          inferenceDurationMs: 9,
          inputHeight: 256,
          inputWidth: 256,
          profileId: "movement-deep-capture-refinement-v1",
          source: "native-roi-second-pass",
        },
        tracking: { occluded: false, state: "reacquired" },
      },
      hands: {
        left: handEvidence("Left", -0.1),
        right: handEvidence("Right", 0.1),
      },
      profileId: "movement-deep-capture-v1",
    },
    faceLandmarks: Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.3, z: 0 })),
    hands: {
      left: { landmarks: leftHand, worldLandmarks: leftHand },
      right: { landmarks: rightHand, worldLandmarks: rightHand },
    },
    landmarks: pose,
    sourceTimestampMs: 1_000,
    timestamp: 0,
    worldLandmarks: pose,
  };
}

function finalWriteSnapshot(runtimeFrame: NonNullable<ReturnType<typeof buildMovementGamePlayerRuntimeFrame>>) {
  const bones = new Map<string, THREE.Object3D>();
  const expressionWrites: Array<{ name: string; value: number }> = [];
  const landmarks = runtimeFrame.source.landmarks;
  const prepared = prepareVrmSolverInput({
    isPlayer: true,
    isPlaying: true,
    mirrorForDisplay: true,
    payload: {
      blendshapes: landmarks.blendshapes as VrmBlendshapeCategory[] | undefined,
      deepCapture: landmarks.deepCapture,
      hands: landmarks.hands as VrmHandsPayload | undefined,
      worldLandmarks: landmarks.worldPose,
    },
    rawLandmarks: landmarks.pose,
  });
  const result = applyMovementAvatarEndFrameRuntime({
    blendshapes: prepared.rigBlendshapes,
    deepCapture: prepared.rigDeepCapture,
    expressionManager: {
      setValue: (name, value) => expressionWrites.push({ name, value }),
    },
    hands: prepared.rigHands,
    isPlayer: true,
    lookupBone: (name) => {
      if (!bones.has(name)) bones.set(name, new THREE.Object3D());
      return bones.get(name);
    },
    mirrorForDisplay: true,
  });

  return {
    bones: Object.fromEntries([...bones.entries()].sort(([left], [right]) => left.localeCompare(right)).map(
      ([name, bone]) => [name, bone.quaternion.toArray()],
    )),
    expressionWrites,
    result,
  };
}

describe("Deep Capture Replay/mounted Game final renderer boundary", () => {
  it("produces identical bilateral hand, wrist, finger, eye, and expression writes", () => {
    const frame = immutableDeepCaptureFrame();
    const session = buildMovementReplaySessionFromRecording({
      _id: "deep-renderer-proof",
      createdAt: 1_000,
      poseData: "immutable-packet",
    }, [frame], 30, {
      deepCaptureProfile: buildMovementDeepCaptureProfile(),
      schemaVersion: 3,
    });
    const replaySample = session.samples[0]!;
    const replayPayload: VrmMotionPayload = {
      blendshapes: replaySample.tracking.blendshapes as VrmBlendshapeCategory[] | undefined,
      capturedAt: replaySample.capturedAt,
      deepCapture: replaySample.tracking.deepCapture,
      hands: replaySample.tracking.hands,
      landmarks: replaySample.tracking.pose,
      worldLandmarks: replaySample.tracking.worldPose,
    };
    const livePayload: VrmMotionPayload = {
      blendshapes: frame.blendshapes as VrmBlendshapeCategory[] | undefined,
      capturedAt: frame.capturedAt,
      deepCapture: frame.deepCapture,
      hands: frame.hands,
      landmarks: frame.landmarks,
      worldLandmarks: frame.worldLandmarks,
    };
    const replayRuntime = buildMovementGamePlayerRuntimeFrame({
      calibration: null,
      isPlaying: true,
      motionRef: replayPayload,
      retargetSourceModel: null,
      source: "recorded-replay",
    });
    const gameRuntime = buildMovementGamePlayerRuntimeFrame({
      calibration: null,
      isPlaying: true,
      motionRef: livePayload,
      retargetSourceModel: null,
      source: "live-webcam",
    });
    if (!replayRuntime || !gameRuntime) throw new Error("Expected both shared player runtimes.");

    const replayWrites = finalWriteSnapshot(replayRuntime);
    const gameWrites = finalWriteSnapshot(gameRuntime);

    expect(replayWrites).toEqual(gameWrites);
    expect(replayWrites.result.appliedHandRotations).toBeGreaterThanOrEqual(30);
    expect(replayWrites.result.appliedExpressions).toBe(5);
    expect(Object.keys(replayWrites.bones)).toEqual(expect.arrayContaining([
      "leftHand",
      "rightHand",
      "leftIndexProximal",
      "rightIndexProximal",
    ]));
    expect(replayWrites.expressionWrites.map((write) => write.name)).toEqual(expect.arrayContaining([
      "blinkLeft",
      "blinkRight",
      "lookRight",
      "aa",
      "happy",
    ]));
  });

  it("preserves every hand fixture through Replay and mounted Game with zero silent frame skips", () => {
    const scenarios = [
      "near-camera",
      "far-camera",
      "edge-of-frame",
      "palm-towards",
      "palm-away",
      "edge-on",
      "crossed-hands",
      "temporary-occlusion",
    ] as const;
    const frames = scenarios.map((scenario, index) => {
      const frame = structuredClone(immutableDeepCaptureFrame());
      frame.capturedAt = 1_000 + index * 33;
      frame.sourceTimestampMs = 1_000 + index * 33;
      frame.timestamp = index * 33;
      const left = frame.hands?.left?.landmarks;
      const right = frame.hands?.right?.landmarks;
      if (scenario === "near-camera" && left) {
        left.forEach((landmark) => {
          landmark.x = 0.05 + (landmark.x - 0.25) * 2.2;
          landmark.y = 0.8 + (landmark.y - 0.68) * 2.2;
        });
      }
      if (scenario === "far-camera" && left) {
        left.forEach((landmark) => {
          landmark.x = 0.3 + (landmark.x - 0.25) * 0.25;
          landmark.y = 0.45 + (landmark.y - 0.68) * 0.25;
        });
      }
      if (scenario === "edge-of-frame" && left) {
        left.forEach((landmark) => {
          landmark.x = Math.max(0, landmark.x - 0.25);
        });
      }
      if (scenario === "palm-away") {
        frame.deepCapture!.hands!.left!.orientation!.facing = "palm-facing-away";
        frame.deepCapture!.hands!.left!.orientation!.palmNormal = { x: 0, y: 0, z: 1 };
      }
      if (scenario === "edge-on") {
        frame.deepCapture!.hands!.left!.orientation!.facing = "edge-on";
        frame.deepCapture!.hands!.left!.orientation!.palmNormal = { x: 1, y: 0, z: 0 };
      }
      if (scenario === "crossed-hands" && left && right) {
        left.forEach((landmark) => { landmark.x += 0.4; });
        right.forEach((landmark) => { landmark.x -= 0.4; });
        frame.deepCapture!.hands!.left!.assignment = "pose-wrist-reconciled";
        frame.deepCapture!.hands!.right!.assignment = "pose-wrist-reconciled";
      }
      if (scenario === "temporary-occlusion") {
        delete frame.hands?.left;
        delete frame.deepCapture?.hands?.left;
      }
      return frame;
    });
    const session = buildMovementReplaySessionFromRecording({
      _id: "deep-renderer-sequence-proof",
      createdAt: 1_000,
      poseData: "immutable-packet",
    }, frames, 30, {
      deepCaptureProfile: buildMovementDeepCaptureProfile(),
      schemaVersion: 3,
    });

    expect(session.samples).toHaveLength(scenarios.length);
    session.samples.forEach((sample, index) => {
      const source = frames[index]!;
      const replayRuntime = buildMovementGamePlayerRuntimeFrame({
        calibration: null,
        isPlaying: true,
        motionRef: {
          blendshapes: sample.tracking.blendshapes as VrmBlendshapeCategory[] | undefined,
          capturedAt: sample.capturedAt,
          deepCapture: sample.tracking.deepCapture,
          hands: sample.tracking.hands,
          landmarks: sample.tracking.pose,
          worldLandmarks: sample.tracking.worldPose,
        },
        retargetSourceModel: null,
        source: "recorded-replay",
      });
      const gameRuntime = buildMovementGamePlayerRuntimeFrame({
        calibration: null,
        isPlaying: true,
        motionRef: {
          blendshapes: source.blendshapes as VrmBlendshapeCategory[] | undefined,
          capturedAt: source.capturedAt,
          deepCapture: source.deepCapture,
          hands: source.hands,
          landmarks: source.landmarks,
          worldLandmarks: source.worldLandmarks,
        },
        retargetSourceModel: null,
        source: "live-webcam",
      });
      expect(replayRuntime, `${scenarios[index]} Replay frame`).not.toBeNull();
      expect(gameRuntime, `${scenarios[index]} mounted Game frame`).not.toBeNull();
      expect(sample.tracking.deepCapture?.hands).toEqual(source.deepCapture?.hands);
      expect(sample.tracking.hands?.left ?? null).toEqual(source.hands?.left ?? null);
      expect(sample.tracking.hands?.right ?? null).toEqual(source.hands?.right ?? null);
      expect(finalWriteSnapshot(replayRuntime!)).toEqual(finalWriteSnapshot(gameRuntime!));
    });
  });

  it("keeps source-left hand evidence anatomical and writes it to player-avatar right", () => {
    const frame = immutableDeepCaptureFrame();
    delete frame.hands?.right;
    delete frame.deepCapture?.hands?.right;
    const runtime = buildMovementGamePlayerRuntimeFrame({
      calibration: null,
      isPlaying: true,
      motionRef: {
        blendshapes: frame.blendshapes as VrmBlendshapeCategory[] | undefined,
        capturedAt: frame.capturedAt,
        deepCapture: frame.deepCapture,
        hands: frame.hands,
        landmarks: frame.landmarks,
        worldLandmarks: frame.worldLandmarks,
      },
      retargetSourceModel: null,
      source: "live-webcam",
    });
    if (!runtime) throw new Error("Expected shared player runtime.");
    const writes = finalWriteSnapshot(runtime);

    expect(frame.deepCapture?.hands?.left?.detectorHandedness.label).toBe("Left");
    expect(Object.keys(frame.deepCapture?.hands?.left?.fingerJointAngles ?? {})).toHaveLength(15);
    expect(writes.bones).toHaveProperty("rightHand");
    expect(writes.bones).toHaveProperty("rightIndexProximal");
    expect(writes.bones).not.toHaveProperty("leftHand");
  });
});
