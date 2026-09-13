import * as THREE from "three";
import { expect, it } from "vitest";
import { GUARD_CYCLE_DISTANCE, guardStep, poseHands, posePatrol } from "./CharacterAnimation";
import { patrolModel } from "./CharacterAssets";
import { WORLD_SCALE } from "./WorldLayout";

it("plants the rendered guard ankle in world space throughout stance", () => {
  const material = new THREE.MeshStandardMaterial();
  const mats = Object.fromEntries(["cloth", "leather", "skin", "gold", "wood", "straw", "lit"]
    .map((name) => [name, material]));
  const model = patrolModel("guard", mats);
  const ankle = model.limbs[0].getObjectByName("ankle")!;
  const feet: THREE.Vector3[] = [];
  for (const t of [0.025, 0.08, 0.15, 0.22, 0.30]) {
    const travelled = t * GUARD_CYCLE_DISTANCE;
    model.group.position.z = -travelled;
    posePatrol(model, "guard", travelled / WORLD_SCALE, true);
    feet.push(ankle.getWorldPosition(new THREE.Vector3()));
    const rotation = ankle.getWorldQuaternion(new THREE.Quaternion());
    expect(rotation.angleTo(new THREE.Quaternion())).toBeLessThan(0.001);
  }
  for (const foot of feet) expect(foot.distanceTo(feet[0])).toBeLessThan(0.001);
  model.group.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
  material.dispose();
});

it("lifts the foot during recovery and keeps the leg solution finite", () => {
  for (let sample = 0; sample <= 240; sample++) {
    const step = guardStep(sample / 240 * Math.PI * 2, true);
    expect(Object.values(step).every(Number.isFinite)).toBe(true);
    expect(step.knee).toBeLessThanOrEqual(0);
  }
  expect(guardStep(Math.PI * 2 * 0.66, true).lift).toBeGreaterThan(0.08);
  expect(guardStep(0.5, false)).toEqual(guardStep(5.5, false));
});

it("keeps hands mirrored and steady camera free from stride or dash movement", () => {
  const hands = new THREE.Group();
  hands.add(new THREE.Group(), new THREE.Group());
  poseHands(hands, 0, false, true, 0);
  const reference = hands.children.map((h) => ({ p: h.position.clone(), q: h.quaternion.clone() }));
  poseHands(hands, 7.2, true, true, 0.2);
  hands.children.forEach((hand, i) => {
    expect(hand.position.distanceTo(reference[i].p)).toBe(0);
    expect(hand.quaternion.angleTo(reference[i].q)).toBeLessThan(0.001);
  });
  expect(hands.children[0].position.x).toBe(-hands.children[1].position.x);
  poseHands(hands, Math.PI / 2, true, false, 0);
  expect(hands.children[0].position.y - reference[0].p.y).toBeGreaterThan(0);
  expect(hands.children[1].position.y - reference[1].p.y).toBeLessThan(0);
});
