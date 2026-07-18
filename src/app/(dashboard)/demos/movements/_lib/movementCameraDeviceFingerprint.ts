import { movementBoundaryChecksum } from "./movementBoundaryChecksum";

export const MOVEMENT_CAMERA_DEVICE_FINGERPRINT_PROFILE = {
  id: "movement-camera-device-fingerprint-v1",
} as const;

export function resolveMovementCameraDeviceFingerprint(
  video: HTMLVideoElement | null | undefined,
): string | null {
  const stream = video?.srcObject as MediaStream | null | undefined;
  if (!stream || typeof stream.getVideoTracks !== "function") return null;
  const track = stream.getVideoTracks()[0];
  if (!track) return null;
  const settings = track.getSettings();
  const identity = {
    deviceId: settings.deviceId || null,
    groupId: settings.groupId || null,
    label: track.label || null,
    profileId: MOVEMENT_CAMERA_DEVICE_FINGERPRINT_PROFILE.id,
  };
  if (!identity.deviceId && !identity.groupId && !identity.label) return null;
  return movementBoundaryChecksum(identity);
}
