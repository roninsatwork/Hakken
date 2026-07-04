import { describe, expect, it } from "vitest";
import {
  resolveMovementAvatarHeadApplicationPose,
  resolveMovementAvatarHeadDecision,
  resolveMovementAvatarHeadWorldYaw,
  resolveMovementAvatarHipsPositionOptions,
  resolveMovementAvatarPlayerLegRaiseHold,
  resolveMovementAvatarRootOrientation,
  resolveMovementAvatarStudioDecision,
} from "./movementAvatarPipeline";
import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";
import { classifyMovementBodyOrientation } from "./movementBodyOrientation";
import {
  kneelingPoseFixture,
  movementOrientationPoseWith,
  pronePoseFixture,
  quadrupedPoseFixture,
  seatedPoseFixture,
  sideLyingPoseFixture,
  supinePoseFixture,
} from "./movementBodyOrientation.testFixtures";
import {
  makeMovementAvatarProofPose,
  movementAvatarProofLandmark,
} from "./movementAvatarProofFixtures";
import type {
  MovementCalibration,
  MovementHeadMotionIntent,
  TrackingLandmark,
} from "./movementTrackingCalibration";

const neutralHeadIntent: MovementHeadMotionIntent = {
  confidence: 0.9,
  depth: 0,
  label: "neutral",
  lateral: 0,
  vertical: 0,
};

const neutralCalibration: MovementCalibration = {
  calibratedAt: 1,
  floorY: 0.96,
  headCenter: { x: 0.5, y: 0.28, z: 0 },
  headNeutral: {
    confidence: 0.95,
    pitch: 0,
    roll: 0,
    source: "face",
    yaw: 0,
  },
  hipCenter: { x: 0.5, y: 0.66, z: 0 },
  quality: 0.95,
  shoulderCenter: { x: 0.5, y: 0.42, z: 0 },
  shoulderWidth: 0.22,
  torsoHeight: 0.24,
};

const neutralLowerBodyDrive: MovementAvatarLowerBodyDrive = {
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

describe("movement avatar pipeline", () => {
  it("keeps live player head pitch on the existing avatar application path", () => {
    const decision = resolveMovementAvatarHeadDecision({
      avatarRole: "player",
      calibration: neutralCalibration,
      headMotionIntent: neutralHeadIntent,
      rawHead: {
        confidence: 0.95,
        pitch: 0.4,
        roll: 0,
        source: "face",
        yaw: 0,
      },
    });

    expect(decision.appliedHead.pitch).toBeGreaterThan(0);
    expect(decision.headPitch).toBeGreaterThan(0);
  });

  it("keeps live player head vertical offset on the existing avatar application path", () => {
    const pose = resolveMovementAvatarHeadApplicationPose({
      headMotionIntent: {
        ...neutralHeadIntent,
        vertical: 0.7,
      },
      headPitch: 0,
      headRoll: 0,
      headYaw: 0,
      shouldApplyHeadMotion: true,
      shouldApplyLowerBody: false,
      shouldApplyPlayerHeadMotion: true,
      shouldApplySpine: false,
    });

    expect(pose.headPositionOffset?.y).toBeLessThan(0);
  });

  it("does not apply a live head position offset to recorded instructor head motion", () => {
    const pose = resolveMovementAvatarHeadApplicationPose({
      headMotionIntent: {
        ...neutralHeadIntent,
        vertical: 0.7,
      },
      headPitch: 0,
      headRoll: 0,
      headYaw: 0,
      shouldApplyHeadMotion: true,
      shouldApplyLowerBody: false,
      shouldApplyPlayerHeadMotion: false,
      shouldApplySpine: false,
    });

    expect(pose.headPositionOffset).toBeNull();
  });

  it("keeps recorded head yaw relative to the turned avatar root", () => {
    expect(resolveMovementAvatarHeadWorldYaw({
      avatarRootYaw: 0,
      headYaw: 0,
    })).toBe(0);
    expect(resolveMovementAvatarHeadWorldYaw({
      avatarRootYaw: Math.PI,
      headYaw: 0,
    })).toBeCloseTo(Math.PI, 5);
    expect(resolveMovementAvatarHeadWorldYaw({
      avatarRootYaw: Math.PI / 2,
      headYaw: 0.18,
    })).toBeCloseTo(Math.PI / 2 + 0.18, 5);
  });

  it("does not use player floor correction for a held single-leg raise", () => {
    const options = resolveMovementAvatarHipsPositionOptions({
      avatarRole: "player",
      lowerBodyDrive: {
        ...neutralLowerBodyDrive,
        playerLegRaiseDepth: 0.7,
        playerLegRaiseSide: "left",
        playerLowerBodyState: "left-leg-raise",
        shouldApplyLowerBody: true,
        shouldApplySolverTorso: true,
        shouldDrivePlayerLegRaise: true,
      },
    });

    expect(options.floorContactCorrectionScale).toBe(0);
  });

  it("keeps seated and kneeling root orientation upright while lowering the avatar root", () => {
    const rootOrientation = resolveMovementAvatarRootOrientation({
      bodyOrientation: classifyMovementBodyOrientation(seatedPoseFixture()),
    });
    const kneelingRootOrientation = resolveMovementAvatarRootOrientation({
      bodyOrientation: classifyMovementBodyOrientation(kneelingPoseFixture()),
    });

    expect(rootOrientation.shouldApply).toBe(false);
    expect(rootOrientation.shouldApplyHeight).toBe(true);
    expect(rootOrientation.owner).toBe("body-orientation-seated");
    expect(rootOrientation.targetHeightDrop).toBeGreaterThan(0.6);
    expect(rootOrientation.targetPitch).toBe(0);
    expect(rootOrientation.targetRoll).toBe(0);
    expect(kneelingRootOrientation.shouldApply).toBe(false);
    expect(kneelingRootOrientation.shouldApplyHeight).toBe(true);
    expect(kneelingRootOrientation.owner).toBe("body-orientation-kneeling");
    expect(kneelingRootOrientation.targetHeightDrop).toBeGreaterThan(0.45);
    expect(kneelingRootOrientation.targetHeightDrop).toBeLessThan(rootOrientation.targetHeightDrop);
  });

  it("tilts the avatar root for side-lying floor work", () => {
    const rootOrientation = resolveMovementAvatarRootOrientation({
      bodyOrientation: classifyMovementBodyOrientation(sideLyingPoseFixture()),
    });

    expect(rootOrientation.shouldApply).toBe(true);
    expect(rootOrientation.shouldApplyHeight).toBe(true);
    expect(rootOrientation.owner).toBe("body-orientation-side-lying-left");
    expect(rootOrientation.targetHeightDrop).toBeGreaterThan(0.8);
    expect(rootOrientation.targetPitch).toBe(0);
    expect(rootOrientation.targetRoll).toBeCloseTo(Math.PI / 2, 5);
  });

  it("tips the avatar root forward for quadruped floor work", () => {
    const rootOrientation = resolveMovementAvatarRootOrientation({
      bodyOrientation: classifyMovementBodyOrientation(quadrupedPoseFixture()),
    });

    expect(rootOrientation.shouldApply).toBe(true);
    expect(rootOrientation.shouldApplyHeight).toBe(true);
    expect(rootOrientation.owner).toBe("body-orientation-quadruped");
    expect(rootOrientation.targetHeightDrop).toBeGreaterThan(0.75);
    expect(rootOrientation.targetPitch).toBeCloseTo(-Math.PI / 2, 5);
    expect(rootOrientation.targetRoll).toBe(0);
  });

  it("tips the avatar root for supine and prone floor work", () => {
    const supineRootOrientation = resolveMovementAvatarRootOrientation({
      bodyOrientation: classifyMovementBodyOrientation(supinePoseFixture()),
    });
    const proneRootOrientation = resolveMovementAvatarRootOrientation({
      bodyOrientation: classifyMovementBodyOrientation(pronePoseFixture()),
    });

    expect(supineRootOrientation.shouldApply).toBe(true);
    expect(supineRootOrientation.shouldApplyHeight).toBe(true);
    expect(supineRootOrientation.owner).toBe("body-orientation-supine");
    expect(supineRootOrientation.targetHeightDrop).toBeGreaterThan(0.8);
    expect(supineRootOrientation.targetPitch).toBeCloseTo(Math.PI / 2, 5);
    expect(proneRootOrientation.shouldApply).toBe(true);
    expect(proneRootOrientation.shouldApplyHeight).toBe(true);
    expect(proneRootOrientation.owner).toBe("body-orientation-prone");
    expect(proneRootOrientation.targetHeightDrop).toBeGreaterThan(0.8);
    expect(proneRootOrientation.targetPitch).toBeCloseTo(-Math.PI / 2, 5);
  });

  it("adds conservative support-presentation poses for seated, kneeling, and floor states", () => {
    const uprightPose = movementOrientationPoseWith({
      0: movementAvatarProofLandmark(0.5, 0.24),
      7: movementAvatarProofLandmark(0.46, 0.27),
      8: movementAvatarProofLandmark(0.54, 0.27),
      11: movementAvatarProofLandmark(0.39, 0.42),
      12: movementAvatarProofLandmark(0.61, 0.42),
      23: movementAvatarProofLandmark(0.43, 0.66),
      24: movementAvatarProofLandmark(0.57, 0.66),
      25: movementAvatarProofLandmark(0.43, 0.81),
      26: movementAvatarProofLandmark(0.57, 0.81),
      27: movementAvatarProofLandmark(0.43, 0.94),
      28: movementAvatarProofLandmark(0.57, 0.94),
    });
    const resolveDecision = (poseLandmarks: TrackingLandmark[]) => (
      resolveMovementAvatarStudioDecision({
        avatarRole: "player",
        calibration: null,
        retargetSourceModel: null,
        source: { poseLandmarks },
      })
    );

    expect(resolveDecision(uprightPose).supportPresentation).toMatchObject({
      armSpecs: [],
      owner: "support-presentation-none",
      shouldApply: false,
      spineSpecs: [],
    });
    expect(resolveDecision(uprightPose).supportContactLocks).toMatchObject({
      anchors: [],
      shouldApply: false,
      status: "inactive",
    });

    ([
      [seatedPoseFixture(), "support-presentation-seated"],
      [kneelingPoseFixture(), "support-presentation-kneeling"],
      [quadrupedPoseFixture(), "support-presentation-all-fours"],
      [sideLyingPoseFixture(), "support-presentation-side-lying"],
      [supinePoseFixture(), "support-presentation-supine"],
      [pronePoseFixture(), "support-presentation-prone"],
    ] as const).forEach(([poseLandmarks, owner]) => {
      const decision = resolveDecision(poseLandmarks);
      const presentation = decision.supportPresentation;

      expect(presentation.owner).toBe(owner);
      expect(presentation.shouldApply).toBe(true);
      expect(presentation.specs.length).toBeGreaterThanOrEqual(6);
      expect(presentation.armSpecs.length).toBeGreaterThan(0);
      expect(presentation.spineSpecs.length).toBeGreaterThan(0);
      expect(presentation.specs.map((spec) => spec.bone)).toContain("rightUpperLeg");
      expect(presentation.specs.map((spec) => spec.bone)).toContain("leftUpperLeg");
      expect(presentation.spineSpecs.map((spec) => spec.bone)).toContain("spine");
      expect(decision.supportContactLocks.shouldApply).toBe(true);
      expect(decision.supportContactLocks.status).toBe("partial");
      expect(decision.supportContactLocks.anchors.length).toBeGreaterThan(0);
    });
  });

  it("presents seated chair-work proof poses with source-derived shape", () => {
    const resolveDecision = (poseLandmarks: TrackingLandmark[]) => (
      resolveMovementAvatarStudioDecision({
        avatarRole: "player",
        calibration: null,
        retargetSourceModel: null,
        source: { poseLandmarks },
      })
    );
    const forwardFoldDecision = resolveDecision(makeMovementAvatarProofPose("seated-forward-fold"));
    const legLiftDecision = resolveDecision(makeMovementAvatarProofPose("seated-leg-lift"));
    const legPitch = (
      decision: ReturnType<typeof resolveMovementAvatarStudioDecision>,
      bone: "leftLowerLeg" | "rightLowerLeg",
    ) => decision.supportPresentation.specs.find((spec) => spec.bone === bone)?.rotation.x ?? 0;
    const spinePitch = (
      decision: ReturnType<typeof resolveMovementAvatarStudioDecision>,
      bone: "chest" | "spine",
    ) => decision.supportPresentation.spineSpecs.find((spec) => spec.bone === bone)?.rotation.x ?? 0;

    expect(forwardFoldDecision.exercisePose.poseKey).toBe("seated-forward-fold");
    expect(forwardFoldDecision.supportPresentation.owner).toBe("support-presentation-seated-forward-fold");
    expect(spinePitch(forwardFoldDecision, "spine")).toBeGreaterThan(0.19);
    expect(spinePitch(forwardFoldDecision, "chest")).toBeGreaterThan(0.17);

    expect(legLiftDecision.exercisePose.poseKey).toBe("seated-leg-lift");
    expect(legLiftDecision.supportPresentation.owner).toBe("support-presentation-seated-leg-lift");
    expect(legPitch(legLiftDecision, "rightLowerLeg")).toBeGreaterThan(
      legPitch(legLiftDecision, "leftLowerLeg"),
    );
  });

  it("uses multi-anchor body-plane contact locks for lying floor work", () => {
    const resolveDecision = (poseLandmarks: TrackingLandmark[]) => (
      resolveMovementAvatarStudioDecision({
        avatarRole: "player",
        calibration: null,
        retargetSourceModel: null,
        source: { poseLandmarks },
      })
    );
    const supineDecision = resolveDecision(supinePoseFixture());
    const proneDecision = resolveDecision(pronePoseFixture());
    const sideLyingDecision = resolveDecision(sideLyingPoseFixture());

    expect(supineDecision.supportIntent.anchorPoints).toEqual([
      "back",
      "leftShoulder",
      "rightShoulder",
      "leftHip",
      "rightHip",
      "leftFoot",
      "rightFoot",
    ]);
    expect(supineDecision.supportConstraint.activeLayers).toContain("body-plane-floor-contact");
    expect(supineDecision.supportContactLocks).toMatchObject({
      boneCorrectionScale: 0.08,
      maxBoneCorrection: 0.055,
      rootCorrectionScale: 0.88,
    });
    expect(supineDecision.supportContactLocks.anchors.map((anchor) => anchor.bone)).toEqual([
      "spine",
      "chest",
      "hips",
      "leftFoot",
      "rightFoot",
    ]);

    expect(proneDecision.supportIntent.anchorPoints).toEqual([
      "chest",
      "belly",
      "leftHip",
      "rightHip",
      "leftHand",
      "rightHand",
      "leftFoot",
      "rightFoot",
    ]);
    expect(proneDecision.supportConstraint.activeLayers).toContain("body-plane-floor-contact");
    expect(proneDecision.supportContactLocks).toMatchObject({
      boneCorrectionScale: 0.08,
      maxBoneCorrection: 0.055,
      rootCorrectionScale: 0.88,
    });
    expect(proneDecision.supportContactLocks.anchors.map((anchor) => anchor.bone)).toEqual([
      "chest",
      "spine",
      "hips",
      "leftHand",
      "rightHand",
      "leftFoot",
      "rightFoot",
    ]);

    expect(sideLyingDecision.supportIntent.anchorPoints).toEqual([
      "sideBody",
      "leftHip",
      "leftShoulder",
      "leftElbow",
    ]);
    expect(sideLyingDecision.supportConstraint.activeLayers).toContain("body-plane-floor-contact");
    expect(sideLyingDecision.supportContactLocks).toMatchObject({
      boneCorrectionScale: 0.075,
      maxBoneCorrection: 0.05,
      rootCorrectionScale: 0.86,
    });
    expect(sideLyingDecision.supportContactLocks.anchors.map((anchor) => anchor.bone)).toEqual([
      "hips",
      "chest",
      "leftLowerArm",
    ]);
  });

  it("uses conservative per-anchor correction for seated, kneeling, and quadruped support", () => {
    const resolveDecision = (poseLandmarks: TrackingLandmark[]) => (
      resolveMovementAvatarStudioDecision({
        avatarRole: "player",
        calibration: null,
        retargetSourceModel: null,
        source: { poseLandmarks },
      })
    );
    const seatedDecision = resolveDecision(seatedPoseFixture());
    const kneelingDecision = resolveDecision(kneelingPoseFixture());
    const quadrupedDecision = resolveDecision(quadrupedPoseFixture());
    const plankDecision = resolveDecision(makeMovementAvatarProofPose("yoga-plank"));

    expect(seatedDecision.supportContactLocks).toMatchObject({
      boneCorrectionScale: 0.035,
      maxBoneCorrection: 0.025,
      rootCorrectionScale: 1,
    });
    expect(seatedDecision.supportContactLocks.anchors.map((anchor) => anchor.bone)).toEqual([
      "hips",
      "rightFoot",
      "leftFoot",
    ]);
    expect(kneelingDecision.supportContactLocks).toMatchObject({
      boneCorrectionScale: 0.04,
      maxBoneCorrection: 0.03,
      rootCorrectionScale: 1,
    });
    expect(kneelingDecision.supportContactLocks.anchors.map((anchor) => anchor.bone)).toEqual([
      "rightLowerLeg",
      "leftLowerLeg",
      "rightFoot",
      "leftFoot",
    ]);
    expect(quadrupedDecision.supportContactLocks).toMatchObject({
      boneCorrectionScale: 0.05,
      maxBoneCorrection: 0.035,
      rootCorrectionScale: 0.94,
    });
    expect(quadrupedDecision.supportContactLocks.anchors.map((anchor) => anchor.bone)).toEqual([
      "rightHand",
      "leftHand",
      "rightLowerLeg",
      "leftLowerLeg",
    ]);
    expect(plankDecision.supportContactLocks).toMatchObject({
      boneCorrectionScale: 0.05,
      maxBoneCorrection: 0.035,
      rootCorrectionScale: 0.92,
    });
    expect(plankDecision.supportContactLocks.anchors.map((anchor) => anchor.bone)).toEqual([
      "rightHand",
      "leftHand",
      "rightFoot",
      "leftFoot",
    ]);
  });

  it("uses pose-specific floor anchors for bridge and prone extension", () => {
    const resolveDecision = (poseLandmarks: TrackingLandmark[]) => (
      resolveMovementAvatarStudioDecision({
        avatarRole: "player",
        calibration: null,
        retargetSourceModel: null,
        source: { poseLandmarks },
      })
    );
    const bridgeDecision = resolveDecision(makeMovementAvatarProofPose("supine-bridge"));
    const cobraDecision = resolveDecision(makeMovementAvatarProofPose("prone-cobra"));
    const highBridgePose = makeMovementAvatarProofPose("supine-bridge").map((landmark) => ({ ...landmark }));
    highBridgePose[23] = { ...highBridgePose[23]!, y: highBridgePose[23]!.y - 0.08 };
    highBridgePose[24] = { ...highBridgePose[24]!, y: highBridgePose[24]!.y - 0.08 };
    const highBridgeDecision = resolveDecision(highBridgePose);
    const highCobraPose = makeMovementAvatarProofPose("prone-cobra").map((landmark) => ({ ...landmark }));
    [0, 7, 8, 11, 12].forEach((index) => {
      highCobraPose[index] = { ...highCobraPose[index]!, y: highCobraPose[index]!.y - 0.08 };
    });
    const highCobraDecision = resolveDecision(highCobraPose);
    const lowerBodyPitch = (
      decision: ReturnType<typeof resolveMovementAvatarStudioDecision>,
      bone: "rightLowerLeg" | "rightUpperLeg",
    ) => decision.supportPresentation.specs.find((spec) => spec.bone === bone)?.rotation.x ?? 0;
    const spinePitch = (
      decision: ReturnType<typeof resolveMovementAvatarStudioDecision>,
      bone: "chest" | "hips" | "spine" | "upperChest",
    ) => decision.supportPresentation.spineSpecs.find((spec) => spec.bone === bone)?.rotation.x ?? 0;
    const armPitch = (
      decision: ReturnType<typeof resolveMovementAvatarStudioDecision>,
      bone: "rightLowerArm" | "rightUpperArm",
    ) => decision.supportPresentation.armSpecs.find((spec) => spec.bone === bone)?.rotation.x ?? 0;

    expect(bridgeDecision.exercisePose.poseKey).toBe("pilates-bridge-prep");
    expect(bridgeDecision.supportPresentation.floorPose).toMatchObject({
      key: "bridge",
    });
    expect(bridgeDecision.supportPresentation.floorPose.bridgeLiftDepth).toBeGreaterThan(0);
    expect(highBridgeDecision.supportPresentation.floorPose.bridgeLiftDepth).toBeGreaterThan(
      bridgeDecision.supportPresentation.floorPose.bridgeLiftDepth,
    );
    expect(lowerBodyPitch(highBridgeDecision, "rightUpperLeg")).toBeGreaterThan(
      lowerBodyPitch(bridgeDecision, "rightUpperLeg"),
    );
    expect(lowerBodyPitch(highBridgeDecision, "rightLowerLeg")).toBeLessThan(
      lowerBodyPitch(bridgeDecision, "rightLowerLeg"),
    );
    expect(spinePitch(highBridgeDecision, "hips")).toBeLessThan(spinePitch(bridgeDecision, "hips"));
    expect(spinePitch(highBridgeDecision, "spine")).toBeLessThan(spinePitch(bridgeDecision, "spine"));
    expect(bridgeDecision.supportContactLocks.owner).toBe("support-contact-bridge-floor");
    expect(bridgeDecision.supportContactLocks.anchors.map((anchor) => anchor.bone)).toEqual([
      "spine",
      "chest",
      "leftFoot",
      "rightFoot",
    ]);
    expect(bridgeDecision.supportContactLocks.anchors.map((anchor) => anchor.bone)).not.toContain("hips");
    expect(bridgeDecision.supportContactLocks.rootCorrectionScale).toBeLessThan(0.88);

    expect(cobraDecision.exercisePose.poseKey).toBe("prone-back-extension-prep");
    expect(cobraDecision.supportPresentation.floorPose).toMatchObject({
      key: "proneExtension",
    });
    expect(cobraDecision.supportPresentation.floorPose.proneExtensionDepth).toBeGreaterThan(0);
    expect(highCobraDecision.supportPresentation.floorPose.proneExtensionDepth).toBeGreaterThan(
      cobraDecision.supportPresentation.floorPose.proneExtensionDepth,
    );
    expect(armPitch(highCobraDecision, "rightUpperArm")).toBeGreaterThan(
      armPitch(cobraDecision, "rightUpperArm"),
    );
    expect(armPitch(highCobraDecision, "rightLowerArm")).toBeLessThan(
      armPitch(cobraDecision, "rightLowerArm"),
    );
    expect(spinePitch(highCobraDecision, "spine")).toBeLessThan(spinePitch(cobraDecision, "spine"));
    expect(spinePitch(highCobraDecision, "chest")).toBeLessThan(spinePitch(cobraDecision, "chest"));
    expect(spinePitch(highCobraDecision, "upperChest")).toBeLessThan(
      spinePitch(cobraDecision, "upperChest"),
    );
    expect(cobraDecision.supportContactLocks.owner).toBe("support-contact-prone-extension-floor");
    expect(cobraDecision.supportContactLocks.anchors.map((anchor) => anchor.bone)).toEqual([
      "spine",
      "hips",
      "leftHand",
      "rightHand",
      "leftFoot",
      "rightFoot",
    ]);
    expect(cobraDecision.supportContactLocks.anchors.map((anchor) => anchor.bone)).not.toContain("chest");
    expect(cobraDecision.supportContactLocks.boneCorrectionScale).toBeLessThan(0.08);
  });

  it("scales Pilates hundred and side-lying leg lift presentation from source depth", () => {
    const resolveDecision = (poseLandmarks: TrackingLandmark[]) => (
      resolveMovementAvatarStudioDecision({
        avatarRole: "player",
        calibration: null,
        retargetSourceModel: null,
        source: { poseLandmarks },
      })
    );
    const hundredDecision = resolveDecision(makeMovementAvatarProofPose("pilates-hundred"));
    const highHundredPose = makeMovementAvatarProofPose("pilates-hundred").map((landmark) => ({ ...landmark }));
    [15, 16, 25, 26, 27, 28, 29, 30, 31, 32].forEach((index) => {
      highHundredPose[index] = { ...highHundredPose[index]!, y: highHundredPose[index]!.y - 0.06 };
    });
    const highHundredDecision = resolveDecision(highHundredPose);
    const singleLegStretchDecision = resolveDecision(makeMovementAvatarProofPose("pilates-single-leg-stretch"));
    const deadBugDecision = resolveDecision(makeMovementAvatarProofPose("pilates-dead-bug"));
    const hollowHoldDecision = resolveDecision(makeMovementAvatarProofPose("pilates-hollow-hold"));
    const doubleLegStretchDecision = resolveDecision(makeMovementAvatarProofPose("pilates-double-leg-stretch"));
    const sideLiftDecision = resolveDecision(makeMovementAvatarProofPose("side-lying-leg-lift"));
    const highSideLiftPose = makeMovementAvatarProofPose("side-lying-leg-lift").map((landmark) => ({ ...landmark }));
    [26, 28, 30, 32].forEach((index) => {
      highSideLiftPose[index] = { ...highSideLiftPose[index]!, y: highSideLiftPose[index]!.y - 0.07 };
    });
    const highSideLiftDecision = resolveDecision(highSideLiftPose);
    const clamDecision = resolveDecision(makeMovementAvatarProofPose("pilates-clam"));
    const swimmingDecision = resolveDecision(makeMovementAvatarProofPose("pilates-swimming"));
	    const legPitch = (
	      decision: ReturnType<typeof resolveMovementAvatarStudioDecision>,
	      bone: "leftUpperLeg" | "rightLowerLeg" | "rightUpperLeg",
	    ) => decision.supportPresentation.specs.find((spec) => spec.bone === bone)?.rotation.x ?? 0;
    const legSide = (
      decision: ReturnType<typeof resolveMovementAvatarStudioDecision>,
      bone: "rightUpperLeg",
    ) => decision.supportPresentation.specs.find((spec) => spec.bone === bone)?.rotation.y ?? 0;
	    const armPitch = (
	      decision: ReturnType<typeof resolveMovementAvatarStudioDecision>,
	      bone: "leftUpperArm" | "rightLowerArm" | "rightUpperArm",
	    ) => decision.supportPresentation.armSpecs.find((spec) => spec.bone === bone)?.rotation.x ?? 0;
    const spineRoll = (
      decision: ReturnType<typeof resolveMovementAvatarStudioDecision>,
      bone: "hips" | "spine",
    ) => decision.supportPresentation.spineSpecs.find((spec) => spec.bone === bone)?.rotation.z ?? 0;

    expect(hundredDecision.exercisePose.poseKey).toBe("pilates-hundred-prep");
    expect(hundredDecision.supportPresentation.floorPose.key).toBe("pilatesHundred");
    expect(hundredDecision.supportPresentation.floorPose.pilatesHundredDepth).toBeGreaterThan(0);
    expect(highHundredDecision.supportPresentation.floorPose.pilatesHundredDepth).toBeGreaterThan(
      hundredDecision.supportPresentation.floorPose.pilatesHundredDepth,
    );
    expect(legPitch(highHundredDecision, "rightUpperLeg")).toBeGreaterThan(
      legPitch(hundredDecision, "rightUpperLeg"),
    );
    expect(legPitch(highHundredDecision, "rightLowerLeg")).toBeLessThan(
      legPitch(hundredDecision, "rightLowerLeg"),
    );
    expect(armPitch(highHundredDecision, "rightUpperArm")).toBeGreaterThan(
      armPitch(hundredDecision, "rightUpperArm"),
    );

    expect(singleLegStretchDecision.exercisePose.poseKey).toBe("pilates-single-leg-stretch-prep");
    expect(singleLegStretchDecision.supportPresentation.owner).toBe("support-presentation-single-leg-stretch");
    expect(singleLegStretchDecision.supportPresentation.floorPose.key).toBe("pilatesSingleLegStretch");
    expect(singleLegStretchDecision.supportPresentation.floorPose.pilatesSingleLegStretchDepth).toBeGreaterThan(0);
    expect(legPitch(singleLegStretchDecision, "leftUpperLeg")).toBeGreaterThan(
      legPitch(singleLegStretchDecision, "rightUpperLeg"),
    );

    expect(deadBugDecision.exercisePose.poseKey).toBe("pilates-dead-bug-prep");
    expect(deadBugDecision.supportPresentation.owner).toBe("support-presentation-dead-bug");
    expect(deadBugDecision.supportPresentation.floorPose.key).toBe("pilatesDeadBug");
    expect(deadBugDecision.supportPresentation.floorPose.pilatesDeadBugDepth).toBeGreaterThan(0);
    expect(armPitch(deadBugDecision, "leftUpperArm")).toBeLessThan(armPitch(deadBugDecision, "rightUpperArm"));
    expect(legPitch(deadBugDecision, "rightUpperLeg")).toBeGreaterThan(
      legPitch(deadBugDecision, "leftUpperLeg"),
    );

    expect(hollowHoldDecision.exercisePose.poseKey).toBe("pilates-hollow-hold-prep");
    expect(hollowHoldDecision.supportPresentation.owner).toBe("support-presentation-hollow-hold");
    expect(hollowHoldDecision.supportPresentation.floorPose.key).toBe("pilatesHollowHold");
    expect(hollowHoldDecision.supportPresentation.floorPose.pilatesHollowHoldDepth).toBeGreaterThan(0);
    expect(legPitch(hollowHoldDecision, "rightUpperLeg")).toBeGreaterThan(0.25);

    expect(doubleLegStretchDecision.exercisePose.poseKey).toBe("pilates-double-leg-stretch-prep");
    expect(doubleLegStretchDecision.supportPresentation.owner).toBe("support-presentation-double-leg-stretch");
    expect(doubleLegStretchDecision.supportPresentation.floorPose.key).toBe("pilatesDoubleLegStretch");
    expect(doubleLegStretchDecision.supportPresentation.floorPose.pilatesDoubleLegStretchDepth).toBeGreaterThan(0);
    expect(legPitch(doubleLegStretchDecision, "rightUpperLeg")).toBeGreaterThan(0.4);

    expect(sideLiftDecision.exercisePose.poseKey).toBe("pilates-side-lying-leg-lift");
    expect(sideLiftDecision.supportPresentation.floorPose.key).toBe("sideLegLift");
    expect(sideLiftDecision.supportPresentation.floorPose.sideLegLiftDepth).toBeGreaterThan(0);
    expect(highSideLiftDecision.supportPresentation.floorPose.sideLegLiftDepth).toBeGreaterThan(
      sideLiftDecision.supportPresentation.floorPose.sideLegLiftDepth,
    );
    expect(legPitch(highSideLiftDecision, "rightUpperLeg")).toBeLessThan(
      legPitch(sideLiftDecision, "rightUpperLeg"),
    );
    expect(legPitch(highSideLiftDecision, "rightLowerLeg")).toBeGreaterThan(
      legPitch(sideLiftDecision, "rightLowerLeg"),
    );
    expect(legSide(highSideLiftDecision, "rightUpperLeg")).toBeLessThan(
      legSide(sideLiftDecision, "rightUpperLeg"),
    );
    expect(spineRoll(highSideLiftDecision, "hips")).toBeGreaterThan(
      spineRoll(sideLiftDecision, "hips"),
    );
    expect(spineRoll(highSideLiftDecision, "spine")).toBeGreaterThan(
      spineRoll(sideLiftDecision, "spine"),
    );

    expect(clamDecision.exercisePose.poseKey).toBe("pilates-clam-prep");
    expect(clamDecision.supportPresentation.owner).toBe("support-presentation-clam-prep");
    expect(clamDecision.supportPresentation.floorPose.key).toBe("pilatesClam");
    expect(clamDecision.supportPresentation.floorPose.pilatesClamDepth).toBeGreaterThan(0);

    expect(swimmingDecision.exercisePose.poseKey).toBe("pilates-swimming-prep");
    expect(swimmingDecision.supportPresentation.owner).toBe("support-presentation-swimming-prep");
    expect(swimmingDecision.supportPresentation.floorPose.key).toBe("pilatesSwimming");
    expect(swimmingDecision.supportPresentation.floorPose.pilatesSwimmingDepth).toBeGreaterThan(0);
    expect(armPitch(swimmingDecision, "leftUpperArm")).toBeGreaterThan(
      armPitch(swimmingDecision, "rightUpperArm"),
    );
  });

  it("scales yoga and bear-crawl floor presentation from source shape", () => {
    const resolveDecision = (poseLandmarks: TrackingLandmark[]) => (
      resolveMovementAvatarStudioDecision({
        avatarRole: "player",
        calibration: null,
        retargetSourceModel: null,
        source: { poseLandmarks },
      })
    );
    const plankDecision = resolveDecision(makeMovementAvatarProofPose("yoga-plank"));
    const downDogDecision = resolveDecision(makeMovementAvatarProofPose("yoga-down-dog"));
    const shallowDownDogPose = makeMovementAvatarProofPose("yoga-down-dog").map((landmark) => ({ ...landmark }));
    [23, 24].forEach((index) => {
      shallowDownDogPose[index] = { ...shallowDownDogPose[index]!, y: shallowDownDogPose[index]!.y + 0.08 };
    });
    const shallowDownDogDecision = resolveDecision(shallowDownDogPose);
    const bearDecision = resolveDecision(makeMovementAvatarProofPose("bear-crawl"));
    const highBearPose = makeMovementAvatarProofPose("bear-crawl").map((landmark) => ({ ...landmark }));
    [25, 26].forEach((index) => {
      highBearPose[index] = { ...highBearPose[index]!, y: highBearPose[index]!.y - 0.08 };
    });
    const highBearDecision = resolveDecision(highBearPose);
    const childDecision = resolveDecision(makeMovementAvatarProofPose("yoga-child-pose"));
    const deepChildPose = makeMovementAvatarProofPose("yoga-child-pose").map((landmark) => ({ ...landmark }));
    deepChildPose[0] = { ...deepChildPose[0]!, y: deepChildPose[0]!.y + 0.08 };
    const deepChildDecision = resolveDecision(deepChildPose);
    const catDecision = resolveDecision(makeMovementAvatarProofPose("yoga-cat"));
    const deepCatPose = makeMovementAvatarProofPose("yoga-cat").map((landmark) => ({ ...landmark }));
    deepCatPose[0] = { ...deepCatPose[0]!, y: deepCatPose[0]!.y + 0.08 };
    const deepCatDecision = resolveDecision(deepCatPose);
    const cowDecision = resolveDecision(makeMovementAvatarProofPose("yoga-cow"));
    const armPitch = (
      decision: ReturnType<typeof resolveMovementAvatarStudioDecision>,
      bone: "rightLowerArm" | "rightUpperArm",
    ) => decision.supportPresentation.armSpecs.find((spec) => spec.bone === bone)?.rotation.x ?? 0;
    const legPitch = (
      decision: ReturnType<typeof resolveMovementAvatarStudioDecision>,
      bone: "rightLowerLeg" | "rightUpperLeg",
    ) => decision.supportPresentation.specs.find((spec) => spec.bone === bone)?.rotation.x ?? 0;
    const spinePitch = (
      decision: ReturnType<typeof resolveMovementAvatarStudioDecision>,
      bone: "chest" | "hips" | "spine",
    ) => decision.supportPresentation.spineSpecs.find((spec) => spec.bone === bone)?.rotation.x ?? 0;

    expect(plankDecision.exercisePose.poseKey).toBe("yoga-plank-prep");
    expect(plankDecision.supportPresentation.floorPose.key).toBe("plank");
    expect(plankDecision.supportPresentation.floorPose.plankLineDepth).toBeGreaterThan(0.8);

    expect(downDogDecision.exercisePose.poseKey).toBe("yoga-down-dog-prep");
    expect(downDogDecision.supportPresentation.floorPose.key).toBe("downDog");
    expect(downDogDecision.supportPresentation.floorPose.downDogPikeDepth).toBeGreaterThan(
      shallowDownDogDecision.supportPresentation.floorPose.downDogPikeDepth,
    );
    expect(armPitch(downDogDecision, "rightUpperArm")).toBeGreaterThan(
      armPitch(shallowDownDogDecision, "rightUpperArm"),
    );
    expect(legPitch(downDogDecision, "rightUpperLeg")).toBeLessThan(
      legPitch(shallowDownDogDecision, "rightUpperLeg"),
    );
    expect(spinePitch(downDogDecision, "hips")).toBeLessThan(spinePitch(shallowDownDogDecision, "hips"));

    expect(bearDecision.exercisePose.poseKey).toBe("bear-crawl-prep");
    expect(bearDecision.supportPresentation.floorPose.key).toBe("bearCrawl");
    expect(highBearDecision.supportPresentation.floorPose.bearCrawlDepth).toBeGreaterThan(
      bearDecision.supportPresentation.floorPose.bearCrawlDepth,
    );
    expect(legPitch(highBearDecision, "rightUpperLeg")).toBeGreaterThan(
      legPitch(bearDecision, "rightUpperLeg"),
    );
    expect(legPitch(highBearDecision, "rightLowerLeg")).toBeLessThan(
      legPitch(bearDecision, "rightLowerLeg"),
    );

    expect(childDecision.exercisePose.poseKey).toBe("yoga-child-pose-prep");
    expect(childDecision.supportPresentation.floorPose.key).toBe("childPose");
    expect(deepChildDecision.exercisePose.poseKey).toBe("yoga-child-pose-prep");
    expect(deepChildDecision.supportPresentation.floorPose.key).toBe("childPose");
    expect(deepChildDecision.supportPresentation.floorPose.childFoldDepth).toBeGreaterThan(
      childDecision.supportPresentation.floorPose.childFoldDepth,
    );
    expect(legPitch(deepChildDecision, "rightUpperLeg")).toBeGreaterThan(
      legPitch(childDecision, "rightUpperLeg"),
    );
    expect(legPitch(deepChildDecision, "rightLowerLeg")).toBeLessThan(
      legPitch(childDecision, "rightLowerLeg"),
    );
    expect(spinePitch(deepChildDecision, "spine")).toBeGreaterThan(spinePitch(childDecision, "spine"));
    expect(spinePitch(deepChildDecision, "chest")).toBeGreaterThan(spinePitch(childDecision, "chest"));

    expect(catDecision.exercisePose.poseKey).toBe("yoga-cat-prep");
    expect(catDecision.supportPresentation.owner).toBe("support-presentation-yoga-cat");
    expect(catDecision.supportPresentation.floorPose.key).toBe("cat");
    expect(deepCatDecision.supportPresentation.floorPose.catDepth).toBeGreaterThan(
      catDecision.supportPresentation.floorPose.catDepth,
    );
    expect(cowDecision.exercisePose.poseKey).toBe("yoga-cow-prep");
    expect(cowDecision.supportPresentation.owner).toBe("support-presentation-yoga-cow");
    expect(cowDecision.supportPresentation.floorPose.key).toBe("cow");
    expect(cowDecision.supportPresentation.floorPose.cowDepth).toBeGreaterThan(0);
    expect(spinePitch(catDecision, "spine")).toBeGreaterThan(spinePitch(cowDecision, "spine"));
  });

  it("presents standing yoga proof poses with source-derived shape", () => {
    const resolveDecision = (poseLandmarks: TrackingLandmark[]) => (
      resolveMovementAvatarStudioDecision({
        avatarRole: "player",
        calibration: null,
        retargetSourceModel: null,
        source: { poseLandmarks },
      })
    );
    const forwardFoldDecision = resolveDecision(makeMovementAvatarProofPose("yoga-forward-fold"));
    const halfLiftDecision = resolveDecision(makeMovementAvatarProofPose("yoga-half-lift"));
    const deepFoldPose = makeMovementAvatarProofPose("yoga-forward-fold").map((landmark) => ({ ...landmark }));
    [0, 15, 16].forEach((index) => {
      deepFoldPose[index] = { ...deepFoldPose[index]!, y: deepFoldPose[index]!.y + 0.06 };
    });
    const deepFoldDecision = resolveDecision(deepFoldPose);
    const chairDecision = resolveDecision(makeMovementAvatarProofPose("yoga-chair"));
    const warriorOneDecision = resolveDecision(makeMovementAvatarProofPose("yoga-warrior-one"));
    const warriorDecision = resolveDecision(makeMovementAvatarProofPose("yoga-warrior-two"));
    const triangleDecision = resolveDecision(makeMovementAvatarProofPose("yoga-triangle"));
    const treeDecision = resolveDecision(makeMovementAvatarProofPose("yoga-tree"));
    const legPitch = (
      decision: ReturnType<typeof resolveMovementAvatarStudioDecision>,
      bone: "leftUpperLeg" | "rightUpperLeg",
    ) => decision.supportPresentation.specs.find((spec) => spec.bone === bone)?.rotation.x ?? 0;
    const armSide = (
      decision: ReturnType<typeof resolveMovementAvatarStudioDecision>,
      bone: "leftUpperArm" | "rightUpperArm",
    ) => decision.supportPresentation.armSpecs.find((spec) => spec.bone === bone)?.rotation.z ?? 0;
    const spinePitch = (
      decision: ReturnType<typeof resolveMovementAvatarStudioDecision>,
      bone: "chest" | "hips" | "spine",
    ) => decision.supportPresentation.spineSpecs.find((spec) => spec.bone === bone)?.rotation.x ?? 0;

    expect(forwardFoldDecision.exercisePose.poseKey).toBe("yoga-forward-fold-prep");
    expect(forwardFoldDecision.supportPresentation.owner).toBe("support-presentation-yoga-forward-fold");
    expect(forwardFoldDecision.supportPresentation.standingPose.key).toBe("forwardFold");
    expect(forwardFoldDecision.supportPresentation.standingPose.foldDepth).toBeGreaterThan(0);
    expect(deepFoldDecision.supportPresentation.standingPose.foldDepth).toBeGreaterThan(
      forwardFoldDecision.supportPresentation.standingPose.foldDepth,
    );
    expect(spinePitch(deepFoldDecision, "spine")).toBeGreaterThan(spinePitch(forwardFoldDecision, "spine"));

    expect(halfLiftDecision.exercisePose.poseKey).toBe("yoga-half-lift-prep");
    expect(halfLiftDecision.supportPresentation.owner).toBe("support-presentation-yoga-half-lift");
    expect(halfLiftDecision.supportPresentation.standingPose.key).toBe("halfLift");
    expect(halfLiftDecision.supportPresentation.standingPose.halfLiftDepth).toBeGreaterThan(0);
    expect(spinePitch(forwardFoldDecision, "spine")).toBeGreaterThan(spinePitch(halfLiftDecision, "spine"));

    expect(chairDecision.exercisePose.poseKey).toBe("yoga-chair-prep");
    expect(chairDecision.supportPresentation.owner).toBe("support-presentation-yoga-chair");
    expect(chairDecision.supportPresentation.standingPose.key).toBe("chair");
    expect(chairDecision.supportPresentation.standingPose.chairDepth).toBeGreaterThan(0);
    expect(legPitch(chairDecision, "rightUpperLeg")).toBeGreaterThan(0.7);

    expect(warriorOneDecision.exercisePose.poseKey).toBe("yoga-warrior-one-prep");
    expect(warriorOneDecision.supportPresentation.owner).toBe("support-presentation-yoga-warrior-one");
    expect(warriorOneDecision.supportPresentation.standingPose.key).toBe("warriorOne");
    expect(warriorOneDecision.supportPresentation.standingPose.warriorOneDepth).toBeGreaterThan(0);
    expect(legPitch(warriorOneDecision, "rightUpperLeg")).toBeGreaterThan(0.3);

    expect(warriorDecision.exercisePose.poseKey).toBe("yoga-warrior-two-prep");
    expect(warriorDecision.supportPresentation.owner).toBe("support-presentation-yoga-warrior-two");
    expect(warriorDecision.supportPresentation.standingPose.warriorDepth).toBeGreaterThan(0);
    expect(armSide(warriorDecision, "rightUpperArm")).toBeLessThan(-0.8);
    expect(armSide(warriorDecision, "leftUpperArm")).toBeGreaterThan(0.8);

    expect(triangleDecision.exercisePose.poseKey).toBe("yoga-triangle-prep");
    expect(triangleDecision.supportPresentation.owner).toBe("support-presentation-yoga-triangle");
    expect(triangleDecision.supportPresentation.standingPose.triangleDepth).toBeGreaterThan(0);
    expect(triangleDecision.supportPresentation.spineSpecs.some((spec) => Math.abs(spec.rotation.z) > 0.2)).toBe(true);

    expect(treeDecision.exercisePose.poseKey).toBe("yoga-tree-prep");
    expect(treeDecision.supportPresentation.owner).toBe("support-presentation-yoga-tree");
    expect(treeDecision.supportPresentation.standingPose.treeDepth).toBeGreaterThan(0);
    expect(legPitch(treeDecision, "leftUpperLeg")).toBeGreaterThan(0.8);
  });

  it("presents upright athletic proof poses with source-derived shape", () => {
    const resolveDecision = (poseLandmarks: TrackingLandmark[]) => (
      resolveMovementAvatarStudioDecision({
        avatarRole: "player",
        calibration: null,
        retargetSourceModel: null,
        source: { poseLandmarks },
      })
    );
    const forwardLungeDecision = resolveDecision(makeMovementAvatarProofPose("forward-lunge"));
    const sideLungeDecision = resolveDecision(makeMovementAvatarProofPose("side-lunge"));
    const jumpingJackDecision = resolveDecision(makeMovementAvatarProofPose("jumping-jack"));
    const armRaiseDecision = resolveDecision(makeMovementAvatarProofPose("standing-arm-raise"));
    const standingTwistDecision = resolveDecision(makeMovementAvatarProofPose("standing-twist"));
    const legPitch = (
      decision: ReturnType<typeof resolveMovementAvatarStudioDecision>,
      bone: "leftUpperLeg" | "rightUpperLeg",
    ) => decision.supportPresentation.specs.find((spec) => spec.bone === bone)?.rotation.x ?? 0;
    const legSide = (
      decision: ReturnType<typeof resolveMovementAvatarStudioDecision>,
      bone: "leftUpperLeg" | "rightUpperLeg",
    ) => decision.supportPresentation.specs.find((spec) => spec.bone === bone)?.rotation.z ?? 0;
    const armPitch = (
      decision: ReturnType<typeof resolveMovementAvatarStudioDecision>,
      bone: "leftUpperArm" | "rightUpperArm",
    ) => decision.supportPresentation.armSpecs.find((spec) => spec.bone === bone)?.rotation.x ?? 0;
    const spineTwist = (
      decision: ReturnType<typeof resolveMovementAvatarStudioDecision>,
      bone: "chest" | "spine",
    ) => decision.supportPresentation.spineSpecs.find((spec) => spec.bone === bone)?.rotation.y ?? 0;

    expect(forwardLungeDecision.exercisePose.poseKey).toBe("forward-lunge-prep");
    expect(forwardLungeDecision.supportPresentation.owner).toBe("support-presentation-forward-lunge");
    expect(forwardLungeDecision.supportPresentation.standingPose.key).toBe("forwardLunge");
    expect(forwardLungeDecision.supportPresentation.standingPose.forwardLungeDepth).toBeGreaterThan(0);
    expect(legPitch(forwardLungeDecision, "rightUpperLeg")).toBeGreaterThan(
      legPitch(forwardLungeDecision, "leftUpperLeg"),
    );

    expect(sideLungeDecision.exercisePose.poseKey).toBe("side-lunge-prep");
    expect(sideLungeDecision.supportPresentation.owner).toBe("support-presentation-side-lunge");
    expect(sideLungeDecision.supportPresentation.standingPose.key).toBe("sideLunge");
    expect(sideLungeDecision.supportPresentation.standingPose.sideLungeDepth).toBeGreaterThan(0);
    expect(legSide(sideLungeDecision, "rightUpperLeg")).toBeLessThan(legSide(sideLungeDecision, "leftUpperLeg"));

    expect(jumpingJackDecision.exercisePose.poseKey).toBe("jumping-jack-prep");
    expect(jumpingJackDecision.supportPresentation.owner).toBe("support-presentation-jumping-jack-prep");
    expect(jumpingJackDecision.supportPresentation.standingPose.key).toBe("jumpingJack");
    expect(jumpingJackDecision.supportPresentation.standingPose.jumpingJackDepth).toBeGreaterThan(0);
    expect(armPitch(jumpingJackDecision, "rightUpperArm")).toBeLessThan(-0.45);
    expect(legSide(jumpingJackDecision, "rightUpperLeg")).toBeLessThan(-0.25);
    expect(legSide(jumpingJackDecision, "leftUpperLeg")).toBeGreaterThan(0.25);

    expect(armRaiseDecision.exercisePose.poseKey).toBe("standing-arm-raise");
    expect(armRaiseDecision.supportPresentation.owner).toBe("support-presentation-standing-arm-raise");
    expect(armRaiseDecision.supportPresentation.standingPose.key).toBe("armRaise");
    expect(armRaiseDecision.supportPresentation.standingPose.armRaiseDepth).toBeGreaterThan(0);
    expect(armPitch(armRaiseDecision, "rightUpperArm")).toBeLessThan(-0.5);

    expect(standingTwistDecision.exercisePose.poseKey).toBe("standing-twist");
    expect(standingTwistDecision.supportPresentation.owner).toBe("support-presentation-standing-twist");
    expect(standingTwistDecision.supportPresentation.standingPose.key).toBe("standingTwist");
    expect(standingTwistDecision.supportPresentation.standingPose.twistDepth).toBeGreaterThan(0);
    expect(spineTwist(standingTwistDecision, "chest")).toBeGreaterThan(
      spineTwist(standingTwistDecision, "spine"),
    );
  });

  it("holds a recent player leg raise through a weak neutral frame", () => {
    const active = resolveMovementAvatarPlayerLegRaiseHold({
      avatarRole: "player",
      lowerBodyDrive: {
        ...neutralLowerBodyDrive,
        playerLegRaiseDepth: 0.72,
        playerLegRaiseSide: "left",
        playerLowerBodyState: "left-leg-raise",
        shouldApplyLowerBody: true,
        shouldApplySolverTorso: true,
        shouldDrivePlayerLegRaise: true,
      },
      now: 1000,
      previousState: {
        depth: 0,
        expiresAt: 0,
        side: null,
      },
    });
    const held = resolveMovementAvatarPlayerLegRaiseHold({
      avatarRole: "player",
      lowerBodyDrive: neutralLowerBodyDrive,
      now: 1800,
      previousState: active.state,
    });

    expect(held.wasHeld).toBe(true);
    expect(held.lowerBodyDrive.shouldDrivePlayerLegRaise).toBe(true);
    expect(held.lowerBodyDrive.playerLegRaiseSide).toBe("left");
    expect(held.lowerBodyDrive.playerLegRaiseDepth).toBeCloseTo(0.72);
  });

  it("smooths noisy player leg raise depth instead of snapping the knee downward", () => {
    const active = resolveMovementAvatarPlayerLegRaiseHold({
      avatarRole: "player",
      lowerBodyDrive: {
        ...neutralLowerBodyDrive,
        playerLegRaiseDepth: 0.4,
        playerLegRaiseSide: "left",
        playerLowerBodyState: "left-leg-raise",
        shouldApplyLowerBody: true,
        shouldApplySolverTorso: true,
        shouldDrivePlayerLegRaise: true,
      },
      now: 1160,
      previousState: {
        depth: 0.72,
        expiresAt: 2400,
        side: "left",
      },
    });

    expect(active.lowerBodyDrive.playerLegRaiseDepth).toBeGreaterThan(0.6);
    expect(active.lowerBodyDrive.playerLegRaiseDepth).toBeLessThan(0.72);
    expect(active.state.depth).toBeCloseTo(active.lowerBodyDrive.playerLegRaiseDepth);
  });

  it("lets player leg raise depth rise responsively while still smoothing", () => {
    const active = resolveMovementAvatarPlayerLegRaiseHold({
      avatarRole: "player",
      lowerBodyDrive: {
        ...neutralLowerBodyDrive,
        playerLegRaiseDepth: 0.72,
        playerLegRaiseSide: "left",
        playerLowerBodyState: "left-leg-raise",
        shouldApplyLowerBody: true,
        shouldApplySolverTorso: true,
        shouldDrivePlayerLegRaise: true,
      },
      now: 1160,
      previousState: {
        depth: 0.4,
        expiresAt: 2400,
        side: "left",
      },
    });

    expect(active.lowerBodyDrive.playerLegRaiseDepth).toBeGreaterThan(0.55);
    expect(active.lowerBodyDrive.playerLegRaiseDepth).toBeLessThan(0.72);
  });

  it("releases a held player leg raise after the grace window expires", () => {
    const held = resolveMovementAvatarPlayerLegRaiseHold({
      avatarRole: "player",
      lowerBodyDrive: neutralLowerBodyDrive,
      now: 3000,
      previousState: {
        depth: 0.72,
        expiresAt: 2400,
        side: "left",
      },
    });

    expect(held.wasHeld).toBe(false);
    expect(held.lowerBodyDrive.shouldDrivePlayerLegRaise).toBe(false);
    expect(held.state.side).toBeNull();
  });
});
