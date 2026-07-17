import type {
  FaceLandmarkerResult,
  HandLandmarkerResult,
  NormalizedLandmark,
  PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";
import { describe, expect, it } from "vitest";
import { makeMovementAvatarProofMotionPayload } from "./movementAvatarProofFixtures";
import {
  MOVEMENT_PLAYER_INPUT_CONTRACT,
  buildMovementPlayerSetupFromPrefix,
  createMovementAcquisitionFilters,
  prepareMovementAcquisitionFrame,
} from "./movementPlayerInputContract";

function pose(offset = 0): NormalizedLandmark[] {
  return Array.from({ length: 33 }, (_, index) => ({
    visibility: 0.95,
    x: 0.2 + index * 0.01 + offset,
    y: 0.3 + index * 0.005,
    z: index * -0.002,
  }));
}

function results(offset = 0) {
  return {
    face: {
      faceBlendshapes: [],
      faceLandmarks: [],
      facialTransformationMatrixes: [],
    } as FaceLandmarkerResult,
    hands: {
      handedness: [],
      handednesses: [],
      landmarks: [],
      worldLandmarks: [],
    } as unknown as HandLandmarkerResult,
    pose: {
      landmarks: [pose(offset)],
      worldLandmarks: [pose(offset)],
    } as PoseLandmarkerResult,
  };
}

describe("movement player input contract", () => {
  it("defines one versioned filter and setup policy", () => {
    expect(MOVEMENT_PLAYER_INPUT_CONTRACT).toMatchObject({
      id: "movement-player-input-v1",
      filters: {
        hand: { frequency: 60, minCutoff: 1.6, beta: 0.08 },
        pose: { frequency: 60, minCutoff: 0.05, beta: 0.1 },
      },
      setup: { prefixFrameCount: 60, sampleLimit: 12 },
    });
  });

  it("prepares equivalent capture and Game sequences identically", () => {
    const captureFilters = createMovementAcquisitionFilters();
    const gameFilters = createMovementAcquisitionFilters();
    const first = results();
    const second = results(0.04);
    const common = {
      camera: { facingMode: "user" as const, frameHeight: 720, frameWidth: 1280 },
      capturedAt: 1_000,
    };

    prepareMovementAcquisitionFrame({
      ...common,
      faceResults: first.face,
      filters: captureFilters,
      handResults: first.hands,
      poseResults: first.pose,
      sourceTimestampMs: 1_000,
    });
    prepareMovementAcquisitionFrame({
      ...common,
      faceResults: first.face,
      filters: gameFilters,
      handResults: first.hands,
      poseResults: first.pose,
      sourceTimestampMs: 1_000,
    });
    const capture = prepareMovementAcquisitionFrame({
      ...common,
      capturedAt: 1_017,
      faceResults: second.face,
      filters: captureFilters,
      handResults: second.hands,
      poseResults: second.pose,
      sourceTimestampMs: 1_017,
    });
    const game = prepareMovementAcquisitionFrame({
      ...common,
      capturedAt: 1_017,
      faceResults: second.face,
      filters: gameFilters,
      handResults: second.hands,
      poseResults: second.pose,
      sourceTimestampMs: 1_017,
    });

    expect(game).toEqual(capture);
  });

  it("uses the same 60-frame prefix for recorded and live setup", () => {
    const frames = Array.from({ length: 60 }, (_, index) => ({
      ...makeMovementAvatarProofMotionPayload("standing"),
      capturedAt: index,
    }));

    expect(buildMovementPlayerSetupFromPrefix(frames.slice(0, 59))).toBeNull();
    expect(buildMovementPlayerSetupFromPrefix(frames)?.provenance).toMatchObject({
      frameLimit: 59,
      sampleLimit: 12,
    });
  });
});
