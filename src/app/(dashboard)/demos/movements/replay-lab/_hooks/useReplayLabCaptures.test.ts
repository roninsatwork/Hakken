import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { MovementReplayAnalysis } from "../../_lib/movementReplayAnalyzer";
import { buildReplayStudioRepairPacket } from "../../_lib/movementReplayStudioRepairPacket";
import { buildReplayStudioFixLog } from "./useReplayLabCaptures";

function readFixtureAnalysis(fixtureId: string): MovementReplayAnalysis {
  return JSON.parse(
    readFileSync(
      `scripts/movement-debug/fixtures/replay-studio/${fixtureId}/analysis.json`,
      "utf8",
    ),
  ) as MovementReplayAnalysis;
}

describe("buildReplayStudioFixLog", () => {
  it("exports the repair packet fields shown by browser diagnosis", () => {
    const analysis = readFixtureAnalysis("wrong-side-leg-raise-minimal");
    const currentFrame = analysis.replayStudio.frames[0];
    const repairPacket = buildReplayStudioRepairPacket(analysis, {
      frameIndex: currentFrame.frameIndex,
      generatedAt: "2026-07-12T00:00:00.000Z",
      recording: {
        id: analysis.sessionId,
        sourceHash: "sha256:canonical-source",
        sourceHashBasis: "source-session",
        title: analysis.sessionId,
      },
    });

    const fixLog = buildReplayStudioFixLog({
      analysis,
      currentReplayStudioFrameVerdict: currentFrame,
      repairPacket,
    });

    expect(fixLog.generatedAt).toBe("2026-07-12T00:00:00.000Z");
    expect(fixLog.currentFrame?.frameIndex).toBe(7);
    expect(fixLog.repairPacket.verdict.status).toBe("blocked");
    expect(fixLog.repairPacket.verdict.failureCode).toBe("avatar-wrong-side");
    expect(fixLog.repairPacket.divergence.firstDivergentStage).toBe("mirror-side-mapping");
    expect(fixLog.repairPacket.verdict.evidenceStatus).toBe("proven");
    expect(fixLog.repairPacket.repair.likelyFiles[0]).toContain("movementMirrorMapping.ts");
    expect(fixLog.recordingId).toBe("wrong-side-leg-raise-minimal");
    expect(fixLog.repairPacket.commands.reproduce).toContain("--recording-id wrong-side-leg-raise-minimal");
    expect(fixLog.repairPacket.commands.reproduce).toContain("--frame 7");
    expect(fixLog.repairPacket).toBe(repairPacket);
  });

  it("preserves supplemental browser evidence in the exact exported packet", () => {
    const analysis = readFixtureAnalysis("wrong-side-leg-raise-minimal");
    const repairPacket = buildReplayStudioRepairPacket(analysis, {
      supplementalFailures: [{
        code: "avatar_arm_pose_diverged",
        detail: "Rendered arm telemetry diverged after VRM application.",
        frameIndex: 7,
        severity: "error",
      }],
    });

    const fixLog = buildReplayStudioFixLog({
      analysis,
      currentReplayStudioFrameVerdict: analysis.replayStudio.frames[0],
      repairPacket,
    });

    expect(fixLog.repairPacket).toBe(repairPacket);
    expect(fixLog.repairPacket.verdict.failureCode).toBe(repairPacket.verdict.failureCode);
    expect(fixLog.repairPacket.divergence.explanation).toBe(repairPacket.divergence.explanation);
  });
});
