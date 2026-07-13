import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Replay Studio golden diagnosis fixtures", () => {
  it("runs the committed fixture registry without local scratch inputs", () => {
    const result = spawnSync(process.execPath, [
      "scripts/movement-debug/diagnose-replay-studio-golden.mjs",
    ], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "OK accepted-leg-raise-minimal: accepted/none/unknown",
    );
    expect(result.stdout).toContain(
      "OK rendered-telemetry-missing-minimal: blocked/avatar-output-missing/rendered-telemetry",
    );
    expect(result.stdout).toContain(
      "OK source-normalization-mismatch-minimal: review-only/source-normalization-mismatch/source-normalization",
    );
    expect(result.stdout).toContain(
      "OK calibration-unreliable-minimal: blocked/calibration-unreliable/calibration",
    );
    expect(result.stdout).toContain(
      "OK source-blocked-lower-body-minimal: review-only/source-not-trustworthy/source-capture",
    );
    expect(result.stdout).toContain(
      "OK source-session-source-blocked-lower-body-minimal: blocked/source-not-trustworthy/source-capture",
    );
    expect(result.stdout).toContain(
      "OK source-session-accepted-squat-minimal: blocked/avatar-output-missing/rendered-telemetry",
    );
    expect(result.stdout).toContain(
      "OK source-session-rendered-final-bone-mismatch-minimal: blocked/avatar-not-following-leg/vrm-application",
    );
    expect(result.stdout).toContain(
      "OK wrong-side-leg-raise-minimal: blocked/avatar-wrong-side/mirror-side-mapping",
    );
    expect(result.stdout).toContain(
      "OK owner-flicker-minimal: review-only/owner-flicker/motion-decision",
    );
    expect(result.stdout).toContain(
      "OK support-contact-seated-minimal: blocked/avatar-seated-while-source-standing/support-contact",
    );
    expect(result.stdout).toContain(
      "OK root-motion-drift-minimal: blocked/root-motion-wrong/retarget-solve",
    );
    expect(result.stdout).toContain(
      "OK avatar-leg-missing-minimal: blocked/avatar-not-following-leg/vrm-application",
    );
    expect(result.stdout).toContain(
      "OK rendered-final-bone-mismatch-minimal: blocked/avatar-not-following-leg/vrm-application",
    );
    expect(result.stdout).toContain(
      "OK visual-proof-missing-minimal: blocked/visual-proof-missing/proof-artifact",
    );
    expect(result.stdout).toContain(
      "Coverage stages: source-capture, source-normalization, calibration, motion-decision, mirror-side-mapping, support-contact, retarget-solve, vrm-application, rendered-telemetry, proof-artifact, unknown",
    );
    expect(result.stdout).toContain("Coverage gaps: none");
    const packet = JSON.parse(readFileSync(
      "tmp/movement-replay-lab/replay-studio-golden/wrong-side-leg-raise-minimal.packet.json",
      "utf8",
    ));
    expect(packet.recording.fixtureId).toBe("wrong-side-leg-raise-minimal");
    expect(packet.scope).toEqual(expect.objectContaining({
      silentSkipCount: 0,
      totalFramesCompared: 1,
      totalFramesExpected: 1,
    }));
  });

  it("prints a machine-readable golden summary as JSON", () => {
    const result = spawnSync(process.execPath, [
      "scripts/movement-debug/diagnose-replay-studio-golden.mjs",
      "--json",
    ], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload).toEqual(expect.objectContaining({
      command: "movement:diagnose:golden",
      fixtureCount: 15,
      ok: true,
      schemaVersion: 1,
    }));
    expect(payload.stageCoverage).toEqual(expect.objectContaining({
      gapStages: [],
      unknownStages: [],
    }));
    expect(payload.results).toEqual(expect.arrayContaining([
      expect.objectContaining({
        artifactCheckedPaths: [
          "scripts/movement-debug/fixtures/replay-studio/registry.json",
          "scripts/movement-debug/fixtures/replay-studio/source-session-accepted-squat-minimal/session.json",
        ],
        artifactFreshnessStatus: "recomputed",
        artifactKind: "committed-fixture",
        artifactPath: "scripts/movement-debug/fixtures/replay-studio/source-session-accepted-squat-minimal/session.json",
        evidenceStatus: "insufficient-evidence",
        failureCode: "avatar-output-missing",
        firstDivergentStage: "rendered-telemetry",
        fixtureId: "source-session-accepted-squat-minimal",
        fixtureInputKind: "session",
        fixtureInputPath: "scripts/movement-debug/fixtures/replay-studio/source-session-accepted-squat-minimal/session.json",
        fixtureRefreshCommand: "npm run movement:diagnose -- --fixture source-session-accepted-squat-minimal --require-fresh-artifact",
        id: "source-session-accepted-squat-minimal",
        ok: true,
        sourceHashBasis: "source-session",
        status: "blocked",
        totalFramesCompared: 3,
        totalFramesExpected: 3,
      }),
      expect.objectContaining({
        artifactFreshnessStatus: "recomputed",
        artifactKind: "committed-fixture",
        artifactPath: "scripts/movement-debug/fixtures/replay-studio/source-session-source-blocked-lower-body-minimal/session.json",
        failureCode: "source-not-trustworthy",
        firstDivergentStage: "source-capture",
        fixtureId: "source-session-source-blocked-lower-body-minimal",
        fixtureInputKind: "session",
        fixtureInputPath: "scripts/movement-debug/fixtures/replay-studio/source-session-source-blocked-lower-body-minimal/session.json",
        fixtureRefreshCommand: "npm run movement:diagnose -- --fixture source-session-source-blocked-lower-body-minimal --require-fresh-artifact",
        id: "source-session-source-blocked-lower-body-minimal",
        ok: true,
        sourceHashBasis: "source-session",
      }),
      expect.objectContaining({
        artifactFreshnessStatus: "recomputed",
        artifactKind: "committed-fixture",
        artifactPath: "scripts/movement-debug/fixtures/replay-studio/source-session-rendered-final-bone-mismatch-minimal/session.json",
        evidenceStatus: "proven",
        failureCode: "avatar-not-following-leg",
        firstDivergentStage: "vrm-application",
        fixtureId: "source-session-rendered-final-bone-mismatch-minimal",
        fixtureInputKind: "session",
        fixtureInputPath: "scripts/movement-debug/fixtures/replay-studio/source-session-rendered-final-bone-mismatch-minimal/session.json",
        fixtureRefreshCommand: "npm run movement:diagnose -- --fixture source-session-rendered-final-bone-mismatch-minimal --require-fresh-artifact",
        id: "source-session-rendered-final-bone-mismatch-minimal",
        ok: true,
        repairOwner: "vrm-application",
        sourceHash: "sha256:6332e38deee7da93c1482032201f7b4ff4ec3e834fc9475419ae8c3811de4a64",
        sourceHashBasis: "source-session",
        status: "blocked",
        totalFramesCompared: 3,
        totalFramesExpected: 3,
        totalFramesRendered: 1,
      }),
      expect.objectContaining({
        artifactFreshnessStatus: "not-required",
        artifactKind: "committed-fixture",
        artifactPath: "scripts/movement-debug/fixtures/replay-studio/rendered-final-bone-mismatch-minimal/analysis.json",
        evidenceStatus: "proven",
        failureCode: "avatar-not-following-leg",
        firstDivergentStage: "vrm-application",
        fixtureId: "rendered-final-bone-mismatch-minimal",
        fixtureInputKind: "analysis",
        fixtureInputPath: "scripts/movement-debug/fixtures/replay-studio/rendered-final-bone-mismatch-minimal/analysis.json",
        fixtureRefreshCommand: "npm run movement:diagnose -- --fixture rendered-final-bone-mismatch-minimal --require-fresh-artifact",
        id: "rendered-final-bone-mismatch-minimal",
        ok: true,
        repairOwner: "vrm-application",
        sourceHash: "fnv1a32:248efa7c",
        sourceHashBasis: "analysis-report",
        status: "blocked",
        totalFramesCompared: 1,
        totalFramesExpected: 1,
        totalFramesRendered: 1,
      }),
    ]));
  });

  it("writes a clean machine-readable golden summary file", () => {
    const outPath = `tmp/movement-replay-lab/golden-summary-${process.pid}-${Date.now()}.json`;
    const result = spawnSync(process.execPath, [
      "scripts/movement-debug/diagnose-replay-studio-golden.mjs",
      "--json-out",
      outPath,
    ], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`Wrote ${process.cwd()}/${outPath}`);
    const payload = JSON.parse(readFileSync(outPath, "utf8"));
    expect(payload).toEqual(expect.objectContaining({
      command: "movement:diagnose:golden",
      fixtureCount: 15,
      ok: true,
      schemaVersion: 1,
    }));
    expect(payload.stageCoverage.gapStages).toEqual([]);
    expect(payload.results).toEqual(expect.arrayContaining([
      expect.objectContaining({
        artifactFreshnessStatus: "not-required",
        artifactKind: "committed-fixture",
        artifactPath: "scripts/movement-debug/fixtures/replay-studio/wrong-side-leg-raise-minimal/analysis.json",
        fixtureInputKind: "analysis",
        fixtureInputPath: "scripts/movement-debug/fixtures/replay-studio/wrong-side-leg-raise-minimal/analysis.json",
        fixtureRefreshCommand: "npm run movement:diagnose -- --fixture wrong-side-leg-raise-minimal --require-fresh-artifact",
        id: "wrong-side-leg-raise-minimal",
        sourceHashBasis: "analysis-report",
      }),
    ]));
  });
});
