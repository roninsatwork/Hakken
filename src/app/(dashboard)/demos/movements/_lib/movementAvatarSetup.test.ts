import { describe, expect, it } from "vitest";
import {
  createMovementAvatarSetupState,
  resolveMovementAvatarSetup,
} from "./movementAvatarSetup";
import {
  buildMovementCalibration,
  type TrackingLandmark,
} from "./movementTrackingCalibration";

function withCorePose() {
  const pose = Array.from({ length: 33 }, (_, index) => ({
    x: 0.45 + index * 0.002,
    y: 0.45,
    z: 0,
    visibility: 0.9,
  })) satisfies TrackingLandmark[];
  pose[0] = { x: 0.5, y: 0.28, z: 0, visibility: 0.9 };
  pose[7] = { x: 0.42, y: 0.3, z: 0, visibility: 0.9 };
  pose[8] = { x: 0.58, y: 0.3, z: 0, visibility: 0.9 };
  pose[11] = { x: 0.38, y: 0.44, z: 0, visibility: 0.9 };
  pose[12] = { x: 0.62, y: 0.44, z: 0, visibility: 0.9 };
  pose[13] = { x: 0.34, y: 0.56, z: 0, visibility: 0.9 };
  pose[14] = { x: 0.66, y: 0.56, z: 0, visibility: 0.9 };
  pose[15] = { x: 0.32, y: 0.68, z: 0, visibility: 0.9 };
  pose[16] = { x: 0.68, y: 0.68, z: 0, visibility: 0.9 };
  pose[23] = { x: 0.42, y: 0.68, z: 0, visibility: 0.9 };
  pose[24] = { x: 0.58, y: 0.68, z: 0, visibility: 0.9 };
  pose[25] = { x: 0.44, y: 0.82, z: 0, visibility: 0.85 };
  pose[26] = { x: 0.56, y: 0.82, z: 0, visibility: 0.85 };
  pose[27] = { x: 0.44, y: 0.94, z: 0, visibility: 0.8 };
  pose[28] = { x: 0.56, y: 0.94, z: 0, visibility: 0.8 };
  pose[29] = { x: 0.43, y: 0.95, z: 0.02, visibility: 0.8 };
  pose[30] = { x: 0.57, y: 0.95, z: 0.02, visibility: 0.8 };
  pose[31] = { x: 0.43, y: 0.97, z: 0, visibility: 0.8 };
  pose[32] = { x: 0.57, y: 0.97, z: 0, visibility: 0.8 };
  return pose;
}

describe("movement avatar setup", () => {
  it("accumulates live auto calibration and exposes readiness metadata", () => {
    let state = createMovementAvatarSetupState();
    let target = resolveMovementAvatarSetup({
      isLivePlayer: true,
      manualCalibration: null,
      now: 1000,
      poseLandmarks: withCorePose(),
      previousState: state,
    });

    for (let index = 1; index < 6; index += 1) {
      state = target.nextState;
      target = resolveMovementAvatarSetup({
        isLivePlayer: true,
        manualCalibration: null,
        now: 1000 + index,
        poseLandmarks: withCorePose(),
        previousState: state,
      });
    }

    expect(target.autoCalibrationKind).toBe("full-body");
    expect(target.activeCalibration?.quality).toBeGreaterThan(0.8);
    expect(target.sourceFrame?.sourceOrigin).toBe("live-webcam");
    expect(target.sourceFrame?.startReadiness.state).toBe("ready");
    expect(target.sourceFrame?.startReadiness.canStartGame).toBe(true);
  });

  it("resets automatic samples when manual calibration is provided", () => {
    const pose = withCorePose();
    const manualCalibration = buildMovementCalibration({ poseLandmarks: pose, now: 3000 });
    const target = resolveMovementAvatarSetup({
      isLivePlayer: true,
      manualCalibration,
      now: 3001,
      poseLandmarks: pose,
      previousState: {
        autoCalibration: {
          calibration: null,
          kind: "full-body",
          samples: [manualCalibration!],
        },
      },
    });

    expect(target.activeCalibration).toBe(manualCalibration);
    expect(target.autoCalibrationKind).toBeNull();
    expect(target.nextState.autoCalibration.samples).toEqual([]);
  });

  it("does not create live setup state for recorded avatars", () => {
    const target = resolveMovementAvatarSetup({
      isLivePlayer: false,
      manualCalibration: null,
      poseLandmarks: withCorePose(),
    });

    expect(target.activeCalibration).toBeNull();
    expect(target.autoCalibrationKind).toBeNull();
    expect(target.sourceFrame).toBeNull();
  });
});
