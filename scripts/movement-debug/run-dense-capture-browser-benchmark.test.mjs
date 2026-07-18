import { describe, expect, it } from "vitest";
import {
  DENSE_CAPTURE_BROWSER_CANDIDATES,
  parseByteRange,
} from "./run-dense-capture-browser-benchmark.mjs";

describe("dense capture browser benchmark", () => {
  it("pins two distinct BodyPix model artifacts and configurations", () => {
    expect(DENSE_CAPTURE_BROWSER_CANDIDATES).toHaveLength(2);
    expect(new Set(DENSE_CAPTURE_BROWSER_CANDIDATES.map((candidate) => candidate.id)).size).toBe(2);
    expect(DENSE_CAPTURE_BROWSER_CANDIDATES.map((candidate) => candidate.model.architecture)).toEqual([
      "MobileNetV1",
      "ResNet50",
    ]);
    DENSE_CAPTURE_BROWSER_CANDIDATES.forEach((candidate) => {
      expect(candidate.modelUrl).toMatch(/^https:\/\/storage\.googleapis\.com\/tfjs-models\//);
      expect(candidate.modelId).toContain("@2.2.1");
    });
  });

  it("serves bounded video byte ranges for deterministic browser seeking", () => {
    expect(parseByteRange("bytes=10-19", 100)).toEqual({ end: 19, start: 10 });
    expect(parseByteRange("bytes=90-", 100)).toEqual({ end: 99, start: 90 });
    expect(parseByteRange("bytes=-10", 100)).toEqual({ end: 99, start: 90 });
    expect(parseByteRange("bytes=90-120", 100)).toEqual({ end: 99, start: 90 });
    expect(parseByteRange("bytes=100-", 100)).toBeNull();
    expect(parseByteRange("invalid", 100)).toBeNull();
  });
});
