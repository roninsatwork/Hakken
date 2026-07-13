import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReplayStudioRepairPacket } from "../../_lib/movementReplayStudioRepairPacket";
import ReplayAgentDiagnosisPanel from "./ReplayAgentDiagnosisPanel";

const wrongSideRepairPacket: ReplayStudioRepairPacket = {
  actual: {
    bones: {
      lowerBodyDirectionError: 0.44,
    },
    contacts: {},
    owners: {
      feet: "neutral",
      lower: "avatar",
    },
    root: {},
  },
  code: {
    commit: "test-commit",
    motionPipelineFingerprint: "test-pipeline",
  },
  artifact: {
    checkedPaths: ["tmp/movement-replay-lab/current-analysis.json"],
    freshness: {
      artifactMotionPipelineFingerprints: ["old-pipeline"],
      currentMotionPipelineFingerprint: "test-pipeline",
      reason: "Analysis artifact fingerprint differs from the current motion-pipeline fingerprint.",
      status: "stale",
    },
    kind: "explicit-analysis",
    path: "tmp/movement-replay-lab/current-analysis.json",
    refreshCommand: "npm run movement:replay:analyze -- --out tmp/movement-replay-lab/current-analysis.json",
    sourcePriority: [
      "committed-fixture",
      "explicit-session",
      "explicit-analysis",
      "default-analysis",
      "configured-recording-source",
    ],
  },
  commands: {
    acceptance: "npm run movement:diagnose:golden",
    compareAfterChange:
      "npm run movement:diagnose -- --before before.json --fixture wrong-side-leg-raise-minimal",
    reproduce: "npm run movement:diagnose -- --fixture wrong-side-leg-raise-minimal",
  },
  divergence: {
    explanation: "The avatar follows the opposite leg from the source recording.",
    firstDivergentStage: "mirror-side-mapping",
    metrics: {
      lowerBodyDirectionError: 0.42,
    },
  },
  expected: {
    anatomicalMapping: "identity",
    avatarRole: "player",
    avatarSide: "left",
    bones: {},
    owners: {
      lower: "source",
    },
  },
  generatedAt: "2026-07-12T00:00:00.000Z",
  recording: {
    fixtureId: "wrong-side-leg-raise-minimal",
    id: "fixture:wrong-side-leg-raise-minimal",
    sourceHash: "fnv1a32:330eba19",
    sourceHashBasis: "analysis-report",
    title: "Wrong side leg raise minimal",
  },
  repair: {
    doNotPatch: [
      "Do not add route-local side swaps; update the shared mirror contract and prove rendered parity.",
    ],
    focusedTests: [
      "src/app/(dashboard)/demos/movements/_lib/movementMirrorMapping.test.ts",
    ],
    likelyFiles: [
      "src/app/(dashboard)/demos/movements/_lib/movementMirrorMapping.ts",
    ],
    owner: "mirror-side-mapping",
  },
  schemaVersion: 1,
  scope: {
    frameEnd: 24,
    frameStart: 12,
    silentSkipCount: 0,
    totalFramesCompared: 13,
    totalFramesExpected: 13,
    totalFramesRendered: 13,
  },
  source: {
    anatomicalSide: "left",
    motion: "leg-raise",
    quality: 0.94,
    readiness: "ready",
    visibleBodyParts: ["left-leg", "right-leg"],
  },
  verdict: {
    confidence: 0.86,
    evidenceStatus: "proven",
    failureCode: "avatar-wrong-side",
    severity: "error",
    status: "blocked",
  },
};

describe("ReplayAgentDiagnosisPanel", () => {
  it("renders repair evidence needed by a coding agent", () => {
    const onSeekFrame = vi.fn();

    render(
      <ReplayAgentDiagnosisPanel
        navigationTargets={[
          {
            detail: "avatar-wrong-side",
            frameIndex: 7,
            key: "first-failure",
            label: "First Failure",
          },
        ]}
        onSeekFrame={onSeekFrame}
        repairPacket={wrongSideRepairPacket}
      />,
    );

    expect(screen.getByTestId("movement-replay-agent-diagnosis-status")).toHaveTextContent("blocked");
    expect(screen.getByTestId("movement-replay-agent-diagnosis-failure")).toHaveTextContent("avatar-wrong-side");
    expect(screen.getByTestId("movement-replay-agent-diagnosis-stage")).toHaveTextContent("mirror-side-mapping");
    expect(screen.getByTestId("movement-replay-agent-diagnosis-source")).toHaveTextContent("leg-raise left q 0.94");
    expect(screen.getByTestId("movement-replay-agent-diagnosis-expected")).toHaveTextContent(
      "player left identity",
    );
    expect(screen.getByTestId("movement-replay-agent-diagnosis-actual")).toHaveTextContent(
      "lower avatar / feet neutral / err 0.44",
    );
    expect(screen.getByText(/proven.*q 0.86/)).toBeInTheDocument();
    expect(screen.getByText(/12-24.*skip 0/)).toBeInTheDocument();
    expect(screen.getByTestId("movement-replay-agent-diagnosis-coverage")).toHaveTextContent(
      "13/13 rendered",
    );
    expect(screen.getByTestId("movement-replay-agent-diagnosis-coverage")).toHaveTextContent(
      "13 compared",
    );
    expect(screen.getByTestId("movement-replay-agent-diagnosis-source-hash")).toHaveTextContent(
      "fnv1a32:330eba19",
    );
    expect(screen.getByTestId("movement-replay-agent-diagnosis-pipeline")).toHaveTextContent("test-pipeline");
    expect(screen.getByTestId("movement-replay-agent-diagnosis-generated-at")).toHaveTextContent(
      "2026-07-12T00:00:00.000Z",
    );
    expect(screen.getByTestId("movement-replay-agent-diagnosis-artifact")).toHaveTextContent(
      "explicit-analysis",
    );
    expect(screen.getByTestId("movement-replay-agent-diagnosis-artifact")).toHaveAttribute(
      "title",
      "tmp/movement-replay-lab/current-analysis.json",
    );
    expect(screen.getByTestId("movement-replay-agent-diagnosis-artifact-freshness")).toHaveTextContent(
      "stale",
    );
    expect(screen.getByTestId("movement-replay-agent-diagnosis-artifact-freshness")).toHaveAttribute(
      "title",
      expect.stringContaining("Refresh: npm run movement:replay:analyze"),
    );
    expect(
      screen.getByText("src/app/(dashboard)/demos/movements/_lib/movementMirrorMapping.ts"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("movement-replay-agent-diagnosis-command")).toHaveTextContent(
      "npm run movement:diagnose -- --fixture wrong-side-leg-raise-minimal",
    );
    expect(screen.getByTestId("movement-replay-agent-diagnosis-target-first-failure")).toHaveTextContent(
      "First Failure",
    );
    expect(screen.getByTestId("movement-replay-agent-diagnosis-target-first-failure")).toHaveTextContent(
      "avatar-wrong-side",
    );

    fireEvent.click(screen.getByTestId("movement-replay-agent-diagnosis-target-first-failure"));

    expect(onSeekFrame).toHaveBeenCalledWith(7);
  });
});
