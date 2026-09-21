import { describe, expect, it } from "vitest";

import {
  buildGameVisualReview,
  parseGameVisualReviewArgs,
} from "./write-game-visual-review.mjs";

const manifest = {
  capturedAt: "2026-07-06T17:50:19.895Z",
  captures: [
    {
      canvasPath: "tmp/captures/frame-0-canvas.png",
      currentUrl: "http://localhost:3100/demos/movements/movement-a/play?debugGameFrame=0",
      capturedDebugFrameIndex: 0,
      metrics: {
        brightPixels: 25,
        height: 1100,
        nonBackgroundPixels: 2048,
        width: 1440,
      },
      pagePath: "tmp/captures/frame-0-page.png",
      status: "captured",
      target: {
        cases: ["baseline", "first-scoring-frame"],
        displayLowerLabel: "squat",
        frameIndex: 0,
        movementId: "movement-a",
        recordingId: "recording-a",
        sourceLowerLabel: "squat",
      },
    },
  ],
  errors: [],
  summary: {
    capturedCount: 1,
    errorCount: 0,
    needsReviewCount: 0,
    targetCount: 1,
  },
};

describe("write game visual review", () => {
  it("parses review arguments", () => {
    expect(parseGameVisualReviewArgs([
      "--manifest",
      "tmp/manifest.json",
      "--out",
      "tmp/review.md",
      "--decisions-out",
      "tmp/decisions.json",
    ])).toMatchObject({
      decisionsOutPath: "tmp/decisions.json",
      manifestPath: "tmp/manifest.json",
      outPath: "tmp/review.md",
    });
  });

  it("builds a markdown checklist and JSON decision template", () => {
    const review = buildGameVisualReview(manifest, {
      generatedAt: "2026-07-06T18:00:00.000Z",
      manifestPath: "/repo/tmp/manifest.json",
    });

    expect(review.markdown).toContain("# Game Studio Visual Proof Review");
    expect(review.markdown).toContain("recording-a");
    expect(review.markdown).toContain("first-scoring-frame");
    expect(review.decisionTemplate).toMatchObject({
      manifestPath: "/repo/tmp/manifest.json",
      schema: "hakken-game-visual-review-decisions/v1",
      summary: {
        capturedCount: 1,
        errorCount: 0,
        proofCases: {
          baseline: 1,
          "first-scoring-frame": 1,
        },
        statusCounts: {
          captured: 1,
        },
      },
    });
    expect(review.decisionTemplate.decisions[0]).toMatchObject({
      decision: "TODO",
      key: "recording-a:0:baseline+first-scoring-frame",
      reviewContext: {
        canvasPath: "tmp/captures/frame-0-canvas.png",
        capturedDebugFrameIndex: 0,
        displayLowerLabel: "squat",
        frameIndex: 0,
        sourceLowerLabel: "squat",
      },
    });
  });
});
