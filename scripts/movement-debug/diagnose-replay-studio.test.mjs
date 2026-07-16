import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { movementPipelineFingerprint } from "./lib/movementPipelineFingerprint.mjs";
import { sourceHashForReplaySession } from "./lib/replay-proof-identity.mjs";

const DEFAULT_ANALYSIS_PATHS = [
  "tmp/movement-replay-lab/current-avatar-follow-analysis-with-captures.json",
  "tmp/movement-replay-lab/current-analysis-with-captures.json",
  "tmp/movement-replay-lab/current-analysis.json",
];
const CONFIGURED_EXPORT_POINTER_PATH = "tmp/movement-replay-lab/runs/latest-export-path.txt";

function runDiagnose(args) {
  return spawnSync(process.execPath, [
    "scripts/movement-debug/diagnose-replay-studio.mjs",
    ...args,
  ], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function missingAnalysisPath() {
  return `tmp/movement-replay-lab/missing-diagnose-cli-${process.pid}-${Date.now()}.json`;
}

function withDefaultAnalysisArtifact(payload, callback) {
  const defaultPath = "tmp/movement-replay-lab/current-analysis.json";
  const previousFiles = DEFAULT_ANALYSIS_PATHS.map((path) => ({
    path,
    value: existsSync(path) ? readFileSync(path, "utf8") : null,
  }));
  previousFiles.forEach((file) => {
    if (file.value !== null) unlinkSync(file.path);
  });
  mkdirSync(dirname(defaultPath), { recursive: true });
  writeFileSync(defaultPath, `${JSON.stringify(payload, null, 2)}\n`);

  try {
    callback();
  } finally {
    DEFAULT_ANALYSIS_PATHS.forEach((path) => {
      if (existsSync(path)) unlinkSync(path);
    });
    previousFiles.forEach((file) => {
      if (file.value === null) return;
      mkdirSync(dirname(file.path), { recursive: true });
      writeFileSync(file.path, file.value);
    });
  }
}

function withoutDefaultAnalysisArtifacts(callback) {
  const previousFiles = DEFAULT_ANALYSIS_PATHS.map((defaultPath) => ({
    existed: existsSync(defaultPath),
    path: defaultPath,
    value: existsSync(defaultPath) ? readFileSync(defaultPath, "utf8") : null,
  }));
  previousFiles.forEach((file) => {
    if (file.existed) unlinkSync(file.path);
  });

  try {
    callback();
  } finally {
    previousFiles.forEach((file) => {
      if (file.value !== null) {
        mkdirSync(dirname(file.path), { recursive: true });
        writeFileSync(file.path, file.value);
      } else if (existsSync(file.path)) {
        unlinkSync(file.path);
      }
    });
  }
}

function withoutConfiguredExportPointer(callback) {
  const hadPreviousPointer = existsSync(CONFIGURED_EXPORT_POINTER_PATH);
  const previousPointer = hadPreviousPointer ? readFileSync(CONFIGURED_EXPORT_POINTER_PATH, "utf8") : null;
  if (hadPreviousPointer) unlinkSync(CONFIGURED_EXPORT_POINTER_PATH);

  try {
    callback();
  } finally {
    if (previousPointer !== null) {
      mkdirSync(dirname(CONFIGURED_EXPORT_POINTER_PATH), { recursive: true });
      writeFileSync(CONFIGURED_EXPORT_POINTER_PATH, previousPointer);
    } else if (existsSync(CONFIGURED_EXPORT_POINTER_PATH)) {
      unlinkSync(CONFIGURED_EXPORT_POINTER_PATH);
    }
  }
}

function writeTempJson(path, payload) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`);
}

function withConfiguredExport(recordingId, callback) {
  const exportPath = `tmp/movement-replay-lab/configured-export-${process.pid}-${Date.now()}`;
  const hadPreviousPointer = existsSync(CONFIGURED_EXPORT_POINTER_PATH);
  const previousPointer = hadPreviousPointer ? readFileSync(CONFIGURED_EXPORT_POINTER_PATH, "utf8") : null;
  const poseData = JSON.stringify({
    fps: 30,
    frames: [
      [],
    ],
    schemaVersion: 1,
  });
  mkdirSync(`${exportPath}/movements`, { recursive: true });
  writeFileSync(
    `${exportPath}/movements/documents.jsonl`,
    `${JSON.stringify({
      _id: recordingId,
      captureFps: 30,
      createdAt: 1000,
      durationMs: 0,
      frameCount: 1,
      poseData,
      poseDataFormat: "storage-json-v1",
      title: "Configured export recording",
    })}\n`,
  );
  mkdirSync(dirname(CONFIGURED_EXPORT_POINTER_PATH), { recursive: true });
  writeFileSync(CONFIGURED_EXPORT_POINTER_PATH, `${exportPath}\n`);

  try {
    callback(exportPath);
  } finally {
    if (previousPointer !== null) {
      writeFileSync(CONFIGURED_EXPORT_POINTER_PATH, previousPointer);
    } else if (existsSync(CONFIGURED_EXPORT_POINTER_PATH)) {
      unlinkSync(CONFIGURED_EXPORT_POINTER_PATH);
    }
  }
}

describe("Replay Studio diagnosis CLI", () => {
  it("lists committed fixtures for discoverability", () => {
    const result = runDiagnose(["--list-fixtures"]);

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Replay Studio fixtures:");
    expect(result.stdout).toContain("accepted-leg-raise-minimal");
    expect(result.stdout).toContain("accepted-leg-raise-minimal - Accepted leg raise stays green (analysis, frame 4)");
    expect(result.stdout).toContain("rendered-telemetry-missing-minimal");
    expect(result.stdout).toContain("source-normalization-mismatch-minimal");
    expect(result.stdout).toContain("calibration-unreliable-minimal");
    expect(result.stdout).toContain("source-blocked-lower-body-minimal");
    expect(result.stdout).toContain("source-session-source-blocked-lower-body-minimal");
    expect(result.stdout).toContain("source-session-accepted-squat-minimal");
    expect(result.stdout).toContain("source-session-accepted-squat-minimal - Raw source-session squat blocks without rendered-avatar proof (session, default frame)");
    expect(result.stdout).toContain("source-session-rendered-final-bone-mismatch-minimal");
    expect(result.stdout).toContain("source-session-rendered-final-bone-mismatch-minimal - Raw source-session rendered final bone mismatch routes to VRM application (session, frame 1)");
    expect(result.stdout).toContain("wrong-side-leg-raise-minimal");
    expect(result.stdout).toContain("owner-flicker-minimal");
    expect(result.stdout).toContain("support-contact-seated-minimal");
    expect(result.stdout).toContain("root-motion-drift-minimal");
    expect(result.stdout).toContain("avatar-leg-missing-minimal");
    expect(result.stdout).toContain("rendered-final-bone-mismatch-minimal");
    expect(result.stdout).toContain("visual-proof-missing-minimal");
  });

  it("lists committed fixtures as JSON", () => {
    const result = runDiagnose(["--list-fixtures", "--json"]);

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload).toEqual(expect.objectContaining({
      command: "movement:diagnose:list-fixtures",
      fixtureCount: 15,
      schemaVersion: 1,
    }));
    expect(payload.fixtures.map((fixture) => fixture.id)).toEqual([
      "accepted-leg-raise-minimal",
      "rendered-telemetry-missing-minimal",
      "source-normalization-mismatch-minimal",
      "calibration-unreliable-minimal",
      "source-blocked-lower-body-minimal",
      "source-session-source-blocked-lower-body-minimal",
      "source-session-accepted-squat-minimal",
      "source-session-rendered-final-bone-mismatch-minimal",
      "wrong-side-leg-raise-minimal",
      "owner-flicker-minimal",
      "support-contact-seated-minimal",
      "root-motion-drift-minimal",
      "avatar-leg-missing-minimal",
      "rendered-final-bone-mismatch-minimal",
      "visual-proof-missing-minimal",
    ]);
    expect(payload.fixtures[0].expected).toEqual(expect.objectContaining({
      silentSkipCount: 0,
      totalFramesExpected: 1,
    }));
    const acceptedFixture = payload.fixtures.find((fixture) => fixture.id === "accepted-leg-raise-minimal");
    expect(acceptedFixture).toEqual(expect.objectContaining({
      inputKind: "analysis",
      inputPath: "scripts/movement-debug/fixtures/replay-studio/accepted-leg-raise-minimal/analysis.json",
      refreshCommand: "npm run movement:diagnose -- --fixture accepted-leg-raise-minimal --require-fresh-artifact",
    }));
    const sourceSessionFixture = payload.fixtures.find((fixture) => fixture.id === "source-session-accepted-squat-minimal");
    expect(sourceSessionFixture).toEqual(expect.objectContaining({
      inputKind: "session",
      inputPath: "scripts/movement-debug/fixtures/replay-studio/source-session-accepted-squat-minimal/session.json",
      refreshCommand: "npm run movement:diagnose -- --fixture source-session-accepted-squat-minimal --require-fresh-artifact",
    }));
  });

  it("resolves a committed fixture by id", () => {
    const outPath = `tmp/movement-replay-lab/diagnose-fixture-${process.pid}-${Date.now()}.json`;
    const result = runDiagnose([
      "--fixture",
      "wrong-side-leg-raise-minimal",
      "--out",
      outPath,
      "--no-md",
    ]);

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Replay Studio diagnosis: blocked / avatar-wrong-side / mirror-side-mapping");
    expect(result.stdout).toContain("Artifact: committed-fixture scripts/movement-debug/fixtures/replay-studio/wrong-side-leg-raise-minimal/analysis.json");
    expect(result.stdout).toContain("Artifact refresh: npm run movement:diagnose -- --fixture wrong-side-leg-raise-minimal --require-fresh-artifact");
    expect(result.stdout).toContain("Artifact freshness: not-required");
    expect(result.stdout).toContain("--fixture wrong-side-leg-raise-minimal");
    const packet = JSON.parse(readFileSync(outPath, "utf8"));
    expect(packet.recording.fixtureId).toBe("wrong-side-leg-raise-minimal");
    expect(packet.artifact).toEqual(expect.objectContaining({
      fixtureId: "wrong-side-leg-raise-minimal",
      freshness: expect.objectContaining({
        status: "not-required",
      }),
      kind: "committed-fixture",
      path: "scripts/movement-debug/fixtures/replay-studio/wrong-side-leg-raise-minimal/analysis.json",
      refreshCommand: "npm run movement:diagnose -- --fixture wrong-side-leg-raise-minimal --require-fresh-artifact",
    }));
    expect(packet.commands.compareAfterChange).toContain("--fixture wrong-side-leg-raise-minimal");
  });

  it("re-analyzes a committed source-session fixture by id", () => {
    const outPath = `tmp/movement-replay-lab/diagnose-source-session-fixture-${process.pid}-${Date.now()}.json`;
    const result = runDiagnose([
      "--fixture",
      "source-session-source-blocked-lower-body-minimal",
      "--out",
      outPath,
      "--no-md",
    ]);

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Replay Studio diagnosis: blocked / source-not-trustworthy / source-capture");
    expect(result.stdout).toContain("Artifact: committed-fixture scripts/movement-debug/fixtures/replay-studio/source-session-source-blocked-lower-body-minimal/session.json");
    expect(result.stdout).toContain("Artifact refresh: npm run movement:diagnose -- --fixture source-session-source-blocked-lower-body-minimal --require-fresh-artifact");
    expect(result.stdout).toContain("Artifact freshness: recomputed");
    expect(result.stdout).toContain("--fixture source-session-source-blocked-lower-body-minimal");
    const packet = JSON.parse(readFileSync(outPath, "utf8"));
    const sourceSession = JSON.parse(readFileSync(
      "scripts/movement-debug/fixtures/replay-studio/source-session-source-blocked-lower-body-minimal/session.json",
      "utf8",
    ));
    expect(packet.recording).toEqual(expect.objectContaining({
      fixtureId: "source-session-source-blocked-lower-body-minimal",
      sourceHash: sourceHashForReplaySession(sourceSession),
      sourceHashBasis: "source-session",
    }));
    expect(packet.artifact).toEqual(expect.objectContaining({
      checkedPaths: [
        "scripts/movement-debug/fixtures/replay-studio/registry.json",
        "scripts/movement-debug/fixtures/replay-studio/source-session-source-blocked-lower-body-minimal/session.json",
      ],
      fixtureId: "source-session-source-blocked-lower-body-minimal",
      freshness: expect.objectContaining({
        status: "recomputed",
      }),
      kind: "committed-fixture",
      path: "scripts/movement-debug/fixtures/replay-studio/source-session-source-blocked-lower-body-minimal/session.json",
      refreshCommand: "npm run movement:diagnose -- --fixture source-session-source-blocked-lower-body-minimal --require-fresh-artifact",
    }));
    expect(packet.commands.compareAfterChange).toContain("--fixture source-session-source-blocked-lower-body-minimal");
  });

  it("fails closed for a source-session fixture without rendered-avatar proof", () => {
    const outPath = `tmp/movement-replay-lab/diagnose-source-session-accepted-fixture-${process.pid}-${Date.now()}.json`;
    const result = runDiagnose([
      "--fixture",
      "source-session-accepted-squat-minimal",
      "--out",
      outPath,
      "--no-md",
    ]);

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Replay Studio diagnosis: blocked / avatar-output-missing / rendered-telemetry");
    expect(result.stdout).toContain("Artifact: committed-fixture scripts/movement-debug/fixtures/replay-studio/source-session-accepted-squat-minimal/session.json");
    expect(result.stdout).toContain("Artifact freshness: recomputed");
    const packet = JSON.parse(readFileSync(outPath, "utf8"));
    expect(packet.recording).toEqual(expect.objectContaining({
      fixtureId: "source-session-accepted-squat-minimal",
      sourceHash: "sha256:eacbc0d8e9cf273534bf2c492f5718f8d433fc3d49d252a8912de4a5c3a0d36d",
      sourceHashBasis: "source-session",
    }));
    expect(packet.scope).toEqual(expect.objectContaining({
      silentSkipCount: 3,
      totalFramesCompared: 3,
      totalFramesExpected: 3,
    }));
    expect(packet.artifact).toEqual(expect.objectContaining({
      fixtureId: "source-session-accepted-squat-minimal",
      freshness: expect.objectContaining({
        status: "recomputed",
      }),
      kind: "committed-fixture",
      path: "scripts/movement-debug/fixtures/replay-studio/source-session-accepted-squat-minimal/session.json",
    }));
  });

  it("consolidates complete matching final-VRM telemetry into the source-session packet", () => {
    const telemetryPath = `tmp/movement-replay-lab/diagnose-rendered-telemetry-${process.pid}-${Date.now()}.json`;
    const outPath = `tmp/movement-replay-lab/diagnose-rendered-packet-${process.pid}-${Date.now()}.json`;
    writeFileSync(telemetryPath, JSON.stringify({
      frameCount: 3,
      frames: [0, 1, 2].map((frameIndex) => ({
        debug: {
          avatarVisual: {
            averageLowerBodyDirectionError: 0.01,
            averageUpperBodyDirectionError: 0.01,
            comparedLowerBodySegments: 6,
            comparedUpperBodySegments: 4,
          },
        },
        frameIndex,
        renderedFrameIndex: frameIndex,
      })),
      missingFrameCount: 0,
      motionPipelineFingerprint: movementPipelineFingerprint(),
      playbackError: "",
      sessionId: "source-session-accepted-squat-minimal",
      sourceHash: "sha256:eacbc0d8e9cf273534bf2c492f5718f8d433fc3d49d252a8912de4a5c3a0d36d",
    }, null, 2));

    try {
      const result = runDiagnose([
        "--fixture",
        "source-session-accepted-squat-minimal",
        "--rendered-telemetry",
        telemetryPath,
        "--out",
        outPath,
        "--no-md",
        "--strict",
      ]);

      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Replay Studio diagnosis: accepted / none / unknown");
      const packet = JSON.parse(readFileSync(outPath, "utf8"));
      expect(packet.scope).toEqual(expect.objectContaining({
        silentSkipCount: 0,
        totalFramesCompared: 3,
        totalFramesExpected: 3,
        totalFramesRendered: 3,
      }));
      expect(packet.actual.bones).toEqual(expect.objectContaining({
        comparedLowerBodySegments: 6,
        comparedUpperBodySegments: 4,
        lowerBodyDirectionError: 0.01,
        upperBodyDirectionError: 0.01,
      }));
      expect(packet.artifact.checkedPaths).toContain(telemetryPath);
      expect(packet.commands.reproduce).toContain(`--rendered-telemetry ${telemetryPath}`);
    } finally {
      if (existsSync(telemetryPath)) unlinkSync(telemetryPath);
      if (existsSync(outPath)) unlinkSync(outPath);
    }
  });

  it("records explicit analysis artifacts in the repair packet", () => {
    const analysisPath = "scripts/movement-debug/fixtures/replay-studio/accepted-leg-raise-minimal/analysis.json";
    const outPath = `tmp/movement-replay-lab/diagnose-explicit-analysis-${process.pid}-${Date.now()}.json`;
    const result = runDiagnose([
      "--analysis",
      analysisPath,
      "--recording-id",
      "accepted-leg-raise-minimal",
      "--out",
      outPath,
      "--no-md",
    ]);

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`Artifact: explicit-analysis ${analysisPath}`);
    expect(result.stdout).toContain("Artifact refresh: npm run movement:diagnose -- --fixture accepted-leg-raise-minimal --require-fresh-artifact");
    expect(result.stdout).toContain("Artifact freshness: unknown");
    const packet = JSON.parse(readFileSync(outPath, "utf8"));
    expect(packet.artifact).toEqual(expect.objectContaining({
      checkedPaths: [analysisPath],
      freshness: expect.objectContaining({
        status: "unknown",
      }),
      kind: "explicit-analysis",
      path: analysisPath,
      refreshCommand: "npm run movement:diagnose -- --fixture accepted-leg-raise-minimal --require-fresh-artifact",
      requestedRecordingId: "accepted-leg-raise-minimal",
    }));
  });

  it("marks explicit analysis artifacts current when their fingerprint matches", () => {
    const sourcePath = "scripts/movement-debug/fixtures/replay-studio/accepted-leg-raise-minimal/analysis.json";
    const analysisPath = `tmp/movement-replay-lab/diagnose-current-analysis-${process.pid}-${Date.now()}.json`;
    const outPath = `tmp/movement-replay-lab/diagnose-current-analysis-packet-${process.pid}-${Date.now()}.json`;
    const analysis = {
      ...JSON.parse(readFileSync(sourcePath, "utf8")),
      motionPipelineFingerprint: movementPipelineFingerprint(),
    };
    mkdirSync(dirname(analysisPath), { recursive: true });
    writeFileSync(analysisPath, `${JSON.stringify(analysis, null, 2)}\n`);

    try {
      const result = runDiagnose([
        "--analysis",
        analysisPath,
        "--recording-id",
        "accepted-leg-raise-minimal",
        "--refresh",
        "--require-fresh-artifact",
        "--out",
        outPath,
        "--no-md",
      ]);

      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Artifact freshness: current");
      const packet = JSON.parse(readFileSync(outPath, "utf8"));
      expect(packet.artifact).toEqual(expect.objectContaining({
        freshness: expect.objectContaining({
          artifactMotionPipelineFingerprints: [movementPipelineFingerprint()],
          currentMotionPipelineFingerprint: movementPipelineFingerprint(),
          status: "current",
        }),
        kind: "explicit-analysis",
        refreshCommand: `npm run movement:replay:analyze -- --out ${analysisPath} --recording-ids accepted-leg-raise-minimal`,
      }));
    } finally {
      if (existsSync(analysisPath)) unlinkSync(analysisPath);
      if (existsSync(outPath)) unlinkSync(outPath);
    }
  });

  it("reports ambiguous multi-recording analysis inputs with available ids", () => {
    const analysisPath = `tmp/movement-replay-lab/diagnose-multi-analysis-${process.pid}-${Date.now()}.json`;
    const acceptedAnalysis = JSON.parse(readFileSync(
      "scripts/movement-debug/fixtures/replay-studio/accepted-leg-raise-minimal/analysis.json",
      "utf8",
    ));
    const wrongSideAnalysis = JSON.parse(readFileSync(
      "scripts/movement-debug/fixtures/replay-studio/wrong-side-leg-raise-minimal/analysis.json",
      "utf8",
    ));
    writeTempJson(analysisPath, {
      analyses: [acceptedAnalysis, wrongSideAnalysis],
    });

    try {
      const result = runDiagnose([
        "--analysis",
        analysisPath,
        "--json",
        "--no-md",
      ]);

      expect(result.status).toBe(2);
      expect(result.stderr).toBe("");
      const payload = JSON.parse(result.stdout);
      expect(payload.failure).toEqual(expect.objectContaining({
        availableRecordingIds: [
          "accepted-leg-raise-minimal",
          "wrong-side-leg-raise-minimal",
        ],
        command: "movement:diagnose",
        message: "Analysis input contains multiple recordings. Pass --recording-id <id>.",
        outcome: "missing-input",
        schemaVersion: 1,
      }));
      expect(payload.failure.recovery).toContain("--recording-id <id>");
    } finally {
      if (existsSync(analysisPath)) unlinkSync(analysisPath);
    }
  });

  it("reports missing requested analysis recording ids with available ids", () => {
    const analysisPath = `tmp/movement-replay-lab/diagnose-missing-analysis-id-${process.pid}-${Date.now()}.json`;
    const acceptedAnalysis = JSON.parse(readFileSync(
      "scripts/movement-debug/fixtures/replay-studio/accepted-leg-raise-minimal/analysis.json",
      "utf8",
    ));
    writeTempJson(analysisPath, {
      analyses: [acceptedAnalysis],
    });

    try {
      const result = runDiagnose([
        "--analysis",
        analysisPath,
        "--recording-id",
        "missing-recording-id",
        "--json",
        "--no-md",
      ]);

      expect(result.status).toBe(2);
      expect(result.stderr).toBe("");
      const payload = JSON.parse(result.stdout);
      expect(payload.failure).toEqual(expect.objectContaining({
        availableRecordingIds: ["accepted-leg-raise-minimal"],
        command: "movement:diagnose",
        outcome: "missing-input",
        requestedRecordingId: "missing-recording-id",
        schemaVersion: 1,
      }));
      expect(payload.failure.message).toContain("Recording/session missing-recording-id was not found");
    } finally {
      if (existsSync(analysisPath)) unlinkSync(analysisPath);
    }
  });

  it("fails freshness-required diagnosis when analysis fingerprints are missing", () => {
    const analysisPath = "scripts/movement-debug/fixtures/replay-studio/accepted-leg-raise-minimal/analysis.json";
    const result = runDiagnose([
      "--analysis",
      analysisPath,
      "--recording-id",
      "accepted-leg-raise-minimal",
      "--require-fresh-artifact",
      "--json",
      "--no-md",
    ]);

    expect(result.status).toBe(2);
    expect(result.stderr).toBe("");
    const payload = JSON.parse(result.stdout);
    expect(payload.failure).toEqual(expect.objectContaining({
      command: "movement:diagnose",
      outcome: "stale-input",
      path: analysisPath,
      schemaVersion: 1,
    }));
    expect(payload.failure.message).toContain("Artifact freshness is unknown");
    expect(payload.failure.recovery).toContain("Regenerate the analysis artifact");
    expect(payload.failure.recovery).toContain("npm run movement:diagnose -- --fixture accepted-leg-raise-minimal --require-fresh-artifact");
    expect(payload.failure.refreshCommand).toBe(
      "npm run movement:diagnose -- --fixture accepted-leg-raise-minimal --require-fresh-artifact",
    );
  });

  it("blocks refresh-requested diagnosis when analysis freshness is unknown", () => {
    const analysisPath = "scripts/movement-debug/fixtures/replay-studio/accepted-leg-raise-minimal/analysis.json";
    const result = runDiagnose([
      "--analysis",
      analysisPath,
      "--recording-id",
      "accepted-leg-raise-minimal",
      "--refresh",
      "--json",
      "--no-md",
    ]);

    expect(result.status).toBe(2);
    expect(result.stderr).toBe("");
    const payload = JSON.parse(result.stdout);
    expect(payload.failure).toEqual(expect.objectContaining({
      command: "movement:diagnose",
      outcome: "stale-input",
      path: analysisPath,
      refreshCommand: "npm run movement:diagnose -- --fixture accepted-leg-raise-minimal --require-fresh-artifact",
      schemaVersion: 1,
    }));
    expect(payload.failure.message).toContain("Cannot refresh artifact automatically because freshness is unknown");
    expect(payload.failure.recovery).toContain("run the artifact refresh command");
  });

  it("allows refresh-requested diagnosis for source-session fixtures", () => {
    const result = runDiagnose([
      "--fixture",
      "source-session-accepted-squat-minimal",
      "--refresh",
      "--no-md",
    ]);

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Replay Studio diagnosis: blocked / avatar-output-missing / rendered-telemetry");
    expect(result.stdout).toContain("Artifact freshness: recomputed");
  });

  it("falls back from recording id to a committed fixture when no analysis artifact exists", () => {
    withoutDefaultAnalysisArtifacts(() => {
      const outPath = `tmp/movement-replay-lab/diagnose-recording-fixture-${process.pid}-${Date.now()}.json`;
      const result = runDiagnose([
        "--recording-id",
        "wrong-side-leg-raise-minimal",
        "--out",
        outPath,
        "--no-md",
      ]);

      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Replay Studio diagnosis: blocked / avatar-wrong-side / mirror-side-mapping");
      expect(result.stdout).toContain("Artifact: recording-id-committed-fixture-fallback scripts/movement-debug/fixtures/replay-studio/wrong-side-leg-raise-minimal/analysis.json");
      expect(result.stdout).toContain("Artifact refresh: npm run movement:diagnose -- --fixture wrong-side-leg-raise-minimal --require-fresh-artifact");
      expect(result.stdout).toContain("Artifact freshness: not-required");
      expect(result.stdout).toContain("Artifact fallback: No default Replay analysis artifact was available");
      expect(result.stdout).toContain("--fixture wrong-side-leg-raise-minimal");
      const packet = JSON.parse(readFileSync(outPath, "utf8"));
      expect(packet.recording.fixtureId).toBe("wrong-side-leg-raise-minimal");
      expect(packet.artifact).toEqual(expect.objectContaining({
        fixtureId: "wrong-side-leg-raise-minimal",
        freshness: expect.objectContaining({
          status: "not-required",
        }),
        kind: "recording-id-committed-fixture-fallback",
        refreshCommand: "npm run movement:diagnose -- --fixture wrong-side-leg-raise-minimal --require-fresh-artifact",
        requestedRecordingId: "wrong-side-leg-raise-minimal",
      }));
      expect(packet.artifact.fallbackReason).toContain("No default Replay analysis artifact was available");
      expect(packet.commands.reproduce).toContain("--fixture wrong-side-leg-raise-minimal");
    });
  });

  it("falls back from recording id to a committed source-session fixture when no analysis artifact exists", () => {
    withoutDefaultAnalysisArtifacts(() => {
      const outPath = `tmp/movement-replay-lab/diagnose-recording-source-session-fixture-${process.pid}-${Date.now()}.json`;
      const result = runDiagnose([
        "--recording-id",
        "source-session-source-blocked-lower-body-minimal",
        "--out",
        outPath,
        "--no-md",
      ]);

      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Replay Studio diagnosis: blocked / source-not-trustworthy / source-capture");
      expect(result.stdout).toContain("Artifact: recording-id-committed-fixture-fallback scripts/movement-debug/fixtures/replay-studio/source-session-source-blocked-lower-body-minimal/session.json");
      expect(result.stdout).toContain("Artifact freshness: recomputed");
      expect(result.stdout).toContain("Artifact fallback: No default Replay analysis artifact was available");
      const packet = JSON.parse(readFileSync(outPath, "utf8"));
      expect(packet.recording).toEqual(expect.objectContaining({
        fixtureId: "source-session-source-blocked-lower-body-minimal",
        sourceHashBasis: "source-session",
      }));
      expect(packet.artifact).toEqual(expect.objectContaining({
        fixtureId: "source-session-source-blocked-lower-body-minimal",
        freshness: expect.objectContaining({
          status: "recomputed",
        }),
        kind: "recording-id-committed-fixture-fallback",
        path: "scripts/movement-debug/fixtures/replay-studio/source-session-source-blocked-lower-body-minimal/session.json",
        refreshCommand: "npm run movement:diagnose -- --fixture source-session-source-blocked-lower-body-minimal --require-fresh-artifact",
        requestedRecordingId: "source-session-source-blocked-lower-body-minimal",
      }));
    });
  });

  it("reports default resolver misses with source priority metadata", () => {
    withoutDefaultAnalysisArtifacts(() => {
      withoutConfiguredExportPointer(() => {
        const result = runDiagnose([
          "--recording-id",
          "missing-recording-with-no-fixture",
          "--json",
          "--no-md",
        ]);

        expect(result.status).toBe(2);
        expect(result.stderr).toBe("");
        const payload = JSON.parse(result.stdout);
        expect(payload.failure).toEqual(expect.objectContaining({
          checkedPaths: [
            ...DEFAULT_ANALYSIS_PATHS,
            CONFIGURED_EXPORT_POINTER_PATH,
          ],
          command: "movement:diagnose",
          outcome: "missing-input",
          requestedRecordingId: "missing-recording-with-no-fixture",
          schemaVersion: 1,
          sourcePriority: [
            "committed-fixture",
            "explicit-session",
            "explicit-analysis",
            "default-analysis",
            "configured-recording-source",
          ],
        }));
        expect(payload.failure.message).toContain("No analysis input found");
      });
    });
  });

  it("regenerates a Replay session from the configured local export when no artifact exists", () => {
    const recordingId = `configured-recording-${process.pid}-${Date.now()}`;
    withoutDefaultAnalysisArtifacts(() => {
      withConfiguredExport(recordingId, (exportPath) => {
        const outPath = `tmp/movement-replay-lab/diagnose-configured-source-${process.pid}-${Date.now()}.json`;
        const result = runDiagnose([
          "--recording-id",
          recordingId,
          "--out",
          outPath,
          "--no-md",
          "--refresh",
        ]);

        expect(result.stderr).toBe("");
        expect(result.status).toBe(0);
        expect(result.stdout).toContain("Artifact: configured-recording-source");
        expect(result.stdout).toContain("Artifact freshness: recomputed");
        expect(result.stdout).toContain(`Artifact refresh: npm run movement:diagnose -- --recording-id ${recordingId} --refresh --require-fresh-artifact`);
        const packet = JSON.parse(readFileSync(outPath, "utf8"));
        expect(packet.recording).toEqual(expect.objectContaining({
          id: recordingId,
          sourceHashBasis: "source-session",
        }));
        expect(packet.artifact).toEqual(expect.objectContaining({
          checkedPaths: [
            ...DEFAULT_ANALYSIS_PATHS,
            CONFIGURED_EXPORT_POINTER_PATH,
            exportPath,
            `tmp/movement-replay-lab/configured-recording-sources/${recordingId}.session.json`,
          ],
          freshness: expect.objectContaining({
            status: "recomputed",
          }),
          kind: "configured-recording-source",
          path: `tmp/movement-replay-lab/configured-recording-sources/${recordingId}.session.json`,
          refreshCommand: `npm run movement:diagnose -- --recording-id ${recordingId} --refresh --require-fresh-artifact`,
          requestedRecordingId: recordingId,
        }));
        expect(packet.commands.reproduce).toContain(`--session tmp/movement-replay-lab/configured-recording-sources/${recordingId}.session.json`);
      });
    });
  });

  it("auto-refreshes stale default analysis from the configured local export", () => {
    const recordingId = `configured-refresh-recording-${process.pid}-${Date.now()}`;
    withDefaultAnalysisArtifact({
      replayStudio: {
        session: {
          recordingId,
        },
      },
      sessionId: recordingId,
    }, () => {
      withConfiguredExport(recordingId, (exportPath) => {
        const outPath = `tmp/movement-replay-lab/diagnose-configured-refresh-${process.pid}-${Date.now()}.json`;
        const result = runDiagnose([
          "--recording-id",
          recordingId,
          "--out",
          outPath,
          "--no-md",
          "--refresh",
          "--require-fresh-artifact",
        ]);

        expect(result.stderr).toBe("");
        expect(result.status).toBe(0);
        expect(result.stdout).toContain("Artifact: configured-recording-source");
        expect(result.stdout).toContain("Artifact freshness: recomputed");
        expect(result.stdout).toContain("Artifact fallback: Requested recording id");
        const packet = JSON.parse(readFileSync(outPath, "utf8"));
        expect(packet.recording).toEqual(expect.objectContaining({
          id: recordingId,
          sourceHashBasis: "source-session",
        }));
        expect(packet.artifact).toEqual(expect.objectContaining({
          checkedPaths: [
            ...DEFAULT_ANALYSIS_PATHS,
            CONFIGURED_EXPORT_POINTER_PATH,
            exportPath,
            `tmp/movement-replay-lab/configured-recording-sources/${recordingId}.session.json`,
          ],
          freshness: expect.objectContaining({
            status: "recomputed",
          }),
          kind: "configured-recording-source",
          path: `tmp/movement-replay-lab/configured-recording-sources/${recordingId}.session.json`,
          refreshCommand: `npm run movement:diagnose -- --recording-id ${recordingId} --refresh --require-fresh-artifact`,
          requestedRecordingId: recordingId,
          stalePath: "tmp/movement-replay-lab/current-analysis.json",
        }));
      });
    });
  });

  it("falls back from stale default analysis artifact to a matching committed fixture", () => {
    withDefaultAnalysisArtifact({
      replayStudio: {
        session: {
          recordingId: "stale-local-recording",
        },
      },
      sessionId: "stale-local-recording",
    }, () => {
      const outPath = `tmp/movement-replay-lab/diagnose-stale-default-fixture-${process.pid}-${Date.now()}.json`;
      const result = runDiagnose([
        "--recording-id",
        "owner-flicker-minimal",
        "--out",
        outPath,
        "--no-md",
      ]);

      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Replay Studio diagnosis: review-only / owner-flicker / motion-decision");
      expect(result.stdout).toContain("Artifact: default-analysis-committed-fixture-fallback scripts/movement-debug/fixtures/replay-studio/owner-flicker-minimal/analysis.json");
      expect(result.stdout).toContain("Artifact refresh: npm run movement:diagnose -- --fixture owner-flicker-minimal --require-fresh-artifact");
      expect(result.stdout).toContain("Artifact freshness: not-required");
      expect(result.stdout).toContain("Artifact fallback: Requested recording id owner-flicker-minimal was not present in the default analysis artifact");
      expect(result.stdout).toContain("--fixture owner-flicker-minimal");
      const packet = JSON.parse(readFileSync(outPath, "utf8"));
      expect(packet.recording.fixtureId).toBe("owner-flicker-minimal");
      expect(packet.artifact).toEqual(expect.objectContaining({
        fixtureId: "owner-flicker-minimal",
        freshness: expect.objectContaining({
          status: "not-required",
        }),
        kind: "default-analysis-committed-fixture-fallback",
        refreshCommand: "npm run movement:diagnose -- --fixture owner-flicker-minimal --require-fresh-artifact",
        requestedRecordingId: "owner-flicker-minimal",
        stalePath: "tmp/movement-replay-lab/current-analysis.json",
      }));
    });
  });

  it("exits non-zero in strict mode for a blocked fixture while still writing the repair packet", () => {
    const outPath = `tmp/movement-replay-lab/diagnose-strict-blocked-${process.pid}-${Date.now()}.json`;
    const result = runDiagnose([
      "--fixture",
      "wrong-side-leg-raise-minimal",
      "--out",
      outPath,
      "--no-md",
      "--strict",
    ]);

    expect(result.stderr).toBe("");
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Replay Studio diagnosis: blocked / avatar-wrong-side / mirror-side-mapping");
    expect(result.stdout).toContain("Fix area: mirror-side-mapping");
    const packet = JSON.parse(readFileSync(outPath, "utf8"));
    expect(packet.verdict.status).toBe("blocked");
    expect(packet.repair.owner).toBe("mirror-side-mapping");
  });

  it("exits zero in strict mode for an accepted fixture", () => {
    const result = runDiagnose([
      "--fixture",
      "accepted-leg-raise-minimal",
      "--no-md",
      "--strict",
    ]);

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Replay Studio diagnosis: accepted / none / unknown");
  });

  it("exits non-zero in strict mode for a review-only fixture", () => {
    const result = runDiagnose([
      "--fixture",
      "owner-flicker-minimal",
      "--no-md",
      "--strict",
    ]);

    expect(result.stderr).toBe("");
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Replay Studio diagnosis: review-only / owner-flicker / motion-decision");
  });

  it("reports invalid before packets as recoverable input failures", () => {
    const beforePath = `tmp/movement-replay-lab/diagnose-invalid-before-${process.pid}-${Date.now()}.json`;
    writeTempJson(beforePath, {
      notReplayStudioRepairPacket: true,
    });

    try {
      const result = runDiagnose([
        "--fixture",
        "accepted-leg-raise-minimal",
        "--before",
        beforePath,
        "--json",
        "--no-md",
      ]);

      expect(result.status).toBe(2);
      expect(result.stderr).toBe("");
      const payload = JSON.parse(result.stdout);
      expect(payload.failure).toEqual(expect.objectContaining({
        command: "movement:diagnose",
        message: `Expected ${beforePath} to be a schemaVersion 1 Replay Studio repair packet.`,
        outcome: "missing-input",
        path: beforePath,
        schemaVersion: 1,
      }));
      expect(payload.failure.recovery).toContain("movement:diagnose --out <file>");
    } finally {
      if (existsSync(beforePath)) unlinkSync(beforePath);
    }
  });

  it("reports unknown options as recoverable input failures", () => {
    const result = runDiagnose([
      "--not-a-real-option",
      "--json",
      "--no-md",
    ]);

    expect(result.status).toBe(2);
    expect(result.stderr).toBe("");
    const payload = JSON.parse(result.stdout);
    expect(payload.failure).toEqual(expect.objectContaining({
      command: "movement:diagnose",
      message: "Unknown option: --not-a-real-option",
      outcome: "missing-input",
      schemaVersion: 1,
    }));
    expect(payload.failure.recovery).toContain("--help");
  });

  it("reports missing option values as recoverable input failures", () => {
    const result = runDiagnose([
      "--analysis",
      "--json",
      "--no-md",
    ]);

    expect(result.status).toBe(2);
    expect(result.stderr).toBe("");
    const payload = JSON.parse(result.stdout);
    expect(payload.failure).toEqual(expect.objectContaining({
      command: "movement:diagnose",
      message: "Missing value for --analysis.",
      outcome: "missing-input",
      schemaVersion: 1,
    }));
    expect(payload.failure.recovery).toContain("--analysis <value>");
  });

  it("reports invalid frame values as recoverable input failures", () => {
    const result = runDiagnose([
      "--fixture",
      "accepted-leg-raise-minimal",
      "--frame",
      "not-a-frame",
      "--json",
      "--no-md",
    ]);

    expect(result.status).toBe(2);
    expect(result.stderr).toBe("");
    const payload = JSON.parse(result.stdout);
    expect(payload.failure).toEqual(expect.objectContaining({
      command: "movement:diagnose",
      message: "Invalid --frame value: not-a-frame.",
      outcome: "missing-input",
      schemaVersion: 1,
    }));
    expect(payload.failure.recovery).toContain("integer frame index");
  });

  it("reports an unknown fixture id as missing input", () => {
    const result = runDiagnose([
      "--fixture",
      "missing-fixture",
      "--json",
      "--no-md",
    ]);

    expect(result.status).toBe(2);
    expect(result.stderr).toBe("");
    const payload = JSON.parse(result.stdout);
    expect(payload.failure).toEqual(expect.objectContaining({
      availableFixtureIds: expect.arrayContaining([
        "accepted-leg-raise-minimal",
        "source-session-accepted-squat-minimal",
        "wrong-side-leg-raise-minimal",
      ]),
      command: "movement:diagnose",
      message: "Replay Studio fixture missing-fixture was not found in scripts/movement-debug/fixtures/replay-studio/registry.json.",
      outcome: "missing-input",
      path: "scripts/movement-debug/fixtures/replay-studio/registry.json",
      schemaVersion: 1,
    }));
  });

  it("prints missing analysis input as a recoverable diagnosis failure", () => {
    const result = runDiagnose([
      "--analysis",
      missingAnalysisPath(),
      "--no-md",
    ]);

    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Replay Studio diagnosis missing-input: Missing analysis JSON");
    expect(result.stderr).toContain("Recovery: Pass --analysis <file>, --session <file>, or regenerate");
  });

  it("reports invalid analysis JSON as a recoverable input failure", () => {
    const analysisPath = `tmp/movement-replay-lab/diagnose-invalid-analysis-${process.pid}-${Date.now()}.json`;
    mkdirSync(dirname(analysisPath), { recursive: true });
    writeFileSync(analysisPath, "{ invalid json\n");

    try {
      const result = runDiagnose([
        "--analysis",
        analysisPath,
        "--json",
        "--no-md",
      ]);

      expect(result.status).toBe(2);
      expect(result.stderr).toBe("");
      const payload = JSON.parse(result.stdout);
      expect(payload.failure).toEqual(expect.objectContaining({
        command: "movement:diagnose",
        outcome: "missing-input",
        path: analysisPath,
        schemaVersion: 1,
      }));
      expect(payload.failure.message).toContain(`Invalid analysis JSON: ${analysisPath}.`);
      expect(payload.failure.recovery).toContain("Fix the JSON syntax");
    } finally {
      if (existsSync(analysisPath)) unlinkSync(analysisPath);
    }
  });

  it("prints missing analysis input as JSON when requested", () => {
    const missingPath = missingAnalysisPath();
    const result = runDiagnose([
      "--analysis",
      missingPath,
      "--json",
      "--no-md",
    ]);

    expect(result.status).toBe(2);
    expect(result.stderr).toBe("");
    const payload = JSON.parse(result.stdout);
    expect(payload.failure).toEqual(expect.objectContaining({
      command: "movement:diagnose",
      message: `Missing analysis JSON: ${missingPath}`,
      outcome: "missing-input",
      path: missingPath,
      schemaVersion: 1,
    }));
    expect(payload.failure.recovery).toContain("Pass --analysis <file>");
  });
});
