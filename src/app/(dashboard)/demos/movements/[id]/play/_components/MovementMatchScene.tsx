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
        <color attach="background" args={["#050510"]} />
        <fog attach="fog" args={["#050510", 35, 65]} />

        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 10, 5]} intensity={1} color="#ffffff" castShadow />
        <pointLight position={[-10, 5, 10]} intensity={2} color="#00f2ff" />
        <Environment preset="city" />

        <OrbitControls enableZoom={false} enablePan={false} maxPolarAngle={Math.PI / 2} />

        <Grid
          position={[0, -2.8, 0]}
          args={[50, 50]}
          cellColor="#ffffff"
          cellThickness={0.5}
          sectionColor="#ffffff"
          sectionThickness={1}
          sectionSize={3}
          fadeDistance={30}
          fadeStrength={1}
          infiniteGrid
        />

        <React.Suspense fallback={null}>
          {children}
        </React.Suspense>
      </Canvas>
    </div>
  );
}
