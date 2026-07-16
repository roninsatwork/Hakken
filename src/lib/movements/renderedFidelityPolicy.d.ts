export type RenderedFidelityOutcome =
  | "blocked"
  | "limited-review"
  | "pass"
  | "proof-limited"
  | "repair-required"
  | "severe"
  | "source-limited";

export const RENDERED_FIDELITY_POLICY_VERSION: string;
export const RENDERED_FIDELITY_POLICY: Readonly<{
  blockAbove: number;
  headAxisMaxRadians: number;
  limitedConfidence: number;
  passMax: number;
  requiredUpperBodySegments: readonly string[];
  severeAbove: number;
  sustainedRepairFrames: number;
  trustworthyConfidence: number;
}>;

export function classifyRenderedFidelitySample(input: {
  confidence?: number | null;
  error?: number | null;
  hasProof?: boolean;
}): RenderedFidelityOutcome;

export function isRenderedFidelityRepairOutcome(outcome: RenderedFidelityOutcome): boolean;

export function contiguousRenderedFidelityRuns<T extends { frameIndex: number }>(
  samples: T[],
  predicate: (sample: T) => boolean,
): T[][];
