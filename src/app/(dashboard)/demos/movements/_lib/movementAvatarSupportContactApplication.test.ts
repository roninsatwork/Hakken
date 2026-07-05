import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  applyMovementAvatarSupportContactBoneCorrectionLocalApplications,
  applyMovementAvatarSupportContactBoneCorrections,
  applyMovementAvatarSupportContactLocksToObjects,
  applyMovementAvatarSupportContactRootCorrection,
  resolveMovementAvatarSupportContactCorrectionApplication,
} from "./movementAvatarSupportContactApplication";
import type { MovementAvatarSupportContactLockDecision } from "./movementAvatarPipeline";

function contactLocks(
  overrides: Partial<MovementAvatarSupportContactLockDecision> = {},
): MovementAvatarSupportContactLockDecision {
  return {
    anchors: [],
    boneCorrectionScale: 0.35,
    maxBoneCorrection: 0.08,
    maxCorrection: 0.2,
    owner: "support-contact-test",
    rootCorrectionScale: 0.75,
    shouldApply: true,
    slerp: 0.5,
    status: "partial",
    ...overrides,
  };
}

describe("movement avatar support contact application", () => {
  it("resolves weighted root and residual bone corrections from anchor samples", () => {
    const result = resolveMovementAvatarSupportContactCorrectionApplication({
      contactLocks: contactLocks(),
      floorY: -1,
      samples: [
        {
          anchor: {
            bone: "hips",
            label: "seat",
            surface: "chair",
            targetOffsetFromFloor: 0.4,
            weight: 1,
          },
          worldY: -0.7,
        },
        {
          anchor: {
            bone: "leftFoot",
            label: "left foot",
            surface: "floor",
            targetOffsetFromFloor: 0.05,
            weight: 0.5,
          },
          worldY: -0.8,
        },
      ],
    });

    expect(result.appliedAnchors).toBe(2);
    expect(result.rootCorrection).toBeCloseTo(0.016667, 5);
    expect(result.appliedRootCorrection).toBeCloseTo(0.00625, 5);
    expect(result.boneCorrections).toEqual([
      expect.objectContaining({
        sampleIndex: 0,
        weightedCorrection: expect.closeTo(0.028, 5),
      }),
      expect.objectContaining({
        sampleIndex: 1,
        weightedCorrection: expect.closeTo(-0.014, 5),
      }),
    ]);
    expect(result.appliedBoneCorrection).toBeCloseTo(0.028, 5);
    expect(result.supportContactCorrection).toBeCloseTo(0.028, 5);
  });

  it("returns a neutral correction when no anchors were sampled", () => {
    const result = resolveMovementAvatarSupportContactCorrectionApplication({
      contactLocks: contactLocks(),
      floorY: -1,
      samples: [],
    });

    expect(result).toMatchObject({
      appliedAnchors: 0,
      appliedBoneCorrection: 0,
      appliedRootCorrection: 0,
      boneCorrections: [],
      rootCorrection: 0,
      supportContactCorrection: 0,
    });
  });

  it("executes root correction only when support anchors were applied", () => {
    const applied: number[] = [];

    const result = applyMovementAvatarSupportContactRootCorrection({
      application: {
        appliedAnchors: 2,
        appliedBoneCorrection: 0.02,
        appliedRootCorrection: 0.03,
        boneCorrections: [],
        rootCorrection: 0.06,
        supportContactCorrection: 0.03,
      },
      apply: (appliedRootCorrection) => {
        applied.push(appliedRootCorrection);
        return true;
      },
    });

    expect(result).toEqual({
      applied: true,
      appliedRootCorrection: 0.03,
    });
    expect(applied).toEqual([0.03]);
    expect(applyMovementAvatarSupportContactRootCorrection({
      application: {
        appliedAnchors: 0,
        appliedBoneCorrection: 0,
        appliedRootCorrection: 0,
        boneCorrections: [],
        rootCorrection: 0,
        supportContactCorrection: 0,
      },
      apply: () => true,
    })).toEqual({
      applied: false,
      appliedRootCorrection: 0,
    });
  });

  it("executes bone corrections and reports the largest applied correction", () => {
    const visited: number[] = [];

    const result = applyMovementAvatarSupportContactBoneCorrections({
      apply: (correction) => {
        visited.push(correction.sampleIndex);
        return correction.sampleIndex !== 1;
      },
      corrections: [
        {
          correction: 0.08,
          residualCorrection: 0.06,
          sampleIndex: 0,
          weightedCorrection: 0.02,
        },
        {
          correction: -0.08,
          residualCorrection: -0.06,
          sampleIndex: 1,
          weightedCorrection: -0.05,
        },
        {
          correction: 0.12,
          residualCorrection: 0.1,
          sampleIndex: 2,
          weightedCorrection: 0.04,
        },
      ],
    });

    expect(visited).toEqual([0, 1, 2]);
    expect(result).toEqual({
      applied: 2,
      appliedBoneCorrection: 0.04,
    });
  });

  it("executes local bone correction applications after caller-supplied conversion", () => {
    const visited: Array<{ localY: number; sampleIndex: number }> = [];

    const result = applyMovementAvatarSupportContactBoneCorrectionLocalApplications({
      apply: (application) => {
        visited.push({
          localY: application.targetLocalPosition.y,
          sampleIndex: application.sampleIndex,
        });
        return application.sampleIndex !== 2;
      },
      corrections: [
        {
          correction: 0.08,
          residualCorrection: 0.06,
          sampleIndex: 0,
          weightedCorrection: 0.02,
        },
        {
          correction: -0.08,
          residualCorrection: -0.06,
          sampleIndex: 1,
          weightedCorrection: -0.05,
        },
        {
          correction: 0.12,
          residualCorrection: 0.1,
          sampleIndex: 2,
          weightedCorrection: 0.04,
        },
      ],
      toLocalPosition: (correction) => {
        if (correction.sampleIndex === 1) return null;
        return {
          x: 0,
          y: correction.weightedCorrection,
          z: 0,
        };
      },
    });

    expect(visited).toEqual([
      { localY: 0.02, sampleIndex: 0 },
      { localY: 0.04, sampleIndex: 2 },
    ]);
    expect(result).toEqual({
      applied: 1,
      appliedBoneCorrection: 0.02,
    });
  });

  it("applies support-contact locks directly to Three root and bone objects", () => {
    const scene = new THREE.Object3D();
    const avatarRoot = new THREE.Object3D();
    const seatParent = new THREE.Object3D();
    const hips = new THREE.Object3D();
    scene.add(avatarRoot);
    avatarRoot.add(seatParent);
    seatParent.add(hips);
    hips.position.y = -0.7;
    scene.updateMatrixWorld(true);

    const result = applyMovementAvatarSupportContactLocksToObjects({
      avatarRoot,
      contactLocks: contactLocks({
        anchors: [{
          bone: "hips",
          label: "seat",
          surface: "chair",
          targetOffsetFromFloor: 0.4,
          weight: 1,
        }],
      }),
      floorY: -1,
      lookupBone: (bone) => bone === "hips" ? hips : null,
      scene,
    });

    expect(result.applied).toBe(true);
    expect(result.appliedAnchors).toBe(1);
    expect(result.appliedRootCorrection).toBeCloseTo(0.0375);
    expect(result.appliedBoneCorrection).toBeGreaterThan(0);
    expect(result.supportContactCorrection).toBeGreaterThan(0);
    expect(avatarRoot.position.y).toBeCloseTo(0.0375);
    expect(hips.position.y).not.toBeCloseTo(-0.7);
    expect(applyMovementAvatarSupportContactLocksToObjects({
      avatarRoot,
      contactLocks: contactLocks({ shouldApply: false }),
      floorY: -1,
      lookupBone: () => null,
      scene,
    })).toEqual({
      applied: false,
      appliedAnchors: 0,
      appliedBoneCorrection: 0,
      appliedRootCorrection: 0,
      supportContactCorrection: 0,
    });
  });
});
