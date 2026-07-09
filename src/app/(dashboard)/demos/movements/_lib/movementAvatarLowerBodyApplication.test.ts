import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  applyMovementAvatarInstructorFootPlantRequests,
  applyMovementAvatarInstructorFootPlantRequestsToVrmBones,
  applyMovementAvatarInstructorFootPlantPose,
  applyMovementAvatarInstructorFootPlantPoseToVrmBones,
  applyMovementAvatarLowerBodyNeutralPoseApplication,
  applyMovementAvatarLowerBodyNeutralPoseApplicationToVrmBones,
  applyMovementAvatarLowerBodyNonRetargetApplicationPlan,
  applyMovementAvatarLowerBodyNonRetargetApplicationPlanToVrmBones,
  applyMovementAvatarLowerBodyRetargetPostPlanApplication,
  applyMovementAvatarLowerBodyRetargetPostPlanApplicationToVrmBones,
  applyMovementAvatarLowerBodyRetargetSegmentCounts,
  applyMovementAvatarLowerBodyRotationSpecs,
  applyMovementAvatarLowerBodyRotationSpecsToVrmBones,
  applyMovementAvatarLowerBodySquatPoseApplication,
  applyMovementAvatarSingleLegRaisePoseApplication,
  applyMovementAvatarSingleLegRaisePoseApplicationToVrmBones,
  applyMovementAvatarSolvedLowerBodyRotationSpecs,
  applyMovementAvatarSquatFlexionPoseApplication,
  applyMovementAvatarSquatFlexionPoseApplicationToVrmBones,
  applyMovementAvatarSupportPresentationRotationSpecs,
  applyMovementAvatarSupportPresentationRotationSpecsToVrmBones,
  resolveMovementAvatarLowerBodyApplicationPlan,
  resolveMovementAvatarLowerBodyRetargetApplicationPlan,
  resolveMovementAvatarLowerBodyRetargetDecisionApplication,
  resolveMovementAvatarLowerBodyRetargetDecisionApplicationFromInput,
} from "./movementAvatarLowerBodyApplication";
import type {
  MovementAvatarAppliedLowerBodyDecision,
  MovementAvatarLowerBodyApplicationStageDecision,
} from "./movementAvatarPipeline";
import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";
import type { MovementAvatarLowerBodyTargetDecision } from "./movementAvatarTarget";
import type { MovementRetargetFrame } from "./movementRetargeting";

function drive(overrides: Partial<MovementAvatarLowerBodyDrive> = {}): MovementAvatarLowerBodyDrive {
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
      solvedSegments: ["leftThigh", "leftShin", "rightThigh", "rightShin", "leftFoot", "rightFoot"],
      sourceQuality: 0.82,
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

describe("movement avatar lower-body application plan", () => {
  it("uses presentation neutral when no shared stage is active", () => {
    const plan = resolveMovementAvatarLowerBodyApplicationPlan({
      lowerBodyDrive: drive(),
      lowerBodyTarget: target(null, {
        feetOwner: "recorded-source-limited",
        lowerBodyOwner: "recorded-source-limited",
      }),
    });

    expect(plan.mode).toBe("inactive-neutral");
    expect(plan.lowerBodyOwner).toBe("recorded-source-limited");
    expect(plan.feetOwner).toBe("recorded-source-limited");
  });

  it("keeps player leg-raise depth and side in the shared plan", () => {
    const plan = resolveMovementAvatarLowerBodyApplicationPlan({
      lowerBodyDrive: drive({ playerLegRaiseDepth: 0.72 }),
      lowerBodyTarget: target(stage("player-leg-raise", {
        anchoredPlayerLegRaiseSide: "left",
        feetOwner: "left-feet",
        lowerBodyOwner: "player-left-leg-raise",
      })),
    });

    expect(plan.mode).toBe("player-leg-raise");
    if (plan.mode !== "player-leg-raise") throw new Error("Expected player-leg-raise plan.");
    expect(plan.depth).toBe(0.72);
    expect(plan.side).toBe("left");
    expect(plan.lowerBodyOwner).toBe("player-left-leg-raise");
  });

  it("lets source retarget own player leg raises when solved leg segments are available", () => {
    const plan = resolveMovementAvatarLowerBodyApplicationPlan({
      lowerBodyDrive: drive({ playerLegRaiseDepth: 0.72 }),
      lowerBodyTarget: target(stage("player-leg-raise", {
        anchoredPlayerLegRaiseSide: "left",
        canUsePlayerRetargetLegRaise: true,
        feetOwner: "left-feet",
        lowerBodyOwner: "player-left-leg-raise",
      }), {
        feetOwner: "recorded-retarget",
        lowerBodyOwner: "player-retarget",
      }),
    });

    expect(plan.mode).toBe("retarget");
    expect(plan.lowerBodyOwner).toBe("player-retarget");
    expect(plan.feetOwner).toBe("recorded-retarget");
    expect(plan.stageDecision?.anchoredPlayerLegRaiseSide).toBe("left");
  });

  it("marks shallow player squats for neutral easing", () => {
    const plan = resolveMovementAvatarLowerBodyApplicationPlan({
      lowerBodyDrive: drive(),
      lowerBodyTarget: target(stage("player-squat"), {
        playerSquatPresentationDepth: 0.12,
      }),
    });

    expect(plan.mode).toBe("player-squat");
    if (plan.mode !== "player-squat") throw new Error("Expected player-squat plan.");
    expect(plan.depth).toBe(0.12);
    expect(plan.shouldEaseLowerBodyToNeutral).toBe(true);
  });

  it("turns recorded neutral into neutral easing with planted instructor feet", () => {
    const plan = resolveMovementAvatarLowerBodyApplicationPlan({
      lowerBodyDrive: drive(),
      lowerBodyTarget: target(stage("recorded-neutral")),
    });

    expect(plan.mode).toBe("recorded-neutral");
    if (plan.mode !== "recorded-neutral") throw new Error("Expected recorded-neutral plan.");
    expect(plan.plantInstructorFeet).toEqual(["right", "left"]);
    expect(plan.shouldEaseLowerBodyToNeutral).toBe(true);
  });

  it("leaves retarget counts and fallback decisions to the retarget application path", () => {
    const plan = resolveMovementAvatarLowerBodyApplicationPlan({
      lowerBodyDrive: drive(),
      lowerBodyTarget: target(stage("retarget"), {
        feetOwner: "shared-feet",
        lowerBodyOwner: "shared-lower",
      }),
    });

    expect(plan.mode).toBe("retarget");
    expect(plan.lowerBodyOwner).toBe("shared-lower");
    expect(plan.feetOwner).toBe("shared-feet");
  });

  it("executes non-retarget squat application through the shared plan dispatcher", () => {
    const events: string[] = [];
    const plan = resolveMovementAvatarLowerBodyApplicationPlan({
      lowerBodyDrive: drive(),
      lowerBodyTarget: target(stage("player-squat", {
        feetOwner: "squat-feet",
        lowerBodyOwner: "squat-owner",
      }), {
        playerSquatPresentationDepth: 0.5,
      }),
    });

    const result = applyMovementAvatarLowerBodyNonRetargetApplicationPlan({
      applyLegRaise: () => {
        events.push("leg-raise");
      },
      applyNeutral: () => {
        events.push("neutral");
      },
      applySquat: (depth) => {
        events.push(`squat:${depth}`);
        return 0.42;
      },
      plan,
      plantInstructorFeet: (sides) => {
        events.push(`plant:${sides.join(",")}`);
      },
    });

    expect(result).toEqual({
      feetOwner: "squat-feet",
      handled: true,
      lowerBodyOwner: "squat-owner",
      plantedSquatIkDepth: 0.42,
    });
    expect(events).toEqual(["squat:0.5"]);
  });

  it("bundles planted IK and squat flexion as a shared squat-pose application", () => {
    const events: string[] = [];

    const result = applyMovementAvatarLowerBodySquatPoseApplication({
      applyPlantedSquatIk: (depth) => {
        events.push(`planted-ik:${depth}`);
        return depth + 0.1;
      },
      applySquatFlexion: (depth) => {
        events.push(`squat-flexion:${depth}`);
      },
      depth: 0.44,
    });

    expect(result).toEqual({
      appliedSquatFlexion: true,
      plantedSquatIkDepth: 0.54,
    });
    expect(events).toEqual(["planted-ik:0.44", "squat-flexion:0.44"]);
  });

  it("executes non-retarget lower-body plans directly against VRM bones", () => {
    const bones = {
      leftFoot: new THREE.Object3D(),
      leftLowerLeg: new THREE.Object3D(),
      leftUpperLeg: new THREE.Object3D(),
      rightFoot: new THREE.Object3D(),
      rightLowerLeg: new THREE.Object3D(),
      rightUpperLeg: new THREE.Object3D(),
    };
    const plan = resolveMovementAvatarLowerBodyApplicationPlan({
      lowerBodyDrive: drive(),
      lowerBodyTarget: target(stage("player-squat", {
        feetOwner: "squat-feet",
        lowerBodyOwner: "squat-owner",
      }), {
        playerSquatPresentationDepth: 0.5,
      }),
    });

    const result = applyMovementAvatarLowerBodyNonRetargetApplicationPlanToVrmBones({
      applyPlantedSquatIk: (depth) => depth + 0.12,
      currentFeetOwner: "neutral",
      isPlayer: true,
      lookupBone: (bone) => bones[bone as keyof typeof bones],
      lowerBodyNeutralSlerp: 0.2,
      plan,
      singleLegRaiseSlerp: 0.4,
      squatFlexionBendBoost: 0.32,
      squatFlexionSlerp: 1,
    });

    expect(result).toEqual({
      feetOwner: "squat-feet",
      handled: true,
      lowerBodyOwner: "squat-owner",
      plantedSquatIkDepth: 0.62,
    });
    expect(bones.rightUpperLeg.quaternion.w).toBeLessThan(1);
    expect(bones.leftLowerLeg.quaternion.w).toBeLessThan(1);
  });

  it("executes recorded neutral easing and foot planting through the shared plan dispatcher", () => {
    const events: string[] = [];
    const plan = resolveMovementAvatarLowerBodyApplicationPlan({
      lowerBodyDrive: drive(),
      lowerBodyTarget: target(stage("recorded-neutral")),
    });

    const result = applyMovementAvatarLowerBodyNonRetargetApplicationPlan({
      applyLegRaise: () => {
        events.push("leg-raise");
      },
      applyNeutral: () => {
        events.push("neutral");
      },
      applySquat: () => {
        events.push("squat");
        return 0;
      },
      plan,
      plantInstructorFeet: (sides) => {
        events.push(`plant:${sides.join(",")}`);
      },
    });

    expect(result.handled).toBe(true);
    expect(result.plantedSquatIkDepth).toBeNull();
    expect(events).toEqual(["neutral", "plant:right,left"]);
  });

  it("leaves retarget application plans for the retarget branch", () => {
    const events: string[] = [];
    const plan = resolveMovementAvatarLowerBodyApplicationPlan({
      lowerBodyDrive: drive(),
      lowerBodyTarget: target(stage("retarget")),
    });

    const result = applyMovementAvatarLowerBodyNonRetargetApplicationPlan({
      applyLegRaise: () => {
        events.push("leg-raise");
      },
      applyNeutral: () => {
        events.push("neutral");
      },
      applySquat: () => {
        events.push("squat");
        return 0;
      },
      plan,
      plantInstructorFeet: (sides) => {
        events.push(`plant:${sides.join(",")}`);
      },
    });

    expect(result).toEqual({
      feetOwner: null,
      handled: false,
      lowerBodyOwner: null,
      plantedSquatIkDepth: null,
    });
    expect(events).toEqual([]);
  });
});

describe("movement avatar legacy lower-body aim requests", () => {







  it("accumulates lower-body retarget segment counts and marks feet ownership", () => {
    expect(applyMovementAvatarLowerBodyRetargetSegmentCounts({
      current: {
        feet: 1,
        legs: 2,
        lowerBody: 3,
      },
      segmentCounts: {
        applied: 4,
        feet: 1,
        legs: 2,
      },
    })).toEqual({
      feet: 2,
      footOwnerOverride: "recorded-retarget",
      legs: 4,
      lowerBody: 7,
    });
  });

  it("does not mark retarget feet ownership when no foot segments applied", () => {
    expect(applyMovementAvatarLowerBodyRetargetSegmentCounts({
      current: {
        feet: 0,
        legs: 1,
        lowerBody: 1,
      },
      segmentCounts: {
        applied: 2,
        feet: 0,
        legs: 2,
      },
    })).toEqual({
      feet: 0,
      footOwnerOverride: null,
      legs: 3,
      lowerBody: 3,
    });
  });

  it("executes lower-body rotation specs through the supplied renderer callback", () => {
    const specs = [
      {
        bone: "rightUpperLeg",
        rotation: { x: 0.1, y: 0, z: 0 },
        slerp: 0.4,
      },
      {
        bone: "leftUpperLeg",
        rotation: { x: 0.2, y: 0, z: 0 },
        slerp: 0.5,
      },
    ] as const;
    const appliedBones: string[] = [];

    const result = applyMovementAvatarLowerBodyRotationSpecs({
      apply: (spec) => {
        appliedBones.push(spec.bone);
      },
      specs: [...specs],
    });

    expect(result.applied).toBe(2);
    expect(appliedBones).toEqual(["rightUpperLeg", "leftUpperLeg"]);
  });

  it("applies lower-body rotation specs directly to VRM bones", () => {
    const bones = {
      leftUpperLeg: new THREE.Object3D(),
      rightUpperLeg: new THREE.Object3D(),
    };

    const result = applyMovementAvatarLowerBodyRotationSpecsToVrmBones({
      lookupBone: (bone) => bones[bone as keyof typeof bones],
      specs: [
        {
          bone: "rightUpperLeg",
          rotation: { x: 0.2, y: 0, z: 0 },
          slerp: 1,
        },
        {
          bone: "leftUpperLeg",
          rotation: { x: 0.3, y: 0, z: 0 },
          slerp: 1,
        },
        {
          bone: "missingBone",
          rotation: { x: 0.4, y: 0, z: 0 },
          slerp: 1,
        },
      ],
    });

    expect(result.applied).toBe(2);
    expect(bones.rightUpperLeg.quaternion.w).toBeLessThan(1);
    expect(bones.leftUpperLeg.quaternion.w).toBeLessThan(1);
  });

  it("resolves and executes neutral lower-body pose application", () => {
    const appliedBones: string[] = [];

    const result = applyMovementAvatarLowerBodyNeutralPoseApplication({
      applyRotation: (spec) => {
        appliedBones.push(`${spec.bone}:${spec.slerp}`);
      },
      slerp: 0.31,
    });

    expect(result.applied).toBe(6);
    expect(appliedBones).toEqual([
      "rightUpperLeg:0.31",
      "rightLowerLeg:0.31",
      "leftUpperLeg:0.31",
      "leftLowerLeg:0.31",
      "rightFoot:0.31",
      "leftFoot:0.31",
    ]);
  });

  it("applies neutral lower-body pose application directly to VRM bones", () => {
    const bones = {
      leftFoot: new THREE.Object3D(),
      leftLowerLeg: new THREE.Object3D(),
      leftUpperLeg: new THREE.Object3D(),
      rightFoot: new THREE.Object3D(),
      rightLowerLeg: new THREE.Object3D(),
      rightUpperLeg: new THREE.Object3D(),
    };

    expect(applyMovementAvatarLowerBodyNeutralPoseApplicationToVrmBones({
      lookupBone: (bone) => bones[bone as keyof typeof bones],
      slerp: 0.31,
    })).toEqual({ applied: 6 });
  });

  it("resolves and executes squat flexion pose application", () => {
    const appliedBones: string[] = [];

    const result = applyMovementAvatarSquatFlexionPoseApplication({
      applyRotation: (spec) => {
        appliedBones.push(spec.bone);
      },
      bendBoost: 0.4,
      depth: 0.7,
      slerp: 0.43,
    });

    expect(result.applied).toBe(6);
    expect(appliedBones).toEqual([
      "rightUpperLeg",
      "leftUpperLeg",
      "rightLowerLeg",
      "leftLowerLeg",
      "rightFoot",
      "leftFoot",
    ]);
  });

  it("applies squat flexion pose application directly to VRM bones", () => {
    const bones = {
      leftFoot: new THREE.Object3D(),
      leftLowerLeg: new THREE.Object3D(),
      leftUpperLeg: new THREE.Object3D(),
      rightFoot: new THREE.Object3D(),
      rightLowerLeg: new THREE.Object3D(),
      rightUpperLeg: new THREE.Object3D(),
    };

    const result = applyMovementAvatarSquatFlexionPoseApplicationToVrmBones({
      bendBoost: 0.4,
      depth: 0.7,
      lookupBone: (bone) => bones[bone as keyof typeof bones],
      slerp: 1,
    });

    expect(result.applied).toBe(6);
    expect(bones.rightUpperLeg.quaternion.w).toBeLessThan(1);
    expect(bones.leftFoot.quaternion.w).toBeLessThan(1);
  });

  it("resolves and executes single-leg raise pose application", () => {
    const appliedBones: string[] = [];

    const result = applyMovementAvatarSingleLegRaisePoseApplication({
      applyRotation: (spec) => {
        appliedBones.push(spec.bone);
      },
      depth: 0.8,
      side: "left",
      slerp: 0.52,
    });

    expect(result.applied).toBe(6);
    expect(appliedBones).toEqual([
      "leftUpperLeg",
      "leftLowerLeg",
      "leftFoot",
      "rightUpperLeg",
      "rightLowerLeg",
      "rightFoot",
    ]);
  });

  it("applies single-leg raise pose application directly to VRM bones", () => {
    const bones = {
      leftFoot: new THREE.Object3D(),
      leftLowerLeg: new THREE.Object3D(),
      leftUpperLeg: new THREE.Object3D(),
      rightFoot: new THREE.Object3D(),
      rightLowerLeg: new THREE.Object3D(),
      rightUpperLeg: new THREE.Object3D(),
    };

    const result = applyMovementAvatarSingleLegRaisePoseApplicationToVrmBones({
      depth: 0.8,
      lookupBone: (bone) => bones[bone as keyof typeof bones],
      side: "left",
      slerp: 1,
    });

    expect(result.applied).toBe(6);
    expect(bones.leftUpperLeg.quaternion.w).toBeLessThan(1);
    expect(bones.leftLowerLeg.quaternion.w).toBeLessThan(1);
  });

  it("executes solved lower-body rig rotation specs through the supplied renderer callback", () => {
    const specs = [
      {
        bone: "rightUpperLeg",
        limits: { x: 1.2, y: 0.8, z: 0.8 },
        remember: false,
        scale: 1.1,
        slerp: 0.5,
        source: "RightUpperLeg",
      },
      {
        bone: "rightLowerLeg",
        limits: { x: 1.4, y: 0.6, z: 0.6 },
        remember: false,
        scale: 1.1,
        slerp: 0.5,
        source: "RightLowerLeg",
      },
    ] as const;
    const appliedSources: string[] = [];

    const result = applyMovementAvatarSolvedLowerBodyRotationSpecs({
      apply: (spec) => {
        appliedSources.push(spec.source);
      },
      specs: [...specs],
    });

    expect(result.applied).toBe(2);
    expect(appliedSources).toEqual(["RightUpperLeg", "RightLowerLeg"]);
  });



  it("executes mixed support presentation rotation specs through the supplied renderer callback", () => {
    const specs = [
      {
        bone: "rightUpperLeg",
        rotation: { x: 0.1, y: 0, z: 0 },
        slerp: 0.4,
      },
      {
        bone: "spine",
        rotation: { x: 0.2, y: 0, z: 0 },
        slerp: 0.5,
      },
      {
        bone: "leftUpperArm",
        rotation: { x: 0, y: 0, z: 1.1 },
        slerp: 0.6,
      },
    ] as const;
    const appliedBones: string[] = [];

    const result = applyMovementAvatarSupportPresentationRotationSpecs({
      apply: (spec) => {
        appliedBones.push(spec.bone);
      },
      specs: [...specs],
    });

    expect(result.applied).toBe(3);
    expect(appliedBones).toEqual(["rightUpperLeg", "spine", "leftUpperArm"]);
  });

  it("applies mixed support presentation rotation specs directly to VRM bones", () => {
    const bones = {
      rightUpperLeg: new THREE.Object3D(),
      spine: new THREE.Object3D(),
    };

    const result = applyMovementAvatarSupportPresentationRotationSpecsToVrmBones({
      lookupBone: (bone) => bones[bone as keyof typeof bones],
      specs: [
        {
          bone: "rightUpperLeg",
          rotation: { x: 0.2, y: 0, z: 0 },
          slerp: 1,
        },
        {
          bone: "spine",
          rotation: { x: 0.1, y: 0, z: 0 },
          slerp: 1,
        },
        {
          bone: "leftUpperArm",
          rotation: { x: 0.3, y: 0, z: 0 },
          slerp: 1,
        },
      ],
    });

    expect(result.applied).toBe(2);
    expect(bones.rightUpperLeg.quaternion.w).toBeLessThan(1);
    expect(bones.spine.quaternion.w).toBeLessThan(1);
  });

  it("executes instructor foot plant requests through the supplied renderer callback", () => {
    const appliedSides: string[] = [];

    const result = applyMovementAvatarInstructorFootPlantRequests({
      apply: (side) => {
        appliedSides.push(side);
        return true;
      },
      sides: ["left", "right"],
    });

    expect(result.applied).toBe(2);
    expect(appliedSides).toEqual(["left", "right"]);
  });

  it("applies instructor foot plant pose rotations and returns the next feet owner", () => {
    const specs: string[] = [];

    const result = applyMovementAvatarInstructorFootPlantPose({
      applyRotation: (spec) => {
        specs.push(`${spec.bone}:${spec.slerp}`);
      },
      currentFeetOwner: "recorded-retarget",
      isPlayer: false,
      side: "left",
      slerp: 0.7,
    });

    expect(result).toEqual({
      applied: true,
      appliedRotations: 2,
      feetOwner: "recorded-retarget+planted-flat",
    });
    expect(specs).toEqual(["leftFoot:0.7", "leftToes:0.7"]);
  });

  it("applies instructor foot plant pose rotations directly to VRM bones", () => {
    const bones = {
      leftFoot: new THREE.Object3D(),
      leftToes: new THREE.Object3D(),
    };

    const result = applyMovementAvatarInstructorFootPlantPoseToVrmBones({
      currentFeetOwner: "recorded-retarget",
      isPlayer: false,
      lookupBone: (bone) => bones[bone as keyof typeof bones],
      side: "left",
      slerp: 1,
    });

    expect(result).toEqual({
      applied: true,
      appliedRotations: 2,
      feetOwner: "recorded-retarget+planted-flat",
    });
    expect(bones.leftFoot.quaternion.w).toBe(1);
    expect(bones.leftToes.quaternion.w).toBe(1);
  });

  it("applies instructor foot plant request batches directly to VRM bones", () => {
    const bones = {
      leftFoot: new THREE.Object3D(),
      leftToes: new THREE.Object3D(),
      rightFoot: new THREE.Object3D(),
      rightToes: new THREE.Object3D(),
    };

    const result = applyMovementAvatarInstructorFootPlantRequestsToVrmBones({
      contacts: {
        leftFoot: false,
        rightFoot: true,
      },
      currentFeetOwner: "recorded-retarget",
      isPlayer: false,
      lookupBone: (bone) => bones[bone as keyof typeof bones],
      sides: ["left", "right"],
      slerp: 1,
    });

    expect(result).toEqual({
      applied: 1,
      feetOwner: "recorded-retarget+planted-flat",
    });
    expect(bones.rightFoot.quaternion.w).toBe(1);
    expect(bones.rightToes.quaternion.w).toBe(1);
  });

  it("skips instructor foot plant pose for player avatars", () => {
    const specs: string[] = [];

    const result = applyMovementAvatarInstructorFootPlantPose({
      applyRotation: (spec) => {
        specs.push(spec.bone);
      },
      currentFeetOwner: "player-retarget",
      isPlayer: true,
      side: "right",
    });

    expect(result).toEqual({
      applied: false,
      appliedRotations: 0,
      feetOwner: "player-retarget",
    });
    expect(specs).toEqual([]);
  });

  it("gates instructor foot plant requests by recorded contacts when provided", () => {
    const appliedSides: string[] = [];

    const result = applyMovementAvatarInstructorFootPlantRequests({
      apply: (side) => {
        appliedSides.push(side);
        return true;
      },
      contacts: {
        leftFoot: false,
        rightFoot: true,
      },
      sides: ["left", "right"],
    });

    expect(result.applied).toBe(1);
    expect(appliedSides).toEqual(["right"]);
  });
});

function appliedDecision(
  overrides: Partial<MovementAvatarAppliedLowerBodyDecision> = {},
): MovementAvatarAppliedLowerBodyDecision {
  return {
    feetOwner: "neutral",
    lowerBodyOwner: "neutral",
    playerAppliedOwnerDecision: null,
    retargetOwnsLowerBody: false,
    shouldUseLegacyLowerBody: false,
    shouldUsePlayerFootFallback: false,
    shouldUseRecordedSquatPresentation: false,
    ...overrides,
  };
}

describe("movement avatar lower-body retarget application plan", () => {
  it("requests legacy aim when too few retargeted lower-body segments apply", () => {
    const plan = resolveMovementAvatarLowerBodyRetargetApplicationPlan({
      appliedDecision: appliedDecision(),
      avatarRole: "player",
      balancedPlantedSquatDepth: 0,
      instructorSquatPresentationDepth: 0,
      lowerBodyDrive: drive(),
      playerSquatPresentationDepth: 0,
      retargetAppliedLowerBody: 3,
      stageDecision: stage("retarget"),
    });

    expect(plan.shouldApplyLegacyAim).toBe(true);
  });



  it("lets solved player leg-raise retarget own the pose instead of adding a canned overlay", () => {
    const plan = resolveMovementAvatarLowerBodyRetargetApplicationPlan({
      appliedDecision: appliedDecision(),
      avatarRole: "player",
      balancedPlantedSquatDepth: 0,
      instructorSquatPresentationDepth: 0,
      lowerBodyDrive: drive({ playerLegRaiseDepth: 0.63 }),
      playerSquatPresentationDepth: 0,
      retargetAppliedLowerBody: 4,
      stageDecision: stage("retarget", { anchoredPlayerLegRaiseSide: "right" }),
    });

    expect(plan.legRaiseOverlay).toBeNull();
  });

  it("keeps an explicit player leg-raise overlay when solved leg retarget is incomplete", () => {
    const plan = resolveMovementAvatarLowerBodyRetargetApplicationPlan({
      appliedDecision: appliedDecision(),
      avatarRole: "player",
      balancedPlantedSquatDepth: 0,
      instructorSquatPresentationDepth: 0,
      lowerBodyDrive: drive({ playerLegRaiseDepth: 0.63 }),
      playerSquatPresentationDepth: 0,
      retargetAppliedLowerBody: 3,
      stageDecision: stage("retarget", {
        anchoredPlayerLegRaiseSide: "right",
      }),
    });

    expect(plan.legRaiseOverlay).toEqual({ depth: 0.63, side: "right" });
  });


});
