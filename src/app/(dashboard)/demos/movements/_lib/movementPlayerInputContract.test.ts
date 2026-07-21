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
  buildMovementPlayerSetupWindow,
  createMovementAcquisitionFilters,
  isMovementPlayerSetupAcceptable,
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
      setup: {
        id: "movement-player-setup-v1",
        prefixFrameCount: 60,
        sampleLimit: 12,
      },
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
      windowStartIndex: 0,
    });
  });

  it("slides past a weak recording start exactly like the live Game setup", () => {
    const goodFrame = (index: number) => ({
      ...makeMovementAvatarProofMotionPayload("standing"),
      capturedAt: index,
    });
    const weakFrame = (index: number) => {
      const frame = goodFrame(index);
      return {
        ...frame,
        landmarks: (frame.landmarks ?? []).map((landmark) => ({
          ...landmark,
          visibility: 0,
        })),
        worldLandmarks: (frame.worldLandmarks ?? []).map((landmark) => ({
          ...landmark,
          visibility: 0,
        })),
      };
    };
    const frames = [
      ...Array.from({ length: 30 }, (_, index) => weakFrame(index)),
      ...Array.from({ length: 90 }, (_, index) => goodFrame(30 + index)),
    ];

    const slidingSetup = buildMovementPlayerSetupFromPrefix(frames);
    expect(isMovementPlayerSetupAcceptable(slidingSetup)).toBe(true);
    const windowStart = slidingSetup?.provenance.windowStartIndex ?? -1;
    expect(windowStart).toBeGreaterThan(0);

    // Replay's sliding scan and the live Game's one-frame-at-a-time advance
    // must land on the same window and produce an identical setup object.
    const prefixFrameCount = MOVEMENT_PLAYER_INPUT_CONTRACT.setup.prefixFrameCount;
    let liveWindowStart = 0;
    let liveSetup = null as ReturnType<typeof buildMovementPlayerSetupWindow>;
    const liveBuffer: typeof frames = [];
    for (const frame of frames) {
      liveBuffer.push(frame);
      if (liveBuffer.length < prefixFrameCount) continue;
      const candidateFrames = liveBuffer.slice(-prefixFrameCount);
      const candidate = buildMovementPlayerSetupWindow(candidateFrames, liveWindowStart);
      if (isMovementPlayerSetupAcceptable(candidate)) {
        liveSetup = candidate;
        break;
      }
      liveBuffer.splice(0, liveBuffer.length - (prefixFrameCount - 1));
      liveWindowStart += 1;
    }

    expect(liveSetup).toEqual(slidingSetup);
  });
});
