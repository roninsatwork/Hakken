type BodyTrackingVideoConstraints = MediaTrackConstraints & {
  resizeMode?: "crop-and-scale" | "none";
};

export const MOVEMENT_BODY_TRACKING_VIDEO_CONSTRAINTS: BodyTrackingVideoConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 960 },
  aspectRatio: { ideal: 4 / 3 },
  facingMode: "user",
  resizeMode: "none",
};

/**
 * The same picture, from a named camera.
 *
 * `facingMode` is dropped once a camera is named, because the two can disagree
 * — an external camera reports no facing at all, and asking for a front-facing
 * camera *and* that specific device is a request no camera satisfies, which
 * fails the picture outright rather than picking one.
 */
export function movementBodyTrackingVideoConstraints(
  deviceId?: string | null,
): BodyTrackingVideoConstraints {
  if (!deviceId) return MOVEMENT_BODY_TRACKING_VIDEO_CONSTRAINTS;

  const { facingMode: _facingMode, ...shared } = MOVEMENT_BODY_TRACKING_VIDEO_CONSTRAINTS;
  return { ...shared, deviceId: { exact: deviceId } };
}
