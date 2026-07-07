import { describe, expect, it } from "vitest";
import {
  MOVEMENT_EXPANSION_PREVIEW_FAMILIES,
  auditMovementExpansionPreviewSupport,
} from "./movementExpansionPreviewAudit";

describe("movementExpansionPreviewAudit", () => {
  it("keeps the next expansion families internally demo-ready with synthetic runtime proof", () => {
    const audit = auditMovementExpansionPreviewSupport();

    expect(audit.ok).toBe(true);
    expect(audit.previewFamilies).toEqual(MOVEMENT_EXPANSION_PREVIEW_FAMILIES);
    expect(audit.rows).toHaveLength(MOVEMENT_EXPANSION_PREVIEW_FAMILIES.length);
    audit.rows.forEach((row) => {
      expect(row.ok).toBe(true);
      expect(row.registryDemoReady).toBe(true);
      expect(row.registryStatus).toBe(row.expectedFamily === "facing-occlusion" ? "diagnostic-only" : "approximate");
      expect(row.poseKey).not.toBe("unknown");
      expect(row.supportIntent).not.toBe("unknown-support");
    });
    expect(audit.rows.find((row) => row.expectedFamily === "facing-occlusion")).toMatchObject({
      constraintOwner: "root-heading-diagnostic",
      constraintStatus: "active",
      mode: "root-turn-left",
      presentationOwner: "root-heading-away-body-diagnostic",
      registryStatus: "diagnostic-only",
      supportIntent: "facing-away-diagnostic",
    });
    expect(audit.rows.find((row) => row.expectedFamily === "walking")).toMatchObject({
      constraintOwner: "root-motion-step-response",
      constraintStatus: "active",
      mode: "root-travel-forward",
      presentationOwner: expect.stringContaining("step-response-left-release"),
      supportIntent: "root-travel-step-sequence",
    });
    expect(audit.rows.find((row) => row.expectedFamily === "walking")?.presentationOwner)
      .toContain("step-response-right-landing");
  });
});
