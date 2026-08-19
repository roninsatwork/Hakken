import { describe, expect, it } from "vitest";
import type { MovementGameplayEventFrame } from "./movementGameplayEvents";
import {
  accumulateMovementSessionScoreFrame,
  createMovementSessionScoreState,
  resolveMovementSessionScoreResult,
  type MovementSessionScoreState,
} from "./movementSessionScore";

function frame({
  effortQuality = 0,
  matchQuality = null,
  scoreAllowed = true,
  scoredMovementStrength = 0,
}: Partial<MovementGameplayEventFrame> = {}): MovementGameplayEventFrame {
  return {
    effortQuality,
    events: [],
    matchQuality,
    nextStreak: 0,
    readableMovementStrength: scoredMovementStrength,
    scoreAllowed,
    scoredMovementStrength,
  };
}

function feed(
  state: MovementSessionScoreState,
  ticks: Array<Partial<MovementGameplayEventFrame> & {
    scoreDeltaTotal?: number;
    spineCue?: string;
    spineScore?: number;
  }>,
) {
  ticks.forEach(({ scoreDeltaTotal = 0, spineCue, spineScore, ...frameInput }) => {
    accumulateMovementSessionScoreFrame(state, {
      gameplayEventFrame: frame(frameInput),
      scoreDeltaTotal,
      spineCue,
      spineScore,
    });
  });
  return state;
}

/** One rep: rise above the clear threshold, then settle back down. */
function rep({
  effortQuality = 1,
  matchQuality = 1,
  peak = 0.6,
  spineScore = 80,
  spineCue = "Keep tall spine as the knees bend.",
}) {
  return [
    { effortQuality, matchQuality, scoreDeltaTotal: 15, scoredMovementStrength: peak, spineCue, spineScore },
    { effortQuality, matchQuality, scoreDeltaTotal: 15, scoredMovementStrength: peak, spineCue, spineScore },
    { effortQuality: 0, matchQuality: null, scoredMovementStrength: 0.05, spineCue, spineScore },
  ];
}

describe("movementSessionScore", () => {
  it("counts one rep per movement instead of one per scoring tick", () => {
    const state = feed(createMovementSessionScoreState(), [
      ...rep({}),
      ...rep({}),
      ...rep({}),
    ]);

    expect(resolveMovementSessionScoreResult(state).repCount).toBe(3);
  });

  it("closes an unfinished rep when the session ends mid-movement", () => {
    const state = feed(createMovementSessionScoreState(), [
      { effortQuality: 1, matchQuality: 1, scoredMovementStrength: 0.6 },
    ]);

    expect(resolveMovementSessionScoreResult(state).repCount).toBe(1);
  });

  it("normalises the result so a longer session does not simply outscore a shorter one", () => {
    const short = feed(createMovementSessionScoreState(), [...rep({}), ...rep({})]);
    const long = feed(createMovementSessionScoreState(), Array.from(
      { length: 10 },
      () => rep({}),
    ).flat());

    const shortResult = resolveMovementSessionScoreResult(short);
    const longResult = resolveMovementSessionScoreResult(long);

    expect(longResult.points).toBeGreaterThan(shortResult.points);
    expect(longResult.overallPercent).toBe(shortResult.overallPercent);
  });

  it("averages the spine hold rather than reporting a single best frame", () => {
    const state = feed(createMovementSessionScoreState(), [
      { effortQuality: 1, matchQuality: 1, scoredMovementStrength: 0.6, spineScore: 100 },
      { effortQuality: 1, matchQuality: 1, scoredMovementStrength: 0.6, spineScore: 40 },
      { effortQuality: 0, scoredMovementStrength: 0.05, spineScore: 40 },
    ]);

    expect(resolveMovementSessionScoreResult(state).spinePercent).toBe(60);
  });

  it("reports the dominant spine cue over the session", () => {
    const state = feed(createMovementSessionScoreState(), [
      { effortQuality: 1, scoredMovementStrength: 0.6, spineCue: "one-off", spineScore: 90 },
      { effortQuality: 1, scoredMovementStrength: 0.6, spineCue: "recurring", spineScore: 50 },
      { effortQuality: 1, scoredMovementStrength: 0.6, spineCue: "recurring", spineScore: 50 },
    ]);

    expect(resolveMovementSessionScoreResult(state).spineCue).toBe("recurring");
  });

  it("scores agreement with the coach only while the player is moving", () => {
    const state = feed(createMovementSessionScoreState(), [
      { effortQuality: 1, matchQuality: 0.4, scoredMovementStrength: 0.6 },
      // Standing still agrees perfectly with a still coach and must not count.
      { effortQuality: 0, matchQuality: 1, scoredMovementStrength: 0.02 },
      { effortQuality: 0, matchQuality: 1, scoredMovementStrength: 0.02 },
    ]);

    expect(resolveMovementSessionScoreResult(state).coachMatchPercent).toBe(40);
  });

  it("ranks a matched session above an unmatched one with identical effort", () => {
    const matched = feed(createMovementSessionScoreState(), rep({ matchQuality: 1 }));
    const drifting = feed(createMovementSessionScoreState(), rep({ matchQuality: 0.2 }));

    expect(resolveMovementSessionScoreResult(matched).overallPercent)
      .toBeGreaterThan(resolveMovementSessionScoreResult(drifting).overallPercent);
  });

  it("penalises a mostly idle session even when the few movements were good", () => {
    const busy = feed(createMovementSessionScoreState(), [...rep({}), ...rep({}), ...rep({})]);
    const idle = feed(createMovementSessionScoreState(), [
      ...rep({}),
      ...Array.from({ length: 30 }, () => ({
        effortQuality: 0,
        scoredMovementStrength: 0.02,
        spineScore: 80,
      })),
    ]);

    expect(resolveMovementSessionScoreResult(idle).overallPercent)
      .toBeLessThan(resolveMovementSessionScoreResult(busy).overallPercent);
  });

  it("counts lost tracking against coverage without polluting the quality averages", () => {
    const state = feed(createMovementSessionScoreState(), [
      { effortQuality: 1, matchQuality: 1, scoredMovementStrength: 0.6, spineScore: 90 },
      { scoreAllowed: false, scoredMovementStrength: 0.6, spineScore: 10 },
      { scoreAllowed: false, scoredMovementStrength: 0.6, spineScore: 10 },
      { scoreAllowed: false, scoredMovementStrength: 0.6, spineScore: 10 },
    ]);
    const result = resolveMovementSessionScoreResult(state);

    expect(result.trackingPercent).toBe(25);
    expect(result.spinePercent).toBe(90);
    expect(result.coachMatchPercent).toBe(100);
  });

  it("returns a zero result for a session with no movement at all", () => {
    const state = feed(createMovementSessionScoreState(), [
      { effortQuality: 0, scoredMovementStrength: 0.01, spineScore: 100 },
      { effortQuality: 0, scoredMovementStrength: 0.01, spineScore: 100 },
    ]);
    const result = resolveMovementSessionScoreResult(state);

    expect(result.repCount).toBe(0);
    expect(result.overallPercent).toBe(0);
    expect(result.grade).toBe("Keep practising");
  });

  it("scores a gentle session that never clears a rep rather than wiping it to zero", () => {
    const state = feed(createMovementSessionScoreState(), [
      { effortQuality: 0, scoredMovementStrength: 0.18, spineScore: 80 },
      { effortQuality: 0, scoredMovementStrength: 0.2, spineScore: 80 },
      { effortQuality: 0, scoredMovementStrength: 0.16, spineScore: 80 },
    ]);
    const result = resolveMovementSessionScoreResult(state);

    expect(result.repCount).toBe(0);
    expect(result.overallPercent).toBeGreaterThan(0);
  });
});
