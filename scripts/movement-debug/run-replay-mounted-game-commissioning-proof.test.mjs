import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCommissioningProofPlan,
  parseCommissioningProofArgs,
  runReplayMountedGameCommissioningProof,
} from "./run-replay-mounted-game-commissioning-proof.mjs";

describe("Replay/mounted Game commissioning proof command", () => {
  it("plans a fresh end-to-end run from a saved recording id", () => {
    const args = parseCommissioningProofArgs([
      "--recording-id",
      "px-recording",
      "--out",
      "tmp/commissioning-proof",
      "--local-test-auth",
      "--secret",
      "secret-a",
    ]);
    const plan = buildCommissioningProofPlan(args, "2026-07-17T00-00-00-000Z");

    expect(plan).toMatchObject({
      createFreshExport: true,
      recordingId: "px-recording",
    });
    expect(plan.exportPath).toBe(path.resolve("tmp/commissioning-proof/source.convex-export.zip"));
    expect(plan.sessionPath).toBe(path.resolve("tmp/commissioning-proof/replay-session.json"));
    expect(plan.packetProofOutDir).toBe(path.resolve("tmp/commissioning-proof/packet-proof"));
  });

  it("requires a recording id before creating any external proof artifacts", () => {
    const args = parseCommissioningProofArgs(["--out", "tmp/commissioning-proof"]);

    expect(() => buildCommissioningProofPlan(args)).toThrow("Pass --recording-id <movement id>.");
  });

  it("plans schema-v3 Deep Capture proof without changing the legacy default", () => {
    const deepArgs = parseCommissioningProofArgs([
      "--recording-id",
      "deep-recording",
      "--deep-capture",
    ]);

    expect(buildCommissioningProofPlan(deepArgs, "now").proofProfile).toBe("deep-capture-v1");
    expect(buildCommissioningProofPlan(
      parseCommissioningProofArgs(["--recording-id", "v2-recording"]),
      "now",
    ).proofProfile).toBe("commissioning-v2");
  });

  it("orchestrates export, replay-session conversion, and packet proof in order", async () => {
    const calls = [];
    const outDir = path.resolve("tmp/movement-replay-lab/test-commissioning-proof");
    const summaryPath = path.join(outDir, "packet-proof", "summary.json");
    await mkdir(path.dirname(summaryPath), { recursive: true });
    await writeFile(summaryPath, `${JSON.stringify({ passed: true })}\n`);

    const summary = await runReplayMountedGameCommissioningProof([
      "--recording-id",
      "px-recording",
      "--out",
      outDir,
      "--base-url",
      "http://localhost:3100",
      "--deep-capture",
      "--local-test-auth",
      "--secret",
      "secret-a",
    ], {
      runProcess: async (command, args) => {
        calls.push([command, args]);
      },
    });

    expect(summary).toMatchObject({
      passed: true,
      proofProfile: "deep-capture-v1",
      recordingId: "px-recording",
    });
    expect(calls).toEqual([
      [
        "npx",
        [
          "convex",
          "export",
          "--include-file-storage",
          "--path",
          path.join(outDir, "source.convex-export.zip"),
        ],
      ],
      [
        process.execPath,
        expect.arrayContaining([
          path.resolve("scripts/movement-debug/export-replay-session.mjs"),
          "--export",
          path.join(outDir, "source.convex-export.zip"),
          "--recording-id",
          "px-recording",
          "--out",
          path.join(outDir, "replay-session.json"),
        ]),
      ],
      [
        process.execPath,
        expect.arrayContaining([
          path.resolve("scripts/movement-debug/run-replay-mounted-game-packet-proof.mjs"),
          "--base-url",
          "http://localhost:3100",
          "--local-test-auth",
          "--secret",
          "secret-a",
          "--deep-capture",
          "--packet",
          path.join(outDir, "replay-session.json"),
          "--out",
          path.join(outDir, "packet-proof"),
        ]),
      ],
    ]);
  });

  it("can reuse an explicit export while preserving the same packet proof boundary", () => {
    const args = parseCommissioningProofArgs([
      "--recording-id",
      "px-recording",
      "--export",
      "tmp/existing-export.zip",
    ]);
    const plan = buildCommissioningProofPlan(args, "2026-07-17T00-00-00-000Z");

    expect(plan.createFreshExport).toBe(false);
    expect(plan.exportPath).toBe(path.resolve("tmp/existing-export.zip"));
  });
});
