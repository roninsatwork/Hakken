import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import {
  canvasPixelMetrics,
  flattenGameVisualCaptureTargets,
  parseGameVisualCaptureArgs,
} from "./capture-game-visual-proof.mjs";

const plan = {
  baseUrl: "http://localhost:3000",
  sessions: [
    {
      frames: [
        {
          cases: ["baseline"],
          frameIndex: 0,
          playRouteHint: "http://localhost:3000/demos/movements/movement-a/play?debugTracking=1&guidedPreview=1&debugGameFrame=0",
        },
        {
          cases: ["strongest-squat"],
          frameIndex: 24,
          playRouteHint: "http://localhost:3000/demos/movements/movement-a/play?debugTracking=1&guidedPreview=1&debugGameFrame=24",
        },
      ],
      movementId: "movement-a",
      proofCases: ["baseline", "strongest-squat"],
      recordingId: "recording-a",
    },
    {
      frames: [
        {
          cases: ["first-tracking-help-frame"],
          frameIndex: 8,
        },
      ],
      movementId: "movement-b",
      playRouteHint: "http://localhost:3000/demos/movements/movement-b/play?debugTracking=1&guidedPreview=1",
      recordingId: "recording-b",
    },
  ],
};

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuffer, data]);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(body), 8 + data.length);
  return chunk;
}

function tinyPng() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.from([
    0,
    7, 7, 11, 255,
    220, 180, 120, 255,
  ]);

  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("capture game visual proof", () => {
  it("parses capture arguments", () => {
    expect(parseGameVisualCaptureArgs([
      "--plan",
      "tmp/plan.json",
      "--out",
      "tmp/out",
      "--base-url",
      "http://localhost:3100",
      "--storage-state",
      "e2e/.auth/super-admin.json",
      "--max-sessions",
      "2",
      "--max-frames",
      "3",
      "--headed",
    ])).toMatchObject({
      baseUrl: "http://localhost:3100",
      headed: true,
      maxFrames: 3,
      maxSessions: 2,
      outDir: "tmp/out",
      planPath: "tmp/plan.json",
      storageState: "e2e/.auth/super-admin.json",
    });
  });

  it("flattens target frames and rewrites the app base URL", () => {
    expect(flattenGameVisualCaptureTargets(plan, {
      baseUrl: "http://localhost:3100",
      maxFrames: 2,
    })).toEqual([
      expect.objectContaining({
        cases: ["baseline"],
        frameIndex: 0,
        movementId: "movement-a",
        recordingId: "recording-a",
        url: "http://localhost:3100/demos/movements/movement-a/play?debugTracking=1&guidedPreview=1&debugGameFrame=0",
      }),
      expect.objectContaining({
        cases: ["strongest-squat"],
        frameIndex: 24,
        url: "http://localhost:3100/demos/movements/movement-a/play?debugTracking=1&guidedPreview=1&debugGameFrame=24",
      }),
    ]);
  });

  it("builds frame URLs from a session route when a frame route is missing", () => {
    expect(flattenGameVisualCaptureTargets(plan, {
      baseUrl: "http://localhost:3100",
      maxSessions: 2,
    }).at(-1)).toMatchObject({
      cases: ["first-tracking-help-frame"],
      frameIndex: 8,
      url: "http://localhost:3100/demos/movements/movement-b/play?debugTracking=1&guidedPreview=1&debugGameFrame=8",
    });
  });

  it("extracts simple non-background canvas metrics from PNG screenshots", () => {
    expect(canvasPixelMetrics(tinyPng())).toMatchObject({
      brightPixels: 1,
      height: 1,
      nonBackgroundPixels: 1,
      width: 2,
    });
  });
});
