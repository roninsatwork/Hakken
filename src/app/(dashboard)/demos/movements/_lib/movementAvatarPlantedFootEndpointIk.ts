import * as THREE from "three";

const EPSILON = 0.000001;

function setWorldQuaternion(object: THREE.Object3D, worldQuaternion: THREE.Quaternion) {
  if (!object.parent) {
    object.quaternion.copy(worldQuaternion);
    return;
  }
  const parentWorldQuaternion = object.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  object.quaternion.copy(parentWorldQuaternion.multiply(worldQuaternion)).normalize();
}

function alignBoneToWorldDirection({
  bone,
  child,
  desiredDirection,
  scene,
}: {
  bone: THREE.Object3D;
  child: THREE.Object3D;
  desiredDirection: THREE.Vector3;
  scene?: THREE.Object3D | null;
}) {
  scene?.updateMatrixWorld(true);
  const bonePosition = bone.getWorldPosition(new THREE.Vector3());
  const childPosition = child.getWorldPosition(new THREE.Vector3());
  const currentDirection = childPosition.sub(bonePosition);
  if (currentDirection.lengthSq() <= EPSILON || desiredDirection.lengthSq() <= EPSILON) return false;

  const worldQuaternion = bone.getWorldQuaternion(new THREE.Quaternion());
  const correction = new THREE.Quaternion().setFromUnitVectors(
    currentDirection.normalize(),
    desiredDirection.clone().normalize(),
  );
  setWorldQuaternion(bone, correction.multiply(worldQuaternion).normalize());
  scene?.updateMatrixWorld(true);
  return true;
}

/**
 * Moves a planted foot endpoint vertically by rotating the two leg joints.
 * The foot's world orientation is restored afterwards, so contact correction
 * does not undo the independently applied planted-foot plane target.
 */
export function applyMovementAvatarPlantedFootEndpointIk({
  foot,
  lowerLeg,
  scene,
  targetWorldY,
  upperLeg,
}: {
  foot: THREE.Object3D;
  lowerLeg: THREE.Object3D;
  scene?: THREE.Object3D | null;
  targetWorldY: number;
  upperLeg: THREE.Object3D;
}) {
  scene?.updateMatrixWorld(true);
  const hip = upperLeg.getWorldPosition(new THREE.Vector3());
  const knee = lowerLeg.getWorldPosition(new THREE.Vector3());
  const ankle = foot.getWorldPosition(new THREE.Vector3());
  const upperLength = hip.distanceTo(knee);
  const lowerLength = knee.distanceTo(ankle);
  if (upperLength <= EPSILON || lowerLength <= EPSILON) return false;

  const target = ankle.clone();
  target.y = targetWorldY;
  const hipToTarget = target.clone().sub(hip);
  const requestedDistance = hipToTarget.length();
  if (requestedDistance <= EPSILON) return false;

  const minDistance = Math.abs(upperLength - lowerLength) + EPSILON;
  const maxDistance = upperLength + lowerLength - EPSILON;
  if (requestedDistance < minDistance || requestedDistance > maxDistance) return false;

  const targetDirection = hipToTarget.clone().normalize();
  const currentUpperDirection = knee.clone().sub(hip).normalize();
  const currentLowerDirection = ankle.clone().sub(knee).normalize();
  let bendNormal = currentUpperDirection.clone().cross(currentLowerDirection);
  if (bendNormal.lengthSq() <= EPSILON) {
    bendNormal = targetDirection.clone().cross(new THREE.Vector3(0, 0, 1));
    if (bendNormal.lengthSq() <= EPSILON) {
      bendNormal = targetDirection.clone().cross(new THREE.Vector3(1, 0, 0));
    }
  }
  bendNormal.normalize();
  const bendDirection = bendNormal.clone().cross(targetDirection).normalize();
  const projectedLength = (
    upperLength * upperLength - lowerLength * lowerLength + requestedDistance * requestedDistance
  ) / (2 * requestedDistance);
  const bendLength = Math.sqrt(Math.max(0, upperLength * upperLength - projectedLength * projectedLength));
  const currentBendOffset = knee.clone().sub(hip).sub(
    targetDirection.clone().multiplyScalar(knee.clone().sub(hip).dot(targetDirection)),
  );
  if (currentBendOffset.dot(bendDirection) < 0) bendDirection.negate();
  const kneeTarget = hip.clone()
    .add(targetDirection.clone().multiplyScalar(projectedLength))
    .add(bendDirection.multiplyScalar(bendLength));
  const footWorldQuaternion = foot.getWorldQuaternion(new THREE.Quaternion());

  if (!alignBoneToWorldDirection({
    bone: upperLeg,
    child: lowerLeg,
    desiredDirection: kneeTarget.clone().sub(hip),
    scene,
  })) return false;
  scene?.updateMatrixWorld(true);
  const movedKnee = lowerLeg.getWorldPosition(new THREE.Vector3());
  if (!alignBoneToWorldDirection({
    bone: lowerLeg,
    child: foot,
    desiredDirection: target.clone().sub(movedKnee),
    scene,
  })) return false;

  scene?.updateMatrixWorld(true);
  setWorldQuaternion(foot, footWorldQuaternion);
  scene?.updateMatrixWorld(true);
  return true;
}
