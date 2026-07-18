import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildMovementRecordingPacket } from "../../src/app/(dashboard)/demos/movements/_lib/saveMovementRecording";
import {
  DEEP_CAPTURE_TEST_READINESS,
  createCompleteDeepCaptureFrames,
} from "../../src/app/(dashboard)/demos/movements/_lib/movementDeepCaptureTestFixture";
import { validateCompleteReplayGamePacket } from "./run-replay-mounted-game-packet-proof.mjs";
import { recoverLocalMovementPacket } from "./recover-local-movement-packet-cli";

const tempDirs: string[] = [];

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("recoverLocalMovementPacket", () => {
  it("recovers the exact browser packet into a proof-ready Replay/Game session", async () => {
    const directory = mkdtempSync(join(tmpdir(), "sonae-local-packet-test-"));
    tempDirs.push(directory);
    const packetPath = join(directory, "downloaded-packet.json");
    const outPath = join(directory, "recovered-session.json");
    const packet = await buildMovementRecordingPacket({
      captureStartReadiness: DEEP_CAPTURE_TEST_READINESS,
      frames: createCompleteDeepCaptureFrames(),
      requireDeepCapturePacket: true,
    });
    writeFileSync(packetPath, JSON.stringify(packet));

    const result = recoverLocalMovementPacket({ outPath, packetPath });

    expect(result.session).toMatchObject({
      id: expect.stringMatching(/^local-backup-/),
      sampleCount: 60,
      schemaVersion: 3,
      sourcePacketHash: packet.sourcePacketHash,
    });
    expect(validateCompleteReplayGamePacket(result.session, {
      requireDeepCapture: true,
    })).toEqual([]);
    expect(JSON.parse(readFileSync(outPath, "utf8"))).toMatchObject({
      schemaVersion: 3,
      sourcePacketHash: packet.sourcePacketHash,
    });
    expect(readFileSync(packetPath, "utf8")).toBe(JSON.stringify(packet));
  });
});
