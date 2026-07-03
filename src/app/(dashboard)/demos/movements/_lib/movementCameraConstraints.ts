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
