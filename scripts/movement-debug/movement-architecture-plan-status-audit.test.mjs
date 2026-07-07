import { describe, expect, it } from "vitest";

import {
  auditMovementArchitecturePlanStatus,
  parseMovementArchitecturePlanStatusAuditArgs,
} from "./movement-architecture-plan-status-audit.mjs";

const userFacingFamilies = [
  "upright",
  "upper-body-standing",
  "standing-side-bend-head-direction",
  "squat-knee-lift",
  "root-turn",
];

const internalFamilies = [
  "facing-occlusion",
  "root-travel",
  "walking",
  "pivot-weight-transfer",
  "jump-hop",
  "lunges",
  "sitting",
  "kneeling",
  "lying-floor-work",
  "quadruped",
  "rolling-crawling",
  "yoga",
  "pilates",
  "props-contact",
];

function matrixFixture() {
  return {
    blockedUserFacingFamilies: [],
    familyCount: 19,
    internalFamilyCount: 14,
    productionFamilySupportPercent: 26,
    rows: [
      ...userFacingFamilies.map((family) => ({
        category: "user-facing",
        family,
      })),
      ...internalFamilies.map((family) => ({
        category: family === "facing-occlusion" ? "internal-diagnostic" : "internal-preview",
        family,
      })),
    ],
    userFacingCount: 5,
  };
}

function currentPlanText({
  internalCount = 14,
  productionPercent = 26,
  userFacingCount = 5,
} = {}) {
  return `# Movement Studio Best-Practice Architecture Plan

## Current Standing Board

Current verified support claims:

- User-facing: ${userFacingFamilies.map((family) => `\`${family}\``).join(", ")}.
- Internal preview/demo-only: ${internalFamilies.map((family) => `\`${family}\``).join(", ")}.

Current movement-family coverage:

- User-facing supported families: ${userFacingCount}/19.
- Non-user-facing internal families: ${internalCount}/19.

Current proof snapshot from the cheap gates run in this audit:

- \`movement:support-readiness-matrix -- --no-write --json\` passes as the all-family status cross-check: 19 families total, ${userFacingCount} user-facing production-supported families, ${internalCount} internal preview/diagnostic families, ${productionPercent}% production family support, and 0 blocked current user-facing families.

Current progress estimates:

- Movement-family preview coverage slice: 100% testable preview/diagnostic coverage, ${productionPercent}% user-facing production support.

## Executive Verdict

Historical notes may contain older numbers.
`;
}

describe("movement architecture plan status audit", () => {
  it("passes when the current board matches the support matrix", () => {
    const audit = auditMovementArchitecturePlanStatus({
      matrix: matrixFixture(),
      planText: currentPlanText(),
    });

    expect(audit).toMatchObject({
      expected: {
        internalFamilyCount: 14,
        productionFamilySupportPercent: 26,
        userFacingCount: 5,
      },
      failures: [],
      ok: true,
    });
  });

  it("blocks stale current-board family counts and production support percent", () => {
    const audit = auditMovementArchitecturePlanStatus({
      matrix: matrixFixture(),
      planText: currentPlanText({
        internalCount: 15,
        productionPercent: 21,
        userFacingCount: 4,
      }),
    });

    expect(audit.ok).toBe(false);
    expect(audit.failures).toEqual(expect.arrayContaining([
      "missing current-board text: User-facing supported families: 5/19.",
      "missing current-board text: Non-user-facing internal families: 14/19.",
      "missing current-board text: Movement-family preview coverage slice: 100% testable preview/diagnostic coverage, 26% user-facing production support.",
      "stale current-board text is still present: User-facing supported families: 4/19.",
      "stale current-board text is still present: Non-user-facing internal families: 15/19.",
      "stale current-board text is still present: 21% user-facing production support",
    ]));
  });

  it("parses CLI options", () => {
    expect(parseMovementArchitecturePlanStatusAuditArgs([
      "--plan",
      "plan.md",
      "--strict",
      "--json",
    ])).toMatchObject({
      json: true,
      planPath: "plan.md",
      strict: true,
    });
  });
});
