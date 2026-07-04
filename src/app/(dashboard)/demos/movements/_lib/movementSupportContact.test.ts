import { describe, expect, it } from "vitest";
import { classifyMovementBodyOrientation } from "./movementBodyOrientation";
import { makeMovementAvatarProofPose } from "./movementAvatarProofFixtures";
import { resolveMovementSupportContacts } from "./movementSupportContact";
import {
  quadrupedPoseFixture,
  pronePoseFixture,
  seatedPoseFixture,
  sideLyingPoseFixture,
  supinePoseFixture,
} from "./movementBodyOrientation.testFixtures";

describe("movementSupportContact", () => {
  it("uses both feet as floor support for upright standing", () => {
    const pose = makeMovementAvatarProofPose("standing");
    const bodyOrientation = classifyMovementBodyOrientation(pose);
    const support = resolveMovementSupportContacts({ bodyOrientation, poseLandmarks: pose });

    expect(support.primarySurface).toBe("floor");
    expect(support.contacts.map((contact) => contact.point)).toEqual(["leftFoot", "rightFoot"]);
    expect(support.supportLabel).toContain("leftFoot:active");
    expect(support.supportLabel).toContain("rightFoot:active");
  });

  it("reports an inferred seat plus feet for seated poses", () => {
    const pose = seatedPoseFixture();
    const bodyOrientation = classifyMovementBodyOrientation(pose);
    const support = resolveMovementSupportContacts({ bodyOrientation, poseLandmarks: pose });

    expect(bodyOrientation.orientation).toBe("seated");
    expect(support.primarySurface).toBe("chair");
    expect(support.contacts.map((contact) => contact.point)).toEqual(["seat", "leftFoot", "rightFoot"]);
    expect(support.supportLabel).toContain("seat:inferred");
  });

  it("reports hand, knee, and foot floor anchors for quadruped poses", () => {
    const pose = quadrupedPoseFixture();
    const bodyOrientation = classifyMovementBodyOrientation(pose);
    const support = resolveMovementSupportContacts({ bodyOrientation, poseLandmarks: pose });

    expect(bodyOrientation.orientation).toBe("quadruped");
    expect(support.primarySurface).toBe("floor");
    expect(support.contacts.map((contact) => contact.point)).toEqual([
      "leftHand",
      "rightHand",
      "leftKnee",
      "rightKnee",
      "leftFoot",
      "rightFoot",
    ]);
  });

  it("reports hand and foot floor anchors for plank-style proof poses", () => {
    const pose = makeMovementAvatarProofPose("yoga-plank");
    const bodyOrientation = classifyMovementBodyOrientation(pose);
    const support = resolveMovementSupportContacts({ bodyOrientation, poseLandmarks: pose });

    expect(bodyOrientation.orientation).toBe("quadruped");
    expect(support.primarySurface).toBe("floor");
    expect(support.supportLabel).toContain("leftHand:active");
    expect(support.supportLabel).toContain("rightFoot:active");
  });

  it("reports inferred side-body floor support for side lying", () => {
    const pose = sideLyingPoseFixture();
    const bodyOrientation = classifyMovementBodyOrientation(pose);
    const support = resolveMovementSupportContacts({ bodyOrientation, poseLandmarks: pose });

    expect(bodyOrientation.orientation).toBe("sideLyingLeft");
    expect(support.primarySurface).toBe("floor");
    expect(support.contacts).toMatchObject([
      { point: "sideBody", state: "inferred", surface: "floor" },
      { point: "leftHip", state: "inferred", surface: "floor" },
      { point: "leftShoulder", state: "inferred", surface: "floor" },
      { point: "leftElbow", state: "inferred", surface: "floor" },
    ]);
  });

  it("reports back and chest floor support for supine and prone poses", () => {
    const supinePose = supinePoseFixture();
    const pronePose = pronePoseFixture();
    const supineOrientation = classifyMovementBodyOrientation(supinePose);
    const proneOrientation = classifyMovementBodyOrientation(pronePose);
    const supineSupport = resolveMovementSupportContacts({
      bodyOrientation: supineOrientation,
      poseLandmarks: supinePose,
    });
    const proneSupport = resolveMovementSupportContacts({
      bodyOrientation: proneOrientation,
      poseLandmarks: pronePose,
    });

    expect(supineOrientation.orientation).toBe("supine");
    expect(supineSupport.primarySurface).toBe("floor");
    expect(supineSupport.contacts).toMatchObject([
      { point: "back", state: "inferred", surface: "floor" },
      { point: "leftShoulder", state: "inferred", surface: "floor" },
      { point: "rightShoulder", state: "inferred", surface: "floor" },
      { point: "leftHip", state: "inferred", surface: "floor" },
      { point: "rightHip", state: "inferred", surface: "floor" },
      { point: "leftFoot", state: "active", surface: "floor" },
      { point: "rightFoot", state: "active", surface: "floor" },
    ]);
    expect(proneOrientation.orientation).toBe("prone");
    expect(proneSupport.primarySurface).toBe("floor");
    expect(proneSupport.contacts).toMatchObject([
      { point: "chest", state: "inferred", surface: "floor" },
      { point: "belly", state: "inferred", surface: "floor" },
      { point: "leftHip", state: "inferred", surface: "floor" },
      { point: "rightHip", state: "inferred", surface: "floor" },
      { point: "leftHand", state: "active", surface: "floor" },
      { point: "rightHand", state: "active", surface: "floor" },
      { point: "leftFoot", state: "active", surface: "floor" },
      { point: "rightFoot", state: "active", surface: "floor" },
    ]);
  });
});
