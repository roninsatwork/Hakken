"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Classifications } from "@mediapipe/tasks-vision";
import { PoseFilterWrapper } from "@/src/lib/math/OneEuroFilter";
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

const INSTRUCTOR_LAG_COMPENSATION_FRAMES = 6;

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

const cloneHandsPayload = (
  hands: InstructorHandsPayload | undefined,
): InstructorHandsPayload | undefined => {
  if (!hands) return undefined;

  return {
    left: hands.left ? { ...hands.left, landmarks: [...hands.left.landmarks] } : null,
    right: hands.right ? { ...hands.right, landmarks: [...hands.right.landmarks] } : null,
  };
};

export function useMovementInstructorPlayback(loadedFrames: MovementInstructorMotionFrame[]) {
  const instructorFramesRef = useRef<MovementInstructorMotionFrame[]>([]);
  const instructorCurrentLmRef = useRef<MovementInstructorMotionRef>([]);
  const frameIndexRef = useRef(0);

  const instructorFilterRef = useRef(new PoseFilterWrapper(33, 30, 0.05, 0.1));
  const instructorWorldFilterRef = useRef(new PoseFilterWrapper(33, 30, 0.05, 0.1));
  const instructorLeftHandFilterRef = useRef(new PoseFilterWrapper(21, 30, 0.01, 0.0));
  const instructorRightHandFilterRef = useRef(new PoseFilterWrapper(21, 30, 0.01, 0.0));

  useEffect(() => {
    if (loadedFrames.length === 0) return;

    instructorFramesRef.current = loadedFrames;
    frameIndexRef.current = 0;
    instructorCurrentLmRef.current = loadedFrames[0] ?? [];
  }, [loadedFrames]);

  const resetInstructorPlayback = useCallback(() => {
    frameIndexRef.current = 0;
    instructorCurrentLmRef.current = instructorFramesRef.current[0] ?? [];
  }, []);

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
    const frameData = frames[frameIndexRef.current];
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

    instructorCurrentLmRef.current = {
      ...(framePayload ?? {}),
      landmarks: filteredLandmarks,
      worldLandmarks:
        filteredWorldLandmarks.length > 0 ? filteredWorldLandmarks : framePayload?.worldLandmarks,
      hands: filteredHands,
    };

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
  }, []);

  return {
    instructorFramesRef,
    instructorCurrentLmRef,
    frameIndexRef,
    advanceInstructorFrame,
    resetInstructorPlayback,
  };
}
