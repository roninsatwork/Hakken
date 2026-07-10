import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import {
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  applyMovementAvatarBodyFrameOrchestrationRuntime,
  applyMovementAvatarInactiveLowerBodyRuntimeToVrmBones,
  applyMovementAvatarLowerBodyFrameOrchestrationRuntime,
  applyMovementAvatarLowerBodyFrameRuntime,
  applyMovementAvatarPlantedSquatIkRuntimeFrame,
  applyMovementAvatarPlantedSquatIkRuntimeToVrmBones,
  applyMovementAvatarPlantedSquatIkRuntimeVrmFrame,
  applyMovementAvatarRetargetSegmentRuntimeFrame,
  applyMovementAvatarRetargetSegmentRuntimeMappingsToVrmBones,
  applyMovementAvatarUpperBodyFrameOrchestrationRuntime,
  applyMovementAvatarUpperBodyFrameRuntime,
  applyMovementAvatarUpperBodyRuntimeToVrmBones,
  createMovementAvatarLowerBodyFrameCallbacksRuntime,
  createMovementAvatarRetargetFrameRuntimeAdapters,
  type MovementAvatarRetargetFrameRuntimeAdapters,
  resolveMovementAvatarFrameTargetRetargetOrchestrationRuntime,
  resolveMovementAvatarFrameTargetRuntime,
} from "./movementAvatarBodyFrame";
import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";
import type { MovementAvatarArmDecision, MovementAvatarLowerBodyApplicationStageDecision } from "./movementAvatarPipeline";
import type { MovementAvatarPlayerSpineDrive } from "./movementAvatarPlayerDrive";
import { makeMovementAvatarProofMotionPayload } from "./movementAvatarProofFixtures";
import {
  MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS,
  type MovementAvatarRetargetBoneMapping,
  type MovementAvatarRetargetBoneName,
  type MovementAvatarRetargetRestMap,
} from "./movementAvatarRestPose";
import type { MovementAvatarLowerBodyTargetDecision } from "./movementAvatarTarget";
import type { MovementRetargetFrame } from "./movementRetargeting";
import { normalizeVrmLandmark, type VrmSolverLandmark } from "./vrmRigging";

describe("movementAvatarRetargetSegmentRuntime (merged)", () => {
  function retargetFrame(overrides: Partial<MovementRetargetFrame> = {}): MovementRetargetFrame {
    return {
      contacts: {
        leftFoot: false,
        rightFoot: true,
      },
      debug: {
        heldSegments: [],
        solvedSegments: ["rightThigh", "rightFoot"],
        sourceQuality: 0.9,
      },
      hipDrop: 0.4,
      kneeLift: {
        left: 0,
        right: 0.6,
      },
      segments: {
        rightFoot: {
          confidence: 0.95,
          direction: { x: 0.1, y: 0.2, z: -0.5 },
          length: 0.2,
        },
        rightThigh: {
          confidence: 0.95,
          direction: { x: 0.3, y: 0.7, z: -0.4 },
          length: 0.5,
        },
      },
      squatDepth: 0.55,
      ...overrides,
    };
  }

  function restMap(): MovementAvatarRetargetRestMap {
    return {
      rightFoot: {
        worldDirection: new THREE.Vector3(0, -1, 0),
        worldQuaternion: new THREE.Quaternion(),
      },
      rightUpperLeg: {
        worldDirection: new THREE.Vector3(0, -1, 0),
        worldQuaternion: new THREE.Quaternion(),
      },
    };
  }

  describe("movementAvatarRetargetSegmentRuntime", () => {
    it("applies active mappings and preserves recorded foot plant guards", () => {
      const root = new THREE.Object3D();
      const rightUpperLeg = new THREE.Object3D();
      const rightFoot = new THREE.Object3D();
      root.add(rightUpperLeg);
      root.add(rightFoot);
      root.updateMatrixWorld(true);
      const bones = new Map<MovementAvatarRetargetBoneName, THREE.Object3D>([
        ["rightFoot", rightFoot],
        ["rightUpperLeg", rightUpperLeg],
      ]);
      const stored: MovementAvatarRetargetBoneName[] = [];

      const result = applyMovementAvatarRetargetSegmentRuntimeMappingsToVrmBones({
        avatarRole: "instructor",
        currentRestMap: {},
        instructorSquatPresentationDepth: 0.55,
        lookupBone: (boneName) => bones.get(boneName) ?? null,
        lowerBodySegmentMotion: 0.55,
        mappings: [
          MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS[0]!,
          MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS[4]!,
        ],
        refreshRestMap: restMap,
        retargetFrame: retargetFrame(),
        storeLastGood: (boneName) => {
          stored.push(boneName);
        },
      });

      expect(result).toMatchObject({
        applied: 1,
        feet: 0,
        legs: 1,
      });
      expect(result.restMap.rightUpperLeg).toBeDefined();
      expect(stored).toEqual(["rightUpperLeg"]);
      expect(rightUpperLeg.quaternion.w).toBeLessThan(1);
      expect(rightFoot.quaternion.w).toBe(1);
    });

    it("threads the existing rest map when nothing can be applied", () => {
      const existingRestMap = restMap();

      const result = applyMovementAvatarRetargetSegmentRuntimeMappingsToVrmBones({
        avatarRole: "player",
        canApply: false,
        currentRestMap: existingRestMap,
        instructorSquatPresentationDepth: 0,
        lookupBone: () => null,
        lowerBodySegmentMotion: 0,
        mappings: [MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS[0]!],
        refreshRestMap: () => {
          throw new Error("rest map should not refresh when application is disabled");
        },
        retargetFrame: retargetFrame({
          segments: {},
        }),
      });

      expect(result.applied).toBe(0);
      expect(result.restMap).toBe(existingRestMap);
    });

    it("applies a retarget segment runtime frame and writes last-good rotations", () => {
      const scene = new THREE.Object3D();
      const rightUpperLeg = new THREE.Object3D();
      const rightLowerLeg = new THREE.Object3D();
      scene.add(rightUpperLeg);
      scene.add(rightLowerLeg);
      rightUpperLeg.position.set(0, 1, 0);
      rightLowerLeg.position.set(0, 0, 0);
      scene.updateMatrixWorld(true);
      const bones = new Map<MovementAvatarRetargetBoneName, THREE.Object3D>([
        ["rightLowerLeg", rightLowerLeg],
        ["rightUpperLeg", rightUpperLeg],
      ]);
      const vrm = {
        humanoid: {
          getNormalizedBoneNode: (boneName: MovementAvatarRetargetBoneName) => bones.get(boneName) ?? null,
        },
        scene,
      } as unknown as VRM;
      const lastGood: Record<string, THREE.Quaternion> = {};

      const result = applyMovementAvatarRetargetSegmentRuntimeFrame({
        avatarRole: "instructor",
        currentRestMap: {},
        instructorSquatPresentationDepth: 0.55,
        lastGood,
        lookupBone: (boneName) => bones.get(boneName) ?? null,
        lowerBodySegmentMotion: 0.55,
        mappings: [MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS[0]!],
        retargetFrame: retargetFrame(),
        vrm,
      });

      expect(result.applied).toBe(1);
      expect(result.restMap.rightUpperLeg).toBeDefined();
      expect(lastGood.rightUpperLeg).toBeInstanceOf(THREE.Quaternion);
      expect(rightUpperLeg.quaternion.w).toBeLessThan(1);
    });
  });
});

describe("movementAvatarPlantedSquatIkRuntime (merged)", () => {
  function restMap(): MovementAvatarRetargetRestMap {
    return {
      leftLowerLeg: {
        worldDirection: new THREE.Vector3(0, -1, 0),
        worldQuaternion: new THREE.Quaternion(),
      },
      leftUpperLeg: {
        worldDirection: new THREE.Vector3(0, -1, 0),
        worldQuaternion: new THREE.Quaternion(),
      },
      rightLowerLeg: {
        worldDirection: new THREE.Vector3(0, -1, 0),
        worldQuaternion: new THREE.Quaternion(),
      },
      rightUpperLeg: {
        worldDirection: new THREE.Vector3(0, -1, 0),
        worldQuaternion: new THREE.Quaternion(),
      },
    };
  }

  describe("movementAvatarPlantedSquatIkRuntime", () => {
    it("skips low-depth planted squat IK without refreshing the rest map", () => {
      const existingRestMap = restMap();

      const result = applyMovementAvatarPlantedSquatIkRuntimeToVrmBones({
        avatarRole: "player",
        currentRestMap: existingRestMap,
        depth: 0.02,
        forward: new THREE.Vector3(0, 0, 1),
        lookupBone: () => null,
        refreshRestMap: () => {
          throw new Error("rest map should not refresh when planted squat IK is inactive");
        },
      });

      expect(result).toEqual({
        applied: 0,
        appliedDepth: 0,
        restMap: existingRestMap,
      });
    });

    it("applies active planted squat IK specs and threads the rest map", () => {
      const root = new THREE.Object3D();
      const rightUpperLeg = new THREE.Object3D();
      const rightLowerLeg = new THREE.Object3D();
      root.add(rightUpperLeg);
      root.add(rightLowerLeg);
      root.updateMatrixWorld(true);
      const bones = new Map<MovementAvatarRetargetBoneName, THREE.Object3D>([
        ["rightLowerLeg", rightLowerLeg],
        ["rightUpperLeg", rightUpperLeg],
      ]);

      const result = applyMovementAvatarPlantedSquatIkRuntimeToVrmBones({
        avatarRole: "player",
        currentRestMap: {},
        depth: 0.74,
        forward: new THREE.Vector3(0, 0, 1),
        lookupBone: (boneName) => bones.get(boneName) ?? null,
        refreshRestMap: restMap,
      });

      expect(result.applied).toBe(2);
      expect(result.appliedDepth).toBeGreaterThan(0.7);
      expect(result.restMap.rightUpperLeg).toBeDefined();
      expect(rightUpperLeg.quaternion.w).toBeLessThan(1);
      expect(rightLowerLeg.quaternion.w).toBeLessThan(1);
    });

    it("applies planted squat IK from the avatar root frame direction", () => {
      const avatarRoot = new THREE.Object3D();
      const rightUpperLeg = new THREE.Object3D();
      const rightLowerLeg = new THREE.Object3D();
      avatarRoot.add(rightUpperLeg);
      avatarRoot.add(rightLowerLeg);
      avatarRoot.rotation.y = Math.PI / 4;
      avatarRoot.updateMatrixWorld(true);
      const bones = new Map<MovementAvatarRetargetBoneName, THREE.Object3D>([
        ["rightLowerLeg", rightLowerLeg],
        ["rightUpperLeg", rightUpperLeg],
      ]);

      const result = applyMovementAvatarPlantedSquatIkRuntimeFrame({
        avatarRole: "player",
        avatarRoot,
        currentRestMap: {},
        depth: 0.74,
        lookupBone: (boneName) => bones.get(boneName) ?? null,
        refreshRestMap: restMap,
      });

      expect(result.applied).toBe(2);
      expect(result.appliedDepth).toBeGreaterThan(0.7);
      expect(result.restMap.rightUpperLeg).toBeDefined();
      expect(rightUpperLeg.quaternion.w).toBeLessThan(1);
      expect(rightLowerLeg.quaternion.w).toBeLessThan(1);
    });

    it("refreshes planted squat IK rest map from the VRM frame", () => {
      const avatarRoot = new THREE.Object3D();
      const rightUpperLeg = new THREE.Object3D();
      const rightLowerLeg = new THREE.Object3D();
      const rightFoot = new THREE.Object3D();
      avatarRoot.add(rightUpperLeg);
      avatarRoot.add(rightLowerLeg);
      avatarRoot.add(rightFoot);
      rightUpperLeg.position.set(0, 1, 0);
      rightLowerLeg.position.set(0, 0, 0);
      rightFoot.position.set(0, -1, 0);
      avatarRoot.updateMatrixWorld(true);
      const bones = new Map<MovementAvatarRetargetBoneName, THREE.Object3D>([
        ["rightFoot", rightFoot],
        ["rightLowerLeg", rightLowerLeg],
        ["rightUpperLeg", rightUpperLeg],
      ]);
      const vrm = {
        humanoid: {
          getNormalizedBoneNode: (boneName: MovementAvatarRetargetBoneName) => bones.get(boneName) ?? null,
        },
        scene: avatarRoot,
      } as unknown as VRM;

      const result = applyMovementAvatarPlantedSquatIkRuntimeVrmFrame({
        avatarRole: "player",
        avatarRoot,
        currentRestMap: {},
        depth: 0.74,
        lookupBone: (boneName) => bones.get(boneName) ?? null,
        vrm,
      });

      expect(result.applied).toBe(2);
      expect(result.restMap.rightUpperLeg).toBeDefined();
      expect(rightUpperLeg.quaternion.w).toBeLessThan(1);
      expect(rightLowerLeg.quaternion.w).toBeLessThan(1);
    });
  });
});

describe("movementAvatarRetargetFrameRuntime (merged)", () => {
  function retargetFrame(overrides: Partial<MovementRetargetFrame> = {}): MovementRetargetFrame {
    return {
      contacts: {
        leftFoot: true,
        rightFoot: true,
      },
      debug: {
        heldSegments: [],
        solvedSegments: ["rightThigh", "rightShin"],
        sourceQuality: 0.9,
      },
      hipDrop: 0.4,
      kneeLift: {
        left: 0,
        right: 0.6,
      },
      segments: {
        rightShin: {
          confidence: 0.95,
          direction: { x: 0.1, y: -0.6, z: -0.2 },
          length: 0.5,
        },
        rightThigh: {
          confidence: 0.95,
          direction: { x: 0.3, y: 0.7, z: -0.4 },
          length: 0.5,
        },
      },
      squatDepth: 0.55,
      ...overrides,
    };
  }

  describe("movementAvatarRetargetFrameRuntime", () => {
    it("threads rest-map and last-good state through frame retarget adapters", () => {
      const scene = new THREE.Object3D();
      const rightUpperLeg = new THREE.Object3D();
      const rightLowerLeg = new THREE.Object3D();
      const rightFoot = new THREE.Object3D();
      scene.add(rightUpperLeg);
      scene.add(rightLowerLeg);
      scene.add(rightFoot);
      rightUpperLeg.position.set(0, 1, 0);
      rightLowerLeg.position.set(0, 0, 0);
      rightFoot.position.set(0, -1, 0);
      scene.updateMatrixWorld(true);
      const bones = new Map<MovementAvatarRetargetBoneName, THREE.Object3D>([
        ["rightFoot", rightFoot],
        ["rightLowerLeg", rightLowerLeg],
        ["rightUpperLeg", rightUpperLeg],
      ]);
      const vrm = {
        humanoid: {
          getNormalizedBoneNode: (boneName: MovementAvatarRetargetBoneName) => bones.get(boneName) ?? null,
        },
        scene,
      } as unknown as VRM;
      const lastGood: Record<string, THREE.Quaternion> = {};

      const adapters = createMovementAvatarRetargetFrameRuntimeAdapters({
        avatarRole: "instructor",
        avatarRoot: scene,
        currentRestMap: {},
        instructorSquatPresentationDepth: 0.55,
        lastGood,
        lookupBone: (boneName) => bones.get(boneName) ?? null,
        lowerBodySegmentMotion: 0.55,
        retargetFrame: retargetFrame(),
        vrm,
      });

      const retargetApplication = adapters.applyRetargetMappings([
        MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS[0]!,
        MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS[1]!,
      ]);
      const afterRetarget = adapters.getRestMap();
      const plantedDepth = adapters.applyPlantedSquatIk(0.74);

      expect(retargetApplication.applied).toBeGreaterThan(0);
      expect(afterRetarget.rightUpperLeg).toBeDefined();
      expect(lastGood.rightUpperLeg).toBeInstanceOf(THREE.Quaternion);
      expect(plantedDepth).toBeGreaterThan(0.7);
      expect(adapters.getRestMap().rightUpperLeg).toBeDefined();
      expect(rightUpperLeg.quaternion.w).toBeLessThan(1);
    });
  });
});

describe("movementAvatarFrameTargetRuntime (merged)", () => {
  function solverLandmarks(): VrmSolverLandmark[] {
    return makeMovementAvatarProofMotionPayload("standing").landmarks.map(normalizeVrmLandmark);
  }

  describe("movementAvatarFrameTargetRuntime", () => {
    it("resolves player lower-body target selections with the player threshold", () => {
      const runtime = resolveMovementAvatarFrameTargetRuntime({
        avatarRole: "player",
        targetSolverLandmarks: solverLandmarks(),
      });

      expect(runtime.lowerBodyTargetComposition.selections.endpointVisibilityThreshold).toBe(0.18);
      expect(runtime.lowerBodyTargetComposition.leftKneeTarget).toBeDefined();
    });

    it("resolves instructor lower-body target selections with the recorded threshold", () => {
      const runtime = resolveMovementAvatarFrameTargetRuntime({
        avatarRole: "instructor",
        targetSolverLandmarks: solverLandmarks(),
      });

      expect(runtime.lowerBodyTargetComposition.selections.endpointVisibilityThreshold).toBe(0.2);
      expect(runtime.lowerBodyTargetComposition.rightToeTarget).toBeDefined();
    });
  });
});

describe("movementAvatarFrameTargetRetargetOrchestrationRuntime (merged)", () => {
  function solverLandmarks(): VrmSolverLandmark[] {
    return makeMovementAvatarProofMotionPayload("standing").landmarks.map(normalizeVrmLandmark);
  }

  function lowerBodyDrive(overrides: Partial<MovementAvatarLowerBodyDrive> = {}): MovementAvatarLowerBodyDrive {
    return {
      groundedSquatDepth: 0,
      liveSquatDepth: 0,
      playerLegRaiseDepth: 0,
      playerLegRaiseSide: null,
      playerLowerBodyState: "neutral",
      playerSquatPresentationDepth: 0,
      shouldApplyLowerBody: true,
      shouldApplySolverTorso: true,
      shouldDrivePlayerLegRaise: false,
      shouldDrivePlayerSquat: false,
      visualRootDrop: 0,
      ...overrides,
    };
  }

  function retargetFrame(): MovementRetargetFrame {
    return {
      contacts: {
        leftFoot: true,
        rightFoot: true,
      },
      debug: {
        heldSegments: [],
        solvedSegments: ["rightThigh", "rightShin"],
        sourceQuality: 0.9,
      },
      hipDrop: 0.4,
      kneeLift: {
        left: 0,
        right: 0.6,
      },
      segments: {
        rightShin: {
          confidence: 0.95,
          direction: { x: 0.1, y: -0.6, z: -0.2 },
          length: 0.5,
        },
        rightThigh: {
          confidence: 0.95,
          direction: { x: 0.3, y: 0.7, z: -0.4 },
          length: 0.5,
        },
      },
      squatDepth: 0.55,
    };
  }

  describe("movementAvatarFrameTargetRetargetOrchestrationRuntime", () => {
    it("composes target selections and retarget frame adapters together", () => {
      const targetSolverLandmarks = solverLandmarks();
      const scene = new THREE.Object3D();
      const rightUpperLeg = new THREE.Object3D();
      const rightLowerLeg = new THREE.Object3D();
      const rightFoot = new THREE.Object3D();
      scene.add(rightUpperLeg);
      scene.add(rightLowerLeg);
      scene.add(rightFoot);
      rightUpperLeg.position.set(0, 1, 0);
      rightLowerLeg.position.set(0, 0, 0);
      rightFoot.position.set(0, -1, 0);
      scene.updateMatrixWorld(true);
      const bones = new Map<MovementAvatarRetargetBoneName, THREE.Object3D>([
        ["rightFoot", rightFoot],
        ["rightLowerLeg", rightLowerLeg],
        ["rightUpperLeg", rightUpperLeg],
      ]);
      const vrm = {
        humanoid: {
          getNormalizedBoneNode: (boneName: MovementAvatarRetargetBoneName) => bones.get(boneName) ?? null,
        },
        scene,
      } as unknown as VRM;
      const currentRestMap: MovementAvatarRetargetRestMap = {};
      const lastGood: Record<string, THREE.Quaternion> = {};

      const runtime = resolveMovementAvatarFrameTargetRetargetOrchestrationRuntime({
        avatarRole: "instructor",
        avatarRoot: scene,
        currentRestMap,
        instructorSquatPresentationDepth: 0.55,
        lastGood,
        lookupBone: (boneName) => bones.get(boneName) ?? null,
        lowerBodySegmentMotion: 0.55,
        retargetFrame: retargetFrame(),
        targetSolverLandmarks,
        vrm,
      });

      expect(runtime.retargetFrameRuntimeAdapters.getRestMap()).toBe(currentRestMap);

      const retargetApplication = runtime.retargetFrameRuntimeAdapters.applyRetargetMappings([
        MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS[0]!,
        MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS[1]!,
      ]);

      expect(retargetApplication.applied).toBeGreaterThan(0);
      expect(lastGood.rightUpperLeg).toBeInstanceOf(THREE.Quaternion);
      expect(runtime.retargetFrameRuntimeAdapters.getRestMap().rightUpperLeg).toBeDefined();
    });
  });
});

describe("movementAvatarUpperBodyRuntime (merged)", () => {
  function armDecision(
    side: "left" | "right",
    overrides: Partial<MovementAvatarArmDecision> = {},
  ): MovementAvatarArmDecision {
    return {
      endpointConfidence: 0.9,
      isTrackingReady: true,
      side,
      unreadyFallback: "relax",
      ...overrides,
    };
  }

  function spineDrive(): MovementAvatarPlayerSpineDrive {
    return {
      confidence: 0.9,
      forwardLean: 0.2,
      owner: "player-spine-model",
      rotations: {
        chest: { x: 0.3, y: 0, z: 0.03 },
        hips: { x: 0.1, y: 0, z: 0.01 },
        spine: { x: 0.2, y: 0, z: 0.02 },
        upperChest: { x: 0.4, y: 0, z: 0.04 },
      },
      shouldApplySpine: true,
      sideBend: 0.1,
      twist: 0.2,
    };
  }

  function spineApplyOptions(shouldCountRecordedSpineRetarget = false) {
    return {
      activeDrive: {
        chest: 1,
        hips: 1,
        spine: 1,
        upperChest: 1,
      },
      shouldCountRecordedSpineRetarget,
      solver: {
        chest: 0.35,
        hips: 0.15,
        spine: 0.25,
        upperChest: 0.45,
      },
    };
  }

  function bones() {
    const root = new THREE.Object3D();
    const boneMap = new Map<string, THREE.Object3D>();
    [
      "chest",
      "hips",
      "leftHand",
      "leftLowerArm",
      "leftUpperArm",
      "rightHand",
      "rightLowerArm",
      "rightUpperArm",
      "spine",
      "upperChest",
    ].forEach((boneName) => {
      const bone = new THREE.Object3D();
      boneMap.set(boneName, bone);
      root.add(bone);
    });
    boneMap.get("leftLowerArm")?.position.set(0, -1, 0);
    boneMap.get("leftHand")?.position.set(0, -1, 0);
    boneMap.get("rightLowerArm")?.position.set(0, -1, 0);
    boneMap.get("rightHand")?.position.set(0, -1, 0);
    root.updateMatrixWorld(true);

    return boneMap;
  }

  describe("movementAvatarUpperBodyRuntime", () => {
    it("applies spine and leaves retargeted arms untouched", () => {
      const boneMap = bones();
      const lastGood: Record<string, THREE.Quaternion> = {};

      const result = applyMovementAvatarUpperBodyRuntimeToVrmBones({
        activeSpineDrive: spineDrive(),
        armRelaxedSlerp: 0.35,
        avatarRole: "player",
        lastGood,
        leftArmDecision: armDecision("left"),
        leftArmRetargetApplied: true,
        lookupBone: (boneName) => boneMap.get(boneName) ?? null,
        rightArmDecision: armDecision("right"),
        rightArmRetargetApplied: true,
        shouldApplySolverTorso: true,
        spineApplyOptions: spineApplyOptions(),
        torsoTrackingReady: true,
      });

      expect(result.spine).toEqual({ applied: 4, mode: "active" });
      expect(result.rightArm).toEqual({ handled: false, mode: "retargeted" });
      expect(result.leftArm).toEqual({ handled: false, mode: "retargeted" });
      expect(result.recordedSpineRetargetCount).toBe(0);
      expect(boneMap.get("upperChest")?.quaternion.w).toBeLessThan(1);
      // Retargeted arms must not be perturbed by the fallback application.
      expect(boneMap.get("leftUpperArm")?.quaternion.w).toBe(1);
      expect(boneMap.get("rightUpperArm")?.quaternion.w).toBe(1);
    });

    it("holds the last good arm pose when the retarget misses but tracking is ready", () => {
      const boneMap = bones();
      const storedQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.8));
      const lastGood: Record<string, THREE.Quaternion> = {
        leftLowerArm: storedQuaternion.clone(),
        leftUpperArm: storedQuaternion.clone(),
      };

      const result = applyMovementAvatarUpperBodyRuntimeToVrmBones({
        activeSpineDrive: spineDrive(),
        armRelaxedSlerp: 0.35,
        avatarRole: "player",
        lastGood,
        leftArmDecision: armDecision("left"),
        leftArmRetargetApplied: false,
        lookupBone: (boneName) => boneMap.get(boneName) ?? null,
        rightArmDecision: armDecision("right", {
          isTrackingReady: false,
          unreadyFallback: "relax",
        }),
        rightArmRetargetApplied: false,
        shouldApplySolverTorso: true,
        spineApplyOptions: spineApplyOptions(true),
        torsoTrackingReady: false,
      });

      expect(result.recordedSpineRetargetCount).toBe(1);
      expect(result.leftArm).toEqual({ handled: true, mode: "hold-last-good" });
      expect(result.rightArm).toEqual({ handled: true, mode: "relax" });
      expect(boneMap.get("leftUpperArm")?.quaternion.w).toBeLessThan(1);
    });
  });
});

describe("movementAvatarUpperBodyFrameRuntime (merged)", () => {
  function armDecision(side: "left" | "right"): MovementAvatarArmDecision {
    return {
      endpointConfidence: 0.9,
      isTrackingReady: true,
      side,
      unreadyFallback: "relax",
    };
  }

  function spineDrive(overrides: Partial<MovementAvatarPlayerSpineDrive> = {}): MovementAvatarPlayerSpineDrive {
    return {
      confidence: 0.9,
      forwardLean: 0.2,
      owner: "player-spine-model",
      rotations: {
        chest: { x: 0.3, y: 0, z: 0.03 },
        hips: { x: 0.1, y: 0, z: 0.01 },
        spine: { x: 0.2, y: 0, z: 0.02 },
        upperChest: { x: 0.4, y: 0, z: 0.04 },
      },
      shouldApplySpine: true,
      sideBend: 0.1,
      twist: 0.2,
      ...overrides,
    };
  }

  function bones() {
    const root = new THREE.Object3D();
    const boneMap = new Map<string, THREE.Object3D>();
    [
      "chest",
      "hips",
      "leftHand",
      "leftLowerArm",
      "leftUpperArm",
      "rightHand",
      "rightLowerArm",
      "rightUpperArm",
      "spine",
      "upperChest",
    ].forEach((boneName) => {
      const bone = new THREE.Object3D();
      boneMap.set(boneName, bone);
      root.add(bone);
    });
    root.updateMatrixWorld(true);

    return boneMap;
  }

  describe("movementAvatarUpperBodyFrameRuntime", () => {
    it("retargets both arms and the spine, marking arms as retarget-owned", () => {
      const boneMap = bones();
      const applyRetargetMappings = vi.fn((mappings: MovementAvatarRetargetBoneMapping[]) => ({
        applied: mappings.length,
      }));

      const result = applyMovementAvatarUpperBodyFrameRuntime({
        activeSpineDrive: spineDrive(),
        applyRetargetMappings,
        avatarRole: "player",
        boneEaseOptions: {
          armRelaxedSlerp: 0.35,
        },
        lastGood: {},
        leftArmDecision: armDecision("left"),
        lookupBone: (boneName) => boneMap.get(boneName) ?? null,
        rightArmDecision: armDecision("right"),
        shouldApplySolverTorso: true,
        torsoTrackingReady: true,
      });

      // Left arm, right arm, and spine mapping groups each apply once.
      expect(applyRetargetMappings).toHaveBeenCalledTimes(3);
      const mappedSegments = applyRetargetMappings.mock.calls
        .flatMap(([mappings]) => mappings.map((mapping) => mapping.segment));
      expect(mappedSegments.sort()).toEqual([
        "leftLowerArm",
        "leftUpperArm",
        "rightLowerArm",
        "rightUpperArm",
        "spine",
      ]);
      expect(result.retargetAppliedUpperBody).toBe(5);
      expect(result.upperBodyRuntimeApplication.spine).toEqual({ applied: 4, mode: "active" });
      expect(result.upperBodyRuntimeApplication.leftArm.mode).toBe("retargeted");
      expect(result.upperBodyRuntimeApplication.rightArm.mode).toBe("retargeted");
    });

    it("falls back per arm when its retarget mappings could not apply", () => {
      const applyRetargetMappings = vi.fn((mappings: MovementAvatarRetargetBoneMapping[]) => ({
        applied: mappings.some((mapping) => mapping.segment.startsWith("left")) ? 0 : mappings.length,
      }));

      const result = applyMovementAvatarUpperBodyFrameRuntime({
        activeSpineDrive: spineDrive({ shouldApplySpine: false }),
        applyRetargetMappings,
        avatarRole: "instructor",
        boneEaseOptions: {
          armRelaxedSlerp: 0.35,
        },
        lastGood: {},
        leftArmDecision: armDecision("left"),
        lookupBone: () => null,
        rightArmDecision: armDecision("right"),
        shouldApplySolverTorso: true,
        torsoTrackingReady: false,
      });

      expect(result.upperBodyRuntimeApplication.leftArm.mode).toBe("hold-last-good");
      expect(result.upperBodyRuntimeApplication.rightArm.mode).toBe("retargeted");
      // right arm (2) + spine mapping (1) applied.
      expect(result.retargetAppliedUpperBody).toBe(3);
    });
  });
});

describe("movementAvatarUpperBodyFrameOrchestrationRuntime (merged)", () => {
  function armDecision(side: "left" | "right"): MovementAvatarArmDecision {
    return {
      endpointConfidence: 0.9,
      isTrackingReady: true,
      side,
      unreadyFallback: "relax",
    };
  }

  function spineDrive(): MovementAvatarPlayerSpineDrive {
    return {
      confidence: 0.9,
      forwardLean: 0.2,
      owner: "player-spine-model",
      rotations: {
        chest: { x: 0.3, y: 0, z: 0.03 },
        hips: { x: 0.1, y: 0, z: 0.01 },
        spine: { x: 0.2, y: 0, z: 0.02 },
        upperChest: { x: 0.4, y: 0, z: 0.04 },
      },
      shouldApplySpine: true,
      sideBend: 0.1,
      twist: 0.2,
    };
  }

  describe("movementAvatarUpperBodyFrameOrchestrationRuntime", () => {
    it("wires retarget adapters, last-good ref, and rigged-pose sources", () => {
      const spine = new THREE.Object3D();
      const chest = new THREE.Object3D();
      const hips = new THREE.Object3D();
      const boneMap = new Map<string, THREE.Object3D>([
        ["chest", chest],
        ["hips", hips],
        ["spine", spine],
      ]);
      const applyRetargetMappings = vi.fn(() => ({
        applied: 2,
        arms: 2,
        feet: 0,
        legs: 0,
        restMap: {},
        spine: 0,
      }));
      const lastGoodQuaternionRef = {
        current: {} as Record<string, THREE.Quaternion>,
      };
      const result = applyMovementAvatarUpperBodyFrameOrchestrationRuntime({
        activeSpineDrive: spineDrive(),
        avatarRole: "instructor",
        boneEaseOptions: {
          armRelaxedSlerp: 0.35,
        },
        lastGoodQuaternionRef,
        leftArmDecision: armDecision("left"),
        lookupBone: (boneName) => boneMap.get(boneName) ?? null,
        retargetFrameRuntimeAdapters: {
          applyRetargetMappings,
        },
        rightArmDecision: armDecision("right"),
        shouldApplySolverTorso: true,
        torsoTrackingReady: true,
      });

      // One call per mapping group: left arm, right arm, spine.
      expect(applyRetargetMappings).toHaveBeenCalledTimes(3);
      expect(result.retargetAppliedUpperBody).toBe(7);
      expect(result.upperBodyFrameRuntime.retargetAppliedUpperBody).toBe(7);
      expect(result.upperBodyFrameRuntime.upperBodyRuntimeApplication.recordedSpineRetargetCount).toBe(1);
      expect(result.upperBodyFrameRuntime.upperBodyRuntimeApplication.spine.applied).toBeGreaterThan(0);
    });
  });
});

describe("movementAvatarInactiveLowerBodyRuntime (merged)", () => {
  function lowerBodyBones() {
    return new Map<string, THREE.Object3D>([
      ["leftFoot", new THREE.Object3D()],
      ["leftLowerLeg", new THREE.Object3D()],
      ["leftUpperLeg", new THREE.Object3D()],
      ["rightFoot", new THREE.Object3D()],
      ["rightLowerLeg", new THREE.Object3D()],
      ["rightUpperLeg", new THREE.Object3D()],
    ]);
  }

  describe("movementAvatarInactiveLowerBodyRuntime", () => {
    it("marks unreliable recorded lower body as source-limited while easing neutral bones", () => {
      const bones = lowerBodyBones();

      const result = applyMovementAvatarInactiveLowerBodyRuntimeToVrmBones({
        avatarRole: "instructor",
        lookupBone: (bone) => bones.get(bone) ?? null,
        lowerBodyNeutralSlerp: 1,
        lowerBodySourceReliable: false,
      });

      expect(result).toEqual({
        appliedNeutralRotations: 6,
        feetOwner: "recorded-source-limited",
        lowerBodyOwner: "recorded-source-limited",
      });
      expect(bones.get("rightUpperLeg")?.quaternion.w).toBe(1);
    });

    it("keeps owners unchanged for reliable or player inactive paths", () => {
      const instructorResult = applyMovementAvatarInactiveLowerBodyRuntimeToVrmBones({
        avatarRole: "instructor",
        lookupBone: () => null,
        lowerBodyNeutralSlerp: 0.3,
        lowerBodySourceReliable: true,
      });
      const playerResult = applyMovementAvatarInactiveLowerBodyRuntimeToVrmBones({
        avatarRole: "player",
        lookupBone: () => null,
        lowerBodyNeutralSlerp: 0.3,
        lowerBodySourceReliable: false,
      });

      expect(instructorResult).toEqual({
        appliedNeutralRotations: 0,
        feetOwner: null,
        lowerBodyOwner: null,
      });
      expect(playerResult).toEqual({
        appliedNeutralRotations: 0,
        feetOwner: null,
        lowerBodyOwner: null,
      });
    });
  });
});

describe("movementAvatarLowerBodyFrameRuntime (merged)", () => {
  function drive(overrides: Partial<MovementAvatarLowerBodyDrive> = {}): MovementAvatarLowerBodyDrive {
    return {
      groundedSquatDepth: 0,
      liveSquatDepth: 0,
      playerLegRaiseDepth: 0,
      playerLegRaiseSide: null,
      playerLowerBodyState: "neutral",
      playerSquatPresentationDepth: 0,
      shouldApplyLowerBody: true,
      shouldApplySolverTorso: true,
      shouldDrivePlayerLegRaise: false,
      shouldDrivePlayerSquat: false,
      visualRootDrop: 0,
      ...overrides,
    };
  }

  function stage(
    stageName: MovementAvatarLowerBodyApplicationStageDecision["stage"],
    overrides: Partial<MovementAvatarLowerBodyApplicationStageDecision> = {},
  ): MovementAvatarLowerBodyApplicationStageDecision {
    return {
      anchoredPlayerLegRaiseSide: null,
      canUsePlayerRetargetLegRaise: false,
      feetOwner: `${stageName}-feet`,
      lowerBodyOwner: `${stageName}-owner`,
      stage: stageName,
      ...overrides,
    };
  }

  function target(
    stageDecision: MovementAvatarLowerBodyApplicationStageDecision | null,
    overrides: Partial<MovementAvatarLowerBodyTargetDecision> = {},
  ): MovementAvatarLowerBodyTargetDecision {
    return {
      feetOwner: "target-feet",
      inactiveDecision: null,
      instructorLowerBodyMotion: 0,
      lowerBodyOwner: "target-owner",
      playerSourceOwner: {
        lowerBodyOwnerDecision: null,
        playerRetargetLowerBodyMotion: 0,
      },
      playerSquatPresentationDepth: 0,
      recordedSquatPresentationDepth: 0,
      shouldHoldPlayerSquatPose: false,
      stageDecision,
      ...overrides,
    };
  }

  function retargetFrame(overrides: Partial<MovementRetargetFrame> = {}): MovementRetargetFrame {
    return {
      contacts: {
        leftFoot: true,
        rightFoot: true,
      },
      debug: {
        heldSegments: [],
        solvedSegments: ["leftThigh", "leftShin", "rightThigh", "rightShin"],
        sourceQuality: 0.9,
      },
      hipDrop: 0,
      kneeLift: {
        left: 0,
        right: 0,
      },
      segments: {},
      squatDepth: 0,
      ...overrides,
    };
  }

  const boneEaseOptions = {
    lowerBodyNeutralSlerp: 1,
    singleLegRaiseSlerp: 1,
    squatFlexionSlerp: 1,
  };

  function applyRuntime(
    overrides: Partial<Parameters<typeof applyMovementAvatarLowerBodyFrameRuntime>[0]> = {},
  ) {
    return applyMovementAvatarLowerBodyFrameRuntime({
      applyPlantedSquatIk: (depth) => depth,
      applyRetargetMappings: () => ({
        applied: 0,
        feet: 0,
        legs: 0,
      }),
      avatarRole: "player",
      balancedPlantedSquatDepth: 0,
      boneEaseOptions,
      currentFeetOwner: "neutral",
      currentLowerBodyOwner: "neutral",
      instructorSquatPresentationDepth: 0,
      lookupBone: () => null,
      lowerBodyDrive: drive(),
      lowerBodySegmentMotion: 0,
      lowerBodyTarget: target(null),
      lowerBodyTrackingReady: true,
      playerRetargetLowerBodyMotion: 0,
      playerSquatPresentationDepth: 0,
      recordedLowerBodySourceReliable: true,
      retargetFrame: retargetFrame(),
      shouldApplyLowerBody: true,
      shouldHoldPlayerSquatPose: false,
      updateWorldMatrix: () => {},
      ...overrides,
    });
  }

  describe("movementAvatarLowerBodyFrameRuntime", () => {
    it("applies a non-retarget player squat plan and returns owner/depth telemetry", () => {
      const result = applyRuntime({
        applyPlantedSquatIk: (depth) => depth + 0.1,
        lowerBodyDrive: drive({
          liveSquatDepth: 0.5,
          shouldDrivePlayerSquat: true,
        }),
        lowerBodyTarget: target(stage("player-squat"), {
          playerSquatPresentationDepth: 0.42,
          shouldHoldPlayerSquatPose: true,
        }),
        playerSquatPresentationDepth: 0.42,
        shouldHoldPlayerSquatPose: true,
      });

      expect(result).toMatchObject({
        footOwner: "player-squat-feet",
        lowerBodyOwner: "player-squat-owner",
        plantedSquatIkDepth: 0.52,
        retargetAppliedFeet: 0,
        retargetAppliedLegs: 0,
        retargetAppliedLowerBody: 0,
      });
    });

    it("continues retarget lower-body application and returns updated segment counts", () => {
      const applyRetargetMappings = vi.fn(() => ({
        applied: 3,
        feet: 1,
        legs: 2,
      }));
      const updateWorldMatrix = vi.fn();

      const result = applyRuntime({
        applyPlantedSquatIk: (depth) => depth,
        applyRetargetMappings,
        lowerBodyDrive: drive({
          liveSquatDepth: 0.58,
          shouldDrivePlayerSquat: true,
        }),
        lowerBodySegmentMotion: 0.6,
        lowerBodyTarget: target(stage("retarget"), {
          playerSquatPresentationDepth: 0.47,
        }),
        playerRetargetLowerBodyMotion: 0.5,
        playerSquatPresentationDepth: 0.47,
        retargetFrame: retargetFrame({
          squatDepth: 0.58,
        }),
        updateWorldMatrix,
      });

      expect(updateWorldMatrix).toHaveBeenCalledTimes(1);
      expect(applyRetargetMappings).toHaveBeenCalledTimes(1);
      expect(result.retargetAppliedLowerBody).toBe(3);
      expect(result.retargetAppliedLegs).toBe(2);
      expect(result.retargetAppliedFeet).toBe(1);
      expect(result.footOwner).not.toBe("neutral");
      expect(result.lowerBodyOwner).not.toBe("neutral");
    });

    it("reports player retarget ownership when complete solved leg retarget owns a leg raise", () => {
      const result = applyRuntime({
        applyRetargetMappings: () => ({
          applied: 6,
          feet: 2,
          legs: 4,
        }),
        lowerBodyDrive: drive({
          playerLegRaiseDepth: 0.334,
          playerLegRaiseSide: "right",
          playerLowerBodyState: "right-leg-raise",
          shouldDrivePlayerLegRaise: true,
        }),
        lowerBodySegmentMotion: 0.35,
        lowerBodyTarget: target(stage("player-leg-raise", {
          anchoredPlayerLegRaiseSide: "right",
          canUsePlayerRetargetLegRaise: true,
          feetOwner: "player-leg-raise-planted-flat",
          lowerBodyOwner: "player-right-leg-raise",
        }), {
          feetOwner: "player-leg-raise-planted-flat",
          lowerBodyOwner: "player-right-leg-raise",
        }),
        playerRetargetLowerBodyMotion: 0.35,
        retargetFrame: retargetFrame({
          kneeLift: { left: 0, right: 0.334 },
        }),
      });

      expect(result.lowerBodyOwner).toBe("player-retarget");
      expect(result.footOwner).toBe("player-leg-raise-planted-flat");
    });
  });
});

describe("movementAvatarLowerBodyFrameCallbacksRuntime (merged)", () => {
  describe("movementAvatarLowerBodyFrameCallbacksRuntime", () => {
    it("returns null when no last-good quaternion exists for the bone", () => {
      const callbacks = createMovementAvatarLowerBodyFrameCallbacksRuntime({
        lastGoodQuaternionRef: {
          current: {},
        },
        scene: {
          updateMatrixWorld: vi.fn(),
        } as never,
      });

      expect(callbacks.getLastGoodQuaternion("leftUpperLeg")).toBeNull();
    });

    it("stores and returns last-good quaternions by bone name", () => {
      const quaternion = {};
      const lastGoodQuaternionRef = {
        current: {},
      };
      const callbacks = createMovementAvatarLowerBodyFrameCallbacksRuntime({
        lastGoodQuaternionRef: lastGoodQuaternionRef as never,
        scene: {
          updateMatrixWorld: vi.fn(),
        } as never,
      });

      callbacks.storeLastGoodQuaternion("rightLowerLeg", quaternion as never);

      expect(lastGoodQuaternionRef.current).toEqual({
        rightLowerLeg: quaternion,
      });
      expect(callbacks.getLastGoodQuaternion("rightLowerLeg")).toBe(quaternion);
    });

    it("updates the scene world matrix recursively", () => {
      const updateMatrixWorld = vi.fn();
      const callbacks = createMovementAvatarLowerBodyFrameCallbacksRuntime({
        lastGoodQuaternionRef: {
          current: {},
        },
        scene: {
          updateMatrixWorld,
        } as never,
      });

      callbacks.updateWorldMatrix();

      expect(updateMatrixWorld).toHaveBeenCalledTimes(1);
      expect(updateMatrixWorld).toHaveBeenCalledWith(true);
    });
  });
});

describe("movementAvatarLowerBodyFrameOrchestrationRuntime (merged)", () => {
  function lowerBodyDrive(): MovementAvatarLowerBodyDrive {
    return {
      groundedSquatDepth: 0,
      liveSquatDepth: 0,
      playerLegRaiseDepth: 0,
      playerLegRaiseSide: null,
      playerLowerBodyState: "neutral",
      playerSquatPresentationDepth: 0,
      shouldApplyLowerBody: false,
      shouldApplySolverTorso: false,
      shouldDrivePlayerLegRaise: false,
      shouldDrivePlayerSquat: false,
      visualRootDrop: 0,
    };
  }

  function retargetFrame(): MovementRetargetFrame {
    return {
      contacts: {
        leftFoot: false,
        rightFoot: false,
      },
      debug: {
        heldSegments: [],
        solvedSegments: [],
        sourceQuality: 0,
      },
      hipDrop: 0,
      kneeLift: {
        left: 0,
        right: 0,
      },
      segments: {},
      squatDepth: 0,
    };
  }

  describe("movementAvatarLowerBodyFrameOrchestrationRuntime", () => {
    it("applies lower-body runtime and writes the retarget rest-map ref", () => {
      const nextRestMap = {
        rightUpperLeg: {
          worldDirection: new THREE.Vector3(0, -1, 0),
          worldQuaternion: new THREE.Quaternion(),
        },
      };
      const adapters: MovementAvatarRetargetFrameRuntimeAdapters = {
        applyPlantedSquatIk: () => 0,
        applyRetargetMappings: () => ({
          applied: 0,
          arms: 0,
          feet: 0,
          legs: 0,
          restMap: nextRestMap,
          spine: 0,
        }),
        getRestMap: () => nextRestMap,
      };
      const lastGoodQuaternionRef = {
        current: {} as Record<string, THREE.Quaternion>,
      };
      const retargetAvatarRestRef = {
        current: {},
      };

      const result = applyMovementAvatarLowerBodyFrameOrchestrationRuntime({
        avatarRole: "player",
        balancedPlantedSquatDepth: 0,
        boneEaseOptions: {
          lowerBodyNeutralSlerp: 0.2,
          singleLegRaiseSlerp: 0.2,
          squatFlexionSlerp: 0.2,
        },
        currentFeetOwner: "neutral",
        currentLowerBodyOwner: "neutral",
        instructorSquatPresentationDepth: 0,
        lastGoodQuaternionRef,
        lookupBone: () => null,
        lowerBodyDrive: lowerBodyDrive(),
        lowerBodySegmentMotion: 0,
        lowerBodyTarget: {} as never,
        lowerBodyTrackingReady: false,
        playerRetargetLowerBodyMotion: 0,
        playerSquatPresentationDepth: 0,
        profile: undefined,
        recordedLowerBodySourceReliable: false,
        retargetAvatarRestRef,
        retargetFrame: retargetFrame(),
        retargetFrameRuntimeAdapters: adapters,
        scene: new THREE.Object3D(),
        shouldApplyLowerBody: false,
        shouldHoldPlayerSquatPose: false,
        squatFlexionBendBoost: 1,
      });

      expect(result.lowerBodyFrameRuntime.retargetAppliedLowerBody).toBe(0);
      expect(result.lowerBodyOwner).toBe(result.lowerBodyFrameRuntime.lowerBodyOwner);
      expect(result.footOwner).toBe(result.lowerBodyFrameRuntime.footOwner);
      expect(retargetAvatarRestRef.current).toBe(nextRestMap);
    });
  });
});
