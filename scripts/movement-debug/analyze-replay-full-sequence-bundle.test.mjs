import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { buildFullSequenceBundleReport } from "./analyze-replay-full-sequence-bundle.mjs";
import { movementPipelineFingerprint } from "./lib/movementPipelineFingerprint.mjs";
import { sourceHashForReplaySession } from "./lib/replay-proof-identity.mjs";

function writeJson(filePath, payload) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function replaySession(id, frameCount = 2) {
  return {
    id,
    movementId: id,
    sampleCount: frameCount,
    samples: Array.from({ length: frameCount }, () => ({
      tracking: {
        pose: [],
      },
    })),
  };
}

function telemetryFrame(frameIndex) {
  return {
    debug: {
      avatarVisual: {
        averageLowerBodyDirectionError: 0,
        footing: {
          leftFootClearance: 0,
          rightFootClearance: 0,
        },
        segments: {},
      },
      fallbacks: {
        owners: "head pose; torso player-spine-model; lower player-retarget; feet recorded-retarget",
      },
      retarget: {
        appliedLowerBody: 6,
        sourceQuality: 0.9,
      },
      spineDrive: {
        sideBend: 0,
      },
    },
    frameIndex,
  };
}

function fullSequenceTelemetry(session, frameCount = 2) {
  return {
    frameCount,
    frames: Array.from({ length: frameCount }, (_, frameIndex) => telemetryFrame(frameIndex)),
    missingFrames: [],
    motionPipelineFingerprint: movementPipelineFingerprint(),
    playbackMode: "uninterrupted-rendered-sequence",
    proofMode: "player-avatar",
    recordingId: session.id,
    sessionId: session.id,
    sourceHash: sourceHashForReplaySession(session),
  };
}

function threePartyDebug() {
  const direction = { x: 1, y: 0, z: 0 };
  const segments = Object.fromEntries([
    "leftFoot", "leftLowerArm", "leftShin", "leftThigh", "leftUpperArm",
    "rightFoot", "rightLowerArm", "rightShin", "rightThigh", "rightUpperArm",
  ].map((segment) => [segment, { confidence: 0.9, direction }]));
  return {
    avatarSpine: {
      chest: { x: 0.1, y: 0.05, z: 0.02 },
      upperChest: { x: 0.08, y: 0.04, z: 0.01 },
    },
    avatarVisual: { segments },
    headApplied: { pitch: 0.1, roll: 0.04, yaw: 0.02 },
  };
}

function threePartyTelemetry(session, frameCount = 2) {
  return {
    frameCount,
    frames: Array.from({ length: frameCount }, (_, frameIndex) => ({
      avatars: {
        instructor: threePartyDebug(),
        player: threePartyDebug(),
      },
      frameIndex,
    })),
    missingFrameCount: 0,
    motionPipelineFingerprint: movementPipelineFingerprint(),
    proofMode: "three-party-mirror",
    recordingId: session.id,
    sessionId: session.id,
    sourceHash: sourceHashForReplaySession(session),
  };
}

function writeRecordingBundleFixture(basePath, id, frameCount = 2) {
  const sessionPath = `${basePath}/${id}.session.json`;
  const telemetryPath = `${basePath}/${id}.telemetry.json`;
  const session = replaySession(id, frameCount);
  writeJson(sessionPath, session);
  writeJson(telemetryPath, fullSequenceTelemetry(session, frameCount));
  return {
    expectedFrameCount: frameCount,
    id,
    session: sessionPath,
    telemetry: telemetryPath,
  };
}

describe("full-sequence rendered telemetry bundle", () => {
  it("reports required recording ids and frame totals for a passing bundle", async () => {
    const basePath = `tmp/movement-replay-lab/full-sequence-bundle-test-${process.pid}-${Date.now()}`;
    const recordings = [
      writeRecordingBundleFixture(basePath, "acceptance-a", 2),
      writeRecordingBundleFixture(basePath, "acceptance-b", 3),
    ];
    const manifestPath = `${basePath}/manifest.json`;
    writeJson(manifestPath, {
      recordings,
      recordingSetId: "acceptance-smoke",
      requiredRecordingIds: ["acceptance-a", "acceptance-b"],
      schemaVersion: 1,
    });

    const report = await buildFullSequenceBundleReport({ manifestPath });

    expect(report).toEqual(expect.objectContaining({
      command: "movement:replay:full-sequence:bundle",
      ok: true,
      recordingCount: 2,
      recordingIds: ["acceptance-a", "acceptance-b"],
      recordingSetId: "acceptance-smoke",
      requiredRecordingCount: 2,
      schemaVersion: 1,
    }));
    expect(report.frameTotals).toEqual([
      {
        compared: 2,
        complete: true,
        expected: 2,
        id: "acceptance-a",
        missing: 0,
        rendered: 2,
      },
      {
        compared: 3,
        complete: true,
        expected: 3,
        id: "acceptance-b",
        missing: 0,
        rendered: 3,
      },
    ]);
    expect(report.statusCounts).toEqual({ passed: 2 });
  });

  it("runs the committed smoke bundle without local tmp artifacts", () => {
    const result = spawnSync(process.execPath, [
      "scripts/movement-debug/analyze-replay-full-sequence-bundle.mjs",
      "--manifest",
      "scripts/movement-debug/fixtures/replay-studio/full-sequence-bundle-smoke/manifest.json",
      "--json",
      "--strict",
    ], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload).toEqual(expect.objectContaining({
      command: "movement:replay:full-sequence:bundle",
      ok: true,
      recordingCount: 2,
      recordingIds: ["full-sequence-smoke-a", "full-sequence-smoke-b"],
      recordingSetId: "committed-full-sequence-smoke",
      requiredRecordingCount: 2,
      requiredRecordingIds: ["full-sequence-smoke-a", "full-sequence-smoke-b"],
      schemaVersion: 1,
    }));
    expect(payload.frameTotals).toEqual([
      {
        compared: 2,
        complete: true,
        expected: 2,
        id: "full-sequence-smoke-a",
        missing: 0,
        rendered: 2,
      },
      {
        compared: 3,
        complete: true,
        expected: 3,
        id: "full-sequence-smoke-b",
        missing: 0,
        rendered: 3,
      },
    ]);
  });

  it("keeps missing required recording ids visible in the summary", async () => {
    const basePath = `tmp/movement-replay-lab/full-sequence-bundle-missing-required-${process.pid}-${Date.now()}`;
    const manifestPath = `${basePath}/manifest.json`;
    writeJson(manifestPath, {
      recordings: [
        writeRecordingBundleFixture(basePath, "acceptance-a", 2),
      ],
      recordingSetId: "acceptance-smoke",
      requiredRecordingIds: ["acceptance-a", "acceptance-b"],
      schemaVersion: 1,
    });

    const report = await buildFullSequenceBundleReport({ manifestPath });

    expect(report.ok).toBe(false);
    expect(report.missingRequiredRecordingIds).toEqual(["acceptance-b"]);
    expect(report.frameTotals).toHaveLength(1);
  });

  it("requires matching deterministic instructor/player-avatar proof when declared", async () => {
    const basePath = `tmp/movement-replay-lab/full-sequence-bundle-three-party-${process.pid}-${Date.now()}`;
    const id = "three-party-acceptance";
    const session = replaySession(id, 2);
    const sessionPath = `${basePath}/${id}.session.json`;
    const telemetryPath = `${basePath}/${id}.telemetry.json`;
    const threePartyPath = `${basePath}/${id}.three-party.json`;
    const manifestPath = `${basePath}/manifest.json`;
    writeJson(sessionPath, session);
    writeJson(telemetryPath, fullSequenceTelemetry(session, 2));
    writeJson(threePartyPath, threePartyTelemetry(session, 2));
    writeJson(manifestPath, {
      recordings: [{
        expectedFrameCount: 2,
        id,
        requireThreeParty: true,
        session: sessionPath,
        telemetry: telemetryPath,
        threePartyTelemetry: threePartyPath,
      }],
      recordingSetId: "three-party-acceptance-smoke",
      requiredRecordingIds: [id],
      schemaVersion: 1,
    });

    const report = await buildFullSequenceBundleReport({ manifestPath });

    expect(report.ok).toBe(true);
    expect(report.threePartyFrameTotals).toEqual([{
      compared: 2,
      complete: true,
      expected: 2,
      id,
      missing: 0,
      rendered: 2,
    }]);
    expect(report.rows[0]).toMatchObject({
      status: "passed",
      threePartyStatus: "passed",
    });
  });

  it("exits non-zero in strict mode when bundle inputs are missing", () => {
    const basePath = `tmp/movement-replay-lab/full-sequence-bundle-strict-${process.pid}-${Date.now()}`;
    const sessionPath = `${basePath}/acceptance-a.session.json`;
    const manifestPath = `${basePath}/manifest.json`;
    writeJson(sessionPath, replaySession("acceptance-a", 2));
    writeJson(manifestPath, {
      recordings: [
        {
          expectedFrameCount: 2,
          id: "acceptance-a",
          session: sessionPath,
          telemetry: `${basePath}/missing.telemetry.json`,
        },
      ],
      recordingSetId: "acceptance-smoke",
      requiredRecordingIds: ["acceptance-a"],
      schemaVersion: 1,
    });

    const result = spawnSync(process.execPath, [
      "scripts/movement-debug/analyze-replay-full-sequence-bundle.mjs",
      "--manifest",
      manifestPath,
      "--json",
      "--strict",
    ], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    expect(result.stderr).toBe("");
    expect(result.status).toBe(1);
    const payload = JSON.parse(result.stdout);
    expect(payload).toEqual(expect.objectContaining({
      ok: false,
      recordingCount: 1,
      requiredRecordingCount: 1,
    }));
    expect(payload.rows[0]).toEqual(expect.objectContaining({
      id: "acceptance-a",
      status: "missing-input",
    }));
  });
});
