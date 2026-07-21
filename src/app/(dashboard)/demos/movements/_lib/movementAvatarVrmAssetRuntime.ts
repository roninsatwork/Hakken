"use client";

import { useEffect, useRef } from "react";
import { useLoader } from "@react-three/fiber";
import { VRM, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import type * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  resetMovementAvatarRuntimeRefs,
  type MovementAvatarRuntimeResetRefs,
} from "./movementAvatarRuntimeReset";

type LoaderPlugin = ReturnType<Parameters<InstanceType<typeof GLTFLoader>["register"]>[0]>;

export function useMovementAvatarVrmAssetRuntime({
  assetVariant,
  isPlayer,
  resetRefs,
  vrmUrl,
}: {
  // Distinct GLTF cache key per on-screen avatar. Two avatars resolving to the
  // same URL would otherwise share one mutated scene graph. `isPlayer` alone is
  // not enough now that the instructor also runs the player motion lane.
  assetVariant?: string;
  isPlayer: boolean;
  resetRefs: MovementAvatarRuntimeResetRefs;
  vrmUrl: string;
}) {
  const vrmRef = useRef<VRM | null>(null);
  const urlToLoad = assetVariant
    ? `${vrmUrl}?${assetVariant}`
    : isPlayer
      ? `${vrmUrl}?player`
      : vrmUrl;
  const gltf = useLoader(GLTFLoader, urlToLoad, (loader) => {
    loader.register((parser) => new VRMLoaderPlugin(parser as never) as unknown as LoaderPlugin);
  });
  const loadedVrm = gltf.userData.vrm as VRM | undefined;
  const avatarScene = (loadedVrm?.scene ?? gltf.scene) as THREE.Object3D;

  useEffect(() => {
    if (!loadedVrm) return;

    VRMUtils.combineSkeletons(gltf.scene);
    vrmRef.current = loadedVrm;
    resetMovementAvatarRuntimeRefs({
      refs: resetRefs,
      vrm: loadedVrm,
    });
  }, [gltf.scene, loadedVrm, resetRefs]);

  return {
    avatarScene,
    loadedVrm,
    urlToLoad,
    vrmRef,
  };
}
