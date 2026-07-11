import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  applyVrmDemoFallbackPoseToBones,
  applyVrmArmLastGoodPoseToBones,
  applyVrmRigRotationApplicationTarget,
  applyVrmArmRotationTargets,
  applyVrmArmStoredRotationTargets,
  applyVrmBlendshapeExpressionTargetsToManager,
  applyVrmExpressionTargets,
  applyVrmExpressionTargetToManager,
  applyVrmHandRotationTargets,
  applyVrmHandRotationTargetToBone,
  applyVrmHandsRotationTargetsToBones,
  applyVrmNamedRotationTargetToBones,
  applyVrmNamedRotationTargets,
  applyVrmNamedRotationTargetsToBones,
  applyVrmStoredRotationTargetToBone,
  createVrmNormalizedBoneLookup,
  lookupVrmNormalizedBone,
  normalizeVrmLandmark,
  prepareVrmHandLandmarks,
  prepareVrmSolverInput,
  resolveVrmDemoFallbackRotationTargets,
  resolveVrmRigRotationApplicationTarget,
  resolveVrmArmLastGoodRotationTargets,
  resolveVrmArmRelaxedRotationTargets,
  resolveVrmBlendshapeExpressionTargets,
  resolveVrmHandRigOptions,
  resolveVrmHandNeutralRotationTargets,
  resolveVrmHandRotationSpecs,
  resolveVrmHandRotationTargets,
  resolveVrmHandsRotationTargets,
  strengthenVrmHandRotation,
} from "./vrmRigging";
import type { VrmPoseLandmark } from "./vrmRigging";

const makeLandmarks = (): VrmPoseLandmark[] =>
  Array.from({ length: 33 }, (_, index) => ({
    x: index / 32,
    y: 0.5,
    visibility: 0.9,
  }));

describe("vrmRigging", () => {
  it("looks up normalized VRM bones through a shared adapter", () => {
    const head = new THREE.Object3D();
    const vrm = {
      humanoid: {
        getNormalizedBoneNode: (boneName: string) => boneName === "head" ? head : null,
      },
    };

    expect(lookupVrmNormalizedBone(vrm as never, "head")).toBe(head);
    expect(lookupVrmNormalizedBone(vrm as never, "leftFoot")).toBeNull();

    let currentVrm: typeof vrm | null = vrm;
    const lookup = createVrmNormalizedBoneLookup(() => currentVrm as never);
    expect(lookup("head")).toBe(head);
    currentVrm = null;
    expect(lookup("head")).toBeNull();
  });

  it("normalizes legacy landmarks without depth", () => {
    expect(normalizeVrmLandmark({ x: 0.2, y: 0.4 })).toMatchObject({
      x: 0.2,
      y: 0.4,
      z: 0,
      visibility: 0.8,
    });
  });

  it("forces instructor standby landmarks to invisible", () => {
    const prepared = prepareVrmSolverInput({
      rawLandmarks: makeLandmarks(),
      payload: null,
      isPlayer: false,
      isPlaying: false,
    });

    expect(prepared.forceStandby).toBe(true);
    expect(prepared.imageLandmarks.every((landmark) => landmark.visibility === 0)).toBe(true);
  });

  it("reflects instructor coordinates while preserving anatomical hands, face, and blendshape sides", () => {
    const faceLandmarks = Array.from({ length: 264 }, () => ({
      x: 0.5,
      y: 0.5,
      z: 0,
      visibility: 0.9,
    }));
    faceLandmarks[1] = { x: 0.58, y: 0.44, z: 0, visibility: 0.9 };
    faceLandmarks[33] = { x: 0.44, y: 0.42, z: 0, visibility: 0.9 };
    faceLandmarks[263] = { x: 0.57, y: 0.46, z: 0, visibility: 0.9 };
    const prepared = prepareVrmSolverInput({
      rawLandmarks: makeLandmarks(),
      payload: {
        faceLandmarks,
        hands: {
          left: { landmarks: [], worldLandmarks: [{ x: 0.3, y: 0.4, z: 0.1 }] },
          right: { landmarks: [], worldLandmarks: [{ x: 0.7, y: 0.4, z: 0.1 }] },
        },
        blendshapes: [
          { index: 1, categoryName: "eyeBlinkLeft", displayName: "eyeBlinkLeft", score: 0.8 },
          { index: 2, categoryName: "mouthSmileRight", displayName: "mouthSmileRight", score: 0.4 },
        ],
      },
      isPlayer: false,
      isPlaying: true,
    });

    expect(prepared.rigHands?.right?.worldLandmarks?.[0]?.x).toBe(-0.7);
    expect(prepared.rigHands?.left?.worldLandmarks?.[0]?.x).toBe(-0.3);
    expect(prepared.faceLandmarks?.[1]?.x).toBeCloseTo(0.42);
    expect(prepared.faceLandmarks?.[1]?.y).toBeCloseTo(0.44);
    expect(prepared.faceLandmarks?.[33]?.x).toBeCloseTo(0.56);
    expect(prepared.faceLandmarks?.[33]?.y).toBeCloseTo(0.42);
    expect(prepared.faceLandmarks?.[263]?.x).toBeCloseTo(0.43);
    expect(prepared.faceLandmarks?.[263]?.y).toBeCloseTo(0.46);
    expect(prepared.rigBlendshapes?.map((blendshape) => blendshape.categoryName)).toEqual([
      "eyeBlinkLeft",
      "mouthSmileRight",
    ]);
  });

  it("mirrors player display landmarks so source left drives avatar right", () => {
    const landmarks = makeLandmarks();
    landmarks[25] = { x: 0.25, y: 0.7, z: 0.01, visibility: 0.91 };
    landmarks[26] = { x: 0.75, y: 0.8, z: 0.02, visibility: 0.92 };

    const prepared = prepareVrmSolverInput({
      rawLandmarks: landmarks,
      payload: {
        hands: {
          left: { landmarks: [{ x: 0.2, y: 0.4, z: 0.1 }], worldLandmarks: [{ x: 0.3, y: 0.4, z: 0.1 }] },
          right: { landmarks: [{ x: 0.8, y: 0.4, z: 0.1 }], worldLandmarks: [{ x: 0.7, y: 0.4, z: 0.1 }] },
        },
        worldLandmarks: landmarks,
      },
      isPlayer: true,
      isPlaying: true,
      mirrorForDisplay: true,
    });

    expect(prepared.imageLandmarks[26]).toMatchObject({
      x: 0.75,
      y: 0.7,
      visibility: 0.91,
    });
    expect(prepared.imageLandmarks[25]).toMatchObject({
      x: 0.25,
      y: 0.8,
      visibility: 0.92,
    });
    expect(prepared.solverLandmarks?.[26]).toMatchObject({
      x: -0.25,
      y: 0.7,
      visibility: 0.91,
    });
    expect(prepared.rigHands?.right?.worldLandmarks?.[0]?.x).toBe(-0.3);
    expect(prepared.rigHands?.left?.worldLandmarks?.[0]?.x).toBe(-0.7);
  });

  it("prepares hand landmarks with optional x mirroring", () => {
    const prepared = prepareVrmHandLandmarks({
      landmarks: [
        { x: 0.2, y: 0.3, z: 0.1 },
        { x: 0.8, y: 0.4, z: 0.2 },
      ],
    }, { mirrorX: true });

    expect(prepared.map((landmark) => landmark.x)).toEqual([0.8, 0.19999999999999996]);
  });

  it("resolves player and recorded hand rig options outside avatar bone application", () => {
    expect(resolveVrmHandRigOptions({ isPlayer: true })).toEqual({
      isPlayer: true,
      mirrorX: false,
      slerp: 0.85,
    });
    expect(resolveVrmHandRigOptions({ isPlayer: true, mirrorForDisplay: true })).toEqual({
      isPlayer: true,
      mirrorX: true,
      slerp: 0.85,
    });
    expect(resolveVrmHandRigOptions({ isPlayer: false })).toEqual({
      isPlayer: false,
      mirrorX: true,
      slerp: 0.55,
    });
  });

  it("resolves hand rotation specs outside avatar bone application", () => {
    const specs = resolveVrmHandRotationSpecs("left");

    expect(specs).toHaveLength(16);
    expect(specs[0]).toEqual({
      isThumb: false,
      isWrist: true,
      rigKey: "LeftWrist",
      shouldApply: false,
      vrmName: "leftHand",
    });
    expect(specs[1]).toEqual({
      isThumb: true,
      isWrist: false,
      rigKey: "LeftThumbProximal",
      shouldApply: true,
      vrmName: "leftThumbProximal",
    });
    expect(specs.at(-1)).toEqual({
      isThumb: false,
      isWrist: false,
      rigKey: "LeftLittleDistal",
      shouldApply: true,
      vrmName: "leftLittleDistal",
    });
    expect(resolveVrmHandRotationSpecs("right")[1]).toMatchObject({
      rigKey: "RightThumbProximal",
      vrmName: "rightThumbProximal",
    });
  });

  it("strengthens finger rotations while leaving wrist rotations unchanged for callers that keep wrist solving", () => {
    const wrist = strengthenVrmHandRotation(
      { x: 0.2, y: -0.1, z: 0.3 },
      { isPlayer: true, isWrist: true, isThumb: false },
    );
    const finger = strengthenVrmHandRotation(
      { x: 0.2, y: -0.1, z: 0.3 },
      { isPlayer: true, isWrist: false, isThumb: false },
    );

    expect(wrist).toEqual({ x: 0.2, y: -0.1, z: 0.3 });
    expect(finger).toMatchObject({ x: 0.27, y: -0.135, z: 0.405 });
  });

  it("resolves hand rotation targets without wrist application details leaking into the renderer", () => {
    const targets = resolveVrmHandRotationTargets({
      isPlayer: true,
      rig: {
        LeftIndexProximal: { x: 0.2, y: -0.1, z: 0.3 },
        LeftThumbProximal: { x: 0.2, y: -0.1, z: 0.3 },
        LeftWrist: { x: 1, y: 1, z: 1 },
      },
      side: "left",
      slerp: 0.85,
    });

    expect(targets).toHaveLength(2);
    expect(targets.map((target) => target.rigKey)).toEqual([
      "LeftThumbProximal",
      "LeftIndexProximal",
    ]);
    expect(targets[0]).toMatchObject({
      rigKey: "LeftThumbProximal",
      slerp: 0.85,
      vrmName: "leftThumbProximal",
    });
    expect(targets[0].rotation.x).toBeCloseTo(0.243);
    expect(targets[0].rotation.y).toBeCloseTo(-0.1215);
    expect(targets[0].rotation.z).toBeCloseTo(0.3645);
    expect(targets[1]).toMatchObject({
      vrmName: "leftIndexProximal",
    });
    expect(targets[1].rotation.x).toBeCloseTo(0.27);
    expect(targets[1].rotation.y).toBeCloseTo(-0.135);
    expect(targets[1].rotation.z).toBeCloseTo(0.405);
  });

  it("resolves generic rig rotation application targets with scaling, limits, and rotation order", () => {
    const target = resolveVrmRigRotationApplicationTarget({
      bone: "spine",
      limits: { x: 0.2 },
      rotation: { x: 1, y: 0.1, z: 0.2, rotationOrder: "YXZ" },
      scale: 2,
      slerp: 0.4,
    });
    const expected = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0.2, 0.2, 0.4, "YXZ"),
    );

    expect(target).toMatchObject({
      bone: "spine",
      remember: true,
      rotation: { x: 1, y: 0.1, z: 0.2, rotationOrder: "YXZ" },
      slerp: 0.4,
    });
    expect(target?.targetQuaternion.angleTo(expected)).toBeCloseTo(0);
    expect(resolveVrmRigRotationApplicationTarget({
      bone: "spine",
      rotation: undefined,
      slerp: 0.4,
    })).toBeNull();
  });

  it("resolves demo fallback rotation targets outside the renderer", () => {
    const targets = resolveVrmDemoFallbackRotationTargets({ slerp: 0.35 });

    expect(targets).toHaveLength(15);
    expect(targets.slice(0, 4)).toEqual([
      { bone: "spine", rotation: { x: 0.04, y: 0, z: 0 }, slerp: 0.35 },
      { bone: "chest", rotation: { x: 0.03, y: 0, z: 0 }, slerp: 0.35 },
      { bone: "rightUpperArm", rotation: { x: 0, y: 0, z: -1.12 }, slerp: 0.35 },
      { bone: "leftUpperArm", rotation: { x: 0, y: 0, z: 1.12 }, slerp: 0.35 },
    ]);
    expect(targets.at(-1)).toEqual({
      bone: "leftFoot",
      rotation: { x: 0, y: 0, z: 0 },
      slerp: 0.35,
    });
  });

  it("applies demo fallback pose targets through shared bone lookup", () => {
    const bones = new Map<string, { quaternion: THREE.Quaternion }>();
    bones.set("spine", { quaternion: new THREE.Quaternion() });
    bones.set("chest", { quaternion: new THREE.Quaternion() });
    bones.set("rightUpperArm", { quaternion: new THREE.Quaternion() });

    const result = applyVrmDemoFallbackPoseToBones({
      lookupBone: (boneName) => bones.get(boneName) ?? null,
      slerp: 0.35,
    });

    expect(result.applied).toBe(3);
    expect(bones.get("rightUpperArm")?.quaternion.w).toBeLessThan(1);
  });

  it("executes generic rig rotation application targets and stores last-good quaternions only when requested", () => {
    const stored: Array<{ bone: string; quaternion: THREE.Quaternion }> = [];
    const target = resolveVrmRigRotationApplicationTarget({
      bone: "hips",
      rotation: { x: 0.2, y: 0, z: 0 },
      slerp: 0.5,
    });
    const finalQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0, 0));

    const result = applyVrmRigRotationApplicationTarget({
      apply: (applicationTarget) => {
        expect(applicationTarget.targetQuaternion.w).toBeLessThan(1);
        return finalQuaternion;
      },
      storeLastGood: (bone, quaternion) => {
        stored.push({ bone, quaternion });
      },
      target,
    });

    expect(result).toEqual({ applied: true });
    expect(stored).toEqual([{ bone: "hips", quaternion: finalQuaternion }]);
    expect(applyVrmRigRotationApplicationTarget({
      apply: () => false,
      target,
    })).toEqual({ applied: false });
    expect(applyVrmRigRotationApplicationTarget({
      apply: () => finalQuaternion,
      storeLastGood: (bone, quaternion) => {
        stored.push({ bone, quaternion });
      },
      target: resolveVrmRigRotationApplicationTarget({
        bone: "spine",
        remember: false,
        rotation: { x: 0, y: 0, z: 0 },
        slerp: 0.5,
      }),
    })).toEqual({ applied: true });
    expect(stored).toHaveLength(1);
  });

  it("executes named rotation targets through shared rig target construction", () => {
    const stored: Array<{ bone: string; quaternion: THREE.Quaternion }> = [];
    const appliedBones: string[] = [];
    const finalQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0, 0));

    const result = applyVrmNamedRotationTargets({
      apply: (target) => {
        if (target.bone === "missingBone") return false;
        appliedBones.push(target.bone);
        expect(target.targetQuaternion.w).toBeLessThanOrEqual(1);
        return finalQuaternion;
      },
      storeLastGood: (bone, quaternion) => {
        stored.push({ bone, quaternion });
      },
      targets: [
        { bone: "spine", rotation: { x: 0.2, y: 0, z: 0 }, slerp: 0.4 },
        { bone: "hips", remember: true, rotation: { x: 0, y: 0.1, z: 0 }, slerp: 0.5 },
        { bone: "missingBone", rotation: { x: 0, y: 0, z: 0.1 }, slerp: 0.6 },
      ],
    });

    expect(result).toEqual({ applied: 2 });
    expect(appliedBones).toEqual(["spine", "hips"]);
    expect(stored).toEqual([{ bone: "hips", quaternion: finalQuaternion }]);
  });

  it("executes named rotation targets directly against VRM-like bones", () => {
    const bones = new Map<string, { quaternion: THREE.Quaternion }>();
    bones.set("spine", { quaternion: new THREE.Quaternion() });
    bones.set("hips", { quaternion: new THREE.Quaternion() });
    const stored: Array<{ bone: string; quaternion: THREE.Quaternion }> = [];

    const result = applyVrmNamedRotationTargetsToBones({
      lookupBone: (boneName) => bones.get(boneName) ?? null,
      storeLastGood: (bone, quaternion) => {
        stored.push({ bone, quaternion });
      },
      targets: [
        { bone: "spine", rotation: { x: 0.2, y: 0, z: 0 }, slerp: 0.4 },
        { bone: "hips", remember: true, rotation: { x: 0, y: 0.1, z: 0 }, slerp: 0.5 },
        { bone: "missingBone", rotation: { x: 0, y: 0, z: 0.1 }, slerp: 0.6 },
      ],
    });

    expect(result).toEqual({ applied: 2 });
    expect(bones.get("spine")?.quaternion.w).toBeLessThan(1);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.bone).toBe("hips");
  });

  it("executes a single named rotation target directly against a VRM-like bone", () => {
    const upperChest = { quaternion: new THREE.Quaternion() };
    const result = applyVrmNamedRotationTargetToBones({
      bone: "upperChest",
      lookupBone: (boneName) => (boneName === "upperChest" ? upperChest : null),
      rotation: { x: 0.1, y: 0, z: -0.04 },
      slerp: 0.5,
    });

    expect(result).toEqual({ applied: 1 });
    expect(upperChest.quaternion.w).toBeLessThan(1);
  });

  it("resolves arm relaxed, last-good, and hand-neutral fallback targets outside the renderer", () => {
    expect(resolveVrmArmRelaxedRotationTargets({ side: "right", slerp: 0.3 })).toEqual([
      { bone: "rightUpperArm", rotation: { x: 0, y: 0, z: -1.12 }, slerp: 0.3 },
      { bone: "rightLowerArm", rotation: { x: 0, y: 0, z: -0.12 }, slerp: 0.3 },
      { bone: "rightHand", rotation: { x: 0, y: 0, z: 0 }, slerp: 0.3 },
    ]);
    expect(resolveVrmArmRelaxedRotationTargets({ side: "left", slerp: 0.4 })[0]).toEqual({
      bone: "leftUpperArm",
      rotation: { x: 0, y: 0, z: 1.12 },
      slerp: 0.4,
    });
    expect(resolveVrmArmLastGoodRotationTargets({ side: "left" })).toEqual([
      { bone: "leftUpperArm", slerp: 0.42 },
      { bone: "leftLowerArm", slerp: 0.42 },
      { bone: "leftHand", slerp: 0.42 },
    ]);
    expect(resolveVrmHandNeutralRotationTargets({ side: "right", slerp: 0.8 })).toEqual([
      { bone: "rightHand", rotation: { x: 0, y: 0, z: 0 }, slerp: 0.8 },
    ]);
  });


  it("applies last-good arm targets through shared bone lookup and stored rotations", () => {
    const storedUpperArm = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25, 0, 0));
    const storedHand = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.15, 0));
    const bones = new Map<string, { quaternion: THREE.Quaternion }>();
    bones.set("rightUpperArm", { quaternion: new THREE.Quaternion() });
    bones.set("rightLowerArm", { quaternion: new THREE.Quaternion() });
    bones.set("rightHand", { quaternion: new THREE.Quaternion() });

    const result = applyVrmArmLastGoodPoseToBones({
      lastGood: {
        rightHand: storedHand,
        rightUpperArm: storedUpperArm,
      },
      lookupBone: (boneName) => bones.get(boneName) ?? null,
      side: "right",
    });

    expect(result).toEqual({ applied: 2 });
    expect(bones.get("rightUpperArm")?.quaternion.angleTo(storedUpperArm)).toBeGreaterThan(0);
    expect(bones.get("rightUpperArm")?.quaternion.w).toBeLessThan(1);
    expect(bones.get("rightLowerArm")?.quaternion.w).toBe(1);
    expect(bones.get("rightHand")?.quaternion.w).toBeLessThan(1);
  });

  it("executes arm fallback targets through caller-supplied VRM writer callbacks", () => {
    const appliedRotationBones: string[] = [];
    const rotationResult = applyVrmArmRotationTargets({
      apply: (target) => {
        if (target.bone === "missingBone") return false;
        appliedRotationBones.push(target.bone);
      },
      targets: [
        { bone: "leftUpperArm", rotation: { x: 0, y: 0, z: 1.12 }, slerp: 0.3 },
        { bone: "missingBone", rotation: { x: 0, y: 0, z: 0 }, slerp: 0.3 },
      ],
    });

    const appliedStoredBones: string[] = [];
    const storedResult = applyVrmArmStoredRotationTargets({
      apply: (target) => {
        if (target.bone === "rightHand") return false;
        appliedStoredBones.push(target.bone);
      },
      targets: resolveVrmArmLastGoodRotationTargets({ side: "right" }),
    });

    expect(rotationResult.applied).toBe(1);
    expect(appliedRotationBones).toEqual(["leftUpperArm"]);
    expect(storedResult.applied).toBe(2);
    expect(appliedStoredBones).toEqual(["rightUpperArm", "rightLowerArm"]);
  });

  it("applies stored rotation targets to bones through the shared slerp helper", () => {
    const bone = new THREE.Object3D();
    const storedQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 0, 0));

    const result = applyVrmStoredRotationTargetToBone({
      bone,
      storedQuaternion,
      target: { bone: "rightUpperArm", slerp: 1 },
    });

    expect(result).toEqual({ applied: true });
    expect(bone.quaternion.angleTo(storedQuaternion)).toBeCloseTo(0);
    expect(applyVrmStoredRotationTargetToBone({
      bone: null,
      storedQuaternion,
      target: { bone: "rightUpperArm", slerp: 1 },
    })).toEqual({ applied: false });
    expect(applyVrmStoredRotationTargetToBone({
      bone,
      storedQuaternion: null,
      target: { bone: "rightUpperArm", slerp: 1 },
    })).toEqual({ applied: false });
  });

  it("resolves both hand rotation target batches outside avatar bone application", () => {
    const solved: Array<"Left" | "Right"> = [];
    const targets = resolveVrmHandsRotationTargets({
      hands: {
        left: {
          landmarks: Array.from({ length: 21 }, (_, index) => ({
            x: 0.2 + index * 0.001,
            y: 0.3,
            z: 0,
          })),
        },
        right: {
          landmarks: Array.from({ length: 21 }, (_, index) => ({
            x: 0.8 - index * 0.001,
            y: 0.3,
            z: 0,
          })),
        },
      },
      isPlayer: true,
      solveHand: (_landmarks, handedness) => {
        solved.push(handedness);
        return {
          [`${handedness}IndexProximal`]: { x: 0.2, y: 0, z: 0 },
        };
      },
    });

    expect(solved).toEqual(["Left", "Right"]);
    expect(targets).toEqual([
      expect.objectContaining({
        rigKey: "LeftIndexProximal",
        slerp: 0.85,
        vrmName: "leftIndexProximal",
      }),
      expect.objectContaining({
        rigKey: "RightIndexProximal",
        slerp: 0.85,
        vrmName: "rightIndexProximal",
      }),
    ]);
  });

  it("maps blendshape categories to VRM expression targets outside the renderer", () => {
    expect(resolveVrmBlendshapeExpressionTargets([
      { categoryName: "eyeBlinkLeft", displayName: "eyeBlinkLeft", score: 0.2, index: 0 },
      { categoryName: "eyeBlinkRight", displayName: "eyeBlinkRight", score: 0.3, index: 1 },
      { categoryName: "jawOpen", displayName: "jawOpen", score: 0.8, index: 2 },
      { categoryName: "mouthSmileLeft", displayName: "mouthSmileLeft", score: 0.4, index: 3 },
      { categoryName: "mouthSmileRight", displayName: "mouthSmileRight", score: 0.6, index: 4 },
    ])).toEqual([
      { name: "blinkLeft", value: 0.2 },
      { name: "blinkRight", value: 0.3 },
      { name: "aa", value: 1 },
      { name: "happy", value: 0.5 },
    ]);
  });

  it("executes expression targets through a caller-supplied VRM writer callback", () => {
    const appliedNames: string[] = [];

    const result = applyVrmExpressionTargets({
      apply: (target) => {
        appliedNames.push(target.name);
      },
      targets: [
        { name: "blinkLeft", value: 0.2 },
        { name: "happy", value: 0.5 },
      ],
    });

    expect(result.applied).toBe(2);
    expect(appliedNames).toEqual(["blinkLeft", "happy"]);
  });

  it("applies expression targets to expression managers through the shared write helper", () => {
    const writes: Array<{ name: string; value: number }> = [];
    const expressionManager = {
      setValue: (name: "aa" | "blinkLeft" | "blinkRight" | "happy", value: number) => {
        writes.push({ name, value });
      },
    };

    const result = applyVrmExpressionTargetToManager({
      expressionManager,
      target: { name: "happy", value: 0.45 },
    });

    expect(result).toEqual({ applied: true });
    expect(writes).toEqual([{ name: "happy", value: 0.45 }]);
    expect(applyVrmExpressionTargetToManager({
      expressionManager: null,
      target: { name: "aa", value: 0.2 },
    })).toEqual({ applied: false });
  });

  it("applies blendshape expression targets to expression managers through shared orchestration", () => {
    const writes: Array<{ name: string; value: number }> = [];
    const expressionManager = {
      setValue: (name: "aa" | "blinkLeft" | "blinkRight" | "happy", value: number) => {
        writes.push({ name, value });
      },
    };

    const result = applyVrmBlendshapeExpressionTargetsToManager({
      expressionManager,
      blendshapes: [
        { categoryName: "eyeBlinkLeft", displayName: "eyeBlinkLeft", score: 0.2, index: 0 },
        { categoryName: "jawOpen", displayName: "jawOpen", score: 0.8, index: 1 },
        { categoryName: "mouthSmileLeft", displayName: "mouthSmileLeft", score: 0.4, index: 2 },
        { categoryName: "mouthSmileRight", displayName: "mouthSmileRight", score: 0.6, index: 3 },
      ],
    });

    expect(result.applied).toBe(3);
    expect(writes).toEqual([
      { name: "blinkLeft", value: 0.2 },
      { name: "aa", value: 1 },
      { name: "happy", value: 0.5 },
    ]);
    expect(applyVrmBlendshapeExpressionTargetsToManager({
      expressionManager: null,
      blendshapes: [
        { categoryName: "jawOpen", displayName: "jawOpen", score: 0.8, index: 0 },
      ],
    })).toEqual({ applied: 0 });
  });

  it("executes hand rotation targets through a caller-supplied VRM writer callback", () => {
    const appliedBones: string[] = [];
    const appliedQuaternionW: number[] = [];

    const result = applyVrmHandRotationTargets({
      apply: (target) => {
        if (target.vrmName === "missingBone") return false;
        appliedBones.push(target.vrmName);
        appliedQuaternionW.push(target.targetQuaternion.w);
      },
      targets: [
        {
          rigKey: "LeftIndexProximal",
          rotation: { x: 0.2, y: 0, z: 0 },
          slerp: 0.85,
          vrmName: "leftIndexProximal",
        },
        {
          rigKey: "Missing",
          rotation: { x: 0, y: 0, z: 0 },
          slerp: 0.85,
          vrmName: "missingBone",
        },
      ],
    });

    expect(result.applied).toBe(1);
    expect(appliedBones).toEqual(["leftIndexProximal"]);
    expect(appliedQuaternionW[0]).toBeCloseTo(0.995);
  });

  it("applies hand rotation application targets to bones through the shared slerp helper", () => {
    const bone = new THREE.Object3D();
    const targetQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25, 0, 0));

    const result = applyVrmHandRotationTargetToBone({
      bone,
      target: {
        rigKey: "LeftIndexProximal",
        rotation: { x: 0.25, y: 0, z: 0 },
        slerp: 1,
        targetQuaternion,
        vrmName: "leftIndexProximal",
      },
    });

    expect(result).toEqual({ applied: true });
    expect(bone.quaternion.angleTo(targetQuaternion)).toBeCloseTo(0);
    expect(applyVrmHandRotationTargetToBone({
      bone: null,
      target: {
        rigKey: "LeftIndexProximal",
        rotation: { x: 0.25, y: 0, z: 0 },
        slerp: 1,
        targetQuaternion,
        vrmName: "leftIndexProximal",
      },
    })).toEqual({ applied: false });
  });

  it("applies hand rotation targets to VRM bones through shared orchestration", () => {
    const leftIndexProximal = new THREE.Object3D();
    const rightIndexProximal = new THREE.Object3D();
    const bones: Record<string, THREE.Object3D> = {
      leftIndexProximal,
      rightIndexProximal,
    };

    const result = applyVrmHandsRotationTargetsToBones({
      hands: {
        left: {
          landmarks: Array.from({ length: 21 }, (_, index) => ({
            x: 0.2 + index * 0.001,
            y: 0.3,
            z: 0,
          })),
        },
        right: {
          landmarks: Array.from({ length: 21 }, (_, index) => ({
            x: 0.8 - index * 0.001,
            y: 0.3,
            z: 0,
          })),
        },
      },
      isPlayer: true,
      lookupBone: (vrmName) => bones[vrmName],
      solveHand: (_landmarks, handedness) => ({
        [`${handedness}IndexProximal`]: { x: 0.25, y: 0, z: 0 },
      }),
    });

    expect(result.applied).toBe(2);
    expect(leftIndexProximal.quaternion.w).toBeLessThan(1);
    expect(rightIndexProximal.quaternion.w).toBeLessThan(1);
    expect(applyVrmHandsRotationTargetsToBones({
      hands: null,
      isPlayer: true,
      lookupBone: () => null,
    })).toEqual({ applied: 0 });
  });
});
