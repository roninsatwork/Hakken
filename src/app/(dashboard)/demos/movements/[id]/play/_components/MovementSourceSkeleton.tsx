"use client";

import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  getVrmMotionLandmarks,
  type VrmMotionRef,
  type VrmPoseLandmark,
} from "../../../_lib/vrmRigging";
import type { MovementMotionFrame } from "../../../_lib/movementMotionFrame";
import type { MovementTruthSkeletonSegment } from "../../../_lib/movementTruthSkeleton";
import {
  MOVEMENT_SALMON,
} from "../../../_lib/movementPalette";

const SOURCE_BONES: Array<[number, number]> = [
  [0, 7],
  [0, 8],
  [7, 8],
  [11, 12],
  [11, 13],
  [13, 15],
  [15, 17],
  [15, 19],
  [15, 21],
  [12, 14],
  [14, 16],
  [16, 18],
  [16, 20],
  [16, 22],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [27, 29],
  [27, 31],
  [24, 26],
  [26, 28],
  [28, 30],
  [28, 32],
];

const SOURCE_JOINTS = Array.from(new Set(SOURCE_BONES.flat()));
const TRUTH_SKELETON_SEGMENTS: MovementTruthSkeletonSegment[] = [
  "shoulders",
  "hips",
  "leftUpperArm",
  "leftLowerArm",
  "rightUpperArm",
  "rightLowerArm",
  "leftThigh",
  "leftShin",
  "rightThigh",
  "rightShin",
  "leftFoot",
  "rightFoot",
];
const MIN_VISIBLE_CONFIDENCE = 0.18;
const SKELETON_LOCAL_SCALE = 3.05;
const FLOOR_LANDMARKS = [27, 28, 29, 30, 31, 32];

type MovementSourceSkeletonProps = {
  color?: string;
  landmarksRef: RefObject<VrmMotionRef>;
  mirrorX?: boolean;
  mode?: "source" | "truth";
  motionFrameRef?: RefObject<MovementMotionFrame | null>;
  positionOffset: [number, number, number];
};

function landmarkVisibility(landmark?: VrmPoseLandmark) {
  return landmark?.visibility ?? 0.8;
}

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

export default function MovementSourceSkeleton({
  color = MOVEMENT_SALMON,
  landmarksRef,
  mirrorX = false,
  mode = "source",
  motionFrameRef,
  positionOffset,
}: MovementSourceSkeletonProps) {
  const groupRef = useRef<THREE.Group>(null);
  const lineGeometry = useMemo(() => {
    const nextGeometry = new THREE.BufferGeometry();
    nextGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(SOURCE_BONES.length * 2 * 3), 3),
    );
    nextGeometry.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(SOURCE_BONES.length * 2 * 3), 3),
    );
    return nextGeometry;
  }, []);
  const pointGeometry = useMemo(() => {
    const nextGeometry = new THREE.BufferGeometry();
    nextGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(SOURCE_JOINTS.length * 3), 3),
    );
    nextGeometry.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(SOURCE_JOINTS.length * 3), 3),
    );
    return nextGeometry;
  }, []);
  const baseColor = useMemo(() => new THREE.Color(color), [color]);

  const lineMaterial = useMemo(
    () => new THREE.LineBasicMaterial({
      color,
      depthTest: false,
      opacity: 0.88,
      transparent: true,
      vertexColors: true,
    }),
    [color],
  );
  const pointMaterial = useMemo(
    () => new THREE.PointsMaterial({
      color,
      depthTest: false,
      opacity: 0.95,
      size: 0.055,
      sizeAttenuation: true,
      transparent: true,
      vertexColors: true,
    }),
    [color],
  );

  useFrame(() => {
    const group = groupRef.current;
    if (!group) {
      return;
    }

    const linePositions = lineGeometry.attributes.position.array as Float32Array;
    const lineColors = lineGeometry.attributes.color.array as Float32Array;
    const jointPositions = pointGeometry.attributes.position.array as Float32Array;
    const jointColors = pointGeometry.attributes.color.array as Float32Array;

    const clearRemainder = (array: Float32Array, offset: number) => {
      array.fill(0, offset);
    };

    const writeLineColor = (confidence: number, offset: { value: number }) => {
      const intensity = 0.28 + clamp01(confidence) * 0.72;
      lineColors[offset.value++] = baseColor.r * intensity;
      lineColors[offset.value++] = baseColor.g * intensity;
      lineColors[offset.value++] = baseColor.b * intensity;
    };

    const writeZeroLine = (positionOffsetRef: { value: number }, colorOffsetRef: { value: number }) => {
      linePositions[positionOffsetRef.value++] = 0;
      linePositions[positionOffsetRef.value++] = 0;
      linePositions[positionOffsetRef.value++] = 0;
      linePositions[positionOffsetRef.value++] = 0;
      linePositions[positionOffsetRef.value++] = 0;
      linePositions[positionOffsetRef.value++] = 0;
      writeLineColor(0, colorOffsetRef);
      writeLineColor(0, colorOffsetRef);
    };

    const writeLocalLinePoint = (
      point: { x: number; y: number; z: number },
      positions: Float32Array,
      offset: { value: number },
    ) => {
      positions[offset.value++] = point.x;
      positions[offset.value++] = point.y;
      positions[offset.value++] = point.z;
    };

    if (mode === "truth") {
      const skeleton = motionFrameRef?.current?.truthSkeleton;
      const hipCenter = skeleton?.centers.hip;

      if (!skeleton || !hipCenter) {
        group.visible = false;
        return;
      }

      group.visible = true;
      const floorY = skeleton.floorY ?? hipCenter.y;
      const hipX = hipCenter.x;
      const hipZ = hipCenter.z ?? 0;
      const toLocalTruthPoint = (landmark: VrmPoseLandmark) => {
        const x = mirrorX ? 1 - landmark.x : landmark.x;
        const centeredX = mirrorX ? x - (1 - hipX) : x - hipX;

        return {
          x: centeredX * SKELETON_LOCAL_SCALE,
          y: (floorY - landmark.y) * SKELETON_LOCAL_SCALE,
          z: -((landmark.z ?? hipZ) - hipZ) * 0.9,
        };
      };
      const linePositionOffset = { value: 0 };
      const lineColorOffset = { value: 0 };

      TRUTH_SKELETON_SEGMENTS.forEach((segmentName) => {
        const segment = skeleton.segments[segmentName];
        if (
          !segment.start ||
          !segment.end ||
          segment.confidence < MIN_VISIBLE_CONFIDENCE
        ) {
          writeZeroLine(linePositionOffset, lineColorOffset);
          return;
        }

        writeLocalLinePoint(toLocalTruthPoint(segment.start), linePositions, linePositionOffset);
        writeLocalLinePoint(toLocalTruthPoint(segment.end), linePositions, linePositionOffset);
        writeLineColor(segment.confidence, lineColorOffset);
        writeLineColor(segment.confidence, lineColorOffset);
      });

      clearRemainder(linePositions, linePositionOffset.value);
      clearRemainder(lineColors, lineColorOffset.value);

      let jointPositionOffset = 0;
      let jointColorOffset = 0;
      TRUTH_SKELETON_SEGMENTS.forEach((segmentName) => {
        const segment = skeleton.segments[segmentName];
        const segmentPoints = [segment.start, segment.end];

        segmentPoints.forEach((landmark) => {
          if (!landmark || segment.confidence < MIN_VISIBLE_CONFIDENCE) {
            jointPositions[jointPositionOffset++] = 0;
            jointPositions[jointPositionOffset++] = 0;
            jointPositions[jointPositionOffset++] = 0;
            jointColors[jointColorOffset++] = 0;
            jointColors[jointColorOffset++] = 0;
            jointColors[jointColorOffset++] = 0;
            return;
          }

          const point = toLocalTruthPoint(landmark);
          const intensity = 0.34 + clamp01(segment.confidence) * 0.66;
          jointPositions[jointPositionOffset++] = point.x;
          jointPositions[jointPositionOffset++] = point.y;
          jointPositions[jointPositionOffset++] = point.z;
          jointColors[jointColorOffset++] = baseColor.r * intensity;
          jointColors[jointColorOffset++] = baseColor.g * intensity;
          jointColors[jointColorOffset++] = baseColor.b * intensity;
        });
      });

      clearRemainder(jointPositions, jointPositionOffset);
      clearRemainder(jointColors, jointColorOffset);
      lineGeometry.attributes.position.needsUpdate = true;
      lineGeometry.attributes.color.needsUpdate = true;
      pointGeometry.attributes.position.needsUpdate = true;
      pointGeometry.attributes.color.needsUpdate = true;
      lineGeometry.computeBoundingSphere();
      pointGeometry.computeBoundingSphere();
      return;
    }

    const landmarks = getVrmMotionLandmarks(landmarksRef.current);
    if (landmarks.length < 33) {
      group.visible = false;
      return;
    }

    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    if (!leftHip || !rightHip) {
      group.visible = false;
      return;
    }

    const visibleFloorLandmarks = FLOOR_LANDMARKS
      .map((index) => landmarks[index])
      .filter((landmark): landmark is VrmPoseLandmark => (
        Boolean(landmark) && landmarkVisibility(landmark) >= MIN_VISIBLE_CONFIDENCE
      ));
    const floorY = visibleFloorLandmarks.length
      ? Math.max(...visibleFloorLandmarks.map((landmark) => landmark.y))
      : Math.max(leftHip.y, rightHip.y);
    group.visible = true;

    const hipX = (leftHip.x + rightHip.x) / 2;
    const hipZ = ((leftHip.z ?? 0) + (rightHip.z ?? 0)) / 2;
    const linePositionOffset = { value: 0 };
    const lineColorOffset = { value: 0 };

    const toLocalPoint = (landmark: VrmPoseLandmark) => {
      const x = mirrorX ? 1 - landmark.x : landmark.x;
      const centeredX = mirrorX ? x - (1 - hipX) : x - hipX;

      return {
        confidence: landmarkVisibility(landmark),
        x: centeredX * SKELETON_LOCAL_SCALE,
        y: (floorY - landmark.y) * SKELETON_LOCAL_SCALE,
        z: -((landmark.z ?? hipZ) - hipZ) * 0.9,
      };
    };

    const writePoint = (point: ReturnType<typeof toLocalPoint>, positions: Float32Array) => {
      positions[linePositionOffset.value++] = point.x;
      positions[linePositionOffset.value++] = point.y;
      positions[linePositionOffset.value++] = point.z;
    };

    SOURCE_BONES.forEach(([start, end]) => {
      const startLandmark = landmarks[start];
      const endLandmark = landmarks[end];
      const startVisible = landmarkVisibility(startLandmark) >= MIN_VISIBLE_CONFIDENCE;
      const endVisible = landmarkVisibility(endLandmark) >= MIN_VISIBLE_CONFIDENCE;

      if (!startLandmark || !endLandmark || !startVisible || !endVisible) {
        writeZeroLine(linePositionOffset, lineColorOffset);
        return;
      }

      const startPoint = toLocalPoint(startLandmark);
      const endPoint = toLocalPoint(endLandmark);
      writePoint(startPoint, linePositions);
      writePoint(endPoint, linePositions);
      writeLineColor(startPoint.confidence, lineColorOffset);
      writeLineColor(endPoint.confidence, lineColorOffset);
    });

    let jointPositionOffset = 0;
    let jointColorOffset = 0;

    SOURCE_JOINTS.forEach((index) => {
      const landmark = landmarks[index];
      if (!landmark || landmarkVisibility(landmark) < MIN_VISIBLE_CONFIDENCE) {
        jointPositions[jointPositionOffset++] = 0;
        jointPositions[jointPositionOffset++] = 0;
        jointPositions[jointPositionOffset++] = 0;
        jointColors[jointColorOffset++] = 0;
        jointColors[jointColorOffset++] = 0;
        jointColors[jointColorOffset++] = 0;
        return;
      }

      const point = toLocalPoint(landmark);
      const intensity = 0.34 + clamp01(point.confidence) * 0.66;
      jointPositions[jointPositionOffset++] = point.x;
      jointPositions[jointPositionOffset++] = point.y;
      jointPositions[jointPositionOffset++] = point.z;
      jointColors[jointColorOffset++] = baseColor.r * intensity;
      jointColors[jointColorOffset++] = baseColor.g * intensity;
      jointColors[jointColorOffset++] = baseColor.b * intensity;
    });

    lineGeometry.attributes.position.needsUpdate = true;
    lineGeometry.attributes.color.needsUpdate = true;
    pointGeometry.attributes.position.needsUpdate = true;
    pointGeometry.attributes.color.needsUpdate = true;
    lineGeometry.computeBoundingSphere();
    pointGeometry.computeBoundingSphere();
  });

  return (
    <group
      ref={groupRef}
      position={[positionOffset[0], positionOffset[1] - 1.78, positionOffset[2] + 0.08]}
      renderOrder={30}
      rotation={[0, Math.PI, 0]}
      scale={2.15}
    >
      <lineSegments geometry={lineGeometry} material={lineMaterial} />
      <points geometry={pointGeometry} material={pointMaterial} />
    </group>
  );
}
