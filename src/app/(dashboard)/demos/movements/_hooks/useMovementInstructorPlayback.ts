"use client";

import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import type { Classifications } from "@mediapipe/tasks-vision";
import {
  normalizeVrmLandmark,
  reflectVrmLandmarkArrayCoordinates,
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
  frameId?: string;
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

const getReflectedInstructorMotionLandmarks = (
  value: MovementInstructorMotionRef,
): InstructorPoseLandmark[] => {
  const landmarks = withDepth(getInstructorMotionLandmarks(value))
    .map((landmark) => normalizeVrmLandmark(landmark));

  reflectVrmLandmarkArrayCoordinates(landmarks, (x) => 1 - x);

  return landmarks;
};

// World landmarks are hip-centred metres, so facing-player mirroring negates x
// instead of the image-space 1 - x flip.
const getReflectedInstructorWorldLandmarks = (
  value: MovementInstructorMotionRef,
): InstructorPoseLandmark[] | null => {
  if (!value || Array.isArray(value)) return null;

  const worldLandmarks = value.worldLandmarks;
  if (!worldLandmarks || worldLandmarks.length < 33) return null;

  const landmarks = withDepth(worldLandmarks)
    .map((landmark) => normalizeVrmLandmark(landmark));

  reflectVrmLandmarkArrayCoordinates(landmarks, (x) => -x);

  return landmarks;
};

function getRetargetNeutralScore(model: MovementRetargetSourceModel) {
  const neutralKneeLift = (model.neutralKneeLift.left + model.neutralKneeLift.right) / 2;
  const torsoSideBend = Math.abs(model.shoulderCenter.x - model.hipCenter.x);
  const semanticTorsoDirection = model.semanticNeutral?.torsoDirection;
  const torsoForwardAngle = semanticTorsoDirection
    ? Math.acos(Math.max(-1, Math.min(1, semanticTorsoDirection.y)))
    : 0;
  // A low knee-lift/side-bend score alone can select a deep forward hinge as
  // the recording's neutral frame. Preserve a small camera-pitch allowance,
  // then strongly prefer a visibly upright world-torso baseline.
  const excessiveForwardAngle = Math.max(0, torsoForwardAngle - 0.18);
  return neutralKneeLift + torsoSideBend * 2.4 + excessiveForwardAngle * 1.5 +
    (1 - model.quality) * 0.08;
}

export function buildInstructorRetargetSourceModel(
  frames: MovementInstructorMotionFrame[],
): MovementRetargetSourceModel | null {
  let bestModel: MovementRetargetSourceModel | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  frames.forEach((frame, index) => {
    const poseLandmarks = getReflectedInstructorMotionLandmarks(frame);
    if (poseLandmarks.length < 33) return;

    const model = buildMovementRetargetSourceModel({
      now: index,
      poseLandmarks,
      worldPoseLandmarks: getReflectedInstructorWorldLandmarks(frame),
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
  const poseLandmarks = getReflectedInstructorMotionLandmarks(frame);
  if (poseLandmarks.length < 33) return null;

  const retargetFrame = solveMovementRetargetFrame({
    calibration: retargetSourceModel,
    poseLandmarks,
    worldPoseLandmarks: getReflectedInstructorWorldLandmarks(frame),
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

export function useMovementInstructorPlayback(
  loadedFrames: MovementInstructorMotionFrame[],
  options: { sourceFrameIndexRef?: RefObject<{ frameIndex: number }> } = {},
) {
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

  useEffect(() => {
    if (loadedFrames.length === 0) return;

    instructorFramesRef.current = loadedFrames;
    frameIndexRef.current = 0;
    instructorCurrentLmRef.current = loadedFrames[0] ?? [];
  }, [loadedFrames]);

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
      instructorCurrentLmRef.current = cloneFramePayload(frames[clampedFrameIndex]!);

      return {
        status: clampedFrameIndex + 1 >= totalFrames ? "complete" : "advanced",
        frames,
        frameIndex: clampedFrameIndex,
        lagFrame: frames[Math.max(0, clampedFrameIndex - INSTRUCTOR_LAG_COMPENSATION_FRAMES)],
      };
    },
    [],
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

    const requestedFrameIndex = options.sourceFrameIndexRef
      ? Math.max(0, Math.min(totalFrames - 1, options.sourceFrameIndexRef.current.frameIndex))
      : frameIndexRef.current + 1;

    if (frameIndexRef.current + 1 >= totalFrames) {
      return { status: "complete", frames, frameIndex: frameIndexRef.current };
    }

    if (requestedFrameIndex <= frameIndexRef.current) {
      return {
        status: "advanced",
        frames,
        frameIndex: frameIndexRef.current,
        lagFrame: frames[Math.max(0, frameIndexRef.current - INSTRUCTOR_LAG_COMPENSATION_FRAMES)],
      };
    }

    while (frameIndexRef.current < requestedFrameIndex) {
      frameIndexRef.current += 1;
      instructorCurrentLmRef.current = cloneFramePayload(frames[frameIndexRef.current]!);
    }

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
  }, [options.sourceFrameIndexRef]);

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
