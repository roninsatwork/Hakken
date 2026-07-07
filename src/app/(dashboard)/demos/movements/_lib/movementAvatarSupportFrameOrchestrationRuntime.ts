import {
  applyMovementAvatarSupportFrameRuntime,
  type MovementAvatarSupportFrameRuntimeResult,
} from "./movementAvatarSupportFrameRuntime";
import type { MovementAvatarSupportContactRuntimeTelemetry } from "./movementAvatarSupportContactRuntime";

type MovementAvatarSupportFrameRuntimeInput = Parameters<typeof applyMovementAvatarSupportFrameRuntime>[0];

export type MovementAvatarSupportFrameOrchestrationRuntimeResult = {
  lowerBodyOwner: string;
  supportContactTelemetry: MovementAvatarSupportContactRuntimeTelemetry;
  supportFrameRuntime: MovementAvatarSupportFrameRuntimeResult;
};

export function applyMovementAvatarSupportFrameOrchestrationRuntime({
  currentLowerBodyOwner,
  ...input
}: MovementAvatarSupportFrameRuntimeInput): MovementAvatarSupportFrameOrchestrationRuntimeResult {
  const supportFrameRuntime = applyMovementAvatarSupportFrameRuntime({
    ...input,
    currentLowerBodyOwner,
  });

  return {
    lowerBodyOwner: supportFrameRuntime.nextLowerBodyOwner ?? currentLowerBodyOwner ?? "neutral",
    supportContactTelemetry: supportFrameRuntime.supportContactTelemetry,
    supportFrameRuntime,
  };
}
