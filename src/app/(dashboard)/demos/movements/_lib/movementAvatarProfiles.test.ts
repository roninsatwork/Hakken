import { describe, expect, it } from "vitest";
import {
  getMovementAvatarTrackingProfile,
  getMovementAvatarTrackingProfileName,
} from "./movementAvatarProfiles";

describe("movementAvatarProfiles", () => {
  it("returns safe tracking defaults for known avatar URLs with query suffixes", () => {
    const profile = getMovementAvatarTrackingProfile("/models/VIPE_Hero__1793.vrm?player");

    expect(profile).toMatchObject({
      headPitchOffset: 0,
      minHeadPitch: -0.45,
      maxHeadPitch: 0.85,
      headSlerp: expect.any(Number),
      lowerArmSlerp: 0.92,
      legSlerp: 0.64,
      floorCorrectionScale: 1.6,
    });
  });

  it("falls back to defaults for unknown avatars", () => {
    const profile = getMovementAvatarTrackingProfile("/models/custom.vrm");

    expect(profile.maxHeadYaw).toBeGreaterThan(0);
    expect(profile.upperArmSlerp).toBe(0.78);
    expect(profile.footVisibility).toBe(0.18);
  });

  it("keeps avatar-specific overrides while preserving shared whole-body defaults", () => {
    const profile = getMovementAvatarTrackingProfile("/models/VIPE_Hero__2575.vrm");

    expect(profile).toMatchObject({
      headPitchOffset: 0.02,
      footSlerp: 0.52,
      lowerArmSlerp: 0.9,
      neckPitchShare: 0.28,
    });
  });

  it("returns a readable profile name without query suffixes", () => {
    expect(getMovementAvatarTrackingProfileName("/models/VIPE_Hero__1793.vrm?player")).toBe(
      "VIPE_Hero__1793.vrm",
    );
  });
});
