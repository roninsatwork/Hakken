import { describe, expect, it } from "vitest";

import {
  buildMovementRoadmapProgressReport,
  parseMovementRoadmapProgressReportArgs,
  parseSectionProgressRows,
} from "./movement-roadmap-progress-report.mjs";

const phasePercents = [92, 87, 75, 75, 99, 76, 94, 98, 84, 90, 80, 99, 98, 99, 96];

function planFixture({
  averagePercent = 90,
  overallPercent = 70,
} = {}) {
  return `# Movement Studio Best-Practice Architecture Plan

## Current Standing Board

Current progress estimates:

- Overall full human-movement engine: about ${overallPercent}%.
- Current standing/posture/Game Studio slice: 98%.
- Architecture-hardening slice: 99%.
- Movement-family preview coverage slice: 100% testable preview/diagnostic coverage, 26% user-facing production support.
- Product-support scoreboard slice: 100% for current artifact coverage.
- Architecture-plan status slice: 100%.
- Seated validation lane: 77% toward promotion.
- Walking validation lane: 41% toward promotion.
- Average progress across the 15 plan sections: about ${averagePercent}%.
- Plan adherence for the current standing architecture: 97%.

## Executive Verdict

## Section Progress

| Section | Progress | Done | Outstanding |
| --- | --- | --- | --- |
${phasePercents.map((percent, index) => `| Phase ${index}: Section ${index} | ${percent}% | Done | Outstanding |`).join("\n")}
`;
}

function matrixFixture() {
  return {
    blockedUserFacingFamilies: [],
    familyCount: 19,
    internalFamilyCount: 14,
    productionFamilySupportPercent: 26,
    rows: [
      ...["upright", "upper-body-standing", "standing-side-bend-head-direction", "squat-knee-lift", "root-turn"].map((family) => ({
        blockers: [],
        category: "user-facing",
        family,
        nextAction: "Keep proof fresh.",
      })),
      ...["facing-occlusion", "root-travel", "walking", "sitting"].map((family) => ({
        blockers: ["recorded proof"],
        category: family === "facing-occlusion" ? "internal-diagnostic" : "internal-preview",
        family,
        nextAction: `Record ${family}.`,
      })),
    ],
    userFacingCount: 5,
  };
}

describe("movement roadmap progress report", () => {
  it("parses section progress rows from the architecture plan table", () => {
    expect(parseSectionProgressRows(planFixture())).toHaveLength(15);
    expect(parseSectionProgressRows(planFixture())[0]).toMatchObject({
      percent: 92,
      phase: 0,
      title: "Section 0",
    });
  });

  it("explains why overall progress stays below the section average", () => {
    const report = buildMovementRoadmapProgressReport({
      matrix: matrixFixture(),
      planText: planFixture(),
    });

    expect(report).toMatchObject({
      matrix: {
        familyCount: 19,
        internalFamilyCount: 14,
        productionFamilySupportPercent: 26,
        userFacingCount: 5,
      },
      ok: true,
      progress: {
        overallPercent: 70,
        sectionAverageNearestFive: 90,
        sectionAverageRounded: 89,
        statedSectionAverage: 90,
      },
    });
    expect(report.explanation).toContain("not the average of architecture phases");
    expect(report.highlightedBlockers.map((row) => row.family)).toEqual([
      "facing-occlusion",
      "root-travel",
      "walking",
      "sitting",
    ]);
  });

  it("blocks misleading overall progress that rises to the section average", () => {
    const report = buildMovementRoadmapProgressReport({
      matrix: matrixFixture(),
      planText: planFixture({ overallPercent: 90 }),
    });

    expect(report.ok).toBe(false);
    expect(report.failures).toEqual(expect.arrayContaining([
      "expected overall full human-movement progress to stay below section average until production support catches up, got 90% vs about 90%",
    ]));
  });

  it("parses CLI options", () => {
    expect(parseMovementRoadmapProgressReportArgs([
      "--plan",
      "plan.md",
      "--out",
      "progress.json",
      "--markdown-out",
      "progress.md",
      "--no-write",
      "--strict",
      "--json",
    ])).toMatchObject({
      json: true,
      markdownOutPath: "progress.md",
      outPath: "progress.json",
      planPath: "plan.md",
      strict: true,
      write: false,
    });
  });
});
