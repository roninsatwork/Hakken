"use client";

import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getVrmMotionLandmarks, type VrmMotionRef } from "../../../_lib/vrmRigging";

type MovementSparklesProps = {
  landmarksRef: RefObject<VrmMotionRef>;
  jointIndices: number[];
  syncRef: RefObject<number>;
};

const SPARKLES_PER_JOINT = 30;

export default function MovementSparkles({
  landmarksRef,
  jointIndices,
  syncRef,
}: MovementSparklesProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const positions = useMemo(
    () => new Float32Array(SPARKLES_PER_JOINT * 3 * jointIndices.length),
    [jointIndices],
  );

  useFrame((state) => {
    if (!pointsRef.current || (syncRef.current ?? 0) < 85) {
      if (pointsRef.current) pointsRef.current.visible = false;
      return;
    }

    pointsRef.current.visible = true;
    const landmarks = getVrmMotionLandmarks(landmarksRef.current);
    if (landmarks.length < 33) return;

    const time = state.clock.getElapsedTime();
    const positionAttribute = pointsRef.current.geometry.attributes.position;
    const array = positionAttribute.array as Float32Array;

    jointIndices.forEach((jointIndex, jointOffset) => {
      const landmark = landmarks[jointIndex];
      if (!landmark) return;

      const baseX = (landmark.x - 0.5) * -15;
      const baseY = (0.5 - landmark.y) * 15;
      const baseZ = (landmark.z || 0) * -15 * 0.5;

      for (let sparkleIndex = 0; sparkleIndex < SPARKLES_PER_JOINT; sparkleIndex += 1) {
        const idx = (jointOffset * SPARKLES_PER_JOINT + sparkleIndex) * 3;
        const angle = sparkleIndex + time * 3;
        const dist = 0.3 + Math.sin(time * 8 + sparkleIndex) * 0.2;
        array[idx] = baseX + Math.cos(angle) * dist;
        array[idx + 1] = baseY + Math.sin(angle) * dist;
        array[idx + 2] = baseZ + Math.sin(time * 10 + sparkleIndex) * 0.1;
      }
    });

    positionAttribute.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.15}
        color="#ffb800"
        transparent
        opacity={0.8}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}
