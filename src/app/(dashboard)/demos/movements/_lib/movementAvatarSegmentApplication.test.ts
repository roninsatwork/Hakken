import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  resolveMovementAvatarPlantedSquatIkPose,
  type MovementAvatarRetargetSegmentApplicationDecision,
} from "./movementAvatarPipeline";
import {
  MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS,
  MOVEMENT_AVATAR_UPPER_BODY_RECORDED_RETARGET_MAPPINGS,
} from "./movementAvatarRestPose";
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

  it("limits low-confidence recovery to a bounded local rotation step", () => {
    const parent = new THREE.Object3D();
    const bone = new THREE.Object3D();
    parent.add(bone);
    parent.updateMatrixWorld(true);
    const before = bone.quaternion.clone();

    const result = applyMovementAvatarRestMappedWorldDirection({
      bone,
      desiredWorldDirection: new THREE.Vector3(1, 0, 0),
      maxLocalAngleStep: 0.08,
      restPose: {
        worldDirection: new THREE.Vector3(0, -1, 0),
        worldQuaternion: new THREE.Quaternion(),
      },
      slerp: 1,
    });

    expect(result).not.toBeNull();
    expect(before.angleTo(bone.quaternion)).toBeCloseTo(0.08);
    expect(bone.quaternion.angleTo(result!.target.targetLocalQuaternion)).toBeGreaterThan(1);
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

  it("cancels camera tilt using the calibrated neutral spine as vertical", () => {
    // Camera pitched down ~15deg: the neutral spine reads tilted in source
    // space. The correction must bring it back to world-up and counter-rotate
    // every other segment identically.
    const tilt = 15 * (Math.PI / 180);
    const tiltedNeutralSpine = { x: 0, y: -Math.cos(tilt), z: -Math.sin(tilt) };
    const frame: MovementRetargetFrame = {
      ...retargetFrame(),
      neutralSpineDirection: tiltedNeutralSpine,
      segments: {
        spine: {
          confidence: 0.9,
          direction: tiltedNeutralSpine,
          length: 1,
        },
      },
      space: "world",
    };

    const spec = resolveMovementAvatarRetargetSegmentWorldDirection({
      mapping: { bone: "spine", child: "chest", segment: "spine", type: "spine" },
      retargetFrame: frame,
      segmentApplicationDecision: { ...segmentDecision(), zScale: 1 },
    });

    expect(spec).not.toBeNull();
    // A neutral pose under a tilted camera must resolve to a vertical spine.
    expect(spec!.desiredWorldDirection.y).toBeCloseTo(1, 5);
    expect(spec!.desiredWorldDirection.z).toBeCloseTo(0, 5);
  });

  it("skips the spine segment without a calibrated vertical reference", () => {
    const frame: MovementRetargetFrame = {
      ...retargetFrame(),
      segments: {
        spine: {
          confidence: 0.9,
          direction: { x: 0, y: -0.97, z: -0.26 },
          length: 1,
        },
      },
      space: "world",
    };

    expect(resolveMovementAvatarRetargetSegmentWorldDirection({
      mapping: { bone: "spine", child: "chest", segment: "spine", type: "spine" },
      retargetFrame: frame,
      segmentApplicationDecision: { ...segmentDecision(), zScale: 1 },
    })).toBeNull();
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

  it("does not add a second player limb mirror after display side mapping", () => {
    const mapping = MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS[0]!;
    const frame = retargetFrame();
    const instructor = resolveMovementAvatarRetargetSegmentWorldDirection({
      avatarRole: "instructor",
      mapping,
      retargetFrame: frame,
      segmentApplicationDecision: segmentDecision(),
    });
    const player = resolveMovementAvatarRetargetSegmentWorldDirection({
      avatarRole: "player",
      mapping,
      retargetFrame: frame,
      segmentApplicationDecision: segmentDecision(),
    });

    expect(instructor?.desiredWorldDirection.x).toBeGreaterThan(0);
    expect(player?.desiredWorldDirection.x).toBeCloseTo(instructor?.desiredWorldDirection.x ?? 0);
    expect(player?.desiredWorldDirection.y).toBeCloseTo(instructor?.desiredWorldDirection.y ?? 0);
    expect(player?.desiredWorldDirection.z).toBeCloseTo(instructor?.desiredWorldDirection.z ?? 0);

    const armMapping = MOVEMENT_AVATAR_UPPER_BODY_RECORDED_RETARGET_MAPPINGS.find(
      (candidate) => candidate.type === "arm" && candidate.segment === "rightUpperArm",
    );
    if (!armMapping) throw new Error("Expected right upper-arm mapping.");
    const armFrame = retargetFrame();
    armFrame.segments.rightUpperArm = {
      confidence: 0.9,
      direction: { x: 0.4, y: 0.9, z: 0 },
      length: 1,
    };
    const playerArm = resolveMovementAvatarRetargetSegmentWorldDirection({
      avatarRole: "player",
      mapping: armMapping,
      retargetFrame: armFrame,
      segmentApplicationDecision: segmentDecision(),
    });
    expect(playerArm?.desiredWorldDirection.x).toBeGreaterThan(0);
  });

  it("keeps player arms in the already-mapped display direction after cancelling camera tilt", () => {
    const armMapping = MOVEMENT_AVATAR_UPPER_BODY_RECORDED_RETARGET_MAPPINGS.find(
      (candidate) => candidate.type === "arm" && candidate.segment === "rightUpperArm",
    );
    if (!armMapping) throw new Error("Expected right upper-arm mapping.");

    const instructorFrame = retargetFrame();
    instructorFrame.space = "world";
    instructorFrame.neutralSpineDirection = { x: 0.16, y: -0.95, z: -0.27 };
    instructorFrame.segments.rightUpperArm = {
      confidence: 0.9,
      direction: { x: 0.32, y: 0.91, z: 0.26 },
      length: 1,
    };
    const playerFrame: MovementRetargetFrame = {
      ...instructorFrame,
      segments: {
        ...instructorFrame.segments,
      },
    };

    const instructor = resolveMovementAvatarRetargetSegmentWorldDirection({
      avatarRole: "instructor",
      mapping: armMapping,
      retargetFrame: instructorFrame,
      segmentApplicationDecision: { ...segmentDecision(), zScale: 1 },
    });
    const player = resolveMovementAvatarRetargetSegmentWorldDirection({
      avatarRole: "player",
      mapping: armMapping,
      retargetFrame: playerFrame,
      segmentApplicationDecision: { ...segmentDecision(), zScale: 1 },
    });

    expect(player?.desiredWorldDirection.x).toBeCloseTo(instructor?.desiredWorldDirection.x ?? 0, 5);
    expect(player?.desiredWorldDirection.y).toBeCloseTo(instructor?.desiredWorldDirection.y ?? 0, 5);
    expect(player?.desiredWorldDirection.z).toBeCloseTo(instructor?.desiredWorldDirection.z ?? 0, 5);
  });

  it("bounds a newly reacquired leg segment before returning to normal response", () => {
    const frame = retargetFrame();
    frame.segments.rightThigh = {
      ...frame.segments.rightThigh!,
      confidence: 0.34,
    };
    const spec = resolveMovementAvatarRetargetSegmentWorldDirection({
      mapping: MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS[0]!,
      retargetFrame: frame,
      segmentApplicationDecision: segmentDecision({ slerp: 0.1 }),
    });

    expect(spec).toMatchObject({
      bone: "rightUpperLeg",
      slerp: 0.1,
    });
    expect(spec?.maxLocalAngleStep).toBeCloseTo(0.1013, 3);
  });

  it("releases the leg recovery bound for clear tracking", () => {
    const recoveringFrame = retargetFrame();
    recoveringFrame.segments.rightThigh = {
      ...recoveringFrame.segments.rightThigh!,
      confidence: 0.8,
    };
    const clearFrame = retargetFrame();
    clearFrame.segments.rightThigh = {
      ...clearFrame.segments.rightThigh!,
      confidence: 0.95,
    };

    const recoveringSpec = resolveMovementAvatarRetargetSegmentWorldDirection({
      mapping: MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS[0]!,
      retargetFrame: recoveringFrame,
      segmentApplicationDecision: segmentDecision(),
    });
    const clearSpec = resolveMovementAvatarRetargetSegmentWorldDirection({
      mapping: MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS[0]!,
      retargetFrame: clearFrame,
      segmentApplicationDecision: segmentDecision(),
    });

    expect(recoveringSpec?.maxLocalAngleStep).toBe(0.24);
    expect(clearSpec?.maxLocalAngleStep).toBe(0.24);
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

  it("scales arm easing with elapsed render time without a redundant local-angle cap", () => {
    const mapping = MOVEMENT_AVATAR_UPPER_BODY_RECORDED_RETARGET_MAPPINGS.find(
      (candidate) => candidate.segment === "rightUpperArm",
    )!;
    const armFrame = retargetFrame();
    armFrame.segments.rightUpperArm = {
      confidence: 0.9,
      direction: { x: -1, y: 0, z: 0 },
      length: 0.4,
    };
    const applyAtDelta = (frameDeltaSeconds: number) => {
      const parent = new THREE.Object3D();
      const arm = new THREE.Object3D();
      parent.add(arm);
      parent.updateMatrixWorld(true);
      applyMovementAvatarRetargetSegmentMappingToVrmBones({
        currentRestMap: {
          rightUpperArm: {
            worldDirection: new THREE.Vector3(0, -1, 0),
            worldQuaternion: new THREE.Quaternion(),
          },
        },
        frameDeltaSeconds,
        lookupBone: (boneName) => boneName === "rightUpperArm" ? arm : null,
        mapping,
        refreshRestMap: () => ({}),
        retargetFrame: armFrame,
        segmentApplicationDecision: segmentDecision(),
      });
      return new THREE.Quaternion().angleTo(arm.quaternion);
    };

    expect(applyAtDelta(1 / 60)).toBeCloseTo((Math.PI / 2) * 0.42, 5);
    expect(applyAtDelta(1 / 20)).toBeCloseTo((Math.PI / 2) * (1 - Math.pow(0.58, 3)), 5);
  });

  it("scales leg easing with elapsed source time so lower body does not trail on slow frames", () => {
    const mapping = MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS.find(
      (candidate) => candidate.segment === "rightThigh",
    )!;
    const legFrame = retargetFrame();
    legFrame.segments.rightThigh = {
      confidence: 0.9,
      direction: { x: 1, y: 0, z: 0 },
      length: 0.4,
    };
    const applyAtDelta = (frameDeltaSeconds: number) => {
      const parent = new THREE.Object3D();
      const leg = new THREE.Object3D();
      parent.add(leg);
      parent.updateMatrixWorld(true);
      applyMovementAvatarRetargetSegmentMappingToVrmBones({
        currentRestMap: {
          rightUpperLeg: {
            worldDirection: new THREE.Vector3(0, -1, 0),
            worldQuaternion: new THREE.Quaternion(),
          },
        },
        frameDeltaSeconds,
        lookupBone: (boneName) => boneName === "rightUpperLeg" ? leg : null,
        mapping,
        refreshRestMap: () => ({}),
        retargetFrame: legFrame,
        segmentApplicationDecision: segmentDecision(),
      });
      return new THREE.Quaternion().angleTo(leg.quaternion);
    };

    expect(applyAtDelta(1 / 60)).toBeCloseTo(0.24, 5);
    expect(applyAtDelta(1 / 20)).toBeCloseTo(0.72, 5);
  });
});
