import { describe, expect, it } from "vitest";

import {
  filterMovementReplayRowsByIds,
  parseManualReviewDecisions,
  parseMovementRecordedProofCase,
  parseMovementReplayRecordingPlanIds,
  parseMovementReplayTargetIds,
  parseSourceLimitationDecisions,
} from "./analyze-sessions-cli";

describe("movement replay analyzer CLI decision parsing", () => {
  it("parses explicit recording id lists from comma, whitespace, and comment-separated input", () => {
    expect(parseMovementReplayTargetIds(`
      recording-1,recording-2
      # ignored comment
      recording-3 recording-2
    `)).toEqual(["recording-1", "recording-2", "recording-3"]);
  });

  it("validates product-scope proof-case names for explicit validation runs", () => {
    expect(parseMovementRecordedProofCase("standing-arm-raise")).toBe("standing-arm-raise");
    expect(() => parseMovementRecordedProofCase("unknown-proof")).toThrow("Unknown product-scope proof case");
  });

  it("filters replay rows to exact requested ids and fails on missing rows", () => {
    const rows = [
      { _id: "recording-1", poseData: "{}" },
      { _id: "recording-2", poseData: "{}" },
      { _id: "recording-3", poseData: "{}" },
    ];

    expect(filterMovementReplayRowsByIds(rows, ["recording-3", "recording-1"])).toEqual([
      { _id: "recording-1", poseData: "{}" },
      { _id: "recording-3", poseData: "{}" },
    ]);
    expect(() => filterMovementReplayRowsByIds(rows, ["recording-4"])).toThrow(
      "Requested recording/session id(s) were not found",
    );
  });

  it("parses exact ids from recording gap plan summaries and rows", () => {
    expect(parseMovementReplayRecordingPlanIds({
      rows: [
        { recordingId: "recording-2" },
        { recordingId: "recording-3" },
      ],
      summary: {
        recordingIds: ["recording-1", "recording-2"],
      },
    })).toEqual(["recording-1", "recording-2", "recording-3"]);
  });

  it("parses exact ids from selected recording-plan capture scenarios", () => {
    const plan = {
      captureScenarios: [
        {
          freshRecordingLabel: "movement-proof-front-leg-isolation",
          id: "front-leg-isolation",
          proofCases: ["left-leg-raise", "mirror-side-ownership", "right-leg-raise"],
          recordingIds: ["recording-1", "recording-2"],
          title: "Front leg isolation and mirror side ownership",
        },
        {
          freshRecordingLabel: "movement-proof-root-travel",
          id: "root-travel",
          proofCases: ["root-travel"],
          recordingIds: ["recording-3"],
          title: "Root travel",
        },
      ],
      rows: [
        { recordingId: "recording-4" },
      ],
      summary: {
        recordingIds: ["recording-5"],
      },
    };

    expect(parseMovementReplayRecordingPlanIds(plan, ["front-leg-isolation"])).toEqual([
      "recording-1",
      "recording-2",
    ]);
    expect(parseMovementReplayRecordingPlanIds(plan, ["movement-proof-root-travel"])).toEqual([
      "recording-3",
    ]);
    expect(parseMovementReplayRecordingPlanIds(plan, ["left-leg-raise"])).toEqual([
      "recording-1",
      "recording-2",
    ]);
    expect(() => parseMovementReplayRecordingPlanIds(plan, ["unknown-scenario"])).toThrow(
      "Requested recording scenario(s) were not found in the recording plan",
    );
  });

  it("ignores review-template summary metadata while parsing manual decisions", () => {
    expect(parseManualReviewDecisions({
      decisions: [
        {
          proofCase: "side-bend",
          recordingId: "recording-1",
          result: "readable-pass",
          reviewContext: {
            status: "manual-review",
          },
        },
        {
          proofCase: "side-bend",
          recordingId: "recording-2",
          result: "TODO",
        },
      ],
      summary: {
        totalRows: 2,
      },
    })).toEqual([
      {
        proofCase: "side-bend",
        recordingId: "recording-1",
        result: "readable-pass",
        reviewContext: {
          status: "manual-review",
        },
      },
    ]);
  });

  it("ignores source-limitation-template summary metadata while parsing product decisions", () => {
    expect(parseSourceLimitationDecisions({
      limitations: [
        {
          proofCase: "weak-feet",
          recordingId: "recording-1",
          result: "accepted-product-limitation",
          reviewContext: {
            status: "source-data-limitation",
          },
        },
        {
          proofCase: "weak-feet",
          recordingId: "recording-2",
          result: "TODO",
        },
      ],
      summary: {
        totalRows: 2,
      },
    })).toEqual([
      {
        proofCase: "weak-feet",
        recordingId: "recording-1",
        result: "accepted-product-limitation",
        reviewContext: {
          status: "source-data-limitation",
        },
      },
    ]);
  });
});
