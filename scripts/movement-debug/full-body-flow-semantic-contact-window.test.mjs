import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeFullSequence } from "./analyze-replay-full-sequence.mjs";

const fixture = JSON.parse(readFileSync(
  new URL("./fixtures/full-body-flow-frames-648-656-semantic-contact.json", import.meta.url),
  "utf8",
));

function vector([x, y, z]) {
  return { x, y, z };
}

function semanticSegment(segment) {
  return {
    ...segment,
    renderedDirection: vector(segment.renderedDirection),
    sourceDirection: vector(segment.sourceDirection),
  };
}

function analyzerInputFromFixture() {
  return {
    session: { samples: fixture.frames.map(() => ({ tracking: { pose: [] } })) },
    telemetry: {
      frameCount: fixture.scope.localFrameCount,
      frames: fixture.frames.map((frame, frameIndex) => {
        const semantic = frame.semantic ?? fixture.passingFrameDefaults;
        const decision = frame.decision ?? {};
        return {
          debug: {
            avatarVisual: {
              comparedLowerBodySegments: 0,
              semantic: {
                avatarScale: fixture.passingFrameDefaults.avatarScale,
                evidenceVersion: fixture.artifact.semanticEvidenceVersion,
                feet: structuredClone(semantic.feet),
                headChain: semanticSegment(semantic.headChain),
                torso: semanticSegment(semantic.torso),
              },
              segments: {},
            },
            retarget: {
              leftFootContact: decision.leftFootContact ?? true,
              rightFootContact: decision.rightFootContact ?? true,
              sourceQuality: 0.99,
            },
          },
          frameIndex,
          sourceFrameIndex: frame.sourceFrameIndex,
        };
      }),
      missingFrames: [],
      playbackMode: fixture.artifact.playbackMode,
      sessionId: "full-body-flow-frames-648-656-semantic-contact-regression",
    },
  };
}

describe("Full Body Flow frames 648-656 semantic/contact window", () => {
  it("preserves the immutable sanitized source identity and controlling red facts", () => {
    expect(fixture.recording).toEqual({
      id: "px7fafa0wypmmc5rfz1nzmdvas88n6m0",
      sourceFrameCount: 2169,
      sourceHash: "sha256:8a00b45ba5e3f1ec29ac2b5e224504b8cca4f680eca60da69eed9ac43e6f9e17",
      title: "Full Body Flow",
    });
    expect(fixture.scope.sourceFrameIndexes).toEqual([648, 649, 650, 651, 652, 653, 654, 655, 656]);
    expect(fixture.frames[4]).toMatchObject({
      decision: {
        forwardLean: 0.8303,
        headTargetEqualsApplied: true,
        leftFootContact: false,
        rightFootContact: false,
      },
      semantic: { torso: { sourceLeanRadians: 0.1499 } },
      sourceFrameIndex: 652,
    });
  });

  it("blocks independent torso/head-chain divergence and raised planted-foot surfaces", () => {
    const analysis = analyzeFullSequence(analyzerInputFromFixture());

    expect(analysis.status).toBe("blocked");
    for (const code of [
      "rendered-torso-source-diverged",
      "rendered-head-chain-source-diverged",
      "rendered-planted-foot-contact-contradiction",
      "rendered-heel-clearance-diverged",
      "rendered-toe-clearance-diverged",
      "rendered-foot-plane-diverged",
    ]) {
      expect(analysis.failures).toContainEqual(expect.objectContaining({ code }));
    }
    expect(analysis.semanticAcceptance).toMatchObject({
      footContact: {
        contactContradictionCount: 2,
        footPlaneDivergenceCount: 2,
        heelDivergenceCount: 2,
        proofLimitedCount: 0,
        sampleCount: 18,
        toeDivergenceCount: 2,
      },
      headChain: { divergedSampleCount: 1, sampleCount: 9 },
      torso: { divergedSampleCount: 1, sampleCount: 9 },
    });
  });

  it("fails closed when a current semantic frame omits independent final contact proof", () => {
    const input = analyzerInputFromFixture();
    delete input.telemetry.frames[0].debug.avatarVisual.semantic.feet.left.toeEndClearance;

    const analysis = analyzeFullSequence(input);
    expect(analysis.failures).toContainEqual({
      code: "rendered-semantic-proof-limited",
      count: 1,
    });
  });

  it("classifies low-quality source evidence without turning it into a rendered-avatar defect", () => {
    const input = analyzerInputFromFixture();
    input.telemetry.frames.forEach((frame) => {
      frame.debug.avatarVisual.semantic.torso.confidence = 0.4;
      frame.debug.avatarVisual.semantic.headChain.confidence = 0.4;
      for (const foot of Object.values(frame.debug.avatarVisual.semantic.feet)) {
        foot.sourceConfidence = 0.4;
      }
    });

    const analysis = analyzeFullSequence(input);
    for (const code of [
      "rendered-torso-source-diverged",
      "rendered-head-chain-source-diverged",
      "rendered-planted-foot-contact-contradiction",
      "rendered-heel-clearance-diverged",
      "rendered-toe-clearance-diverged",
      "rendered-foot-plane-diverged",
    ]) {
      expect(analysis.failures.map((failure) => failure.code)).not.toContain(code);
    }
    expect(analysis.semanticAcceptance).toMatchObject({
      footContact: { sourceLimitedCount: 18 },
      headChain: { sourceLimitedSampleCount: 9 },
      torso: { sourceLimitedSampleCount: 9 },
    });
  });
});
