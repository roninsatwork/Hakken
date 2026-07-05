import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  resolveMovementAvatarPlantedSquatIkPose,
  type MovementAvatarRetargetSegmentApplicationDecision,
} from "./movementAvatarPipeline";
import { MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS } from "./movementAvatarRestPose";
import type { MovementRetargetFrame } from "./movementRetargeting";
import {
  applyMovementAvatarPlantedSquatIkWorldDirectionSpecs,
  applyMovementAvatarPlantedSquatIkWorldDirectionSpecsToVrmBones,
  applyMovementAvatarRetargetSegmentMappingToVrmBones,
  applyMovementAvatarRetargetSegmentMappings,
  applyMovementAvatarRestMappedWorldDirection,
  applyMovementAvatarRestMappedWorldDirectionWithLookup,
  applyMovementAvatarRestMappedWorldDirectionWithRestMap,
  resolveMovementAvatarBasisWorldDirection,
  resolveMovementAvatarPlantedSquatIkWorldDirections,
  resolveMovementAvatarRetargetSegmentWorldDirection,
} from "./movementAvatarSegmentApplication";

function retargetFrame(): MovementRetargetFrame {
  return {
    contacts: {
      leftFoot: false,
      rightFoot: false,
    },
    debug: {
      heldSegments: [],
      solvedSegments: ["rightThigh"],
      sourceQuality: 0.9,
    },
    hipDrop: 0,
    kneeLift: {
      left: 0,
      right: 0,
    },
    segments: {
      rightThigh: {
        confidence: 0.9,
        direction: { x: 0.2, y: 0.7, z: -0.4 },
        length: 0.4,
      },
    },
    squatDepth: 0,
  };
}

function segmentDecision(
  overrides: Partial<MovementAvatarRetargetSegmentApplicationDecision> = {},
): MovementAvatarRetargetSegmentApplicationDecision {
  return {
    reason: "active",
    shouldApply: true,
    slerp: 0.42,
    zScale: 0.5,
    ...overrides,
  };
}

describe("movement avatar segment application", () => {
  it("applies rest-mapped world directions to a Three.js bone", () => {
    const parent = new THREE.Object3D();
    const bone = new THREE.Object3D();
    parent.add(bone);
    parent.updateMatrixWorld(true);

    const result = applyMovementAvatarRestMappedWorldDirection({
      bone,
      desiredWorldDirection: new THREE.Vector3(1, 0, 0),
      restPose: {
        worldDirection: new THREE.Vector3(0, -1, 0),
        worldQuaternion: new THREE.Quaternion(),
      },
      slerp: 1,
    });

    expect(result).not.toBeNull();
    expect(bone.quaternion.angleTo(result!.target.targetLocalQuaternion)).toBeCloseTo(0);
    expect(result!.finalLocalQuaternion.angleTo(bone.quaternion)).toBeCloseTo(0);
  });

  it("skips rest-mapped world direction application when input is incomplete", () => {
    const parent = new THREE.Object3D();
    const bone = new THREE.Object3D();
    parent.add(bone);

    expect(applyMovementAvatarRestMappedWorldDirection({
      bone,
      desiredWorldDirection: new THREE.Vector3(1, 0, 0),
      restPose: null,
      slerp: 1,
    })).toBeNull();

    expect(applyMovementAvatarRestMappedWorldDirection({
      bone: new THREE.Object3D(),
      desiredWorldDirection: new THREE.Vector3(1, 0, 0),
      restPose: {
        worldDirection: new THREE.Vector3(0, -1, 0),
        worldQuaternion: new THREE.Quaternion(),
      },
      slerp: 1,
    })).toBeNull();

    expect(applyMovementAvatarRestMappedWorldDirection({
      bone,
      desiredWorldDirection: new THREE.Vector3(0, 0, 0),
      restPose: {
        worldDirection: new THREE.Vector3(0, -1, 0),
        worldQuaternion: new THREE.Quaternion(),
      },
      slerp: 1,
    })).toBeNull();
  });

  it("refreshes rest maps and stores last-good quaternions outside the renderer", () => {
    const parent = new THREE.Object3D();
    const bone = new THREE.Object3D();
    parent.add(bone);
    parent.updateMatrixWorld(true);
    const stored: Array<{ boneName: string; quaternion: THREE.Quaternion }> = [];
    let refreshCount = 0;

    const result = applyMovementAvatarRestMappedWorldDirectionWithRestMap({
      bone,
      boneName: "rightUpperLeg",
      currentRestMap: {},
      desiredWorldDirection: new THREE.Vector3(1, 0, 0),
      refreshRestMap: () => {
        refreshCount += 1;
        return {
          rightUpperLeg: {
            worldDirection: new THREE.Vector3(0, -1, 0),
            worldQuaternion: new THREE.Quaternion(),
          },
        };
      },
      rememberLastGood: true,
      slerp: 1,
      storeLastGood: (boneName, quaternion) => {
        stored.push({ boneName, quaternion });
      },
    });

    expect(result.applied).toBe(true);
    expect(result.refreshedRestMap).toBe(true);
    expect(result.restMap.rightUpperLeg).toBeDefined();
    expect(refreshCount).toBe(1);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.boneName).toBe("rightUpperLeg");
    expect(stored[0]?.quaternion.angleTo(bone.quaternion)).toBeCloseTo(0);

    expect(applyMovementAvatarRestMappedWorldDirectionWithRestMap({
      bone,
      boneName: "leftUpperLeg",
      currentRestMap: {},
      desiredWorldDirection: new THREE.Vector3(1, 0, 0),
      refreshRestMap: () => ({}),
      slerp: 1,
    })).toMatchObject({
      applied: false,
      finalLocalQuaternion: null,
      refreshedRestMap: true,
      restMap: {},
    });
  });

  it("applies rest-mapped world directions through shared bone lookup and rest-map lifetime", () => {
    const parent = new THREE.Object3D();
    const bone = new THREE.Object3D();
    parent.add(bone);
    parent.updateMatrixWorld(true);
    const stored: string[] = [];

    const result = applyMovementAvatarRestMappedWorldDirectionWithLookup({
      boneName: "rightUpperLeg",
      currentRestMap: {},
      desiredWorldDirection: new THREE.Vector3(1, 0, 0),
      lookupBone: (boneName) => boneName === "rightUpperLeg" ? bone : null,
      refreshRestMap: () => ({
        rightUpperLeg: {
          worldDirection: new THREE.Vector3(0, -1, 0),
          worldQuaternion: new THREE.Quaternion(),
        },
      }),
      rememberLastGood: true,
      slerp: 1,
      storeLastGood: (boneName) => {
        stored.push(boneName);
      },
    });

    expect(result.applied).toBe(true);
    expect(result.restMap.rightUpperLeg).toBeDefined();
    expect(stored).toEqual(["rightUpperLeg"]);
  });

  it("skips rest-map refresh when lookup application is unavailable or direction is empty", () => {
    let refreshCount = 0;
    const apply = (canApply: boolean, desiredWorldDirection: THREE.Vector3) =>
      applyMovementAvatarRestMappedWorldDirectionWithLookup({
        boneName: "rightUpperLeg",
        canApply,
        currentRestMap: {},
        desiredWorldDirection,
        lookupBone: () => {
          throw new Error("lookup should not run");
        },
        refreshRestMap: () => {
          refreshCount += 1;
          return {};
        },
        slerp: 1,
      });

    expect(apply(false, new THREE.Vector3(1, 0, 0))).toMatchObject({
      applied: false,
      refreshedRestMap: false,
      restMap: {},
    });
    expect(apply(true, new THREE.Vector3(0, 0, 0))).toMatchObject({
      applied: false,
      refreshedRestMap: false,
      restMap: {},
    });
    expect(refreshCount).toBe(0);
  });

  it("converts basis directions into normalized world directions", () => {
    const direction = resolveMovementAvatarBasisWorldDirection({
      basis: { down: 1, forward: 1, side: 0 },
      forward: new THREE.Vector3(0, 0, 2),
    });

    expect(direction?.length()).toBeCloseTo(1);
    expect(direction?.y).toBeLessThan(0);
    expect(direction?.z).toBeGreaterThan(0);
  });

  it("builds planted squat IK world-direction application specs", () => {
    const plantedSquatIk = resolveMovementAvatarPlantedSquatIkPose({
      avatarRole: "player",
      depth: 0.74,
    });
    const specs = resolveMovementAvatarPlantedSquatIkWorldDirections({
      forward: new THREE.Vector3(0, 0, 1),
      plantedSquatIk,
    });

    expect(specs).toHaveLength(6);
    expect(specs[0]).toMatchObject({
      bone: "rightUpperLeg",
      slerp: 0.52,
    });
    expect(specs[0]!.desiredWorldDirection.length()).toBeCloseTo(1);
    expect(specs[0]!.desiredWorldDirection.y).toBeLessThan(0);
    expect(specs[4]).toMatchObject({
      bone: "rightFoot",
      slerp: 0.3,
    });
    expect(resolveMovementAvatarPlantedSquatIkWorldDirections({
      forward: new THREE.Vector3(0, 0, 1),
      plantedSquatIk: { ikDepth: 0, specs: [] },
    })).toEqual([]);
  });

  it("executes planted squat IK world-direction specs and reports applied depth", () => {
    const specs = [
      {
        bone: "rightUpperLeg",
        desiredWorldDirection: new THREE.Vector3(0, -1, 0),
        slerp: 0.52,
      },
      {
        bone: "rightLowerLeg",
        desiredWorldDirection: new THREE.Vector3(0, -1, 1).normalize(),
        slerp: 0.5,
      },
    ] as const;
    const appliedBones: string[] = [];

    const result = applyMovementAvatarPlantedSquatIkWorldDirectionSpecs({
      apply: (spec) => {
        appliedBones.push(spec.bone);
        return spec.bone === "rightUpperLeg";
      },
      ikDepth: 0.74,
      specs: [...specs],
    });

    expect(result).toEqual({
      applied: 1,
      appliedDepth: 0.74,
    });
    expect(appliedBones).toEqual(["rightUpperLeg", "rightLowerLeg"]);

    expect(applyMovementAvatarPlantedSquatIkWorldDirectionSpecs({
      apply: () => false,
      ikDepth: 0.74,
      specs: [...specs],
    })).toEqual({
      applied: 0,
      appliedDepth: 0,
    });
  });

  it("applies planted squat IK world-direction specs directly to VRM bones", () => {
    const parent = new THREE.Object3D();
    const rightUpperLeg = new THREE.Object3D();
    const rightLowerLeg = new THREE.Object3D();
    parent.add(rightUpperLeg);
    parent.add(rightLowerLeg);
    parent.updateMatrixWorld(true);
    const stored: string[] = [];

    const result = applyMovementAvatarPlantedSquatIkWorldDirectionSpecsToVrmBones({
      currentRestMap: {},
      ikDepth: 0.74,
      lookupBone: (boneName) => {
        if (boneName === "rightUpperLeg") return rightUpperLeg;
        if (boneName === "rightLowerLeg") return rightLowerLeg;
        return null;
      },
      refreshRestMap: () => ({
        rightLowerLeg: {
          worldDirection: new THREE.Vector3(0, -1, 0),
          worldQuaternion: new THREE.Quaternion(),
        },
        rightUpperLeg: {
          worldDirection: new THREE.Vector3(0, -1, 0),
          worldQuaternion: new THREE.Quaternion(),
        },
      }),
      specs: [
        {
          bone: "rightUpperLeg",
          desiredWorldDirection: new THREE.Vector3(1, 0, 0),
          slerp: 1,
        },
        {
          bone: "rightLowerLeg",
          desiredWorldDirection: new THREE.Vector3(0, 0, 1),
          slerp: 1,
        },
        {
          bone: "leftUpperLeg",
          desiredWorldDirection: new THREE.Vector3(1, 0, 0),
          slerp: 1,
        },
      ],
      storeLastGood: (boneName) => {
        stored.push(boneName);
      },
    });

    expect(result.applied).toBe(2);
    expect(result.appliedDepth).toBe(0.74);
    expect(result.restMap.rightUpperLeg).toBeDefined();
    expect(stored).toEqual([]);
    expect(rightUpperLeg.quaternion.w).toBeLessThan(1);
    expect(rightLowerLeg.quaternion.w).toBeLessThan(1);
  });

  it("builds retarget segment world-direction application specs", () => {
    const spec = resolveMovementAvatarRetargetSegmentWorldDirection({
      mapping: MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS[0]!,
      retargetFrame: retargetFrame(),
      segmentApplicationDecision: segmentDecision(),
    });

    expect(spec).toMatchObject({
      bone: "rightUpperLeg",
      slerp: 0.42,
    });
    expect(spec?.desiredWorldDirection.length()).toBeCloseTo(1);
    expect(spec?.desiredWorldDirection.x).toBeGreaterThan(0);
    expect(spec?.desiredWorldDirection.y).toBeLessThan(0);
    expect(spec?.desiredWorldDirection.z).toBeGreaterThan(0);
  });

  it("skips retarget segment world directions when inactive or missing", () => {
    expect(resolveMovementAvatarRetargetSegmentWorldDirection({
      mapping: MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS[0]!,
      retargetFrame: retargetFrame(),
      segmentApplicationDecision: segmentDecision({ shouldApply: false }),
    })).toBeNull();

    expect(resolveMovementAvatarRetargetSegmentWorldDirection({
      mapping: MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS[1]!,
      retargetFrame: retargetFrame(),
      segmentApplicationDecision: segmentDecision(),
    })).toBeNull();
  });

  it("counts applied retarget segment mappings by body area", () => {
    const mappings = [
      { bone: "spine", child: "chest", segment: "spine", type: "spine" },
      { bone: "rightUpperArm", child: "rightLowerArm", segment: "rightUpperArm", type: "arm" },
      { bone: "rightUpperLeg", child: "rightLowerLeg", segment: "rightThigh", type: "leg" },
      { bone: "rightFoot", child: "rightToes", segment: "rightFoot", type: "foot" },
    ] as const;

    const counts = applyMovementAvatarRetargetSegmentMappings({
      apply: (mapping) => mapping.type !== "spine",
      mappings: [...mappings],
    });

    expect(counts).toEqual({
      applied: 3,
      arms: 1,
      feet: 1,
      legs: 1,
      spine: 0,
    });
  });

  it("applies retarget segment mappings directly to VRM bones and stores last-good rotations", () => {
    const parent = new THREE.Object3D();
    const rightUpperLeg = new THREE.Object3D();
    parent.add(rightUpperLeg);
    parent.updateMatrixWorld(true);
    const stored: string[] = [];

    const result = applyMovementAvatarRetargetSegmentMappingToVrmBones({
      currentRestMap: {},
      lookupBone: (boneName) => boneName === "rightUpperLeg" ? rightUpperLeg : null,
      mapping: MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS[0]!,
      refreshRestMap: () => ({
        rightUpperLeg: {
          worldDirection: new THREE.Vector3(0, -1, 0),
          worldQuaternion: new THREE.Quaternion(),
        },
      }),
      retargetFrame: retargetFrame(),
      segmentApplicationDecision: segmentDecision(),
      storeLastGood: (boneName) => {
        stored.push(boneName);
      },
    });

    expect(result.applied).toBe(true);
    expect(result.restMap.rightUpperLeg).toBeDefined();
    expect(stored).toEqual(["rightUpperLeg"]);
    expect(rightUpperLeg.quaternion.w).toBeLessThan(1);
  });
});
