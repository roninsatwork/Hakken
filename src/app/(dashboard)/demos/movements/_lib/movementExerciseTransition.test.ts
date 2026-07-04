import { describe, expect, it } from "vitest";
import { classifyMovementBodyOrientation } from "./movementBodyOrientation";
import {
  kneelingPoseFixture,
  seatedPoseFixture,
  supinePoseFixture,
} from "./movementBodyOrientation.testFixtures";
import { makeMovementAvatarProofPose } from "./movementAvatarProofFixtures";
import {
  resolveMovementExercisePose,
  type MovementExercisePoseDecision,
} from "./movementExercisePose";
import { resolveMovementExerciseTransition } from "./movementExerciseTransition";
import { resolveMovementSupportContacts } from "./movementSupportContact";
import type { TrackingLandmark } from "./movementTrackingCalibration";

function exercisePoseFor(poseLandmarks: TrackingLandmark[]): MovementExercisePoseDecision {
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

describe("movementExerciseTransition", () => {
  it("labels a first upright frame as stable upright", () => {
    const standing = exercisePoseFor(makeMovementAvatarProofPose("standing"));
    const transition = resolveMovementExerciseTransition({
      currentPose: standing,
      previousPose: null,
    });

    expect(transition.key).toBe("stable-upright");
    expect(transition.isTransition).toBe(false);
    expect(transition.fromPoseKey).toBeNull();
  });

  it("labels standing to seated and seated to standing transitions", () => {
    const standing = exercisePoseFor(makeMovementAvatarProofPose("standing"));
    const seated = exercisePoseFor(seatedPoseFixture());

    expect(resolveMovementExerciseTransition({
      currentPose: seated,
      previousPose: standing,
    }).key).toBe("standing-to-seated");
    expect(resolveMovementExerciseTransition({
      currentPose: standing,
      previousPose: seated,
    }).key).toBe("seated-to-standing");
  });

  it("labels standing to kneeling and kneeling to floor transitions", () => {
    const standing = exercisePoseFor(makeMovementAvatarProofPose("standing"));
    const kneeling = exercisePoseFor(kneelingPoseFixture());
    const tabletop = exercisePoseFor(makeMovementAvatarProofPose("quadruped"));

    expect(resolveMovementExerciseTransition({
      currentPose: kneeling,
      previousPose: standing,
    }).key).toBe("standing-to-kneeling");
    expect(resolveMovementExerciseTransition({
      currentPose: tabletop,
      previousPose: kneeling,
    }).key).toBe("kneeling-to-floor");
  });

  it("labels floor entry and exit transitions for lying-down flows", () => {
    const standing = exercisePoseFor(makeMovementAvatarProofPose("standing"));
    const seated = exercisePoseFor(makeMovementAvatarProofPose("seated"));
    const kneeling = exercisePoseFor(makeMovementAvatarProofPose("kneeling"));
    const supine = exercisePoseFor(supinePoseFixture());

    expect(resolveMovementExerciseTransition({
      currentPose: supine,
      previousPose: standing,
    }).key).toBe("standing-to-floor");
    expect(resolveMovementExerciseTransition({
      currentPose: standing,
      previousPose: supine,
    }).key).toBe("floor-to-standing");
    expect(resolveMovementExerciseTransition({
      currentPose: supine,
      previousPose: seated,
    }).key).toBe("seated-to-floor");
    expect(resolveMovementExerciseTransition({
      currentPose: seated,
      previousPose: supine,
    }).key).toBe("floor-to-seated");
    expect(resolveMovementExerciseTransition({
      currentPose: kneeling,
      previousPose: seated,
    }).key).toBe("seated-to-kneeling");
    expect(resolveMovementExerciseTransition({
      currentPose: seated,
      previousPose: kneeling,
    }).key).toBe("kneeling-to-seated");
  });

  it("labels seated, kneeling, and yoga all-fours exercise variations", () => {
    const seated = exercisePoseFor(makeMovementAvatarProofPose("seated"));
    const seatedTwist = exercisePoseFor(makeMovementAvatarProofPose("seated-twist"));
    const kneeling = exercisePoseFor(makeMovementAvatarProofPose("kneeling"));
    const halfKneeling = exercisePoseFor(makeMovementAvatarProofPose("half-kneeling"));
    const lowLunge = exercisePoseFor(makeMovementAvatarProofPose("low-lunge"));
    const tabletop = exercisePoseFor(makeMovementAvatarProofPose("quadruped"));
    const bearCrawl = exercisePoseFor(makeMovementAvatarProofPose("bear-crawl"));
    const birdDog = exercisePoseFor(makeMovementAvatarProofPose("quadruped-bird-dog"));
    const plank = exercisePoseFor(makeMovementAvatarProofPose("yoga-plank"));
    const downDog = exercisePoseFor(makeMovementAvatarProofPose("yoga-down-dog"));
    const childPose = exercisePoseFor(makeMovementAvatarProofPose("yoga-child-pose"));

    expect(resolveMovementExerciseTransition({
      currentPose: seatedTwist,
      previousPose: seated,
    }).key).toBe("seated-variation");
    expect(resolveMovementExerciseTransition({
      currentPose: halfKneeling,
      previousPose: kneeling,
    }).key).toBe("kneeling-variation");
    expect(resolveMovementExerciseTransition({
      currentPose: lowLunge,
      previousPose: halfKneeling,
    }).key).toBe("kneeling-variation");
    expect(resolveMovementExerciseTransition({
      currentPose: bearCrawl,
      previousPose: tabletop,
    }).key).toBe("quadruped-variation");
    expect(resolveMovementExerciseTransition({
      currentPose: birdDog,
      previousPose: bearCrawl,
    }).key).toBe("quadruped-variation");
    expect(resolveMovementExerciseTransition({
      currentPose: plank,
      previousPose: birdDog,
    }).key).toBe("quadruped-to-plank");
    expect(resolveMovementExerciseTransition({
      currentPose: downDog,
      previousPose: plank,
    }).key).toBe("plank-to-down-dog");
    expect(resolveMovementExerciseTransition({
      currentPose: childPose,
      previousPose: downDog,
    }).key).toBe("down-dog-to-child-pose");
    expect(resolveMovementExerciseTransition({
      currentPose: childPose,
      previousPose: tabletop,
    }).key).toBe("quadruped-to-child-pose");
  });

  it("separates floor pose variations from floor rolls", () => {
    const supine = exercisePoseFor(supinePoseFixture());
    const hundred = exercisePoseFor(makeMovementAvatarProofPose("pilates-hundred"));
    const bridge = exercisePoseFor(makeMovementAvatarProofPose("supine-bridge"));
    const prone = exercisePoseFor(makeMovementAvatarProofPose("prone"));
    const childPose = exercisePoseFor(makeMovementAvatarProofPose("yoga-child-pose"));

    expect(resolveMovementExerciseTransition({
      currentPose: hundred,
      previousPose: supine,
    }).key).toBe("floor-variation");
    expect(resolveMovementExerciseTransition({
      currentPose: bridge,
      previousPose: hundred,
    }).key).toBe("floor-variation");
    expect(resolveMovementExerciseTransition({
      currentPose: prone,
      previousPose: supine,
    }).key).toBe("floor-roll");
    expect(resolveMovementExerciseTransition({
      currentPose: supine,
      previousPose: childPose,
    }).key).toBe("quadruped-to-floor");
  });
});
