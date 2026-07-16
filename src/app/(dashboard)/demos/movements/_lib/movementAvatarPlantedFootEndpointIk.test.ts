import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { applyMovementAvatarPlantedFootEndpointIk } from "./movementAvatarPlantedFootEndpointIk";

describe("movement avatar planted-foot endpoint IK", () => {
  it("lowers a reachable foot through the leg chain without translating or tilting the foot bone", () => {
    const scene = new THREE.Scene();
    const upperLeg = new THREE.Object3D();
    const lowerLeg = new THREE.Object3D();
    const foot = new THREE.Object3D();
    upperLeg.position.set(0, 2, 0);
    lowerLeg.position.set(0.45, -0.85, 0.1);
    foot.position.set(-0.35, -0.72, 0.15);
    foot.rotation.set(0.2, -0.1, 0.08);
    scene.add(upperLeg);
    upperLeg.add(lowerLeg);
    lowerLeg.add(foot);
    scene.updateMatrixWorld(true);

    const upperLocalPosition = upperLeg.position.clone();
    const lowerLocalPosition = lowerLeg.position.clone();
    const footLocalPosition = foot.position.clone();
    const initialFoot = foot.getWorldPosition(new THREE.Vector3());
    const initialFootWorldQuaternion = foot.getWorldQuaternion(new THREE.Quaternion());

    expect(applyMovementAvatarPlantedFootEndpointIk({
      foot,
      lowerLeg,
      scene,
      targetWorldY: initialFoot.y - 0.1,
      upperLeg,
    })).toBe(true);

    const finalFoot = foot.getWorldPosition(new THREE.Vector3());
    const finalFootWorldQuaternion = foot.getWorldQuaternion(new THREE.Quaternion());
    expect(finalFoot.y).toBeCloseTo(initialFoot.y - 0.1, 5);
    expect(finalFoot.x).toBeCloseTo(initialFoot.x, 5);
    expect(finalFoot.z).toBeCloseTo(initialFoot.z, 5);
    expect(upperLeg.position).toEqual(upperLocalPosition);
    expect(lowerLeg.position).toEqual(lowerLocalPosition);
    expect(foot.position).toEqual(footLocalPosition);
    expect(Math.abs(finalFootWorldQuaternion.dot(initialFootWorldQuaternion))).toBeCloseTo(1, 5);
  });

  it("refuses an unreachable endpoint instead of stretching the skeleton", () => {
    const scene = new THREE.Scene();
    const upperLeg = new THREE.Object3D();
    const lowerLeg = new THREE.Object3D();
    const foot = new THREE.Object3D();
    lowerLeg.position.y = -1;
    foot.position.y = -1;
    scene.add(upperLeg);
    upperLeg.add(lowerLeg);
    lowerLeg.add(foot);
    scene.updateMatrixWorld(true);

    expect(applyMovementAvatarPlantedFootEndpointIk({
      foot,
      lowerLeg,
      scene,
      targetWorldY: -3,
      upperLeg,
    })).toBe(false);
  });
});
