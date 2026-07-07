import { renderHook, waitFor } from "@testing-library/react";
import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLoader } from "@react-three/fiber";
import { VRMUtils } from "@pixiv/three-vrm";
import { useMovementAvatarVrmAssetRuntime } from "./movementAvatarVrmAssetRuntime";
import { resetMovementAvatarRuntimeRefs } from "./movementAvatarRuntimeReset";
import type { MovementAvatarRuntimeResetRefs } from "./movementAvatarRuntimeReset";

vi.mock("@react-three/fiber", () => ({
  useLoader: vi.fn(),
}));

vi.mock("@pixiv/three-vrm", () => ({
  VRMLoaderPlugin: vi.fn(function VRMLoaderPlugin() {
    return {};
  }),
  VRMUtils: {
    combineSkeletons: vi.fn(),
  },
}));

vi.mock("./movementAvatarRuntimeReset", async () => {
  const actual = await vi.importActual<typeof import("./movementAvatarRuntimeReset")>(
    "./movementAvatarRuntimeReset",
  );

  return {
    ...actual,
    resetMovementAvatarRuntimeRefs: vi.fn(),
  };
});

function resetRefs(): MovementAvatarRuntimeResetRefs {
  return {
    baseBonePositionRef: { current: {} },
    baseHipsPositionRef: { current: null },
    exerciseTransitionStateRef: { current: {} as MovementAvatarRuntimeResetRefs["exerciseTransitionStateRef"]["current"] },
    instructorLowerBodyStabilityRef: {
      current: {} as MovementAvatarRuntimeResetRefs["instructorLowerBodyStabilityRef"]["current"],
    },
    lastGoodQuatRef: { current: {} },
    liveRootMotionHistoryRef: { current: [] },
    plantedFootLockRef: { current: {} as MovementAvatarRuntimeResetRefs["plantedFootLockRef"]["current"] },
    playerLegRaiseHoldRef: { current: {} as MovementAvatarRuntimeResetRefs["playerLegRaiseHoldRef"]["current"] },
    playerLowerBodyStabilityRef: {
      current: {} as MovementAvatarRuntimeResetRefs["playerLowerBodyStabilityRef"]["current"],
    },
    retargetAvatarRestRef: { current: {} },
    retargetSourceModelRef: { current: null },
    setupStateRef: { current: {} as MovementAvatarRuntimeResetRefs["setupStateRef"]["current"] },
  };
}

describe("movementAvatarVrmAssetRuntime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads player VRM URLs with a cache split and resets runtime refs when a VRM is available", async () => {
    const scene = new THREE.Object3D();
    const vrmScene = new THREE.Object3D();
    const loadedVrm = {
      scene: vrmScene,
    } as VRM;
    const loaderRegister = vi.fn();
    vi.mocked(useLoader).mockImplementation((_loader, _url, configureLoader) => {
      configureLoader?.({
        register: loaderRegister,
      } as never);

      return {
        scene,
        userData: {
          vrm: loadedVrm,
        },
      } as never;
    });
    const refs = resetRefs();

    const { result } = renderHook(() => useMovementAvatarVrmAssetRuntime({
      isPlayer: true,
      resetRefs: refs,
      vrmUrl: "/models/avatar.vrm",
    }));

    expect(result.current.urlToLoad).toBe("/models/avatar.vrm?player");
    expect(result.current.avatarScene).toBe(vrmScene);
    expect(loaderRegister).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(result.current.vrmRef.current).toBe(loadedVrm);
      expect(VRMUtils.combineSkeletons).toHaveBeenCalledWith(scene);
      expect(resetMovementAvatarRuntimeRefs).toHaveBeenCalledWith({
        refs,
        vrm: loadedVrm,
      });
    });
  });

  it("uses the GLTF scene when no VRM is available and skips reset", () => {
    const scene = new THREE.Object3D();
    vi.mocked(useLoader).mockReturnValue({
      scene,
      userData: {},
    } as never);

    const { result } = renderHook(() => useMovementAvatarVrmAssetRuntime({
      isPlayer: false,
      resetRefs: resetRefs(),
      vrmUrl: "/models/instructor.vrm",
    }));

    expect(result.current.urlToLoad).toBe("/models/instructor.vrm");
    expect(result.current.avatarScene).toBe(scene);
    expect(result.current.loadedVrm).toBeUndefined();
    expect(result.current.vrmRef.current).toBeNull();
    expect(VRMUtils.combineSkeletons).not.toHaveBeenCalled();
    expect(resetMovementAvatarRuntimeRefs).not.toHaveBeenCalled();
  });
});
