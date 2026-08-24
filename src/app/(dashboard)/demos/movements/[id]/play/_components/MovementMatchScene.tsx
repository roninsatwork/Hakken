"use client";

import React from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, Grid, Lightformer, OrbitControls } from "@react-three/drei";
import {
  MOVEMENT_SALMON,
  MOVEMENT_SCENE_BG,
} from "../../../_lib/movementPalette";

type MovementMatchSceneProps = {
  children: React.ReactNode;
};

export default function MovementMatchScene({ children }: MovementMatchSceneProps) {
  return (
    <div className="absolute inset-0 z-0">
      <Canvas camera={{ position: [0, 2, 25], fov: 45 }}>
        <color attach="background" args={[MOVEMENT_SCENE_BG]} />
        <fog attach="fog" args={[MOVEMENT_SCENE_BG, 35, 66]} />

        <ambientLight intensity={0.72} />
        <directionalLight position={[8, 12, 8]} intensity={1.15} color="#fff4ec" castShadow />
        <pointLight position={[-10, 5, 10]} intensity={1.35} color="#bfe7d0" />
        <pointLight position={[10, 4, 8]} intensity={0.9} color={MOVEMENT_SALMON} />
        {/*
          * Soft reflected light, built here rather than downloaded.
          *
          * This was `preset="apartment"`, which has the library fetch a lighting
          * image from a website outside this platform. The app's security policy
          * lists which outside addresses it may talk to and that one is not on
          * it, so since the policy was tightened on 2026-08-22 the browser
          * refused the request and the whole scene failed to render.
          *
          * Adding the address to the list would have fixed it and left the scene
          * depending on somebody else's server staying up. Building the light
          * here cannot break, works with no connection at all, and needs no
          * exception to the policy. The three panels mirror the three lights
          * above so the surfaces reflect what is actually lighting them.
          */}
        <Environment resolution={64}>
          <Lightformer intensity={1.1} position={[0, 6, -6]} scale={[12, 12, 1]} color="#fff4ec" />
          <Lightformer intensity={0.8} position={[-8, 2, 5]} scale={[7, 7, 1]} color="#bfe7d0" />
          <Lightformer intensity={0.6} position={[8, 2, 5]} scale={[7, 7, 1]} color={MOVEMENT_SALMON} />
        </Environment>

        <OrbitControls enableZoom={false} enablePan={false} maxPolarAngle={Math.PI / 2} />

        <Grid
          position={[0, -2.8, 0]}
          args={[50, 50]}
          cellColor="#d7eef4"
          cellThickness={0.32}
          sectionColor={MOVEMENT_SALMON}
          sectionThickness={0.7}
          sectionSize={3}
          fadeDistance={30}
          fadeStrength={1.25}
          infiniteGrid
        />

        <React.Suspense fallback={null}>
          {children}
        </React.Suspense>
      </Canvas>
    </div>
  );
}
