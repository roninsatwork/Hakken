import type { Classifications } from "@mediapipe/tasks-vision";
import type { VRM } from "@pixiv/three-vrm";
import * as Kalidokit from "kalidokit";
import * as THREE from "three";
import { MOVEMENT_LANDMARK_MIRROR_PAIRS } from "./movementMirrorMapping";
import type { MovementDeepCaptureFrameEvidence } from "./movementDeepCaptureContract";
import type { MovementHandSide } from "./movementTypes";

export type VrmBlendshapeCategory = Classifications["categories"][number];

export type VrmLandmarkTuple = [number, number, number?];

export type VrmPoseLandmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
  isSnapped?: boolean;
};

export type VrmLandmarkInput = VrmPoseLandmark | VrmLandmarkTuple;

export type VrmSolverLandmark = {
  x: number;
  y: number;
  z: number;
  visibility: number;
  isSnapped?: boolean;
};

export type VrmHandCapture = {
  landmarks: VrmPoseLandmark[];
  worldLandmarks?: VrmPoseLandmark[] | null;
};

export type VrmHandsPayload = Partial<Record<MovementHandSide, VrmHandCapture | null>>;

export type VrmMotionPayload = {
  capturedAt?: number;
  frameId?: string;
  pose?: VrmPoseLandmark[];
  landmarks?: VrmPoseLandmark[];
  worldLandmarks?: VrmPoseLandmark[] | null;
  faceLandmarks?: VrmPoseLandmark[] | null;
  blendshapes?: VrmBlendshapeCategory[];
  deepCapture?: MovementDeepCaptureFrameEvidence;
  hands?: VrmHandsPayload;
};

export type VrmMotionFrame = VrmMotionPayload | VrmPoseLandmark[];

export type VrmMotionRef = VrmMotionFrame | null;

export type VrmNormalizedBoneName = Parameters<VRM["humanoid"]["getNormalizedBoneNode"]>[0];

export function lookupVrmNormalizedBone(
  vrm: VRM | null | undefined,
  boneName: string,
) {
  return vrm?.humanoid?.getNormalizedBoneNode(boneName as VrmNormalizedBoneName) ?? null;
}

export function createVrmNormalizedBoneLookup(
  getVrm: () => VRM | null | undefined,
) {
  return (boneName: string) => lookupVrmNormalizedBone(getVrm(), boneName);
}

export type VrmRigVector = {
  x: number;
  y: number;
  z: number;
};

export type VrmRigRotation = VrmRigVector & {
  rotationOrder?: string;
};

export type VrmHandRig = Record<string, VrmRigRotation | undefined>;

export type VrmHandRotationSpec = {
  isThumb: boolean;
  isWrist: boolean;
  rigKey: string;
  shouldApply: boolean;
  vrmName: string;
};

export type VrmHandRotationTarget = {
  rigKey: string;
  rotation: VrmRigRotation;
  slerp: number;
  vrmName: string;
};

export type VrmHandRotationApplicationTarget = VrmHandRotationTarget & {
  targetQuaternion: THREE.Quaternion;
};

export type VrmHandRotationTargetApplicationResult = {
  applied: boolean;
};

export type VrmArmRotationTarget = {
  bone: string;
  rotation: VrmRigRotation;
  slerp: number;
};

export type VrmArmStoredRotationTarget = {
  bone: string;
  slerp: number;
};

export type VrmStoredRotationTargetApplicationResult = {
  applied: boolean;
};

export type VrmExpressionTarget = {
  name:
    | "aa"
    | "angry"
    | "blinkLeft"
    | "blinkRight"
    | "ee"
    | "happy"
    | "lookDown"
    | "lookLeft"
    | "lookRight"
    | "lookUp"
    | "oh"
    | "ou"
    | "sad"
    | "surprised";
  value: number;
};

export type VrmExpressionTargetWriter = {
  setValue: (name: VrmExpressionTarget["name"], value: number) => void;
};

export type VrmExpressionTargetApplicationResult = {
  applied: boolean;
};

export type VrmRigRotationLimits = Partial<Record<"x" | "y" | "z", number>>;

export type VrmRigRotationApplicationTarget = {
  bone: string;
  remember: boolean;
  rotation: VrmRigRotation;
  slerp: number;
  targetQuaternion: THREE.Quaternion;
};

export type VrmNamedRotationTarget = {
  bone: string;
  remember?: boolean;
  rotation: VrmRigRotation;
  slerp: number;
};

export type VrmQuaternionBoneLike = {
  quaternion: THREE.Quaternion;
};

const PLAYER_FINGER_GAIN = 1.35;
const INSTRUCTOR_FINGER_GAIN = 1.15;
const THUMB_GAIN_MULTIPLIER = 0.9;
const ARM_LAST_GOOD_SLERP = 0.42;

function clampRotation(value: number, limit = Math.PI) {
  return Math.max(-limit, Math.min(limit, value));
}

export function getVrmMotionLandmarks(value: VrmMotionRef): VrmPoseLandmark[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return value.pose ?? value.landmarks ?? [];
}

type PrepareVrmSolverInput = {
  rawLandmarks: VrmLandmarkInput[];
  payload: VrmMotionPayload | null;
  isPlayer: boolean;
  isPlaying: boolean;
  mirrorForDisplay?: boolean;
};

export function normalizeVrmLandmark(landmark: VrmLandmarkInput): VrmSolverLandmark {
  if (Array.isArray(landmark)) {
    return {
      x: landmark[0],
      y: landmark[1],
      z: landmark[2] ?? 0,
      visibility: 0.8,
    };
  }

  return {
    x: landmark.x,
    y: landmark.y,
    z: landmark.z ?? 0,
    visibility: landmark.visibility ?? 0.8,
    isSnapped: landmark.isSnapped,
  };
}

export function mirrorVrmLandmarkArray(
  arr: VrmSolverLandmark[],
  invertX: (x: number) => number,
) {
  reflectVrmLandmarkArrayCoordinates(arr, invertX);
  swapVrmLandmarkArraySides(arr);
}

export function reflectVrmLandmarkArrayCoordinates(
  arr: VrmSolverLandmark[],
  reflectX: (x: number) => number,
) {
  arr.forEach((lm) => {
    lm.x = reflectX(lm.x);
  });
}

export function swapVrmLandmarkArraySides(arr: VrmSolverLandmark[]) {
  MOVEMENT_LANDMARK_MIRROR_PAIRS.forEach(([leftIndex, rightIndex]) => {
    if (arr[leftIndex] && arr[rightIndex]) {
      const temp = { ...arr[leftIndex] };
      arr[leftIndex] = { ...arr[rightIndex] };
      arr[rightIndex] = temp;
    }
  });
}

function reflectHandsPayloadCoordinates(hands: VrmHandsPayload): VrmHandsPayload {
  return Object.fromEntries(
    (["left", "right"] as const).map((side) => {
      const hand = hands[side];
      if (!hand) return [side, hand];

      return [side, {
        ...hand,
        landmarks: hand.landmarks.map((landmark) => ({ ...landmark })),
        worldLandmarks: hand.worldLandmarks?.map((landmark) => ({
          ...landmark,
          x: -landmark.x,
        })) ?? hand.worldLandmarks,
      }];
    }),
  ) as VrmHandsPayload;
}

function swapHandsPayloadSides(hands: VrmHandsPayload): VrmHandsPayload {
  const mirroredHands: VrmHandsPayload = {};

  if (hands.left) {
    mirroredHands.right = { ...hands.left };
  }

  if (hands.right) {
    mirroredHands.left = { ...hands.right };
  }

  return mirroredHands;
}

function swapDeepCaptureHandSides(
  deepCapture: MovementDeepCaptureFrameEvidence,
): MovementDeepCaptureFrameEvidence {
  if (!deepCapture.hands) return deepCapture;
  return {
    ...deepCapture,
    hands: {
      left: deepCapture.hands.right ?? null,
      right: deepCapture.hands.left ?? null,
    },
  };
}

function mirrorBlendshapeSides(blendshapes: VrmBlendshapeCategory[]) {
  return blendshapes.map((blendshape) => {
    let name = blendshape.categoryName;
    if (name.includes("Left")) name = name.replace("Left", "Right");
    else if (name.includes("Right")) name = name.replace("Right", "Left");
    return { ...blendshape, categoryName: name };
  });
}

const VRM_FACE_MIRROR_INDEX_PAIRS = [
  [33, 263],
] as const;

function reflectFaceLandmarksForDisplay(faceLandmarks: VrmSolverLandmark[]) {
  return faceLandmarks.map((landmark) => ({
    ...landmark,
    x: 1 - landmark.x,
  }));
}

function swapFaceLandmarkSides(faceLandmarks: VrmSolverLandmark[]) {
  const swappedFaceLandmarks = faceLandmarks.map((landmark) => ({ ...landmark }));
  VRM_FACE_MIRROR_INDEX_PAIRS.forEach(([leftIndex, rightIndex]) => {
    const left = swappedFaceLandmarks[leftIndex];
    const right = swappedFaceLandmarks[rightIndex];
    if (!left || !right) return;
    swappedFaceLandmarks[leftIndex] = right;
    swappedFaceLandmarks[rightIndex] = left;
  });

  return swappedFaceLandmarks;
}

export function prepareVrmSolverInput({
  rawLandmarks,
  payload,
  isPlayer,
  isPlaying,
  mirrorForDisplay = false,
}: PrepareVrmSolverInput) {
  const forceStandby = !isPlayer && !isPlaying;
  const shouldReflectCoordinates = !isPlayer || mirrorForDisplay;
  const shouldSwapAnatomicalSides = mirrorForDisplay;
  const format = (landmark: VrmLandmarkInput) => {
    const normalized = normalizeVrmLandmark(landmark);
    return {
      ...normalized,
      visibility: forceStandby ? 0 : normalized.visibility,
    };
  };

  const imageLandmarks = rawLandmarks.map(format);
  // World landmarks only; there is no image-space fallback because every
  // consumer either requires genuine world data or falls back to
  // imageLandmarks itself.
  const solverLandmarks: VrmSolverLandmark[] | null =
    payload?.worldLandmarks ? payload.worldLandmarks.map(format) : null;
  let faceLandmarks = payload?.faceLandmarks?.map(format);
  let rigHands = payload?.hands;
  let rigBlendshapes = payload?.blendshapes;
  let rigDeepCapture = payload?.deepCapture;

  if (shouldReflectCoordinates) {
    reflectVrmLandmarkArrayCoordinates(imageLandmarks, (x) => 1 - x);
    if (solverLandmarks) {
      reflectVrmLandmarkArrayCoordinates(solverLandmarks, (x) => -x);
    }

    if (payload?.hands) {
      rigHands = reflectHandsPayloadCoordinates(payload.hands);
    }

    if (faceLandmarks) {
      faceLandmarks = reflectFaceLandmarksForDisplay(faceLandmarks);
    }
  }

  if (shouldSwapAnatomicalSides) {
    swapVrmLandmarkArraySides(imageLandmarks);
    if (solverLandmarks) {
      swapVrmLandmarkArraySides(solverLandmarks);
    }
    if (rigHands) {
      rigHands = swapHandsPayloadSides(rigHands);
    }
    if (rigDeepCapture) {
      rigDeepCapture = swapDeepCaptureHandSides(rigDeepCapture);
    }
    if (payload?.blendshapes) {
      rigBlendshapes = mirrorBlendshapeSides(payload.blendshapes);
    }
    if (faceLandmarks) {
      faceLandmarks = swapFaceLandmarkSides(faceLandmarks);
    }
  }

  return {
    faceLandmarks,
    forceStandby,
    imageLandmarks,
    solverLandmarks,
    rigHands,
    rigBlendshapes,
    rigDeepCapture,
  };
}




export function solveVrmHand(
  landmarks: VrmPoseLandmark[],
  handedness: "Left" | "Right",
): VrmHandRig | null {
  const solverLandmarks = landmarks.map((landmark) => ({
    ...landmark,
    z: landmark.z ?? 0,
  }));

  return Kalidokit.Hand.solve(solverLandmarks, handedness) as VrmHandRig | null;
}

export function prepareVrmHandLandmarks(
  handData: VrmHandCapture,
  options: { mirrorX?: boolean } = {},
): VrmPoseLandmark[] {
  const sourceLandmarks = handData.landmarks;

  return sourceLandmarks.map((landmark) => ({
    ...landmark,
    x: options.mirrorX ? 1 - landmark.x : landmark.x,
  }));
}

export function resolveVrmHandRigOptions({
  isPlayer,
  mirrorForDisplay = false,
}: {
  isPlayer: boolean;
  mirrorForDisplay?: boolean;
}) {
  return {
    isPlayer,
    mirrorX: !isPlayer || mirrorForDisplay,
    slerp: isPlayer ? 0.85 : 0.55,
  };
}

export function resolveVrmHandRotationSpecs(
  side: MovementHandSide,
  options: { applyWrist?: boolean } = {},
): VrmHandRotationSpec[] {
  const handedness = side === "left" ? "Left" : "Right";
  const fingers = ["Thumb", "Index", "Middle", "Ring", "Little"];
  const joints = ["Proximal", "Intermediate", "Distal"];

  return [
    {
      isThumb: false,
      isWrist: true,
      rigKey: `${handedness}Wrist`,
      shouldApply: options.applyWrist ?? false,
      vrmName: `${side}Hand`,
    },
    ...fingers.flatMap((finger) =>
      joints.map((joint) => ({
        isThumb: finger === "Thumb",
        isWrist: false,
        rigKey: `${handedness}${finger}${joint}`,
        shouldApply: true,
        vrmName: `${side}${finger}${joint}`,
      })),
    ),
  ];
}

export function strengthenVrmHandRotation(
  rotation: VrmRigRotation,
  options: { isPlayer: boolean; isWrist: boolean; isThumb: boolean },
): VrmRigRotation {
  if (options.isWrist) return rotation;

  const baseGain = options.isPlayer ? PLAYER_FINGER_GAIN : INSTRUCTOR_FINGER_GAIN;
  const gain = options.isThumb ? baseGain * THUMB_GAIN_MULTIPLIER : baseGain;

  return {
    ...rotation,
    x: clampRotation(rotation.x * gain),
    y: clampRotation(rotation.y * gain),
    z: clampRotation(rotation.z * gain),
  };
}

export function resolveVrmHandRotationTargets({
  applyWrist = false,
  isPlayer,
  rig,
  side,
  slerp,
}: {
  applyWrist?: boolean;
  isPlayer: boolean;
  rig: VrmHandRig;
  side: MovementHandSide;
  slerp: number;
}): VrmHandRotationTarget[] {
  return resolveVrmHandRotationSpecs(side, { applyWrist }).flatMap((spec) => {
    if (!spec.shouldApply) return [];

    const rotation = rig[spec.rigKey];
    if (!rotation) return [];

    return [{
      rigKey: spec.rigKey,
      rotation: strengthenVrmHandRotation(rotation, {
        isPlayer,
        isThumb: spec.isThumb,
        isWrist: spec.isWrist,
      }),
      slerp: spec.isWrist ? Math.min(slerp, 0.35) : slerp,
      vrmName: spec.vrmName,
    }];
  });
}

export function resolveVrmRigRotationApplicationTarget({
  bone,
  limits,
  remember = true,
  rotation,
  scale = 1,
  slerp,
}: {
  bone: string;
  limits?: VrmRigRotationLimits;
  remember?: boolean;
  rotation?: VrmRigRotation;
  scale?: number;
  slerp: number;
}): VrmRigRotationApplicationTarget | null {
  if (!rotation) return null;

  const targetEuler = new THREE.Euler(
    limits?.x ? clampRotation(rotation.x * scale, limits.x) : rotation.x * scale,
    limits?.y ? clampRotation(rotation.y * scale, limits.y) : rotation.y * scale,
    limits?.z ? clampRotation(rotation.z * scale, limits.z) : rotation.z * scale,
    (rotation.rotationOrder || "XYZ") as THREE.EulerOrder,
  );

  return {
    bone,
    remember,
    rotation,
    slerp,
    targetQuaternion: new THREE.Quaternion().setFromEuler(targetEuler),
  };
}

export function resolveVrmDemoFallbackRotationTargets({
  slerp,
}: {
  slerp: number;
}): VrmNamedRotationTarget[] {
  return [
    { bone: "spine", rotation: { x: 0.04, y: 0, z: 0 }, slerp },
    { bone: "chest", rotation: { x: 0.03, y: 0, z: 0 }, slerp },
    { bone: "rightUpperArm", rotation: { x: 0, y: 0, z: -1.12 }, slerp },
    { bone: "leftUpperArm", rotation: { x: 0, y: 0, z: 1.12 }, slerp },
    { bone: "rightLowerArm", rotation: { x: 0, y: 0, z: -0.12 }, slerp },
    { bone: "leftLowerArm", rotation: { x: 0, y: 0, z: 0.12 }, slerp },
    { bone: "rightHand", rotation: { x: 0, y: 0, z: 0 }, slerp },
    { bone: "leftHand", rotation: { x: 0, y: 0, z: 0 }, slerp },
    { bone: "hips", rotation: { x: 0, y: 0, z: 0 }, slerp },
    { bone: "rightUpperLeg", rotation: { x: 0, y: 0, z: 0 }, slerp },
    { bone: "rightLowerLeg", rotation: { x: 0, y: 0, z: 0 }, slerp },
    { bone: "leftUpperLeg", rotation: { x: 0, y: 0, z: 0 }, slerp },
    { bone: "leftLowerLeg", rotation: { x: 0, y: 0, z: 0 }, slerp },
    { bone: "rightFoot", rotation: { x: 0, y: 0, z: 0 }, slerp },
    { bone: "leftFoot", rotation: { x: 0, y: 0, z: 0 }, slerp },
  ];
}

export function applyVrmDemoFallbackPoseToBones({
  lookupBone,
  slerp,
}: {
  lookupBone: (boneName: string) => VrmQuaternionBoneLike | null | undefined;
  slerp: number;
}) {
  return applyVrmNamedRotationTargetsToBones({
    lookupBone,
    targets: resolveVrmDemoFallbackRotationTargets({ slerp }),
  });
}

export function applyVrmRigRotationApplicationTarget({
  apply,
  target,
  storeLastGood,
}: {
  apply: (target: VrmRigRotationApplicationTarget) => false | THREE.Quaternion | null | void;
  target: VrmRigRotationApplicationTarget | null;
  storeLastGood?: (bone: string, quaternion: THREE.Quaternion) => void;
}) {
  if (!target) {
    return {
      applied: false,
    };
  }

  const finalLocalQuaternion = apply(target);
  const applied = finalLocalQuaternion !== false && finalLocalQuaternion !== null;

  if (applied && target.remember && finalLocalQuaternion instanceof THREE.Quaternion) {
    storeLastGood?.(target.bone, finalLocalQuaternion);
  }

  return {
    applied,
  };
}

export function applyVrmNamedRotationTargets({
  apply,
  storeLastGood,
  targets,
}: {
  apply: (target: VrmRigRotationApplicationTarget) => false | THREE.Quaternion | null | void;
  storeLastGood?: (bone: string, quaternion: THREE.Quaternion) => void;
  targets: VrmNamedRotationTarget[];
}) {
  let applied = 0;

  targets.forEach((target) => {
    const result = applyVrmRigRotationApplicationTarget({
      apply,
      storeLastGood,
      target: resolveVrmRigRotationApplicationTarget({
        bone: target.bone,
        remember: target.remember ?? false,
        rotation: target.rotation,
        slerp: target.slerp,
      }),
    });

    if (result.applied) applied += 1;
  });

  return {
    applied,
  };
}

export function applyVrmNamedRotationTargetsToBones({
  lookupBone,
  storeLastGood,
  targets,
}: {
  lookupBone: (boneName: string) => VrmQuaternionBoneLike | null | undefined;
  storeLastGood?: (bone: string, quaternion: THREE.Quaternion) => void;
  targets: VrmNamedRotationTarget[];
}) {
  return applyVrmNamedRotationTargets({
    apply: (target) => {
      const bone = lookupBone(target.bone);
      if (!bone) return false;

      bone.quaternion.slerp(target.targetQuaternion, target.slerp);
      return bone.quaternion.clone();
    },
    storeLastGood,
    targets,
  });
}

export function applyVrmNamedRotationTargetToBones({
  bone,
  lookupBone,
  remember,
  rotation,
  slerp,
  storeLastGood,
}: VrmNamedRotationTarget & {
  lookupBone: (boneName: string) => VrmQuaternionBoneLike | null | undefined;
  storeLastGood?: (bone: string, quaternion: THREE.Quaternion) => void;
}) {
  return applyVrmNamedRotationTargetsToBones({
    lookupBone,
    storeLastGood,
    targets: [{
      bone,
      remember,
      rotation,
      slerp,
    }],
  });
}

function getVrmArmBones(side: MovementHandSide) {
  return [
    `${side}UpperArm`,
    `${side}LowerArm`,
    `${side}Hand`,
  ];
}

export function resolveVrmArmRelaxedRotationTargets({
  side,
  slerp,
}: {
  side: MovementHandSide;
  slerp: number;
}): VrmArmRotationTarget[] {
  const direction = side === "right" ? -1 : 1;

  return [
    {
      bone: `${side}UpperArm`,
      rotation: { x: 0, y: 0, z: direction * 1.12 },
      slerp,
    },
    {
      bone: `${side}LowerArm`,
      rotation: { x: 0, y: 0, z: direction * 0.12 },
      slerp,
    },
    {
      bone: `${side}Hand`,
      rotation: { x: 0, y: 0, z: 0 },
      slerp,
    },
  ];
}

export function resolveVrmArmLastGoodRotationTargets({
  side,
  slerp = ARM_LAST_GOOD_SLERP,
}: {
  side: MovementHandSide;
  slerp?: number;
}): VrmArmStoredRotationTarget[] {
  return getVrmArmBones(side).map((bone) => ({
    bone,
    slerp,
  }));
}

export function resolveVrmHandNeutralRotationTargets({
  side,
  slerp,
}: {
  side: MovementHandSide;
  slerp: number;
}): VrmArmRotationTarget[] {
  return [{
    bone: `${side}Hand`,
    rotation: { x: 0, y: 0, z: 0 },
    slerp,
  }];
}

export function applyVrmArmRelaxedPoseToBones({
  lookupBone,
  side,
  slerp,
}: {
  lookupBone: (boneName: string) => VrmQuaternionBoneLike | null | undefined;
  side: MovementHandSide;
  slerp: number;
}) {
  return applyVrmNamedRotationTargetsToBones({
    lookupBone,
    targets: resolveVrmArmRelaxedRotationTargets({ side, slerp }),
  });
}


export function applyVrmArmLastGoodPoseToBones({
  lastGood,
  lookupBone,
  side,
}: {
  lastGood: Partial<Record<string, THREE.Quaternion | null | undefined>>;
  lookupBone: (boneName: string) => VrmQuaternionBoneLike | null | undefined;
  side: MovementHandSide;
}) {
  return applyVrmArmStoredRotationTargets({
    apply: (target) => applyVrmStoredRotationTargetToBone({
      bone: lookupBone(target.bone),
      storedQuaternion: lastGood[target.bone],
      target,
    }).applied,
    targets: resolveVrmArmLastGoodRotationTargets({ side }),
  });
}

export function resolveVrmHandsRotationTargets({
  deepCapture,
  hands,
  isPlayer,
  mirrorForDisplay = false,
  solveHand = solveVrmHand,
}: {
  deepCapture?: MovementDeepCaptureFrameEvidence | null;
  hands?: VrmHandsPayload | null;
  isPlayer: boolean;
  mirrorForDisplay?: boolean;
  solveHand?: (landmarks: VrmPoseLandmark[], handedness: "Left" | "Right") => VrmHandRig | null;
}): VrmHandRotationTarget[] {
  if (!hands) return [];

  const handRigOptions = resolveVrmHandRigOptions({
    isPlayer,
    mirrorForDisplay,
  });

  return (["left", "right"] as MovementHandSide[]).flatMap((side) => {
    const handData = hands[side];
    if (!handData?.landmarks) return [];

    const handedness = side === "left" ? "Left" : "Right";
    const handLandmarks = prepareVrmHandLandmarks(handData, {
      mirrorX: handRigOptions.mirrorX,
    });
    const rig = solveHand(handLandmarks, handedness);
    if (!rig) return [];
    const orientation = deepCapture?.hands?.[side]?.orientation;
    const applyWrist = Boolean(
      orientation?.wristRotation &&
      orientation.facing !== "unknown" &&
      orientation.provenance.confidence >= 0.5
    );

    return resolveVrmHandRotationTargets({
      applyWrist,
      isPlayer: handRigOptions.isPlayer,
      rig,
      side,
      slerp: handRigOptions.slerp,
    });
  });
}

export function resolveVrmBlendshapeExpressionTargets(
  blendshapes?: VrmBlendshapeCategory[] | null,
): VrmExpressionTarget[] {
  if (!blendshapes) return [];

  const scores = new Map(blendshapes.map((blendshape) => [
    blendshape.categoryName,
    blendshape.score,
  ]));
  const present = (names: string[]) => names.some((name) => scores.has(name));
  const average = (names: string[]) => names.reduce(
    (sum, name) => sum + (scores.get(name) ?? 0),
    0,
  ) / names.length;
  const maximum = (names: string[]) => Math.max(...names.map((name) => scores.get(name) ?? 0));
  const targets: VrmExpressionTarget[] = [];

  if (scores.has("eyeBlinkLeft")) {
    targets.push({ name: "blinkLeft", value: scores.get("eyeBlinkLeft") ?? 0 });
  }
  if (scores.has("eyeBlinkRight")) {
    targets.push({ name: "blinkRight", value: scores.get("eyeBlinkRight") ?? 0 });
  }
  if (scores.has("jawOpen")) {
    targets.push({ name: "aa", value: Math.min(1, (scores.get("jawOpen") ?? 0) * 1.5) });
  }

  const smile = ["mouthSmileLeft", "mouthSmileRight"];
  targets.push({ name: "happy", value: average(smile) });

  const eyeLookUp = ["eyeLookUpLeft", "eyeLookUpRight"];
  const eyeLookDown = ["eyeLookDownLeft", "eyeLookDownRight"];
  const eyeLookLeft = ["eyeLookOutLeft", "eyeLookInRight"];
  const eyeLookRight = ["eyeLookInLeft", "eyeLookOutRight"];
  if (present(eyeLookUp)) targets.push({ name: "lookUp", value: average(eyeLookUp) });
  if (present(eyeLookDown)) targets.push({ name: "lookDown", value: average(eyeLookDown) });
  if (present(eyeLookLeft)) targets.push({ name: "lookLeft", value: average(eyeLookLeft) });
  if (present(eyeLookRight)) targets.push({ name: "lookRight", value: average(eyeLookRight) });

  const surprise = ["browInnerUp", "eyeWideLeft", "eyeWideRight"];
  const anger = ["browDownLeft", "browDownRight", "noseSneerLeft", "noseSneerRight"];
  const sadness = ["mouthFrownLeft", "mouthFrownRight", "browOuterUpLeft", "browOuterUpRight"];
  if (present(surprise)) targets.push({ name: "surprised", value: maximum(surprise) });
  if (present(anger)) targets.push({ name: "angry", value: average(anger) });
  if (present(sadness)) targets.push({ name: "sad", value: average(sadness) });
  if (scores.has("mouthPucker")) targets.push({ name: "ou", value: scores.get("mouthPucker") ?? 0 });
  if (scores.has("mouthFunnel")) targets.push({ name: "oh", value: scores.get("mouthFunnel") ?? 0 });
  if (present(["mouthStretchLeft", "mouthStretchRight"])) {
    targets.push({
      name: "ee",
      value: average(["mouthStretchLeft", "mouthStretchRight"]),
    });
  }

  return targets;
}

export function applyVrmExpressionTargets({
  apply,
  targets,
}: {
  apply: (target: VrmExpressionTarget) => boolean | void;
  targets: VrmExpressionTarget[];
}) {
  let applied = 0;

  targets.forEach((target) => {
    const result = apply(target);
    if (result !== false) applied += 1;
  });

  return {
    applied,
  };
}

export function applyVrmExpressionTargetToManager({
  expressionManager,
  target,
}: {
  expressionManager: VrmExpressionTargetWriter | null | undefined;
  target: VrmExpressionTarget;
}): VrmExpressionTargetApplicationResult {
  if (!expressionManager) {
    return {
      applied: false,
    };
  }

  expressionManager.setValue(target.name, target.value);

  return {
    applied: true,
  };
}

export function applyVrmBlendshapeExpressionTargetsToManager({
  blendshapes,
  expressionManager,
}: {
  blendshapes?: VrmBlendshapeCategory[] | null;
  expressionManager: VrmExpressionTargetWriter | null | undefined;
}) {
  return applyVrmExpressionTargets({
    apply: (target) => applyVrmExpressionTargetToManager({
      expressionManager,
      target,
    }).applied,
    targets: resolveVrmBlendshapeExpressionTargets(blendshapes),
  });
}

export function applyVrmHandRotationTargets({
  apply,
  targets,
}: {
  apply: (target: VrmHandRotationApplicationTarget) => boolean | void;
  targets: VrmHandRotationTarget[];
}) {
  let applied = 0;

  targets.forEach((target) => {
    const result = apply({
      ...target,
      targetQuaternion: new THREE.Quaternion().setFromEuler(
        new THREE.Euler(target.rotation.x, target.rotation.y, target.rotation.z),
      ),
    });
    if (result !== false) applied += 1;
  });

  return {
    applied,
  };
}

export function applyVrmHandRotationTargetToBone({
  bone,
  target,
}: {
  bone: THREE.Object3D | null | undefined;
  target: VrmHandRotationApplicationTarget;
}): VrmHandRotationTargetApplicationResult {
  if (!bone) {
    return {
      applied: false,
    };
  }

  bone.quaternion.slerp(target.targetQuaternion, target.slerp);

  return {
    applied: true,
  };
}

export function applyVrmHandsRotationTargetsToBones({
  deepCapture,
  hands,
  isPlayer,
  lookupBone,
  mirrorForDisplay = false,
  solveHand,
}: {
  deepCapture?: MovementDeepCaptureFrameEvidence | null;
  hands?: VrmHandsPayload | null;
  isPlayer: boolean;
  lookupBone: (vrmName: string) => THREE.Object3D | null | undefined;
  mirrorForDisplay?: boolean;
  solveHand?: (landmarks: VrmPoseLandmark[], handedness: "Left" | "Right") => VrmHandRig | null;
}) {
  return applyVrmHandRotationTargets({
    apply: (target) => applyVrmHandRotationTargetToBone({
      bone: lookupBone(target.vrmName),
      target,
    }).applied,
    targets: resolveVrmHandsRotationTargets({
      deepCapture,
      hands,
      isPlayer,
      mirrorForDisplay,
      solveHand,
    }),
  });
}

export function applyVrmArmRotationTargets({
  apply,
  targets,
}: {
  apply: (target: VrmArmRotationTarget) => boolean | void;
  targets: VrmArmRotationTarget[];
}) {
  let applied = 0;

  targets.forEach((target) => {
    const result = apply(target);
    if (result !== false) applied += 1;
  });

  return {
    applied,
  };
}

export function applyVrmArmStoredRotationTargets({
  apply,
  targets,
}: {
  apply: (target: VrmArmStoredRotationTarget) => boolean | void;
  targets: VrmArmStoredRotationTarget[];
}) {
  let applied = 0;

  targets.forEach((target) => {
    const result = apply(target);
    if (result !== false) applied += 1;
  });

  return {
    applied,
  };
}

export function applyVrmStoredRotationTargetToBone({
  bone,
  storedQuaternion,
  target,
}: {
  bone: VrmQuaternionBoneLike | null | undefined;
  storedQuaternion: THREE.Quaternion | null | undefined;
  target: VrmArmStoredRotationTarget;
}): VrmStoredRotationTargetApplicationResult {
  if (!bone || !storedQuaternion) {
    return {
      applied: false,
    };
  }

  bone.quaternion.slerp(storedQuaternion, target.slerp);

  return {
    applied: true,
  };
}
