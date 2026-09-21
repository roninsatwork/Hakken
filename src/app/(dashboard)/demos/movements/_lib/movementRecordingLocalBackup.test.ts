import { describe, expect, it, vi } from "vitest";
import type { MovementFrameEnvelope } from "./movementTypes";
import {
  createMovementRecordingBackupFilename,
  downloadMovementRecordingLocalBackup,
  serializeMovementRecordingBackupPacket,
} from "./movementRecordingLocalBackup";

const packet: MovementFrameEnvelope = {
  fps: 30,
  frames: [],
  schemaVersion: 3,
  sourcePacketHash: `sha256:${"a".repeat(64)}`,
};

describe("movementRecordingLocalBackup", () => {
  it("creates a deterministic filesystem-safe filename", () => {
    expect(createMovementRecordingBackupFilename({
      now: new Date("2026-07-18T08:09:10.123Z"),
      schemaVersion: 3,
      title: "  Full Motion: Eyes & Hands!  ",
    })).toBe(
      "hakken-movement-schema-v3-full-motion-eyes-hands-2026-07-18T08-09-10-123Z.json",
    );
  });

  it("downloads the packet as JSON without camera media", async () => {
    const createdBlobs: Blob[] = [];
    const createObjectURL = vi.fn((blob: Blob) => {
      createdBlobs.push(blob);
      return "blob:movement-backup";
    });
    const revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    const result = downloadMovementRecordingLocalBackup({
      now: new Date("2026-07-18T08:09:10.123Z"),
      packet,
      title: "Full Motion",
      urlObject: { createObjectURL, revokeObjectURL },
    });

    expect(result).toEqual({
      filename: "hakken-movement-schema-v3-full-motion-2026-07-18T08-09-10-123Z.json",
      packetHash: packet.sourcePacketHash,
    });
    expect(click).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    const blob = createdBlobs[0]!;
    expect(blob.type).toBe("application/json");
    expect(blob.size).toBe(serializeMovementRecordingBackupPacket(packet).length);
    expect(serializeMovementRecordingBackupPacket(packet)).toBe(JSON.stringify(packet));
    expect(document.querySelector("a[download]")).not.toBeInTheDocument();

    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:movement-backup");
    click.mockRestore();
  });
});
