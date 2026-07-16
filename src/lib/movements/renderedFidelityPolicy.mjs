export const RENDERED_FIDELITY_POLICY_VERSION = "2026-07-15.v1";

export const RENDERED_FIDELITY_POLICY = Object.freeze({
  blockAbove: 0.15,
  headAxisMaxRadians: 0.1,
  limitedConfidence: 0.45,
  passMax: 0.1,
  requiredUpperBodySegments: Object.freeze([
    "spine",
    "leftUpperArm",
    "leftLowerArm",
    "rightUpperArm",
    "rightLowerArm",
  ]),
  severeAbove: 0.25,
  sustainedRepairFrames: 3,
  trustworthyConfidence: 0.75,
});

export function classifyRenderedFidelitySample({ confidence, error, hasProof = true }) {
  if (!hasProof || !Number.isFinite(error)) return "proof-limited";
  if (!Number.isFinite(confidence) || confidence < RENDERED_FIDELITY_POLICY.limitedConfidence) {
    return "source-limited";
  }
  if (confidence < RENDERED_FIDELITY_POLICY.trustworthyConfidence) return "limited-review";
  if (error > RENDERED_FIDELITY_POLICY.severeAbove) return "severe";
  if (error > RENDERED_FIDELITY_POLICY.blockAbove) return "blocked";
  if (error > RENDERED_FIDELITY_POLICY.passMax) return "repair-required";
  return "pass";
}

export function isRenderedFidelityRepairOutcome(outcome) {
  return outcome === "repair-required" || outcome === "blocked" || outcome === "severe";
}

export function contiguousRenderedFidelityRuns(samples, predicate) {
  const runs = [];
  [...samples]
    .filter(predicate)
    .sort((left, right) => left.frameIndex - right.frameIndex)
    .forEach((sample) => {
      const current = runs.at(-1);
      if (!current || sample.frameIndex !== current.at(-1).frameIndex + 1) {
        runs.push([sample]);
      } else {
        current.push(sample);
      }
    });
  return runs;
}
