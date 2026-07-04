import * as THREE from "three";
import type { MovementAvatarBasisDirection } from "./movementAvatarPipeline";
import type { MovementAvatarRetargetRestBone } from "./movementAvatarRestPose";

export type MovementAvatarRestMappedQuaternionTarget = {
  targetLocalQuaternion: THREE.Quaternion;
  targetWorldQuaternion: THREE.Quaternion;
};

export function resolveMovementAvatarRestMappedQuaternionTarget({
  desiredWorldDirection,
  parentWorldQuaternion,
  restPose,
}: {
  desiredWorldDirection: THREE.Vector3;
  parentWorldQuaternion: THREE.Quaternion;
  restPose: MovementAvatarRetargetRestBone;
}): MovementAvatarRestMappedQuaternionTarget | null {
  if (desiredWorldDirection.lengthSq() < 0.000001) return null;

  const targetWorldOffset = new THREE.Quaternion().setFromUnitVectors(
    restPose.worldDirection,
    desiredWorldDirection.clone().normalize(),
  );
  const targetWorldQuaternion = targetWorldOffset.multiply(
    restPose.worldQuaternion.clone(),
  );
  const targetLocalQuaternion = parentWorldQuaternion
    .clone()
    .invert()
    .multiply(targetWorldQuaternion);

  return {
    targetLocalQuaternion,
    targetWorldQuaternion,
  };
}

export function resolveMovementAvatarBasisWorldDirection({
  basis,
  forward,
}: {
  basis: MovementAvatarBasisDirection;
  forward: THREE.Vector3;
}) {
  const down = new THREE.Vector3(0, -1, 0);
  const side = new THREE.Vector3(1, 0, 0);
  const direction = down
    .multiplyScalar(basis.down)
    .add(side.multiplyScalar(basis.side))
    .add(forward.clone().normalize().multiplyScalar(basis.forward));

  return direction.lengthSq() > 0.000001 ? direction.normalize() : null;
}
