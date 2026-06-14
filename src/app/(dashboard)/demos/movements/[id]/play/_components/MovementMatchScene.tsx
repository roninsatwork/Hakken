"use client";

import React from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, Grid, OrbitControls } from "@react-three/drei";

type MovementMatchSceneProps = {
  children: React.ReactNode;
};

export default function MovementMatchScene({ children }: MovementMatchSceneProps) {
  return (
    <div className="absolute inset-0 z-0">
      <Canvas camera={{ position: [0, 2, 25], fov: 45 }}>
        <color attach="background" args={["#07070b"]} />
        <fog attach="fog" args={["#07070b", 35, 66]} />

        <ambientLight intensity={0.72} />
        <directionalLight position={[8, 12, 8]} intensity={1.15} color="#fff4ec" castShadow />
        <pointLight position={[-10, 5, 10]} intensity={1.35} color="#bfe7d0" />
        <pointLight position={[10, 4, 8]} intensity={0.9} color="#f6ccbe" />
        <Environment preset="apartment" />

        <OrbitControls enableZoom={false} enablePan={false} maxPolarAngle={Math.PI / 2} />

        <Grid
          position={[0, -2.8, 0]}
          args={[50, 50]}
          cellColor="#d7eef4"
          cellThickness={0.32}
          sectionColor="#f6ccbe"
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
