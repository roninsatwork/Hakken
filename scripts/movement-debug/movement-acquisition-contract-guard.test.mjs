import { describe, expect, it } from "vitest";
import {
  auditMovementAcquisitionContract,
  runMovementAcquisitionContractGuard,
} from "./movement-acquisition-contract-guard.mjs";

describe("movement acquisition contract guard", () => {
  it("passes the current shared acquisition and setup contract", () => {
    expect(runMovementAcquisitionContractGuard()).toEqual({ failures: [], ok: true });
  });

  it("blocks route-local filters and setup counts", () => {
    const report = auditMovementAcquisitionContract({
      capture: "new PoseFilterWrapper",
      contract: 'id: "movement-player-input-v1"; id: "mediapipe-vision-v1"; MEDIAPIPE_POSE_CONFIDENCE; prefixFrameCount: 60; sampleLimit: 12',
      game: "recordedSourceSequence: automaticPlayerSetup",
      liveSetup: "buildMovementPlayerSetupFromPrefix LIVE_PLAYER_SETUP_MIN_FRAMES",
      mediaPipe: "MOVEMENT_PLAYER_INPUT_CONTRACT",
      playerTracking: "createMovementAcquisitionFilters prepareMovementAcquisitionFrame",
      replay: "buildMovementPlayerSetupFromPrefix",
      trackingCalibration: "buildMovementPlayerSetupFromPrefix",
    });

    expect(report.ok).toBe(false);
    expect(report.failures).toEqual(expect.arrayContaining([
      expect.stringContaining("capture does not use the shared filter factory"),
      expect.stringContaining("route-local acquisition filters"),
      expect.stringContaining("route-local setup count"),
    ]));
  });
});
