import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildMovementAvatarSemanticVisualTelemetry } from "./movementAvatarSemanticVisualTelemetry";
import type { TrackingLandmark } from "./movementTrackingCalibration";

function landmark(x: number, y: number, z = 0): TrackingLandmark {
  return { visibility: 0.99, x, y, z };
}

describe("movement avatar semantic visual telemetry", () => {
  it("compares independent source posture with final bones and samples heel/toe contact", () => {
    const scene = new THREE.Scene();
    const bones: Record<string, THREE.Object3D> = {};
    const addBone = (name: string, x: number, y: number, z: number) => {
      const bone = new THREE.Object3D();
      bone.position.set(x, y, z);
      bones[name] = bone;
      scene.add(bone);
    };
    addBone("hips", 0, 0, 0);
    addBone("chest", 0, 0.45, 0.89);
    addBone("upperChest", 0, 0.55, 0.9);
    addBone("head", 0, 0.7, 1.15);
    addBone("leftFoot", -0.2, 0.03, 0);
    addBone("leftToes", -0.2, 0.09, 0.3);
    addBone("rightFoot", 0.2, 0.004, 0);
    addBone("rightToes", 0.2, 0.006, 0.3);
    scene.updateMatrixWorld(true);

    const source = Array.from({ length: 33 }, () => landmark(0, 0, 0));
    source[0] = landmark(0, -1.35, 0);
    source[7] = landmark(-0.1, -1.3, 0);
    source[8] = landmark(0.1, -1.3, 0);
    source[11] = landmark(-0.25, -1, 0);
    source[12] = landmark(0.25, -1, 0);
    source[23] = landmark(-0.15, 0, 0);
    source[24] = landmark(0.15, 0, 0);
    source[29] = landmark(-0.2, 1, 0);
    source[30] = landmark(0.2, 1, 0);
    source[31] = landmark(-0.2, 1, -0.2);
    source[32] = landmark(0.2, 1, -0.2);

    const vrm = {
      humanoid: { getNormalizedBoneNode: (name: string) => bones[name] ?? null },
      scene,
    } as unknown as VRM;
    const telemetry = buildMovementAvatarSemanticVisualTelemetry({
      avatarRestMap: {
        leftFoot: {
          worldDirection: new THREE.Vector3(0, 0, 1),
          worldQuaternion: new THREE.Quaternion(),
        },
        rightFoot: {
          worldDirection: new THREE.Vector3(0, 0, 1),
          worldQuaternion: new THREE.Quaternion(),
        },
        semantic: {
          avatarScale: 2,
          headChainDirection: new THREE.Vector3(0, 1, 0),
          headForwardDirection: new THREE.Vector3(0, 0, 1),
          torsoDirection: new THREE.Vector3(0, 1, 0),
        },
      },
      floorY: 0,
      retargetSourceModel: {
        calibratedAt: 0,
        floorY: 1,
        hipCenter: { x: 0, y: 0, z: 0 },
        neutralKneeLift: { left: 0, right: 0 },
        quality: 1,
        segments: {},
        semanticNeutral: {
          headChainDirection: { x: 0, y: 1, z: 0 },
          headForwardDirection: { x: 0, y: 1, z: 0 },
          headForwardImageDirection: { x: 0, y: 1, z: 0 },
          torsoDirection: { x: 0, y: 1, z: 0 },
        },
        shoulderCenter: { x: 0, y: -1, z: 0 },
        torsoHeight: 1,
      },
      rigMeasurements: { legLength: 1.2, torsoLength: 0.8 },
      sourceImageLandmarks: source,
      sourceHeadAngles: { confidence: 0.91, pitch: 0, roll: 0, source: "pose", yaw: 0 },
      sourceContacts: { leftFoot: true, rightFoot: true },
      sourceQuality: 0.87,
      sourceWorldLandmarks: source,
      vrm,
    });

    expect(telemetry).toMatchObject({
      avatarScale: 2,
      evidenceVersion: "2026-07-16.v3",
      feet: {
        left: { sourceConfidence: 0.87, sourcePlanted: true },
        right: { sourceConfidence: 0.87, sourcePlanted: true },
      },
      headChain: { confidence: 0.87 },
      torso: {
        confidence: 0.87,
        sourceDirection: { x: 0, y: 1, z: 0 },
        sourceLeanRadians: 0,
      },
    });
    expect(telemetry?.torso.sourceError).toBeGreaterThan(0.5);
    expect(telemetry?.feet.left.toeEndClearance).toBe(0.09);
    expect(telemetry?.feet.left.planeAngleRadians).toBeGreaterThan(0.19);
    expect(telemetry?.feet.right.toeEndClearance).toBe(0.006);
  });
});
