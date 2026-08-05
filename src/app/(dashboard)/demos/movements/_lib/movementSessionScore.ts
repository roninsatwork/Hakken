import type { MovementGameplayEventFrame } from "./movementGameplayEvents";

/**
 * Session scoring turns the per-tick arcade points into a result a person can
 * read: a normalised 0-100 with the components that produced it. Points alone
 * are a rate (points per second spent moving), so a longer routine always beats
 * a better-performed shorter one. Everything here is an average or a share, so
 * the headline means the same thing whatever the routine length.
 */

const REP_ENTER_STRENGTH = 0.28;
const REP_EXIT_STRENGTH = 0.15;

export type MovementSessionScoreState = {
  activeTickCount: number;
  bestSpineScore: number;
  effortQualityTotal: number;
  isInRep: boolean;
  matchQualityTotal: number;
  matchTickCount: number;
  points: number;
  repCount: number;
  repPeakStrength: number;
  repPeakStrengthTotal: number;
  scoreableTickCount: number;
  spineCueCounts: Map<string, number>;
  spineScoreTotal: number;
  spineTickCount: number;
  tickCount: number;
};

export type MovementSessionScoreResult = {
  /** Share of scoreable time the player was actually moving. */
  activePercent: number;
  /** Average joint-angle agreement with the instructor, or null when unpartnered. */
  coachMatchPercent: number | null;
  grade: string;
  /** Average fullness of the movements that were performed. */
  movementQualityPercent: number;
  /** The headline 0-100. */
  overallPercent: number;
  points: number;
  repCount: number;
  spineCue: string | null;
  spinePercent: number;
  /** Share of the session where tracking was good enough to judge. */
  trackingPercent: number;
};

export type MovementSessionScoreFrameInput = {
  gameplayEventFrame: MovementGameplayEventFrame;
  instructorSync?: number | null;
  scoreDeltaTotal: number;
  spineCue?: string | null;
  spineScore?: number | null;
};

export function createMovementSessionScoreState(): MovementSessionScoreState {
  return {
    activeTickCount: 0,
    bestSpineScore: 0,
    effortQualityTotal: 0,
    isInRep: false,
    matchQualityTotal: 0,
    matchTickCount: 0,
    points: 0,
    repCount: 0,
    repPeakStrength: 0,
    repPeakStrengthTotal: 0,
    scoreableTickCount: 0,
    spineCueCounts: new Map(),
    spineScoreTotal: 0,
    spineTickCount: 0,
    tickCount: 0,
  };
}

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function percent(value: number) {
  return Math.round(clamp01(value) * 100);
}

function resolveGrade(overallPercent: number) {
  if (overallPercent >= 90) return "Excellent";
  if (overallPercent >= 75) return "Strong";
  if (overallPercent >= 60) return "Good";
  if (overallPercent >= 40) return "Getting there";
  return "Keep practising";
}

/**
 * Reps are counted with hysteresis so a single movement that hovers around the
 * threshold is one rep, not a dozen. A rep opens when the body clears the
 * "clear movement" strength and closes when it settles back down.
 */
function accumulateRep(state: MovementSessionScoreState, strength: number) {
  if (!state.isInRep && strength >= REP_ENTER_STRENGTH) {
    state.isInRep = true;
    state.repPeakStrength = strength;
    return;
  }

  if (state.isInRep) {
    state.repPeakStrength = Math.max(state.repPeakStrength, strength);
    if (strength <= REP_EXIT_STRENGTH) {
      state.isInRep = false;
      state.repCount += 1;
      state.repPeakStrengthTotal += state.repPeakStrength;
      state.repPeakStrength = 0;
    }
  }
}

export function accumulateMovementSessionScoreFrame(
  state: MovementSessionScoreState,
  {
    gameplayEventFrame,
    instructorSync = null,
    scoreDeltaTotal,
    spineCue = null,
    spineScore = null,
  }: MovementSessionScoreFrameInput,
): MovementSessionScoreState {
  state.tickCount += 1;
  state.points += scoreDeltaTotal;

  if (!gameplayEventFrame.scoreAllowed) {
    // Untracked time still counts against tracking coverage, but nothing about
    // the body can be judged from it, so it feeds no quality average.
    if (state.isInRep) {
      state.isInRep = false;
      state.repCount += 1;
      state.repPeakStrengthTotal += state.repPeakStrength;
      state.repPeakStrength = 0;
    }
    return state;
  }

  state.scoreableTickCount += 1;
  accumulateRep(state, gameplayEventFrame.scoredMovementStrength);

  if (gameplayEventFrame.effortQuality > 0) {
    state.activeTickCount += 1;
    state.effortQualityTotal += gameplayEventFrame.effortQuality;

    // Agreement with the instructor is only meaningful while the player is
    // moving: two people standing still agree perfectly and prove nothing.
    const matchQuality = gameplayEventFrame.matchQuality
      ?? (instructorSync === null ? null : clamp01(instructorSync / 100));
    if (matchQuality !== null) {
      state.matchQualityTotal += matchQuality;
      state.matchTickCount += 1;
    }
  }

  if (typeof spineScore === "number") {
    state.spineScoreTotal += spineScore;
    state.spineTickCount += 1;
    state.bestSpineScore = Math.max(state.bestSpineScore, spineScore);
    if (spineCue) {
      state.spineCueCounts.set(spineCue, (state.spineCueCounts.get(spineCue) ?? 0) + 1);
    }
  }

  return state;
}

function resolveDominantSpineCue(state: MovementSessionScoreState) {
  let dominantCue: string | null = null;
  let dominantCount = 0;

  state.spineCueCounts.forEach((count, cue) => {
    if (count > dominantCount) {
      dominantCue = cue;
      dominantCount = count;
    }
  });

  return dominantCue;
}

export function resolveMovementSessionScoreResult(
  state: MovementSessionScoreState,
): MovementSessionScoreResult {
  const repCount = state.repCount + (state.isInRep ? 1 : 0);
  const activeShare = state.scoreableTickCount > 0
    ? state.activeTickCount / state.scoreableTickCount
    : 0;
  const effortShare = state.activeTickCount > 0
    ? state.effortQualityTotal / state.activeTickCount
    : 0;
  const matchShare = state.matchTickCount > 0
    ? state.matchQualityTotal / state.matchTickCount
    : null;
  const spineShare = state.spineTickCount > 0
    ? state.spineScoreTotal / state.spineTickCount / 100
    : 0;
  const trackingShare = state.tickCount > 0
    ? state.scoreableTickCount / state.tickCount
    : 0;

  const overallShare = matchShare === null
    ? 0.35 * effortShare + 0.30 * activeShare + 0.22 * spineShare + 0.13 * trackingShare
    : 0.35 * matchShare
      + 0.20 * effortShare
      + 0.20 * activeShare
      + 0.15 * spineShare
      + 0.10 * trackingShare;
  const overallPercent = repCount === 0 ? 0 : percent(overallShare);

  return {
    activePercent: percent(activeShare),
    coachMatchPercent: matchShare === null ? null : percent(matchShare),
    grade: resolveGrade(overallPercent),
    movementQualityPercent: percent(effortShare),
    overallPercent,
    points: state.points,
    repCount,
    spineCue: resolveDominantSpineCue(state),
    spinePercent: percent(spineShare),
    trackingPercent: percent(trackingShare),
  };
}
