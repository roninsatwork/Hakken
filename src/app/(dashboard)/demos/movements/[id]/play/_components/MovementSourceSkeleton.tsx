"use client";

import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  getVrmMotionLandmarks,
  type VrmMotionRef,
  type VrmPoseLandmark,
} from "../../../_lib/vrmRigging";

const SOURCE_BONES: Array<[number, number]> = [
  [7, 8],
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [27, 31],
  [24, 26],
  [26, 28],
  [28, 32],
];

type MovementSourceSkeletonProps = {
  color?: string;
  landmarksRef: RefObject<VrmMotionRef>;
  mirrorX?: boolean;
  positionOffset: [number, number, number];
};

function landmarkVisibility(landmark?: VrmPoseLandmark) {
  return landmark?.visibility ?? 0.8;
}

export default function MovementSourceSkeleton({
  color = "#f6ccbe",
  landmarksRef,
  mirrorX = false,
  positionOffset,
}: MovementSourceSkeletonProps) {
  const groupRef = useRef<THREE.Group>(null);
  const geometry = useMemo(() => {
    const nextGeometry = new THREE.BufferGeometry();
    nextGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(SOURCE_BONES.length * 2 * 3), 3),
    );
    return nextGeometry;
  }, []);

  const material = useMemo(
    () => new THREE.LineBasicMaterial({
      color,
      depthTest: false,
      opacity: 0.82,
      transparent: true,
    }),
    [color],
  );

  useFrame(() => {
    const landmarks = getVrmMotionLandmarks(landmarksRef.current);
    const group = groupRef.current;
    if (!group || landmarks.length < 33) {
      if (group) group.visible = false;
      return;
    }

    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    if (!leftHip || !rightHip) {
      group.visible = false;
      return;
    }

    group.visible = true;

    const hipX = (leftHip.x + rightHip.x) / 2;
    const hipY = (leftHip.y + rightHip.y) / 2;
    const positions = geometry.attributes.position.array as Float32Array;
    let offset = 0;

    const writeLandmark = (landmark?: VrmPoseLandmark) => {
      if (!landmark || landmarkVisibility(landmark) < 0.18) {
        positions[offset++] = 0;
        positions[offset++] = 0;
        positions[offset++] = 0;
        return;
      }

      const x = mirrorX ? 1 - landmark.x : landmark.x;
      const centeredX = mirrorX ? x - (1 - hipX) : x - hipX;
      positions[offset++] = centeredX * 3.05;
      positions[offset++] = -(landmark.y - hipY) * 3.05;
      positions[offset++] = -(landmark.z ?? 0) * 0.9;
    };

    SOURCE_BONES.forEach(([start, end]) => {
      writeLandmark(landmarks[start]);
      writeLandmark(landmarks[end]);
    });

    geometry.attributes.position.needsUpdate = true;
    geometry.computeBoundingSphere();
  });

  return (
    <group
      ref={groupRef}
      position={[positionOffset[0], -1.78, positionOffset[2] + 0.08]}
      renderOrder={30}
      rotation={[0, Math.PI, 0]}
      scale={5.25}
    >
      <lineSegments geometry={geometry} material={material} />
    </group>
  );
}
