import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  runLatestDeepCaptureProof,
  selectLatestEligibleDeepCapture,
} from "./run-latest-deep-capture-proof.mjs";

describe("latest eligible Deep Capture proof", () => {
  it("selects the newest eligible schema-v3 recording only", () => {
    expect(selectLatestEligibleDeepCapture({
      results: [
        { createdAt: 30, eligible: false, recordingId: "failed-new", schemaVersion: 3 },
        { createdAt: 20, eligible: true, recordingId: "deep-new", schemaVersion: 3 },
        { createdAt: 10, eligible: true, recordingId: "deep-old", schemaVersion: 3 },
        { createdAt: 40, eligible: true, recordingId: "legacy", schemaVersion: 1 },
      ],
    })).toMatchObject({ recordingId: "deep-new" });
  });

  it("fails clearly without deleting or promoting legacy recordings", () => {
    expect(() => selectLatestEligibleDeepCapture({
      results: [{ createdAt: 10, eligible: false, recordingId: "legacy", schemaVersion: 1 }],
    })).toThrow("No eligible schema-v3 Deep Capture recording exists");
  });

  it("exports, inventories, selects, and routes the newest packet into existing proof", async () => {
    const outDir = path.resolve("tmp/movement-replay-lab/test-latest-deep-capture-proof");
    const calls = [];
    const summary = await runLatestDeepCaptureProof([
      "--out", outDir,
      "--base-url", "http://localhost:3100",
      "--local-test-auth",
      "--secret", "secret-a",
    ], {
      runProcess: async (command, args) => {
        calls.push([command, args]);
        if (args.includes("--all-recordings")) {
          const inventoryPath = args[args.indexOf("--out") + 1];
          await mkdir(path.dirname(inventoryPath), { recursive: true });
          await writeFile(inventoryPath, `${JSON.stringify({
            results: [{
              createdAt: 200,
              eligible: true,
              recordingId: "deep-latest",
              schemaVersion: 3,
              title: "Latest Deep Capture",
            }],
          })}\n`);
        }
        if (args.includes("--recording-id")) {
          const proofOutDir = args[args.indexOf("--out") + 1];
          await mkdir(proofOutDir, { recursive: true });
          await writeFile(path.join(proofOutDir, "summary.json"), `${JSON.stringify({ passed: true })}\n`);
        }
      },
    });

    expect(summary).toMatchObject({
      passed: true,
      recordingId: "deep-latest",
      title: "Latest Deep Capture",
    });
    expect(calls[0]).toEqual([
      "npx",
      expect.arrayContaining(["convex", "export", "--include-file-storage"]),
    ]);
    expect(calls[1][1]).toEqual(expect.arrayContaining([
      "--deep-capture",
      "--all-recordings",
    ]));
    expect(calls[2][1]).toEqual(expect.arrayContaining([
      "--deep-capture",
      "--recording-id",
      "deep-latest",
      "--export",
      path.join(outDir, "source.convex-export.zip"),
      "--local-test-auth",
      "--secret",
      "secret-a",
    ]));
  });
});
