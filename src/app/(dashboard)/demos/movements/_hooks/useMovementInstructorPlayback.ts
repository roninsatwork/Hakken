"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Classifications } from "@mediapipe/tasks-vision";
import { PoseFilterWrapper } from "@/src/lib/math/OneEuroFilter";
import {
  mirrorVrmLandmarkArray,
  normalizeVrmLandmark,
} from "../_lib/vrmRigging";
import {
  buildMovementRetargetSourceModel,
  getBalancedPlantedSquatDepth,
  solveMovementRetargetFrame,
  type MovementRetargetSourceModel,
} from "../_lib/movementRetargeting";
import type { MovementHandSide } from "../_lib/movementTypes";

type InstructorPoseLandmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
  isSnapped?: boolean;
};

type InstructorHandCapture = {
  landmarks: InstructorPoseLandmark[];
  worldLandmarks?: InstructorPoseLandmark[] | null;
};

type InstructorHandsPayload = Partial<Record<MovementHandSide, InstructorHandCapture | null>>;

export type MovementInstructorMotionPayload = {
  pose?: InstructorPoseLandmark[];
  landmarks?: InstructorPoseLandmark[];
  worldLandmarks?: InstructorPoseLandmark[] | null;
  faceLandmarks?: InstructorPoseLandmark[] | null;
  blendshapes?: Classifications["categories"];
  hands?: InstructorHandsPayload;
};

export type MovementInstructorMotionFrame =
  | MovementInstructorMotionPayload
  | InstructorPoseLandmark[];

export type MovementInstructorMotionRef = MovementInstructorMotionFrame | null;

type InstructorPlaybackStatus = "empty" | "complete" | "advanced";

type InstructorPlaybackAdvance = {
  status: InstructorPlaybackStatus;
  frames: MovementInstructorMotionFrame[];
  frameIndex: number;
  lagFrame?: MovementInstructorMotionFrame;
};

export type MovementInstructorRetargetFrameAnalysis = {
  balancedPlantedSquatDepth: number;
  frameIndex: number;
  hipDrop: number;
  leftFootContact: boolean;
  leftKneeLift: number;
  rightFootContact: boolean;
  rightKneeLift: number;
  sourceQuality: number;
  squatDepth: number;
};

export type MovementInstructorRetargetAnalysis = {
  frameCount: number;
  peakLeftKneeLift: MovementInstructorRetargetFrameAnalysis | null;
  peakRightKneeLift: MovementInstructorRetargetFrameAnalysis | null;
  peakSingleKneeLift: MovementInstructorRetargetFrameAnalysis | null;
  peakSquat: MovementInstructorRetargetFrameAnalysis | null;
};

const INSTRUCTOR_LAG_COMPENSATION_FRAMES = 6;
const RETARGET_ANALYSIS_MIN_SOURCE_QUALITY = 0.7;

function createInstructorPoseFilter() {
  return new PoseFilterWrapper(33, 30, 0.05, 0.1);
}

function createInstructorHandFilter() {
  return new PoseFilterWrapper(21, 30, 0.01, 0.0);
}

const withDepth = (landmarks: InstructorPoseLandmark[]) =>
  landmarks.map((landmark) => ({
    ...landmark,
    z: landmark.z ?? 0,
  }));

const getInstructorMotionLandmarks = (
  value: MovementInstructorMotionRef,
): InstructorPoseLandmark[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return value.pose ?? value.landmarks ?? [];
};

const getMirroredInstructorMotionLandmarks = (
  value: MovementInstructorMotionRef,
): InstructorPoseLandmark[] => {
  const landmarks = withDepth(getInstructorMotionLandmarks(value))
    .map((landmark) => normalizeVrmLandmark(landmark));

  mirrorVrmLandmarkArray(landmarks, (x) => 1 - x);

  return landmarks;
};

// World landmarks are hip-centred metres, so facing-player mirroring negates x
// instead of the image-space 1 - x flip.
const getMirroredInstructorWorldLandmarks = (
  value: MovementInstructorMotionRef,
): InstructorPoseLandmark[] | null => {
  if (!value || Array.isArray(value)) return null;

  const worldLandmarks = value.worldLandmarks;
  if (!worldLandmarks || worldLandmarks.length < 33) return null;

  const landmarks = withDepth(worldLandmarks)
    .map((landmark) => normalizeVrmLandmark(landmark));

  mirrorVrmLandmarkArray(landmarks, (x) => -x);

  return landmarks;
};

function getRetargetNeutralScore(model: MovementRetargetSourceModel) {
  const neutralKneeLift = (model.neutralKneeLift.left + model.neutralKneeLift.right) / 2;
  const torsoSideBend = Math.abs(model.shoulderCenter.x - model.hipCenter.x);
  return neutralKneeLift + torsoSideBend * 2.4 + (1 - model.quality) * 0.08;
}

export function buildInstructorRetargetSourceModel(
  frames: MovementInstructorMotionFrame[],
): MovementRetargetSourceModel | null {
  let bestModel: MovementRetargetSourceModel | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  frames.forEach((frame, index) => {
    const poseLandmarks = getMirroredInstructorMotionLandmarks(frame);
    if (poseLandmarks.length < 33) return;

    const model = buildMovementRetargetSourceModel({
      now: index,
      poseLandmarks,
      worldPoseLandmarks: getMirroredInstructorWorldLandmarks(frame),
    });
    if (!model) return;

    const score = getRetargetNeutralScore(model);
    if (score < bestScore) {
      bestModel = model;
      bestScore = score;
    }
  });

  return bestModel;
}

function toRetargetFrameAnalysis(
  frameIndex: number,
  frame: MovementInstructorMotionFrame,
  retargetSourceModel: MovementRetargetSourceModel,
): MovementInstructorRetargetFrameAnalysis | null {
  const poseLandmarks = getMirroredInstructorMotionLandmarks(frame);
  if (poseLandmarks.length < 33) return null;

  const retargetFrame = solveMovementRetargetFrame({
    calibration: retargetSourceModel,
    poseLandmarks,
    worldPoseLandmarks: getMirroredInstructorWorldLandmarks(frame),
  });

  return {
    balancedPlantedSquatDepth: getBalancedPlantedSquatDepth(retargetFrame),
    frameIndex,
    hipDrop: retargetFrame.hipDrop,
    leftFootContact: retargetFrame.contacts.leftFoot,
    leftKneeLift: retargetFrame.kneeLift.left,
    rightFootContact: retargetFrame.contacts.rightFoot,
    rightKneeLift: retargetFrame.kneeLift.right,
    sourceQuality: retargetFrame.debug.sourceQuality,
    squatDepth: retargetFrame.squatDepth,
  };
}

function maxBy(
  frames: MovementInstructorRetargetFrameAnalysis[],
  score: (frame: MovementInstructorRetargetFrameAnalysis) => number,
) {
  return frames.reduce<MovementInstructorRetargetFrameAnalysis | null>((best, frame) => {
    if (!best || score(frame) > score(best)) return frame;
    return best;
  }, null);
}

export function buildInstructorRetargetAnalysis(
  frames: MovementInstructorMotionFrame[],
  retargetSourceModel: MovementRetargetSourceModel | null,
): MovementInstructorRetargetAnalysis {
  if (!retargetSourceModel) {
    return {
      frameCount: frames.length,
      peakLeftKneeLift: null,
      peakRightKneeLift: null,
      peakSingleKneeLift: null,
      peakSquat: null,
    };
  }

  const analyzedFrames = frames
    .map((frame, index) => toRetargetFrameAnalysis(index, frame, retargetSourceModel))
    .filter((frame): frame is MovementInstructorRetargetFrameAnalysis => Boolean(frame));
  const goodFrames = analyzedFrames.filter(
    (frame) => frame.sourceQuality >= RETARGET_ANALYSIS_MIN_SOURCE_QUALITY,
  );
  const plantedSquatFrames = goodFrames.filter(
    (frame) => frame.leftFootContact && frame.rightFootContact,
  );
  const kneeLiftFrames = goodFrames.filter(
    (frame) => frame.balancedPlantedSquatDepth < 0.16,
  );

  return {
    frameCount: frames.length,
    peakLeftKneeLift: maxBy(kneeLiftFrames, (frame) => frame.leftKneeLift),
    peakRightKneeLift: maxBy(kneeLiftFrames, (frame) => frame.rightKneeLift),
    peakSingleKneeLift: maxBy(
      kneeLiftFrames,
      (frame) => Math.abs(frame.leftKneeLift - frame.rightKneeLift),
    ),
    peakSquat: maxBy(plantedSquatFrames, (frame) => frame.squatDepth),
  };
}

const cloneHandsPayload = (
  hands: InstructorHandsPayload | undefined,
): InstructorHandsPayload | undefined => {
  if (!hands) return undefined;

  return {
    left: hands.left ? { ...hands.left, landmarks: [...hands.left.landmarks] } : null,
    right: hands.right ? { ...hands.right, landmarks: [...hands.right.landmarks] } : null,
  };
};

const cloneFramePayload = (
  frameData: MovementInstructorMotionFrame,
): MovementInstructorMotionPayload => {
  const framePayload = !Array.isArray(frameData) ? frameData : null;
  const landmarks = withDepth(getInstructorMotionLandmarks(frameData));
  const worldLandmarks = framePayload?.worldLandmarks
    ? withDepth(framePayload.worldLandmarks)
    : framePayload?.worldLandmarks;
  const hands = cloneHandsPayload(framePayload?.hands);

  if (hands?.left?.landmarks) hands.left.landmarks = withDepth(hands.left.landmarks);
  if (hands?.left?.worldLandmarks) hands.left.worldLandmarks = withDepth(hands.left.worldLandmarks);
  if (hands?.right?.landmarks) hands.right.landmarks = withDepth(hands.right.landmarks);
  if (hands?.right?.worldLandmarks) hands.right.worldLandmarks = withDepth(hands.right.worldLandmarks);

  return {
    ...(framePayload ?? {}),
    landmarks,
    worldLandmarks,
    hands,
  };
};

export function useMovementInstructorPlayback(loadedFrames: MovementInstructorMotionFrame[]) {
  const instructorFramesRef = useRef<MovementInstructorMotionFrame[]>([]);
  const instructorCurrentLmRef = useRef<MovementInstructorMotionRef>([]);
  const frameIndexRef = useRef(0);
  const retargetSourceModel = useMemo(
    () => buildInstructorRetargetSourceModel(loadedFrames),
    [loadedFrames],
  );
  const retargetAnalysis = useMemo(
    () => buildInstructorRetargetAnalysis(loadedFrames, retargetSourceModel),
    [loadedFrames, retargetSourceModel],
  );

  const instructorFilterRef = useRef(createInstructorPoseFilter());
  const instructorWorldFilterRef = useRef(createInstructorPoseFilter());
  const instructorLeftHandFilterRef = useRef(createInstructorHandFilter());
  const instructorRightHandFilterRef = useRef(createInstructorHandFilter());

  useEffect(() => {
    if (loadedFrames.length === 0) return;

    instructorFramesRef.current = loadedFrames;
    frameIndexRef.current = 0;
    instructorCurrentLmRef.current = loadedFrames[0] ?? [];
  }, [loadedFrames]);

  const resetInstructorFilters = useCallback(() => {
    instructorFilterRef.current = createInstructorPoseFilter();
    instructorWorldFilterRef.current = createInstructorPoseFilter();
    instructorLeftHandFilterRef.current = createInstructorHandFilter();
    instructorRightHandFilterRef.current = createInstructorHandFilter();
  }, []);

  const buildFilteredFrame = useCallback((frameData: MovementInstructorMotionFrame) => {
    const framePayload = !Array.isArray(frameData) ? frameData : null;
    const now = performance.now();

    const filteredLandmarks = instructorFilterRef.current.filter(
      withDepth(getInstructorMotionLandmarks(frameData)),
      now,
    );

    let filteredWorldLandmarks = framePayload?.worldLandmarks ?? [];
    if (filteredWorldLandmarks.length > 0) {
      filteredWorldLandmarks = instructorWorldFilterRef.current.filter(
        withDepth(filteredWorldLandmarks),
        now,
      );
    }

    const filteredHands = cloneHandsPayload(framePayload?.hands);
    if (filteredHands?.left?.landmarks) {
      filteredHands.left.landmarks = instructorLeftHandFilterRef.current.filter(
        withDepth(filteredHands.left.landmarks),
        now,
      );
    }
    if (filteredHands?.right?.landmarks) {
      filteredHands.right.landmarks = instructorRightHandFilterRef.current.filter(
        withDepth(filteredHands.right.landmarks),
        now,
      );
    }

    return {
      ...(framePayload ?? {}),
      landmarks: filteredLandmarks,
      worldLandmarks:
        filteredWorldLandmarks.length > 0 ? filteredWorldLandmarks : framePayload?.worldLandmarks,
      hands: filteredHands,
    };
  }, []);

  const setInstructorFrame = useCallback(
    (frameIndex: number): InstructorPlaybackAdvance => {
      const frames = instructorFramesRef.current;
      const totalFrames = frames.length;

      if (totalFrames === 0) {
        instructorCurrentLmRef.current = [];
        frameIndexRef.current = 0;
        return { status: "empty", frames, frameIndex: 0 };
      }

      const clampedFrameIndex = Math.max(0, Math.min(totalFrames - 1, frameIndex));
      frameIndexRef.current = clampedFrameIndex;
      resetInstructorFilters();
      instructorCurrentLmRef.current = cloneFramePayload(frames[clampedFrameIndex]!);

      return {
        status: clampedFrameIndex + 1 >= totalFrames ? "complete" : "advanced",
        frames,
        frameIndex: clampedFrameIndex,
        lagFrame: frames[Math.max(0, clampedFrameIndex - INSTRUCTOR_LAG_COMPENSATION_FRAMES)],
      };
    },
    [resetInstructorFilters],
  );

  const resetInstructorPlayback = useCallback(() => {
    setInstructorFrame(0);
  }, [setInstructorFrame]);

  const advanceInstructorFrame = useCallback((): InstructorPlaybackAdvance => {
    const frames = instructorFramesRef.current;
    const totalFrames = frames.length;

    if (totalFrames === 0) {
      return { status: "empty", frames, frameIndex: frameIndexRef.current };
    }

    if (frameIndexRef.current + 1 >= totalFrames) {
      return { status: "complete", frames, frameIndex: frameIndexRef.current };
    }

    frameIndexRef.current += 1;
    instructorCurrentLmRef.current = buildFilteredFrame(frames[frameIndexRef.current]!);

    const lagCompIndex = Math.max(
      0,
      frameIndexRef.current - INSTRUCTOR_LAG_COMPENSATION_FRAMES,
    );

    return {
      status: "advanced",
      frames,
      frameIndex: frameIndexRef.current,
      lagFrame: frames[lagCompIndex],
    };
  }, [buildFilteredFrame]);

  return {
    frameCount: loadedFrames.length,
    instructorFramesRef,
    instructorCurrentLmRef,
    frameIndexRef,
    retargetAnalysis,
    retargetSourceModel,
    advanceInstructorFrame,
    resetInstructorPlayback,
    setInstructorFrame,
  };
}
