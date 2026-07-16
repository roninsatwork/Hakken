import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeFullSequence } from "./analyze-replay-full-sequence.mjs";

const fixture = JSON.parse(readFileSync(
  new URL("./fixtures/full-motion-frames-279-283-fidelity.json", import.meta.url),
  "utf8",
));

function vector([x, y, z]) {
  return { x, y, z };
}

function directionError(expected, rendered) {
  return 1 - expected.reduce((sum, value, index) => sum + value * rendered[index], 0);
}

function analyzerInputFromFixture() {
  return {
    session: {
      samples: fixture.frames.map(() => ({ tracking: { pose: [] } })),
    },
    telemetry: {
      frameCount: fixture.scope.localFrameCount,
      frames: fixture.frames.map((frame, frameIndex) => {
        const [sourcePitch, sourceYaw, sourceRoll] = frame.head.sourcePitchYawRoll;
        const [bonePitch, boneYaw, boneRoll] = frame.head.targetBonePitchYawRoll;
        const [appliedWorldPitch, appliedWorldYaw, appliedWorldRoll] =
          frame.head.renderedWorldPitchYawRoll;
        return {
          debug: {
            avatarHead: {
              appliedWorldPitch,
              appliedWorldRoll,
              appliedWorldYaw,
              bonePitch,
              boneRoll,
              boneYaw,
            },
            avatarVisual: {
              averageLowerBodyDirectionError: frame.averageLowerBodyError,
              averageUpperBodyDirectionError: frame.averageUpperBodyError,
              comparedUpperBodySegments: 5,
              segments: Object.fromEntries(Object.entries(frame.segments).map(([name, segment]) => [
                name,
                {
                  confidence: segment.confidence,
                  direction: vector(segment.rendered),
                  sourceDirection: vector(segment.expected),
                  sourceError: segment.error,
                },
              ])),
            },
            fallbacks: {
              leftArm: "retargeted-arm",
              owners: "head recorded-pose; torso player-spine-model; lower player-retarget; feet neutral",
              rightArm: "retargeted-arm",
            },
            headRaw: {
              confidence: frame.head.confidence,
              pitch: sourcePitch,
              roll: sourceRoll,
              yaw: sourceYaw,
            },
            retarget: {
              appliedLowerBody: 6,
              appliedUpperBody: 4,
              sourceQuality: 0.85,
              totalUpperBody: 5,
            },
            spineDrive: {
              confidence: frame.segments.spine.confidence,
              owner: "player-spine-model",
              sideBend: 0,
            },
          },
          frameIndex,
          sourceFrameIndex: frame.sourceFrameIndex,
        };
      }),
      missingFrames: [],
      motionPipelineFingerprint: fixture.artifact.motionPipelineFingerprint,
      playbackMode: fixture.artifact.playbackMode,
      sessionId: "full-motion-frames-279-283-fidelity-regression",
    },
  };
}

describe("Full Motion Exercises frames 279-283 fidelity window", () => {
  it("preserves the immutable sanitized source scope", () => {
    expect(fixture.schemaVersion).toBe(1);
    expect(fixture.recording).toMatchObject({
      id: "px75fgt11wbg0jvr17j6fc2dvd89trpm",
      sourceFrameCount: 3026,
      sourceHash: "sha256:47e1940250c10f9855d8b1086308b8f80361a424efc5d3a4e591f0936e204e1f",
    });
    expect(fixture.scope).toEqual({
      localFrameCount: 5,
      sourceFrameIndexes: [279, 280, 281, 282, 283],
    });
    expect(fixture.artifact.acceptanceUse).toBe("historical-red-baseline-only");
  });

  it("keeps independent expected and final rendered directions consistent with the recorded errors", () => {
    fixture.frames.forEach((frame) => {
      Object.values(frame.segments).forEach((segment) => {
        expect(directionError(segment.expected, segment.rendered)).toBeCloseTo(segment.error, 3);
      });
    });
  });

  it("blocks the sustained five-frame upper-body divergence", () => {
    const analysis = analyzeFullSequence(analyzerInputFromFixture());

    expect(analysis.status).toBe("blocked");
    expect(analysis.renderedFidelity.averageUpperBody).toMatchObject({
      maxError: 0.2972,
      repairSampleCount: 5,
      sampleCount: 5,
    });
    expect(analysis.renderedFidelity.segments.leftUpperArm).toMatchObject({
      maxError: 0.687,
      severeSampleCount: 5,
    });
    expect(analysis.renderedFidelity.segments.rightLowerArm).toMatchObject({
      maxError: 0.3345,
      severeSampleCount: 5,
    });
    expect(analysis.renderedFidelity.segments.rightUpperArm.sustainedRepairRuns).toContainEqual({
      frameEnd: 4,
      frameStart: 0,
      length: 5,
      maxError: 0.2293,
    });
  });

  it("fails closed when the historical spine owner lacks final target rotations", () => {
    const analysis = analyzeFullSequence(analyzerInputFromFixture());

    expect(analysis.renderedFidelity.segments.spine).toMatchObject({
      proofLimitedSampleCount: 5,
      sampleCount: 5,
    });
    expect(analysis.failures).toContainEqual({
      code: "rendered-fidelity-proof-limited",
      count: 5,
    });
  });
});
