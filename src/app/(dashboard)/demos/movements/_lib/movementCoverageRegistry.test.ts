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

  it("keeps remaining gaps explicit without marking diagnostic families demo-ready", () => {
    const summary = summarizeMovementCoverageRegistry();

    expect(MOVEMENT_COVERAGE_REGISTRY["props-contact"]).toMatchObject({
      demoReady: false,
      proofLevel: "diagnostic",
      status: "diagnostic-only",
    });
    expect(MOVEMENT_COVERAGE_REGISTRY["facing-occlusion"]).toMatchObject({
      demoReady: false,
      proofLevel: "diagnostic",
      status: "diagnostic-only",
    });
    expect(summary.unsupportedFamilies).toEqual([]);
    expect(summary.unsupportedCount).toBe(0);
    expect(summary.blockedFamilies).toEqual(expect.arrayContaining([
      "facing-occlusion",
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
    expect(summary.demoReadyCount).toBeLessThan(summary.familyCount);
    expect(summary.demoReadyPercent).toBeLessThan(100);
    expect(summary.implementedCount).toBeLessThan(summary.familyCount);
    expect(summary.implementedPercent).toBeLessThan(100);
    expect(summary.implementedFamilies).not.toContain("walking");
    expect(summary.implementedFamilies).not.toContain("yoga");
    expect(summary.missingProofFamilies).toEqual(expect.arrayContaining([
      "upper-body-standing",
      "squat-knee-lift",
      "sitting",
      "kneeling",
      "lying-floor-work",
      "quadruped",
      "walking",
      "yoga",
      "props-contact",
    ]));
    expect(MOVEMENT_COVERAGE_REGISTRY.sitting.demoReady).toBe(false);
    expect(MOVEMENT_COVERAGE_REGISTRY.kneeling.demoReady).toBe(false);
    expect(MOVEMENT_COVERAGE_REGISTRY["lying-floor-work"].demoReady).toBe(false);
    expect(MOVEMENT_COVERAGE_REGISTRY.quadruped.demoReady).toBe(false);
    expect(summary.remainingGapCount).toBeGreaterThan(summary.familyCount);
    expect(summary.supportedCount + summary.approximateCount + summary.diagnosticOnlyCount + summary.unsupportedCount)
      .toBe(summary.familyCount);
  });

  it("separates user-facing support from internal demo readiness", () => {
    const summary = summarizeMovementCoverageRegistry();

    expect(summary.userFacingFamilies).toEqual(["upright"]);
    expect(summary.userFacingCount).toBe(1);
    expect(summary.internalDemoOnlyFamilies).toEqual(expect.arrayContaining([
      "upper-body-standing",
      "squat-knee-lift",
      "root-turn",
      "root-travel",
    ]));
    expect(summary.internalDemoOnlyCount).toBe(summary.internalDemoOnlyFamilies.length);
    summary.internalDemoOnlyFamilies.forEach((family) => {
      const entry = MOVEMENT_COVERAGE_REGISTRY[family];
      expect(entry.demoReady).toBe(true);
      expect(entry.proofLevel).not.toBe("full");
    });
  });
});
