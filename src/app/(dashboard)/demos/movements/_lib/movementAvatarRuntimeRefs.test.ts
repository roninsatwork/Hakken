import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MovementRetargetSourceModel } from "./movementRetargeting";
import type { MovementRootMotionFrame } from "./movementRootMotion";
import {
  useMovementAvatarRuntimeRefs,
  useSyncMovementAvatarRuntimeInputs,
} from "./movementAvatarRuntimeRefs";

const rootMotionFrame = {
  debug: {
    reasons: [],
    source: "world-landmarks",
  },
  feet: {
    left: {
      contact: true,
      confidence: 1,
      stepPhase: "planted",
      worldPosition: null,
    },
    right: {
      contact: true,
      confidence: 1,
      stepPhase: "planted",
      worldPosition: null,
    },
  },
  floor: {
    confidence: 1,
    y: 0,
  },
  frameIndex: 1,
  headingConfidence: 1,
  headingYaw: 0,
  intent: {
    confidence: 1,
    headingDelta: 0,
    key: "root-stationary",
    label: "Stationary",
    plantedFoot: "both",
    summary: "Stationary",
    swingFoot: "none",
    travelDirection: "none",
    travelDistance: 0,
  },
  rootPosition: {
    x: 0,
    y: 0,
    z: 0,
  },
  rootPositionConfidence: 1,
} satisfies MovementRootMotionFrame;

const retargetSourceModel = {
  calibratedAt: 1,
  floorY: 0,
  hipCenter: { x: 0, y: 0, z: 0 },
  neutralKneeLift: {
    left: 0,
    right: 0,
  },
  quality: 1,
  segments: {},
  shoulderCenter: { x: 0, y: 1, z: 0 },
  torsoHeight: 1,
} satisfies MovementRetargetSourceModel;

function useRuntimeRefsWithSyncedInputs({
  clear,
  frame,
  model,
}: {
  clear: boolean;
  frame: MovementRootMotionFrame | null;
  model: MovementRetargetSourceModel | null;
}) {
  const refs = useMovementAvatarRuntimeRefs(frame);

  useSyncMovementAvatarRuntimeInputs({
    refs,
    retargetSourceModel: model,
    rootMotionFrame: frame,
    shouldClearRetargetSourceModel: clear,
  });

  return refs;
}

describe("movementAvatarRuntimeRefs", () => {
  it("creates stable runtime refs with a reset-compatible ref bundle", () => {
    const { result, rerender } = renderHook(
      ({ frame }) => useMovementAvatarRuntimeRefs(frame),
      {
        initialProps: {
          frame: rootMotionFrame as MovementRootMotionFrame | null,
        },
      },
    );

    const initialRefs = result.current;

    expect(initialRefs.rootMotionFrameRef.current).toBe(rootMotionFrame);
    expect(initialRefs.resetRefs.baseBonePositionRef).toBe(initialRefs.baseBonePositionRef);
    expect(initialRefs.resetRefs.setupStateRef).toBe(initialRefs.setupStateRef);
    expect(initialRefs.resetRefs.retargetSourceModelRef).toBe(initialRefs.retargetSourceModelRef);
    expect(initialRefs.playerLegRaiseHoldRef.current).toEqual({
      depth: 0,
      expiresAt: 0,
      side: null,
    });

    rerender({ frame: null });

    expect(result.current).toBe(initialRefs);
    expect(result.current.rootMotionFrameRef.current).toBe(rootMotionFrame);
  });

  it("syncs root-motion and retarget-source inputs into runtime refs", async () => {
    const { result, rerender } = renderHook(
      ({ clear, frame, model }) => useRuntimeRefsWithSyncedInputs({
        clear,
        frame,
        model,
      }),
      {
        initialProps: {
          clear: false,
          frame: null as MovementRootMotionFrame | null,
          model: null as MovementRetargetSourceModel | null,
        },
      },
    );

    rerender({
      clear: false,
      frame: rootMotionFrame,
      model: retargetSourceModel,
    });

    await waitFor(() => {
      expect(result.current.rootMotionFrameRef.current).toBe(rootMotionFrame);
      expect(result.current.retargetSourceModelRef.current).toBe(retargetSourceModel);
    });

    rerender({
      clear: true,
      frame: null,
      model: null,
    });

    await waitFor(() => {
      expect(result.current.rootMotionFrameRef.current).toBeNull();
      expect(result.current.retargetSourceModelRef.current).toBeNull();
    });
  });
});
