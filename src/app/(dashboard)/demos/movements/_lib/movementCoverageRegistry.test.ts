import { describe, expect, it } from "vitest";
import {
  MOVEMENT_COVERAGE_FAMILIES,
  MOVEMENT_COVERAGE_REGISTRY,
  getMovementCoverageEntries,
  summarizeMovementCoverageRegistry,
  type MovementCoverageFamily,
} from "./movementCoverageRegistry";

describe("movementCoverageRegistry", () => {
  it("keeps every movement coverage family represented with an explicit status", () => {
    const entries = getMovementCoverageEntries();
    const summary = summarizeMovementCoverageRegistry();

    expect(entries).toHaveLength(MOVEMENT_COVERAGE_FAMILIES.length);
    expect(new Set(MOVEMENT_COVERAGE_FAMILIES).size).toBe(MOVEMENT_COVERAGE_FAMILIES.length);
    expect(Object.keys(MOVEMENT_COVERAGE_REGISTRY).sort()).toEqual([...MOVEMENT_COVERAGE_FAMILIES].sort());
    expect(summary.phaseComplete).toBe(true);
    expect(summary.explicitStatusCount).toBe(summary.familyCount);
    entries.forEach((entry) => {
      expect(entry.proofLevel).toMatch(/^(diagnostic|explicitly-unsupported|full|synthetic)$/);
      expect(Array.isArray(entry.remainingGaps)).toBe(true);
      if (entry.status !== "supported") {
        expect(entry.remainingGaps.length).toBeGreaterThan(0);
      }
    });
  });

  it("covers the original full-human-movement checklist without silent gaps", () => {
    const originalChecklistFamilies: MovementCoverageFamily[] = [
      "root-turn",
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
      "facing-occlusion",
      "props-contact",
    ];

    expect(MOVEMENT_COVERAGE_FAMILIES).toEqual(expect.arrayContaining(originalChecklistFamilies));
  });

  it("keeps remaining gaps explicit while marking synthetic preview families demo-ready", () => {
    const summary = summarizeMovementCoverageRegistry();

    expect(MOVEMENT_COVERAGE_REGISTRY["props-contact"]).toMatchObject({
      demoReady: true,
      proofLevel: "synthetic",
      status: "approximate",
    });
    expect(MOVEMENT_COVERAGE_REGISTRY["facing-occlusion"]).toMatchObject({
      demoReady: true,
      proofLevel: "diagnostic",
      status: "diagnostic-only",
    });
    expect(summary.unsupportedFamilies).toEqual([]);
    expect(summary.unsupportedCount).toBe(0);
    expect(summary.blockedFamilies).toEqual([]);
    expect(summary.blockedFamilies).not.toContain("walking");
    expect(summary.blockedFamilies).not.toEqual(expect.arrayContaining([
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
    ]));
    expect(summary.demoReadyCount).toBe(summary.familyCount);
    expect(summary.demoReadyPercent).toBe(100);
    expect(summary.implementedCount).toBeLessThan(summary.familyCount);
    expect(summary.implementedPercent).toBeLessThan(100);
    expect(summary.implementedFamilies).not.toContain("facing-occlusion");
    expect(summary.implementedFamilies).toContain("walking");
    expect(summary.implementedFamilies).toEqual(expect.arrayContaining([
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
    ]));
    expect(summary.missingProofFamilies).toEqual(expect.arrayContaining([
      "sitting",
      "kneeling",
      "lying-floor-work",
      "quadruped",
      "walking",
      "yoga",
      "props-contact",
    ]));
    expect(MOVEMENT_COVERAGE_REGISTRY.sitting.demoReady).toBe(true);
    expect(MOVEMENT_COVERAGE_REGISTRY.kneeling.demoReady).toBe(true);
    expect(MOVEMENT_COVERAGE_REGISTRY["lying-floor-work"].demoReady).toBe(true);
    expect(MOVEMENT_COVERAGE_REGISTRY.quadruped.demoReady).toBe(true);
    expect(summary.remainingGapCount).toBeGreaterThan(summary.familyCount);
    expect(summary.supportedCount + summary.approximateCount + summary.diagnosticOnlyCount + summary.unsupportedCount)
      .toBe(summary.familyCount);
  });

  it("separates user-facing support from internal demo readiness", () => {
    const summary = summarizeMovementCoverageRegistry();

    expect(summary.userFacingFamilies).toEqual([
      "upright",
      "upper-body-standing",
      "standing-side-bend-head-direction",
      "squat-knee-lift",
      "root-turn",
    ]);
    expect(summary.userFacingCount).toBe(5);
    expect(summary.internalDemoOnlyFamilies).toEqual(expect.arrayContaining([
      "facing-occlusion",
      "root-travel",
      "walking",
      "sitting",
      "kneeling",
      "lying-floor-work",
      "quadruped",
      "yoga",
      "pilates",
    ]));
    expect(summary.internalDemoOnlyFamilies).not.toContain("upper-body-standing");
    expect(summary.internalDemoOnlyFamilies).not.toContain("standing-side-bend-head-direction");
    expect(summary.internalDemoOnlyFamilies).not.toContain("squat-knee-lift");
    expect(summary.internalDemoOnlyFamilies).not.toContain("root-turn");
    expect(summary.internalDemoOnlyCount).toBe(summary.internalDemoOnlyFamilies.length);
    summary.internalDemoOnlyFamilies.forEach((family) => {
      const entry = MOVEMENT_COVERAGE_REGISTRY[family];
      expect(entry.demoReady).toBe(true);
      expect(entry.proofLevel).not.toBe("full");
    });
  });

  it("keeps proof-ready facing/occlusion diagnostic copy from reading as missing proof", () => {
    const entry = MOVEMENT_COVERAGE_REGISTRY["facing-occlusion"];
    const claimText = [entry.summary, ...entry.remainingGaps].join(" ");

    expect(entry).toMatchObject({
      demoReady: true,
      proofLevel: "diagnostic",
      status: "diagnostic-only",
    });
    expect(claimText).toMatch(/focused recorded Replay and Game proof closed/i);
    expect(claimText).toMatch(/coverage product truth is still internal diagnostic/i);
    expect(claimText).not.toMatch(/recorded replay and Game visual proof (?:are|is) missing/i);
    expect(claimText).not.toMatch(/until recorded proof and Game visual proof exist/i);
  });

  it("keeps product claim language scoped to the support proof level", () => {
    const summary = summarizeMovementCoverageRegistry();
    const explicitInternalLanguage = /(internal|missing|before user-facing|non-user-facing|debug-only|diagnostic|does not include)/i;

    summary.userFacingFamilies.forEach((family) => {
      const entry = MOVEMENT_COVERAGE_REGISTRY[family];
      expect(entry.status).toBe("supported");
      expect(entry.proofLevel).toBe("full");
      expect(entry.demoReady).toBe(true);
    });

    summary.internalDemoOnlyFamilies.forEach((family) => {
      const entry = MOVEMENT_COVERAGE_REGISTRY[family];
      const claimText = [entry.summary, ...entry.remainingGaps].join(" ");

      expect(entry.status).not.toBe("supported");
      expect(entry.proofLevel).not.toBe("full");
      expect(entry.remainingGaps.length).toBeGreaterThan(0);
      expect(claimText).toMatch(explicitInternalLanguage);
      expect(claimText).not.toMatch(/\bfull\s+(?:human\s+)?movement\s+support\b/i);
      expect(claimText).not.toMatch(/\bproduction\s+support\b/i);
    });

    expect(MOVEMENT_COVERAGE_REGISTRY["root-turn"].summary).toMatch(/does not include root travel or walking support/i);
    expect(MOVEMENT_COVERAGE_REGISTRY["root-turn"].summary).not.toMatch(/\bloc(?:o)?motion support\b/i);
    expect(MOVEMENT_COVERAGE_REGISTRY["upper-body-standing"].summary).toMatch(/\bstanding\b/i);
    expect(MOVEMENT_COVERAGE_REGISTRY["upper-body-standing"].summary).not.toMatch(/\bfull-body\b/i);
    expect(MOVEMENT_COVERAGE_REGISTRY.walking.summary).toMatch(/before user-facing/i);
    expect(MOVEMENT_COVERAGE_REGISTRY.sitting.summary).toMatch(/before user-facing/i);
  });
});
