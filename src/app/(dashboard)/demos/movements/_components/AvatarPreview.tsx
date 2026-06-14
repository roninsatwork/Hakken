"use client";

import { Suspense, useRef, useEffect } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { OrbitControls, Environment, ContactShadows, Html } from "@react-three/drei";
import { GLTFLoader } from "three-stdlib";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { Loader2 } from "lucide-react";
import * as THREE from "three";

type LoaderPlugin = ReturnType<Parameters<InstanceType<typeof GLTFLoader>["register"]>[0]>;

function Model() {
  const group = useRef<THREE.Group>(null);
  
  // Load the Moon Girl VRM
  const gltf = useLoader(GLTFLoader, "/models/MoonGirl.vrm", (loader) => {
    loader.register((parser) => new VRMLoaderPlugin(parser as never) as unknown as LoaderPlugin);
  });

  useEffect(() => {
    if (gltf) {
      const vrm = gltf.userData.vrm;
      VRMUtils.combineSkeletons(gltf.scene);
      
      // Fix VRM Materials (disable frustum culling and ensure transparent materials render back faces)
      gltf.scene.traverse((obj: THREE.Object3D) => {
        obj.frustumCulled = false;
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => m.side = THREE.DoubleSide);
          } else {
            mesh.material.side = THREE.DoubleSide;
          }
        }
      });

      // Simple default pose (arms slightly down)
      if (vrm && vrm.humanoid) {
        const leftArm = vrm.humanoid.getNormalizedBoneNode("leftUpperArm");
        const rightArm = vrm.humanoid.getNormalizedBoneNode("rightUpperArm");
        if (leftArm) leftArm.rotation.z = 1.2;
        if (rightArm) rightArm.rotation.z = -1.2;
      }
    }
  }, [gltf]);

  return <primitive ref={group} object={gltf.scene} scale={1.2} position={[0, -0.9, 0]} rotation={[0, Math.PI, 0]} />;
}

export default function AvatarPreview() {
  return (
    <div className="w-full h-[400px] bg-sidebar/40 border border-border-dim rounded-[24px] overflow-hidden relative">
      <div className="absolute top-4 left-4 z-10">
        <div className="px-3 py-1 bg-foreground/10 backdrop-blur-md rounded-full border border-border-dim">
          <span className="text-xs font-medium text-foreground">Digital Twin Preview</span>
        </div>
      </div>
      
      <Canvas camera={{ position: [0, 0, 4.0], fov: 45 }}>
        <Suspense
          fallback={
            <Html center>
              <div className="flex flex-col items-center gap-2 text-secondary">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-sm">Loading Moon Girl...</span>
              </div>
            </Html>
          }
        >
          {/* Lighting Setup */}
          <ambientLight intensity={0.5} />
          <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} castShadow />
          <Environment preset="city" />

          {/* The Model */}
          <Model />

          {/* Ground Shadow for realism */}
          <ContactShadows position={[0, -0.9, 0]} opacity={0.4} scale={10} blur={2} far={4} />

          {/* Camera Controls */}
          <OrbitControls 
            target={[0, 0, 0]}
            enableZoom={true} 
            enablePan={false} 
            minPolarAngle={Math.PI / 4} 
            maxPolarAngle={Math.PI / 2} 
            autoRotate={false} 
            enableDamping={true}
            dampingFactor={0.05}
            rotateSpeed={0.3}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
