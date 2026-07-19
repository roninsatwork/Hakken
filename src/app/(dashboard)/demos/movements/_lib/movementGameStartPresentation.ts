import type {
  MovementCameraConfidenceRecoveryCue,
  MovementStartReadiness,
} from "./movementSourceFrame";

export function getMovementGameStartInstruction({
  cameraRecoveryCue,
  hasAutomaticSetup,
  readiness,
}: {
  cameraRecoveryCue?: MovementCameraConfidenceRecoveryCue | null;
  hasAutomaticSetup: boolean;
  readiness: MovementStartReadiness | null;
}) {
  if (!readiness) {
    return "Move into view so the camera can see your whole body.";
  }

  const visibleBodyParts = new Set(readiness.visibleBodyParts);
  const feetVisible = visibleBodyParts.has("leftFoot") && visibleBodyParts.has("rightFoot");
  const legsVisible = visibleBodyParts.has("leftLeg") && visibleBodyParts.has("rightLeg");
  if (!feetVisible || !legsVisible) {
    return "Step back until your head and both feet are visible.";
  }

  const armsVisible = visibleBodyParts.has("leftArm") && visibleBodyParts.has("rightArm");
  if (!armsVisible) {
    return "Move your arms where the camera can see both of them.";
  }

  const headAndTorsoVisible = visibleBodyParts.has("head") && visibleBodyParts.has("torso");
  if (!headAndTorsoVisible) {
    return "Move into the centre so your head and body are visible.";
  }

  if (!hasAutomaticSetup) {
    return "Perfect — stay there while the camera finishes setting up.";
  }

  if (readiness.canStartGame) {
    return "Perfect — stay there.";
  }

  if (cameraRecoveryCue?.event === "step-closer") {
    return "Take one small step closer while keeping your whole body visible.";
  }

  return cameraRecoveryCue?.message ?? "Keep your whole body visible.";
}
