"use client";

import type { RefObject } from "react";
import { Html } from "@react-three/drei";
import type * as THREE from "three";

export function VrmAvatarPresentation({
  avatarBaseY,
  avatarScene,
  groupRef,
  isPlayer,
  name,
  positionOffset,
  showNameLabel,
}: {
  avatarBaseY: number;
  avatarScene: THREE.Object3D;
  groupRef: RefObject<THREE.Group | null>;
  isPlayer: boolean;
  name: string;
  positionOffset: [number, number, number];
  showNameLabel: boolean;
}) {
  const nameLabelX = positionOffset[0] < 0 ? 0.95 : -0.95;

  return (
    <group
      ref={groupRef}
      position={[positionOffset[0], avatarBaseY, positionOffset[2]]}
      rotation={[0, Math.PI, 0]}
      scale={5.25}
    >
      <primitive object={avatarScene} />

      {showNameLabel ? (
        <Html position={[nameLabelX, -0.38, 0]} center zIndexRange={[100, 0]}>
          <div className="rounded-full border border-white/10 bg-[#111018]/70 px-6 py-1.5 shadow-2xl backdrop-blur-md">
            <span
              className={`text-xs font-black uppercase tracking-[0.2em] ${
                isPlayer ? "text-[#f6ccbe]" : "text-[#a8d5ba]"
              }`}
            >
              {name}
            </span>
          </div>
        </Html>
      ) : null}
    </group>
  );
}
