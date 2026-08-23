"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";

export const MOVEMENT_CAMERA_PREFERENCE_KEY = "sonae.movement.cameraDeviceId";

export type MovementCameraDevice = {
  deviceId: string;
  label: string;
};

/**
 * The cameras attached to this machine, held outside React.
 *
 * They are a property of the machine rather than of any one screen, and they
 * change while the app is running — plug a camera in and the list is different.
 * That is what `useSyncExternalStore` is for, and going through it is also what
 * keeps this off the forbidden road of setting state from inside an effect.
 *
 * The snapshot reference only changes when the cameras actually change, because
 * a fresh array every read would spin the render loop forever.
 */
const NO_CAMERAS: MovementCameraDevice[] = [];
let cameraSnapshot: MovementCameraDevice[] = NO_CAMERAS;
const cameraListeners = new Set<() => void>();

function sameCameras(left: MovementCameraDevice[], right: MovementCameraDevice[]) {
  return (
    left.length === right.length &&
    left.every(
      (device, index) =>
        device.deviceId === right[index].deviceId && device.label === right[index].label,
    )
  );
}

async function readCameras() {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;

  let next: MovementCameraDevice[];
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    next = all
      .filter((device) => device.kind === "videoinput")
      .map((device, index) => ({
        deviceId: device.deviceId,
        // Labels stay blank until camera permission is granted, which is why
        // this is read again once the picture starts.
        label: device.label || `Camera ${index + 1}`,
      }));
  } catch {
    next = NO_CAMERAS;
  }

  if (sameCameras(cameraSnapshot, next)) return;
  cameraSnapshot = next;
  cameraListeners.forEach((listener) => listener());
}

function subscribeToCameras(listener: () => void) {
  cameraListeners.add(listener);
  void readCameras();

  const mediaDevices = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
  const onDeviceChange = () => void readCameras();
  mediaDevices?.addEventListener?.("devicechange", onDeviceChange);

  return () => {
    cameraListeners.delete(listener);
    mediaDevices?.removeEventListener?.("devicechange", onDeviceChange);
  };
}

function getCameraSnapshot() {
  return cameraSnapshot;
}

function getServerCameraSnapshot() {
  return NO_CAMERAS;
}

function readStoredCameraPreference() {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(MOVEMENT_CAMERA_PREFERENCE_KEY) ?? "";
  } catch {
    // Private windows and locked-down profiles refuse storage. A studio that
    // forgets the camera still works; one that throws on load does not.
    return "";
  }
}

/**
 * The cameras plugged into this machine, and which one the studio should use.
 *
 * The capture screen used to take whatever camera the browser called the
 * default. On a Mac with an external camera attached that is the external one,
 * so Anthony opened the studio and got his Insta360 pointed at the garden:
 * *"in chrome it said tracking error when i went to record and no bones were
 * coming up on the screen"*. There was nothing wrong with the tracking — there
 * was no person in the picture, and no way in the app to say so.
 *
 * The choice is remembered, because a camera you have to re-pick every visit is
 * barely better than no choice at all.
 */
export function useMovementCameraDevices() {
  const devices = useSyncExternalStore(
    subscribeToCameras,
    getCameraSnapshot,
    getServerCameraSnapshot,
  );
  const [preferredDeviceId, setPreferredDeviceId] = useState(readStoredCameraPreference);

  const selectDevice = useCallback((deviceId: string) => {
    setPreferredDeviceId(deviceId);
    try {
      if (deviceId) {
        window.localStorage.setItem(MOVEMENT_CAMERA_PREFERENCE_KEY, deviceId);
      } else {
        window.localStorage.removeItem(MOVEMENT_CAMERA_PREFERENCE_KEY);
      }
    } catch {
      // Same as above: the choice holds for this visit and no further.
    }
  }, []);

  const refreshDevices = useCallback(() => {
    void readCameras();
  }, []);

  /**
   * The remembered camera, but only while it is actually plugged in.
   *
   * Asking for a camera that has been unplugged fails the whole picture rather
   * than falling back to another one, so a remembered choice that no longer
   * exists is dropped here and the browser's own default is used instead.
   */
  const activeDeviceId = useMemo(
    () => (devices.some((device) => device.deviceId === preferredDeviceId) ? preferredDeviceId : ""),
    [devices, preferredDeviceId],
  );

  return { devices, activeDeviceId, preferredDeviceId, selectDevice, refreshDevices };
}
