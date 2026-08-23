import { describe, expect, it } from "vitest";
import {
  MOVEMENT_BODY_TRACKING_VIDEO_CONSTRAINTS,
  movementBodyTrackingVideoConstraints,
} from "./movementCameraConstraints";

describe("movementBodyTrackingVideoConstraints", () => {
  it("leaves the picture to the browser when no camera is named", () => {
    expect(movementBodyTrackingVideoConstraints()).toBe(
      MOVEMENT_BODY_TRACKING_VIDEO_CONSTRAINTS,
    );
    expect(movementBodyTrackingVideoConstraints("")).toBe(
      MOVEMENT_BODY_TRACKING_VIDEO_CONSTRAINTS,
    );
  });

  it("asks for the named camera and stops asking for a front-facing one", () => {
    const constraints = movementBodyTrackingVideoConstraints("facetime");

    expect(constraints.deviceId).toEqual({ exact: "facetime" });
    // An external camera reports no facing at all, so keeping facingMode here
    // would be a request no camera satisfies — and a black picture.
    expect(constraints).not.toHaveProperty("facingMode");
    expect(constraints.width).toEqual(MOVEMENT_BODY_TRACKING_VIDEO_CONSTRAINTS.width);
  });
});
