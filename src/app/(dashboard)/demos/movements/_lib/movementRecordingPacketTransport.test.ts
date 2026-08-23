// @vitest-environment node
//
// Node, deliberately. The browser test environment has no CompressionStream and
// no streaming Blob, so under jsdom this module would only ever exercise its
// uncompressed fallback — and compression is the whole point of it.
import { describe, expect, it } from "vitest";
import {
  buildMovementRecordingUploadBody,
  readMovementRecordingPacket,
  serializeMovementRecordingPacket,
} from "./movementRecordingPacketTransport";

describe("serializeMovementRecordingPacket", () => {
  it("writes coordinates to four decimal places", () => {
    const written = JSON.parse(
      serializeMovementRecordingPacket({ x: 0.5123456789012345, y: -0.0987654321 }),
    );

    expect(written).toEqual({ x: 0.5123, y: -0.0988 });
  });

  it("leaves timestamps exactly as they are", () => {
    // Thirteen digits. Rounding this by multiplying it out would push it past
    // the largest integer JavaScript holds exactly and corrupt the ordering the
    // replay depends on.
    const capturedAt = 1755950000123;
    const written = JSON.parse(serializeMovementRecordingPacket({ capturedAt, frameWidth: 1280 }));

    expect(written.capturedAt).toBe(capturedAt);
    expect(written.frameWidth).toBe(1280);
  });

  it("keeps a rounded coordinate within the movement tolerance", () => {
    const original = 0.5123456789012345;
    const written = JSON.parse(serializeMovementRecordingPacket({ original })).original;

    // The avatar is held to 0.1 per body segment. This is thousands of times
    // finer, so nothing the replay or the game measures can see it.
    expect(Math.abs(written - original)).toBeLessThan(0.0001);
  });
});

describe("movement recording packet transport", () => {
  const packet = {
    schemaVersion: 3,
    capturedAt: 1755950000123,
    frames: Array.from({ length: 40 }, (_, index) => ({
      timestamp: 1755950000000 + index * 33,
      pose: Array.from({ length: 33 }, (_, point) => ({
        x: (point + index) / 97,
        y: (point * 2 + index) / 89,
        z: (point - index) / 101,
      })),
    })),
  };

  it("compresses on the way out and reads back exactly what went in", async () => {
    const json = serializeMovementRecordingPacket(packet);
    const { body, contentType } = await buildMovementRecordingUploadBody(json);

    expect(contentType).toBe("application/gzip");
    const uploaded = body as Blob;
    expect(uploaded.size).toBeLessThan(json.length / 2);

    const readBack = await readMovementRecordingPacket(new Response(uploaded));

    expect(readBack).toEqual(JSON.parse(json));
  });

  it("still opens a recording saved before any of this existed", async () => {
    const plainJson = JSON.stringify(packet);

    const readBack = await readMovementRecordingPacket(new Response(plainJson));

    expect(readBack).toEqual(packet);
  });
});
