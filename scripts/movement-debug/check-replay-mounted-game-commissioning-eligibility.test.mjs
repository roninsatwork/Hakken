import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildReplayMountedGameCommissioningEligibilityReport,
  compactEligibilityFailures,
  recordingTargetsFromExport,
  runReplayMountedGameCommissioningEligibility,
} from "./check-replay-mounted-game-commissioning-eligibility.mjs";

function completePacket(id = "packet-a") {
  const samples = [{ startReadiness: { status: "ready" } }];
  const channelSummary = Object.fromEntries(
    ["blendshapes", "camera", "face", "hands", "pose", "worldPose"].map((channel) => [
      channel,
      { complete: true, presentFrames: 1, totalFrames: 1 },
    ]),
  );
  return {
    channelSummary,
    id,
    inputContract: {
      id: "movement-player-input-v1",
      setup: { id: "movement-player-setup-v1" },
    },
    sampleCount: 1,
    samples,
    schemaVersion: 2,
    setupPrefix: { complete: true },
    sourcePacketHash: `sha256:${"a".repeat(64)}`,
    title: "Complete Packet",
  };
}

describe("Replay/mounted Game commissioning eligibility preflight", () => {
  it("compacts repeated frame failures into actionable groups", () => {
    const groups = compactEligibilityFailures([
      "Frame 0 is missing Deep Capture profile evidence.",
      "Frame 1 is missing Deep Capture profile evidence.",
      "Frame 1 is missing Deep Capture profile evidence.",
      "recording schemaVersion must be 3",
    ]);

    expect(groups).toEqual(expect.arrayContaining([
      expect.objectContaining({
        affectedFrameCount: 2,
        firstFrame: 0,
        lastFrame: 1,
        message: "is missing Deep Capture profile evidence.",
        occurrenceCount: 3,
        scope: "frame",
      }),
      expect.objectContaining({
        message: "recording schemaVersion must be 3",
        occurrenceCount: 1,
        scope: "packet",
      }),
    ]));
  });

  it("marks complete schema-v2 packets eligible", async () => {
    const packetPath = path.resolve("tmp/movement-replay-lab/test-eligibility/complete.session.json");
    await mkdir(path.dirname(packetPath), { recursive: true });
    await writeFile(packetPath, `${JSON.stringify(completePacket())}\n`);

    const report = await buildReplayMountedGameCommissioningEligibilityReport([
      { packetPath, recordingId: "packet-a", title: "Complete Packet" },
    ]);

    expect(report).toMatchObject({
      eligibleCount: 1,
      ineligibleCount: 0,
      passed: true,
      targetCount: 1,
    });
    expect(report.results[0]).toMatchObject({
      eligible: true,
      failures: [],
      recordingId: "packet-a",
    });
  });

  it("explains why legacy packets cannot be used as commissioning proof", async () => {
    const packetPath = path.resolve("tmp/movement-replay-lab/test-eligibility/legacy.session.json");
    await mkdir(path.dirname(packetPath), { recursive: true });
    await writeFile(packetPath, `${JSON.stringify({
      id: "legacy-a",
      sampleCount: 1,
      samples: [{ tracking: {} }],
      title: "Legacy Packet",
    })}\n`);

    const report = await buildReplayMountedGameCommissioningEligibilityReport([
      { packetPath },
    ]);

    expect(report).toMatchObject({
      eligibleCount: 0,
      ineligibleCount: 1,
      passed: false,
    });
    expect(report.results[0].failures).toEqual(expect.arrayContaining([
      "recording schemaVersion must be 2",
      "input contract must be movement-player-input-v1",
      "sourcePacketHash must be a complete SHA-256 identity",
      "hands channel evidence is missing",
      "face channel evidence is missing",
      "blendshapes channel evidence is missing",
      "camera channel evidence is missing",
      "every sample must preserve its readiness decision",
    ]));
  });

  it("does not treat a complete schema-v2 packet as Deep Capture commissioning evidence", async () => {
    const packetPath = path.resolve("tmp/movement-replay-lab/test-eligibility/v2-not-deep.session.json");
    await mkdir(path.dirname(packetPath), { recursive: true });
    await writeFile(packetPath, `${JSON.stringify(completePacket())}\n`);

    const report = await buildReplayMountedGameCommissioningEligibilityReport(
      [{ packetPath }],
      { requireDeepCapture: true },
    );

    expect(report).toMatchObject({
      eligibleCount: 0,
      proofProfile: "deep-capture-v1",
    });
    expect(report.results[0].failures).toContain("recording schemaVersion must be 3");
    expect(report.results[0].rawFailureCount).toBeGreaterThanOrEqual(report.results[0].failures.length);
  });

  it("reads manifest recording entries and writes a summary", async () => {
    const root = path.resolve("tmp/movement-replay-lab/test-eligibility/manifest");
    const packetPath = path.join(root, "complete.session.json");
    const manifestPath = path.join(root, "manifest.json");
    const outPath = path.join(root, "summary.json");
    await mkdir(root, { recursive: true });
    await writeFile(packetPath, `${JSON.stringify(completePacket("packet-from-manifest"))}\n`);
    await writeFile(manifestPath, `${JSON.stringify({
      recordings: [{
        expectedFrameCount: 1,
        id: "packet-from-manifest",
        session: packetPath,
        title: "Manifest Packet",
      }],
    })}\n`);

    const report = await runReplayMountedGameCommissioningEligibility([
      "--manifest",
      manifestPath,
      "--out",
      outPath,
    ]);

    expect(report.results[0]).toMatchObject({
      eligible: true,
      expectedFrameCount: 1,
      recordingId: "packet-from-manifest",
      schemaVersion: 2,
      title: "Complete Packet",
    });
  });

  it("converts saved recording ids from an export before checking eligibility", async () => {
    const root = path.resolve("tmp/movement-replay-lab/test-eligibility/export-backed");
    const convertedOut = path.join(root, "converted");
    const exportPath = path.join(root, "source.convex-export.zip");

    const report = await runReplayMountedGameCommissioningEligibility([
      "--recording-id",
      "recording-a",
      "--export",
      exportPath,
      "--converted-out",
      convertedOut,
    ], {
      runProcess: async (_script, args) => {
        expect(args).toEqual(expect.arrayContaining([
          "--export",
          exportPath,
          "--recording-id",
          "recording-a",
        ]));
        const outPath = args[args.indexOf("--out") + 1];
        await mkdir(path.dirname(outPath), { recursive: true });
        await writeFile(outPath, `${JSON.stringify(completePacket("recording-a"))}\n`);
      },
    });

    expect(report.results[0]).toMatchObject({
      convertedFromExport: exportPath,
      eligible: true,
      recordingId: "recording-a",
    });
  });

  it("discovers every saved movement in an export without a maintained id manifest", async () => {
    const root = path.resolve("tmp/movement-replay-lab/test-eligibility/all-recordings");
    const exportPath = path.join(root, "export");
    const movementsPath = path.join(exportPath, "movements");
    const convertedOut = path.join(root, "converted");
    await mkdir(movementsPath, { recursive: true });
    await writeFile(path.join(movementsPath, "documents.jsonl"), [
      JSON.stringify({ _id: "recording-a", frameCount: 10, poseData: "storage-a", title: "First" }),
      JSON.stringify({ _id: "recording-b", frameCount: 20, poseData: "storage-b", title: "Second" }),
      JSON.stringify({ _id: "not-a-movement-packet", title: "Missing pose data" }),
    ].join("\n"));

    await expect(recordingTargetsFromExport(exportPath)).resolves.toEqual([
      { expectedFrameCount: 10, recordingId: "recording-a", title: "First" },
      { expectedFrameCount: 20, recordingId: "recording-b", title: "Second" },
    ]);

    const convertedIds = [];
    const report = await runReplayMountedGameCommissioningEligibility([
      "--all-recordings",
      "--export",
      exportPath,
      "--converted-out",
      convertedOut,
    ], {
      runProcess: async (_script, args) => {
        const recordingId = args[args.indexOf("--recording-id") + 1];
        convertedIds.push(recordingId);
        const outPath = args[args.indexOf("--out") + 1];
        await mkdir(path.dirname(outPath), { recursive: true });
        await writeFile(outPath, `${JSON.stringify(completePacket(recordingId))}\n`);
      },
    });

    expect(convertedIds).toEqual(["recording-a", "recording-b"]);
    expect(report).toMatchObject({
      eligibleCount: 2,
      selectionMode: "all-recordings",
      sourceExport: exportPath,
      targetCount: 2,
    });
  });
});
