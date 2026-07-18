import { describe, expect, it, vi } from "vitest";
import {
  MOVEMENT_ESSENTIAL_FACE_LANDMARK_INDEXES,
  MOVEMENT_HAND_CONNECTIONS,
  drawMovementDenseBodyOverlay,
  drawMovementFaceOverlay,
  drawMovementHandOverlay,
  selectMovementDenseBodyOverlayAnchors,
} from "./movementSkeleton";

function context() {
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    fill: vi.fn(),
    fillStyle: "",
    globalAlpha: 1,
    lineCap: "butt",
    lineJoin: "miter",
    lineTo: vi.fn(),
    lineWidth: 1,
    moveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    shadowBlur: 0,
    shadowColor: "",
    stroke: vi.fn(),
    strokeStyle: "",
  } as unknown as CanvasRenderingContext2D;
}

function face(count = 478) {
  return Array.from({ length: count }, (_, index) => ({
    x: 0.35 + (index % 24) * 0.012,
    y: 0.18 + Math.floor(index / 24) * 0.008,
    z: 0,
  }));
}

function denseAnchors() {
  return (["head", "chest", "leftHand"] as const).flatMap((region, regionIndex) => (
    Array.from({ length: 10 }, (_, index) => ({
      anatomicalSide: region === "leftHand" ? "left" as const : "midline" as const,
      depth: null,
      id: `${region}-${index}`,
      image: { x: 0.2 + regionIndex * 0.2 + index * 0.005, y: 0.2 + index * 0.02 },
      normal: null,
      occluded: false,
      provenance: {
        ageMs: 0,
        confidence: 0.9,
        inferenceTimestampMs: 1_000,
        origin: "model-estimated" as const,
        sourceTimestampMs: 990,
      },
      region,
      surface: "front" as const,
    }))
  ));
}

function hand(offset: number) {
  return Array.from({ length: 21 }, (_, index) => ({
    visibility: 1,
    x: offset + (index % 4) * 0.02,
    y: 0.72 - Math.floor(index / 4) * 0.03,
    z: 0,
  }));
}

describe("movement capture hand overlay", () => {
  it("visibly draws all 21 real finger points and every finger connection", () => {
    const ctx = context();
    drawMovementHandOverlay(ctx, {
      left: { landmarks: hand(0.2) },
      right: { landmarks: hand(0.65) },
    }, 1280, 720);

    expect(ctx.arc).toHaveBeenCalledTimes(42);
    expect(ctx.lineTo).toHaveBeenCalledTimes(MOVEMENT_HAND_CONNECTIONS.length * 2);
    expect(ctx.stroke).toHaveBeenCalledTimes(2);
  });

  it("draws no false finger overlay when 21-point evidence is missing", () => {
    const ctx = context();
    drawMovementHandOverlay(ctx, {
      left: null,
      right: { landmarks: hand(0.65).slice(0, 4) },
    }, 1280, 720);

    expect(ctx.arc).not.toHaveBeenCalled();
    expect(ctx.lineTo).not.toHaveBeenCalled();
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it("draws no finger overlay from a malformed 21-point payload", () => {
    const ctx = context();
    const malformed = hand(0.2);
    malformed[8] = { ...malformed[8]!, x: Number.NaN };

    drawMovementHandOverlay(ctx, {
      left: { landmarks: malformed },
    }, 1280, 720);

    expect(ctx.arc).not.toHaveBeenCalled();
    expect(ctx.lineTo).not.toHaveBeenCalled();
    expect(ctx.stroke).not.toHaveBeenCalled();
  });
});

describe("movement capture face overlay", () => {
  it("draws the lighter structural face set by default and all 478 points on demand", () => {
    const essentialContext = context();
    drawMovementFaceOverlay(essentialContext, face(), 1280, 720, "essential");
    expect(essentialContext.arc).toHaveBeenCalledTimes(
      MOVEMENT_ESSENTIAL_FACE_LANDMARK_INDEXES.length,
    );

    const allContext = context();
    drawMovementFaceOverlay(allContext, face(), 1280, 720, "all");
    expect(allContext.arc).toHaveBeenCalledTimes(478);
  });

  it("draws no dense face overlay from incomplete evidence", () => {
    const ctx = context();
    drawMovementFaceOverlay(ctx, face(477), 1280, 720, "all");
    expect(ctx.arc).not.toHaveBeenCalled();
    expect(ctx.fill).not.toHaveBeenCalled();
  });
});

describe("movement capture dense-body overlay", () => {
  it("samples genuine anchors evenly per region by default and exposes all on demand", () => {
    const anchors = denseAnchors();
    expect(selectMovementDenseBodyOverlayAnchors(anchors, "essential")).toHaveLength(12);
    expect(selectMovementDenseBodyOverlayAnchors(anchors, "all")).toHaveLength(30);

    const essentialContext = context();
    drawMovementDenseBodyOverlay(essentialContext, anchors, 1280, 720, "essential");
    expect(essentialContext.arc).toHaveBeenCalledTimes(12);

    const allContext = context();
    drawMovementDenseBodyOverlay(allContext, anchors, 1280, 720, "all");
    expect(allContext.arc).toHaveBeenCalledTimes(30);
  });

  it("draws no dense-body points when measured anchors are missing", () => {
    const ctx = context();
    drawMovementDenseBodyOverlay(ctx, [], 1280, 720, "all");
    expect(ctx.arc).not.toHaveBeenCalled();
    expect(ctx.fill).not.toHaveBeenCalled();
  });
});
