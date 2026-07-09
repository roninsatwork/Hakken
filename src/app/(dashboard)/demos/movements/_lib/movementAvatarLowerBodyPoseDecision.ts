import { resolveMovementAvatarPlantedSquatIkOptions } from "./movementAvatarApplicationOptions";
import type {
  MovementAvatarBoneRotationSpec,
  MovementAvatarLegacyLowerBodyAimSpec,
  MovementAvatarPlantedSquatIkPoseDecision,
  MovementAvatarRigRotationSpec,
} from "./movementAvatarPipeline";

function smoothstep(value: number, min: number, max: number) {
  if (min === max) return value < min ? 0 : 1;
  const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return x * x * (3 - 2 * x);
}

export function resolveMovementAvatarLowerBodyNeutralPose({
  slerp,
}: {
  slerp: number;
}): MovementAvatarBoneRotationSpec[] {
  const neutral = { x: 0, y: 0, z: 0 };

  return [
    { bone: "rightUpperLeg", rotation: neutral, slerp },
    { bone: "rightLowerLeg", rotation: neutral, slerp },
    { bone: "leftUpperLeg", rotation: neutral, slerp },
    { bone: "leftLowerLeg", rotation: neutral, slerp },
    { bone: "rightFoot", rotation: neutral, slerp },
    { bone: "leftFoot", rotation: neutral, slerp },
  ];
}

export function resolveMovementAvatarSolvedLowerBodyPose({
  depth,
  slerp,
}: {
  depth: number;
  slerp: number;
}): MovementAvatarRigRotationSpec[] {
  const flexDepth = smoothstep(depth, 0.08, 0.88);
  if (flexDepth <= 0.001) return [];

  const scale = 1 + flexDepth * 1.05;
  const upperLegLimit = 1.15 + flexDepth * 0.35;
  const lowerLegLimit = 1.45 + flexDepth * 0.35;

  return [
    {
      bone: "rightUpperLeg",
      limits: { x: upperLegLimit, y: 0.8, z: 0.8 },
      remember: false,
      scale,
      slerp,
      source: "RightUpperLeg",
    },
    {
      bone: "leftUpperLeg",
      limits: { x: upperLegLimit, y: 0.8, z: 0.8 },
      remember: false,
      scale,
      slerp,
      source: "LeftUpperLeg",
    },
    {
      bone: "rightLowerLeg",
      limits: { x: lowerLegLimit, y: 0.6, z: 0.6 },
      remember: false,
      scale,
      slerp,
      source: "RightLowerLeg",
    },
    {
      bone: "leftLowerLeg",
      limits: { x: lowerLegLimit, y: 0.6, z: 0.6 },
      remember: false,
      scale,
      slerp,
      source: "LeftLowerLeg",
    },
  ];
}


export function resolveMovementAvatarSquatFlexionPose({
  bendBoost = 0.32,
  depth,
  slerp,
}: {
  bendBoost?: number;
  depth: number;
  slerp: number;
}): MovementAvatarBoneRotationSpec[] {
  const flexDepth = smoothstep(depth, 0.1, 0.92);
  if (flexDepth <= 0.001) return [];

  const upperLegPitch = (1.76 + bendBoost * 1.15) * flexDepth;
  const lowerLegPitch = -(2.12 + bendBoost * 1.15) * flexDepth;
  const footPitch = 0.72 * flexDepth;
  const kneeOut = 0.12 * flexDepth;

  return [
    {
      bone: "rightUpperLeg",
      rotation: { x: upperLegPitch, y: 0, z: -kneeOut },
      slerp,
    },
    {
      bone: "leftUpperLeg",
      rotation: { x: upperLegPitch, y: 0, z: kneeOut },
      slerp,
    },
    {
      bone: "rightLowerLeg",
      rotation: { x: lowerLegPitch, y: 0, z: kneeOut * 0.35 },
      slerp,
    },
    {
      bone: "leftLowerLeg",
      rotation: { x: lowerLegPitch, y: 0, z: -kneeOut * 0.35 },
      slerp,
    },
    {
      bone: "rightFoot",
      rotation: { x: footPitch, y: 0, z: 0 },
      slerp: slerp * 0.75,
    },
    {
      bone: "leftFoot",
      rotation: { x: footPitch, y: 0, z: 0 },
      slerp: slerp * 0.75,
    },
  ];
}

export function resolveMovementAvatarSingleLegRaisePose({
  depth,
  lowerLegBoost = 0,
  side,
  slerp,
  upperLegBoost = 0,
}: {
  depth: number;
  lowerLegBoost?: number;
  side: "left" | "right";
  slerp: number;
  upperLegBoost?: number;
}): MovementAvatarBoneRotationSpec[] {
  const liftDepth = smoothstep(depth, 0.1, 0.45);
  if (liftDepth <= 0.001) return [];

  const plantedSide = side === "left" ? "right" : "left";
  const kneeOut = side === "left" ? 0.42 : -0.42;
  const upperLegPitch = (1.88 + upperLegBoost) * liftDepth;
  const lowerLegPitch = -(1.24 + lowerLegBoost) * liftDepth;

  return [
    {
      bone: `${side}UpperLeg`,
      rotation: { x: upperLegPitch, y: 0.08 * liftDepth, z: kneeOut * 1.4 * liftDepth },
      slerp,
    },
    {
      bone: `${side}LowerLeg`,
      rotation: { x: lowerLegPitch, y: 0, z: -kneeOut * 0.5 * liftDepth },
      slerp,
    },
    {
      bone: `${side}Foot`,
      rotation: { x: 0.48 * liftDepth, y: 0, z: 0 },
      slerp: slerp * 0.82,
    },
    {
      bone: `${plantedSide}UpperLeg`,
      rotation: { x: 0, y: 0, z: 0 },
      slerp: 0.28,
    },
    {
      bone: `${plantedSide}LowerLeg`,
      rotation: { x: 0, y: 0, z: 0 },
      slerp: 0.28,
    },
    {
      bone: `${plantedSide}Foot`,
      rotation: { x: 0, y: 0, z: 0 },
      slerp: 0.12,
    },
  ];
}

export function resolveMovementAvatarPlantedSquatIkPose({
  avatarRole,
  depth,
}: {
  avatarRole: "instructor" | "player";
  depth: number;
}): MovementAvatarPlantedSquatIkPoseDecision {
  const ikDepth = smoothstep(depth, 0.16, 0.82);
  if (ikDepth <= 0.001) {
    return {
      ikDepth: 0,
      specs: [],
    };
  }

  const kneeOut = 0.3 * ikDepth;
  const kneeForward = 0.86 * ikDepth;
  const ankleBack = 0.4 * ikDepth;
  const thighDown = 0.72 - ikDepth * 0.2;
  const shinDown = 0.8 - ikDepth * 0.12;
  const footBrace = 0.18 * ikDepth;
  const { footSlerp, legSlerp } = resolveMovementAvatarPlantedSquatIkOptions({
    avatarRole,
  });

  return {
    ikDepth,
    specs: [
      {
        bone: "rightUpperLeg",
        direction: { down: thighDown, side: -kneeOut, forward: kneeForward },
        slerp: legSlerp,
      },
      {
        bone: "leftUpperLeg",
        direction: { down: thighDown, side: kneeOut, forward: kneeForward },
        slerp: legSlerp,
      },
      {
        bone: "rightLowerLeg",
        direction: { down: shinDown, side: kneeOut * 0.38, forward: -ankleBack },
        slerp: legSlerp,
      },
      {
        bone: "leftLowerLeg",
        direction: { down: shinDown, side: -kneeOut * 0.38, forward: -ankleBack },
        slerp: legSlerp,
      },
      {
        bone: "rightFoot",
        direction: { down: 0.08, side: -footBrace * 0.2, forward: 1 },
        slerp: footSlerp,
      },
      {
        bone: "leftFoot",
        direction: { down: 0.08, side: footBrace * 0.2, forward: 1 },
        slerp: footSlerp,
      },
    ],
  };
}
