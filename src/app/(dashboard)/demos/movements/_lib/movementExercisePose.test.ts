import { describe, expect, it } from "vitest";
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
import { resolveMovementExercisePose } from "./movementExercisePose";
import { resolveMovementSupportContacts } from "./movementSupportContact";
import type { TrackingLandmark } from "./movementTrackingCalibration";

function exercisePoseFor(poseLandmarks: TrackingLandmark[]) {
  const bodyOrientation = classifyMovementBodyOrientation(poseLandmarks);
  const bodySupport = resolveMovementSupportContacts({
    bodyOrientation,
    poseLandmarks,
  });

  return resolveMovementExercisePose({
    bodyOrientation,
    bodySupport,
    poseLandmarks,
  });
}

describe("movementExercisePose", () => {
  it("labels upright standing as supported standing neutral", () => {
    const pose = exercisePoseFor(makeMovementAvatarProofPose("standing"));

    expect(pose.poseKey).toBe("standing-neutral");
    expect(pose.status).toBe("supported");
    expect(pose.toleranceBand).toBe("strict");
    expect(pose.qualityScore).toBeGreaterThanOrEqual(80);
    expect(pose.qualityCue).toBe("Ready for strict posture matching.");
    expect(pose.programLabels).toContain("Mountain-pose baseline");
  });

  it("labels seated and kneeling postures for chair and floor mobility", () => {
    const seated = exercisePoseFor(seatedPoseFixture());
    const kneeling = exercisePoseFor(kneelingPoseFixture());

    expect(seated.poseKey).toBe("chair-seated");
    expect(seated.coverageFamilies).toContain("props-contact");
    expect(seated.toleranceBand).toBe("diagnostic");
    expect(seated.qualityScore).toBeGreaterThan(45);
    expect(seated.programLabels).toContain("Chair seated posture");
    expect(kneeling.poseKey).toBe("kneeling-floor");
    expect(kneeling.disciplines).toContain("yoga");
    expect(kneeling.programLabels).toContain("Yoga hero-pose setup");
  });

  it("labels relative seated hinge geometry as forward fold without requiring low-screen shoulders", () => {
    const pose = exercisePoseFor(movementOrientationPoseWith({
      0: movementAvatarProofLandmark(0.5, 0.57),
      7: movementAvatarProofLandmark(0.46, 0.55),
      8: movementAvatarProofLandmark(0.54, 0.55),
      11: movementAvatarProofLandmark(0.39, 0.49),
      12: movementAvatarProofLandmark(0.61, 0.49),
      15: movementAvatarProofLandmark(0.35, 0.64),
      16: movementAvatarProofLandmark(0.65, 0.64),
      23: movementAvatarProofLandmark(0.43, 0.66),
      24: movementAvatarProofLandmark(0.57, 0.66),
      25: movementAvatarProofLandmark(0.31, 0.7),
      26: movementAvatarProofLandmark(0.69, 0.7),
      27: movementAvatarProofLandmark(0.3, 0.9),
      28: movementAvatarProofLandmark(0.7, 0.9),
    }));

    expect(pose.poseKey).toBe("seated-forward-fold");
    expect(pose.programLabels).toContain("Seated forward fold");
  });

  it("labels frontal seated leg-extension geometry as seated leg lift", () => {
    const pose = exercisePoseFor(movementOrientationPoseWith({
      0: movementAvatarProofLandmark(0.43, 0.08, -0.38),
      7: movementAvatarProofLandmark(0.39, 0.1, -0.25),
      8: movementAvatarProofLandmark(0.47, 0.1, -0.25),
      11: movementAvatarProofLandmark(0.36, 0.21, -0.06),
      12: movementAvatarProofLandmark(0.51, 0.21, -0.06),
      23: movementAvatarProofLandmark(0.51, 0.47, -0.01),
      24: movementAvatarProofLandmark(0.42, 0.5, 0.01),
      25: movementAvatarProofLandmark(0.52, 0.49, -0.5),
      26: movementAvatarProofLandmark(0.44, 0.74, -0.04),
      27: movementAvatarProofLandmark(0.51, 0.75, -0.28),
      28: movementAvatarProofLandmark(0.45, 0.93, 0.16),
    }));

    expect(pose.poseKey).toBe("seated-leg-lift");
    expect(pose.coverageFamilies).toContain("sitting");
    expect(pose.programLabels).toContain("Chair knee extension");
  });

  it("labels quadruped as yoga tabletop and Pilates all-fours", () => {
    const pose = exercisePoseFor(quadrupedPoseFixture());

    expect(pose.poseKey).toBe("tabletop-all-fours");
    expect(pose.coverageFamilies).toEqual(["quadruped", "yoga", "pilates"]);
    expect(pose.programLabels).toEqual(["Yoga tabletop", "Pilates all-fours"]);
  });

  it("labels side-lying, supine, and prone mat-work families", () => {
    const sideLying = exercisePoseFor(sideLyingPoseFixture());
    const supine = exercisePoseFor(supinePoseFixture());
    const prone = exercisePoseFor(pronePoseFixture());

    expect(sideLying.poseKey).toBe("side-lying-mat");
    expect(sideLying.programLabels).toContain("Pilates side-lying series");
    expect(supine.poseKey).toBe("supine-mat");
    expect(supine.programLabels).toContain("Yoga savasana candidate");
    expect(prone.poseKey).toBe("prone-mat");
    expect(prone.programLabels).toContain("Pilates prone mat work");
  });

  it("labels concrete yoga and Pilates mat-work variants", () => {
    const halfLift = exercisePoseFor(makeMovementAvatarProofPose("yoga-half-lift"));
    const armRaise = exercisePoseFor(makeMovementAvatarProofPose("standing-arm-raise"));
    const standingTwist = exercisePoseFor(makeMovementAvatarProofPose("standing-twist"));
    const forwardFold = exercisePoseFor(makeMovementAvatarProofPose("yoga-forward-fold"));
    const chair = exercisePoseFor(makeMovementAvatarProofPose("yoga-chair"));
    const warriorOne = exercisePoseFor(makeMovementAvatarProofPose("yoga-warrior-one"));
    const warriorTwo = exercisePoseFor(makeMovementAvatarProofPose("yoga-warrior-two"));
    const triangle = exercisePoseFor(makeMovementAvatarProofPose("yoga-triangle"));
    const tree = exercisePoseFor(makeMovementAvatarProofPose("yoga-tree"));
    const birdDog = exercisePoseFor(makeMovementAvatarProofPose("quadruped-bird-dog"));
    const bearCrawl = exercisePoseFor(makeMovementAvatarProofPose("bear-crawl"));
    const childPose = exercisePoseFor(makeMovementAvatarProofPose("yoga-child-pose"));
    const cat = exercisePoseFor(makeMovementAvatarProofPose("yoga-cat"));
    const cow = exercisePoseFor(makeMovementAvatarProofPose("yoga-cow"));
    const plank = exercisePoseFor(makeMovementAvatarProofPose("yoga-plank"));
    const downDog = exercisePoseFor(makeMovementAvatarProofPose("yoga-down-dog"));
    const seatedTwist = exercisePoseFor(makeMovementAvatarProofPose("seated-twist"));
    const seatedForwardFold = exercisePoseFor(makeMovementAvatarProofPose("seated-forward-fold"));
    const seatedLegLift = exercisePoseFor(makeMovementAvatarProofPose("seated-leg-lift"));
    const halfKneel = exercisePoseFor(makeMovementAvatarProofPose("half-kneeling"));
    const lowLunge = exercisePoseFor(makeMovementAvatarProofPose("low-lunge"));
    const forwardLunge = exercisePoseFor(makeMovementAvatarProofPose("forward-lunge"));
    const sideLunge = exercisePoseFor(makeMovementAvatarProofPose("side-lunge"));
    const jumpingJack = exercisePoseFor(makeMovementAvatarProofPose("jumping-jack"));
    const sideLegLift = exercisePoseFor(makeMovementAvatarProofPose("side-lying-leg-lift"));
    const clam = exercisePoseFor(makeMovementAvatarProofPose("pilates-clam"));
    const singleLegStretch = exercisePoseFor(makeMovementAvatarProofPose("pilates-single-leg-stretch"));
    const deadBug = exercisePoseFor(makeMovementAvatarProofPose("pilates-dead-bug"));
    const hollowHold = exercisePoseFor(makeMovementAvatarProofPose("pilates-hollow-hold"));
    const doubleLegStretch = exercisePoseFor(makeMovementAvatarProofPose("pilates-double-leg-stretch"));
    const hundred = exercisePoseFor(makeMovementAvatarProofPose("pilates-hundred"));
    const bridge = exercisePoseFor(makeMovementAvatarProofPose("supine-bridge"));
    const cobra = exercisePoseFor(makeMovementAvatarProofPose("prone-cobra"));
    const swimming = exercisePoseFor(makeMovementAvatarProofPose("pilates-swimming"));

    expect(halfLift.poseKey).toBe("yoga-half-lift-prep");
    expect(halfLift.programLabels).toContain("Yoga half lift prep");
    expect(armRaise.poseKey).toBe("standing-arm-raise");
    expect(armRaise.coverageFamilies).toContain("upper-body-standing");
    expect(standingTwist.poseKey).toBe("standing-twist");
    expect(standingTwist.programLabels).toContain("Standing spinal twist");
    expect(forwardFold.poseKey).toBe("yoga-forward-fold-prep");
    expect(forwardFold.programLabels).toContain("Yoga forward fold prep");
    expect(chair.poseKey).toBe("yoga-chair-prep");
    expect(chair.coverageFamilies).toContain("squat-knee-lift");
    expect(warriorOne.poseKey).toBe("yoga-warrior-one-prep");
    expect(warriorOne.programLabels).toContain("Yoga warrior I prep");
    expect(warriorTwo.poseKey).toBe("yoga-warrior-two-prep");
    expect(warriorTwo.programLabels).toContain("Yoga warrior II prep");
    expect(triangle.poseKey).toBe("yoga-triangle-prep");
    expect(triangle.coverageFamilies).toContain("upper-body-standing");
    expect(tree.poseKey).toBe("yoga-tree-prep");
    expect(tree.programLabels).toContain("Standing balance");
    expect(birdDog.poseKey).toBe("quadruped-bird-dog-prep");
    expect(birdDog.programLabels).toContain("Yoga bird-dog prep");
    expect(bearCrawl.poseKey).toBe("bear-crawl-prep");
    expect(bearCrawl.coverageFamilies).toContain("rolling-crawling");
    expect(childPose.poseKey).toBe("yoga-child-pose-prep");
    expect(childPose.programLabels).toContain("Yoga child pose prep");
    expect(cat.poseKey).toBe("yoga-cat-prep");
    expect(cat.programLabels).toContain("Yoga cat prep");
    expect(cow.poseKey).toBe("yoga-cow-prep");
    expect(cow.programLabels).toContain("Yoga cow prep");
    expect(plank.poseKey).toBe("yoga-plank-prep");
    expect(plank.programLabels).toContain("Pilates plank setup");
    expect(plank.toleranceBand).toBe("diagnostic");
    expect(plank.qualityCue).toContain("diagnostic tolerances");
    expect(downDog.poseKey).toBe("yoga-down-dog-prep");
    expect(downDog.programLabels).toContain("Yoga downward-dog prep");
    expect(seatedTwist.poseKey).toBe("seated-twist");
    expect(seatedTwist.programLabels).toContain("Chair seated twist");
    expect(seatedForwardFold.poseKey).toBe("seated-forward-fold");
    expect(seatedForwardFold.programLabels).toContain("Seated forward fold");
    expect(seatedLegLift.poseKey).toBe("seated-leg-lift");
    expect(seatedLegLift.coverageFamilies).toContain("squat-knee-lift");
    expect(halfKneel.poseKey).toBe("half-kneeling-floor");
    expect(halfKneel.programLabels).toContain("Yoga low-lunge setup");
    expect(lowLunge.poseKey).toBe("low-lunge-floor");
    expect(lowLunge.coverageFamilies).toContain("lunges");
    expect(forwardLunge.poseKey).toBe("forward-lunge-prep");
    expect(forwardLunge.coverageFamilies).toContain("lunges");
    expect(sideLunge.poseKey).toBe("side-lunge-prep");
    expect(sideLunge.coverageFamilies).toContain("pivot-weight-transfer");
    expect(jumpingJack.poseKey).toBe("jumping-jack-prep");
    expect(jumpingJack.coverageFamilies).toContain("jump-hop");
    expect(sideLegLift.poseKey).toBe("pilates-side-lying-leg-lift");
    expect(sideLegLift.programLabels).toContain("Pilates side-lying leg lift");
    expect(clam.poseKey).toBe("pilates-clam-prep");
    expect(clam.programLabels).toContain("Pilates clam prep");
    expect(singleLegStretch.poseKey).toBe("pilates-single-leg-stretch-prep");
    expect(singleLegStretch.programLabels).toContain("Pilates single-leg stretch prep");
    expect(deadBug.poseKey).toBe("pilates-dead-bug-prep");
    expect(deadBug.programLabels).toContain("Pilates dead bug prep");
    expect(hollowHold.poseKey).toBe("pilates-hollow-hold-prep");
    expect(hollowHold.programLabels).toContain("Pilates hollow hold prep");
    expect(doubleLegStretch.poseKey).toBe("pilates-double-leg-stretch-prep");
    expect(doubleLegStretch.programLabels).toContain("Pilates double-leg stretch prep");
    expect(hundred.poseKey).toBe("pilates-hundred-prep");
    expect(hundred.programLabels).toContain("Pilates hundred prep");
    expect(bridge.poseKey).toBe("pilates-bridge-prep");
    expect(bridge.programLabels).toContain("Yoga bridge-pose prep");
    expect(cobra.poseKey).toBe("prone-back-extension-prep");
    expect(cobra.programLabels).toContain("Yoga cobra prep");
    expect(swimming.poseKey).toBe("pilates-swimming-prep");
    expect(swimming.programLabels).toContain("Pilates swimming prep");
  });
});
