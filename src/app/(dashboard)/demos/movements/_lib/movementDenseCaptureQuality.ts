export type MovementDenseCaptureQualityTier = "high" | "medium" | "low";

export const MOVEMENT_DENSE_CAPTURE_QUALITY_PROFILES = {
  high: {
    inputHeight: 540,
    inputWidth: 960,
    internalResolution: "medium" as const,
    targetIntervalMs: 100,
  },
  medium: {
    inputHeight: 360,
    inputWidth: 640,
    internalResolution: "medium" as const,
    targetIntervalMs: 180,
  },
  low: {
    inputHeight: 216,
    inputWidth: 384,
    internalResolution: "low" as const,
    targetIntervalMs: 300,
  },
} as const satisfies Record<MovementDenseCaptureQualityTier, {
  inputHeight: number;
  inputWidth: number;
  internalResolution: "medium" | "low";
  targetIntervalMs: number;
}>;

export type MovementDenseCaptureDeviceCapabilities = {
  deviceMemoryGb: number | null;
  hardwareConcurrency: number | null;
  isIpad: boolean;
};

export type MovementDenseCaptureQualityState = {
  fastSampleCount: number;
  qualityTier: MovementDenseCaptureQualityTier;
  slowSampleCount: number;
};

export function readMovementDenseCaptureDeviceCapabilities(): MovementDenseCaptureDeviceCapabilities {
  if (typeof navigator === "undefined") {
    return { deviceMemoryGb: null, hardwareConcurrency: null, isIpad: false };
  }
  const browserNavigator = navigator as Navigator & { deviceMemory?: number };
  return {
    deviceMemoryGb: Number.isFinite(browserNavigator.deviceMemory)
      ? browserNavigator.deviceMemory ?? null
      : null,
    hardwareConcurrency: Number.isFinite(navigator.hardwareConcurrency)
      ? navigator.hardwareConcurrency
      : null,
    isIpad: /iPad/i.test(navigator.userAgent) || (
      navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1
    ),
  };
}

export function resolveInitialMovementDenseCaptureQualityTier({
  deviceMemoryGb,
  hardwareConcurrency,
  isIpad,
}: MovementDenseCaptureDeviceCapabilities): MovementDenseCaptureQualityTier {
  if (
    isIpad ||
    (deviceMemoryGb !== null && deviceMemoryGb <= 4) ||
    (hardwareConcurrency !== null && hardwareConcurrency <= 4)
  ) {
    return "low";
  }
  if (
    deviceMemoryGb === null ||
    hardwareConcurrency === null ||
    deviceMemoryGb <= 8 ||
    hardwareConcurrency <= 8
  ) {
    return "medium";
  }
  return "high";
}

export function createMovementDenseCaptureQualityState(
  qualityTier: MovementDenseCaptureQualityTier,
): MovementDenseCaptureQualityState {
  return { fastSampleCount: 0, qualityTier, slowSampleCount: 0 };
}

const NEXT_HIGHER_TIER: Partial<Record<MovementDenseCaptureQualityTier, MovementDenseCaptureQualityTier>> = {
  low: "medium",
  medium: "high",
};

const NEXT_LOWER_TIER: Partial<Record<MovementDenseCaptureQualityTier, MovementDenseCaptureQualityTier>> = {
  high: "medium",
  medium: "low",
};

const PROMOTION_THRESHOLD_MS: Partial<Record<MovementDenseCaptureQualityTier, number>> = {
  low: 45,
  medium: 55,
};

const DEMOTION_THRESHOLD_MS: Partial<Record<MovementDenseCaptureQualityTier, number>> = {
  high: 95,
  medium: 140,
};

export function updateMovementDenseCaptureQualityState(
  state: MovementDenseCaptureQualityState,
  inferenceDurationMs: number,
): MovementDenseCaptureQualityState {
  if (!Number.isFinite(inferenceDurationMs) || inferenceDurationMs < 0) return state;
  const demotionThresholdMs = DEMOTION_THRESHOLD_MS[state.qualityTier];
  if (demotionThresholdMs !== undefined && inferenceDurationMs > demotionThresholdMs) {
    const slowSampleCount = state.slowSampleCount + 1;
    if (slowSampleCount >= 2) {
      return createMovementDenseCaptureQualityState(
        NEXT_LOWER_TIER[state.qualityTier] ?? state.qualityTier,
      );
    }
    return { ...state, fastSampleCount: 0, slowSampleCount };
  }

  const promotionThresholdMs = PROMOTION_THRESHOLD_MS[state.qualityTier];
  if (promotionThresholdMs !== undefined && inferenceDurationMs <= promotionThresholdMs) {
    const fastSampleCount = state.fastSampleCount + 1;
    if (fastSampleCount >= 5) {
      return createMovementDenseCaptureQualityState(
        NEXT_HIGHER_TIER[state.qualityTier] ?? state.qualityTier,
      );
    }
    return { ...state, fastSampleCount, slowSampleCount: 0 };
  }

  return { ...state, fastSampleCount: 0, slowSampleCount: 0 };
}
