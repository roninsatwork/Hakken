import { describe, expect, it } from "vitest";
import type {
  MovementReplayAnalysis,
  MovementReplayFailure,
} from "../../_lib/movementReplayAnalyzer";
import {
  buildAvatarFollowAcceptanceSummary,
  buildAvatarFollowCriteria,
  buildAvatarFollowCurrentFrameFailures,
  buildAvatarFollowCriterionStatuses,
  buildAvatarFollowFrameSeverityMap,
  buildAvatarFollowSessionFailures,
  buildReplayStudioParityFailure,
  resolveAvatarFollowCriterionStatus,
} from "./replayAvatarFollowDiagnosis";

function makeAnalysis(
  metrics: Partial<MovementReplayAnalysis["metrics"]> = {},
): MovementReplayAnalysis {
  return {
    failures: [
      {
        code: "avatar_arm_pose_diverged",
        detail: "Arm diverged.",
        frameIndex: 3,
        severity: "warning",
      },
      {
        code: "avatar_planted_foot_diverged",
        detail: "Foot diverged.",
        frameIndex: 7,
        severity: "error",
      },
    ],
    metrics: {
      averageAvatarLowerBodyDirectionError: 0.1,
      avatarVisualFrameCount: 4,
      lowerBodyOwnerTransitions: 0,
      ownerTransitionsPerSecond: 0,
      visualMatchScore: 0.95,
      ...metrics,
    },
    replayStudio: {
      frames: [
        {
          failures: [],
          frameIndex: 9,
          status: "review",
        },
        {
          failures: [],
          frameIndex: 10,
          status: "blocked",
        },
      ],
    },
  } as unknown as MovementReplayAnalysis;
}

describe("buildAvatarFollowSessionFailures", () => {
  it("returns session-level repair packet supplemental failures", () => {
    const failures = buildAvatarFollowSessionFailures(makeAnalysis({
      averageAvatarLowerBodyDirectionError: 0.7,
      avatarVisualFrameCount: 0,
      lowerBodyOwnerTransitions: 3,
      ownerTransitionsPerSecond: 1.8,
      visualMatchScore: 0.62,
    }));

    expect(failures.map((failure) => [failure.code, failure.severity])).toEqual([
      ["visual_match_low", "error"],
      ["lower_body_owner_flicker", "warning"],
      ["avatar_output_diverged", "error"],
      ["avatar_output_diverged", "error"],
    ]);
  });

  it("returns no session failures without analysis", () => {
    expect(buildAvatarFollowSessionFailures(null)).toEqual([]);
  });
});

describe("buildAvatarFollowCurrentFrameFailures", () => {
  it("combines analyzer, live, and parity failures for the selected frame", () => {
    const liveFailure: MovementReplayFailure = {
      code: "avatar_head_alignment_diverged",
      detail: "Live head diverged.",
      frameIndex: 7,
      severity: "warning",
    };
    const parityFailure: MovementReplayFailure = {
      code: "replay_game_path_diverged",
      detail: "Replay and Game diverged.",
      frameIndex: 7,
      severity: "warning",
    };

    expect(buildAvatarFollowCurrentFrameFailures({
      analysis: makeAnalysis(),
      liveCurrentFrameFailures: [liveFailure],
      replayStudioParityFailure: parityFailure,
      safeFrameIndex: 7,
    }).map((failure) => failure.code)).toEqual([
      "avatar_planted_foot_diverged",
      "avatar_head_alignment_diverged",
      "replay_game_path_diverged",
    ]);
  });
});

describe("buildReplayStudioParityFailure", () => {
  it("returns no failure when Replay and Studio wrapper snapshots match", () => {
    expect(buildReplayStudioParityFailure({
      diffs: [],
      safeFrameIndex: 4,
    })).toBeNull();
  });

  it("builds a current-frame warning when wrapper snapshots diverge", () => {
    expect(buildReplayStudioParityFailure({
      diffs: ["lower owner differs", "support intent differs"],
      safeFrameIndex: 4,
    })).toEqual({
      code: "replay_game_path_diverged",
      detail: "Replay wrapper diverges from Studio wrapper on frame 4: lower owner differs; support intent differs.",
      frameIndex: 4,
      severity: "warning",
    });
  });
});

describe("buildAvatarFollowAcceptanceSummary", () => {
  it("summarizes the packet status and current failure codes for UI and test attributes", () => {
    expect(buildAvatarFollowAcceptanceSummary({
      currentFrameFailures: [
        {
          code: "avatar_head_alignment_diverged",
          detail: "Head diverged.",
          frameIndex: 2,
          severity: "warning",
        },
        {
          code: "avatar_output_diverged",
          detail: "Avatar diverged.",
          frameIndex: 2,
          severity: "error",
        },
      ],
      repairPacket: {
        divergence: {
          firstDivergentStage: "vrm-application",
        },
        verdict: {
          status: "blocked",
        },
      } as Parameters<typeof buildAvatarFollowAcceptanceSummary>[0]["repairPacket"],
    })).toEqual({
      acceptanceStatus: "blocked-for-acceptance",
      currentFailureCodes: "avatar_head_alignment_diverged,avatar_output_diverged",
      judgeText: "blocked packet / vrm-application",
      status: "blocked",
    });
  });

  it("uses neutral placeholders before a repair packet exists", () => {
    expect(buildAvatarFollowAcceptanceSummary({
      currentFrameFailures: [],
      repairPacket: null,
    })).toEqual({
      acceptanceStatus: "--",
      currentFailureCodes: "",
      judgeText: "--",
      status: "--",
    });
  });
});

describe("resolveAvatarFollowCriterionStatus", () => {
  it("blocks when a matching current-frame failure is an error", () => {
    expect(resolveAvatarFollowCriterionStatus({
      codes: ["avatar_planted_foot_diverged"],
      currentFrameFailures: [makeAnalysis().failures[1]],
      currentFrameSourceReady: true,
      repairStage: "vrm-application",
      repairStatus: "blocked",
    })).toBe("blocked");
  });

  it("blocks all criteria when rendered telemetry is missing", () => {
    expect(resolveAvatarFollowCriterionStatus({
      codes: ["avatar_arm_pose_diverged"],
      currentFrameFailures: [],
      currentFrameSourceReady: true,
      repairStage: "rendered-telemetry",
      repairStatus: "blocked",
    })).toBe("blocked");
  });

  it("reviews when the repair packet is blocked elsewhere", () => {
    expect(resolveAvatarFollowCriterionStatus({
      codes: ["avatar_arm_pose_diverged"],
      currentFrameFailures: [],
      currentFrameSourceReady: true,
      repairStage: "mirror-side-mapping",
      repairStatus: "blocked",
    })).toBe("review");
  });

  it("passes only when source is ready and no packet/current issue applies", () => {
    expect(resolveAvatarFollowCriterionStatus({
      codes: ["avatar_arm_pose_diverged"],
      currentFrameFailures: [],
      currentFrameSourceReady: true,
      repairStage: undefined,
      repairStatus: "accepted",
    })).toBe("pass");
    expect(resolveAvatarFollowCriterionStatus({
      codes: ["avatar_arm_pose_diverged"],
      currentFrameFailures: [],
      currentFrameSourceReady: false,
      repairStage: undefined,
      repairStatus: "accepted",
    })).toBe("--");
  });
});

describe("buildAvatarFollowCriterionStatuses", () => {
  it("maps current failures to the expected Avatar Follow criteria", () => {
    expect(buildAvatarFollowCriterionStatuses({
      currentFrameFailures: [
        {
          code: "avatar_arm_pose_diverged",
          detail: "Arm diverged.",
          frameIndex: 2,
          severity: "warning",
        },
        {
          code: "avatar_planted_foot_diverged",
          detail: "Foot diverged.",
          frameIndex: 2,
          severity: "error",
        },
      ],
      currentFrameSourceReady: true,
      repairStage: undefined,
      repairStatus: "accepted",
    })).toEqual({
      arms: "review",
      foot: "blocked",
      head: "pass",
      spine: "pass",
    });
  });
});

describe("buildAvatarFollowCriteria", () => {
  it("keeps Avatar Follow criteria labels and order out of the page component", () => {
    expect(buildAvatarFollowCriteria({
      metrics: {
        arms: "arms metric",
        foot: "foot metric",
        head: "head metric",
        spine: "spine metric",
      },
      statuses: {
        arms: "review",
        foot: "blocked",
        head: "pass",
        spine: "--",
      },
    })).toEqual([
      {
        key: "head",
        label: "Head",
        metric: "head metric",
        status: "pass",
      },
      {
        key: "spine",
        label: "Body / spine",
        metric: "spine metric",
        status: "--",
      },
      {
        key: "arms",
        label: "Arms",
        metric: "arms metric",
        status: "review",
      },
      {
        key: "foot",
        label: "Planted foot",
        metric: "foot metric",
        status: "blocked",
      },
    ]);
  });
});

describe("buildAvatarFollowFrameSeverityMap", () => {
  it("merges analyzer, live, parity, and Replay Studio severities by frame", () => {
    const liveFailure: MovementReplayFailure = {
      code: "avatar_head_alignment_diverged",
      detail: "Live head diverged.",
      frameIndex: 3,
      severity: "error",
    };
    const parityFailure: MovementReplayFailure = {
      code: "replay_game_path_diverged",
      detail: "Replay and Game diverged.",
      frameIndex: 11,
      severity: "warning",
    };

    const severityMap = buildAvatarFollowFrameSeverityMap({
      analysis: makeAnalysis(),
      liveCurrentFrameFailures: [liveFailure],
      replayStudioParityFailure: parityFailure,
    });

    expect(Object.fromEntries(severityMap)).toEqual({
      3: "error",
      7: "error",
      9: "warning",
      10: "error",
      11: "warning",
    });
  });
});
