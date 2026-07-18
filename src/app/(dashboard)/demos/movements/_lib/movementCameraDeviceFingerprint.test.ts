import { describe, expect, it } from "vitest";
import { resolveMovementCameraDeviceFingerprint } from "./movementCameraDeviceFingerprint";

describe("movement camera device fingerprint", () => {
  it("creates an opaque stable identity without exposing the device id or label", () => {
    const track = {
      getSettings: () => ({ deviceId: "private-device-id", groupId: "private-group-id" }),
      label: "Private camera label",
    };
    const stream = { getVideoTracks: () => [track as unknown as MediaStreamTrack] };
    const video = { srcObject: stream } as HTMLVideoElement;

    const fingerprint = resolveMovementCameraDeviceFingerprint(video);

    expect(fingerprint).toMatch(/^fnv1a32:[a-f0-9]{8}$/);
    expect(fingerprint).not.toContain("private-device-id");
    expect(resolveMovementCameraDeviceFingerprint(video)).toBe(fingerprint);
  });

  it("fails closed when the browser provides no camera identity", () => {
    expect(resolveMovementCameraDeviceFingerprint(undefined)).toBeNull();
  });
});
