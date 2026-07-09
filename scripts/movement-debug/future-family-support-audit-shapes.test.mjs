import { describe, expect, it } from "vitest";

import {
  auditFutureFamilySupportAuditShapes,
  formatFutureFamilySupportAuditShapes,
  futureFamilySupportAuditShapeForFamily,
  FUTURE_FAMILY_SUPPORT_AUDIT_SHAPE_FAMILIES,
} from "./future-family-support-audit-shapes.mjs";

describe("future family support audit shapes", () => {
  it("keeps all generic internal preview families in a source-backed shape registry", () => {
    const audit = auditFutureFamilySupportAuditShapes();

    expect(audit.ok).toBe(true);
    expect(audit.familyCount).toBe(10);
    expect(FUTURE_FAMILY_SUPPORT_AUDIT_SHAPE_FAMILIES).toEqual([
      "pivot-weight-transfer",
      "jump-hop",
      "lunges",
      "kneeling",
      "lying-floor-work",
      "quadruped",
      "rolling-crawling",
      "yoga",
      "pilates",
      "props-contact",
    ]);
  });

  it("exposes promotion proof shape details by family", () => {
    const shape = futureFamilySupportAuditShapeForFamily("quadruped");

    expect(shape.recordedProofCases).toContain("hands-knees-neutral");
    expect(shape.recordedProofCases).toContain("bird-dog-left");
    expect(shape.gameVisualCases).toContain("strongest-hands-knees");
    expect(shape.acceptableSupportClaim).toContain("Hands-and-knees");
    expect(shape.fallbackRule).toContain("Keep crawl sequencing");
  });

  it("fails malformed shapes", () => {
    const audit = auditFutureFamilySupportAuditShapes([
      {
        acceptableSupportClaim: "too short",
        fallbackRule: "",
        family: "pivot-weight-transfer",
        gameVisualCases: ["strongest-standing-pivot"],
        recordedProofCases: ["standing-pivot-left"],
      },
    ]);

    expect(audit.ok).toBe(false);
    expect(audit.failures).toContain("expected 10 future family audit shapes, got 1");
    expect(audit.failures).toContain("pivot-weight-transfer must define at least 3 recorded proof cases");
    expect(audit.failures).toContain("pivot-weight-transfer must define at least 3 Game visual cases");
  });

  it("formats a compact table for documentation handoff", () => {
    const text = formatFutureFamilySupportAuditShapes(auditFutureFamilySupportAuditShapes());

    expect(text).toContain("Status: ready");
    expect(text).toContain("| pivot-weight-transfer |");
    expect(text).toContain("wide-stance-weight-shift-left");
    expect(text).toContain("strongest-weight-shift-left");
  });
});
