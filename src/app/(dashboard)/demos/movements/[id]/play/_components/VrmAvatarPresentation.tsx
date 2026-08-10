"use client";

import type { RefObject } from "react";
import { Html } from "@react-three/drei";
import type * as THREE from "three";
import {
  MOVEMENT_MINT,
  MOVEMENT_PANEL_BG,
  MOVEMENT_SALMON,
} from "../../../_lib/movementPalette";

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
          <div className={`rounded-full border border-white/10 bg-[${MOVEMENT_PANEL_BG}]/70 px-6 py-1.5 shadow-2xl backdrop-blur-md`}>
            <span
              className={`text-xs font-black uppercase tracking-[0.2em] ${
                isPlayer ? `text-[${MOVEMENT_SALMON}]` : `text-[${MOVEMENT_MINT}]`
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
