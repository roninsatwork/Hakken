import type * as THREE from "three";
import type { PatrolModel } from "./CharacterAssets";
import { WORLD_SCALE } from "./WorldLayout";

export const GUARD_CYCLE_DISTANCE = 0.48 / 0.32;

/** Low, inward-facing hands leave the route clear; movement follows travelled distance. */
export function poseHands(
  hands: THREE.Group, stride: number, moving: boolean, steady: boolean, dashTime: number,
) {
  hands.children.forEach((hand, index) => {
    const side = index === 0 ? -1 : 1;
    const swing = moving && !steady ? Math.sin(stride + index * Math.PI) : 0;
    const dash = steady ? 0 : Math.min(1, dashTime / 0.12);
    hand.position.set(side * (0.265 + dash * 0.035), -0.285 + swing * 0.017 - dash * 0.045,
      -0.49 + swing * 0.028 + dash * 0.03);
    hand.rotation.set(-1.18 + swing * 0.075, side * 0.24, side * (0.5 + swing * 0.045));
  });
}

/** Two-bone planted step. Stance travels backwards as the body travels forwards. */
export function guardStep(phase: number, moving: boolean) {
  const t = ((phase / (Math.PI * 2)) % 1 + 1) % 1;
  const stance = t < 0.32;
  const progress = stance ? t / 0.32 : (t - 0.32) / 0.68;
  const z = moving ? (stance ? -0.24 + 0.48 * progress : 0.24 * Math.cos(progress * Math.PI)) : 0;
  const lift = moving && !stance ? Math.sin(progress * Math.PI) * 0.09 : 0;
  const y = -0.58 + lift;
  const length = Math.hypot(y, z), bone = 0.32;
  const bend = 2 * Math.acos(Math.min(1, length / (2 * bone)));
  const hip = Math.atan2(-z, -y) + bend / 2;
  const knee = -bend;
  return { hip, knee, ankle: -(hip + knee), z, lift };
}

export function posePatrol(model: PatrolModel, kind: "guard" | "hound", stride: number, moving: boolean) {
  const phase = kind === "guard"
    ? stride * WORLD_SCALE / GUARD_CYCLE_DISTANCE * Math.PI * 2
    : stride / 9;
  model.limbs.forEach((limb, index) => {
    if (kind === "guard" && index % 2 === 0) {
      const step = guardStep(phase + (index === 0 ? 0 : Math.PI), moving);
      limb.rotation.x = step.hip;
      const knee = limb.getObjectByName("knee"), ankle = limb.getObjectByName("ankle");
      if (knee) knee.rotation.x = step.knee;
      if (ankle) ankle.rotation.x = step.ankle;
    } else {
      const swing = moving ? Math.sin(phase + (index === 0 || index === 3 ? 0 : Math.PI)) : 0;
      limb.rotation.x = swing * (kind === "hound" ? 0.48 : 0.28);
      const knee = limb.getObjectByName("knee"), elbow = limb.getObjectByName("elbow");
      if (knee) knee.rotation.x = 0.12 + Math.max(0, -swing) * 0.65;
      if (elbow) elbow.rotation.x = -0.22 - Math.max(0, swing) * 0.22;
    }
  });
}
