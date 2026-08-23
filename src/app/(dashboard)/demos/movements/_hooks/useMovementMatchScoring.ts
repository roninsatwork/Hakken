"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  type VrmMotionFrame,
} from "../_lib/vrmRigging";
import {
  calculateMovementSync,
  type ScoreHandsPayload,
  type ScoreLandmark,
} from "../_lib/movementScoring";
import {
  buildMovementSpineModel,
  compareMovementSpineModels,
  evaluateMovementSpineReadiness,
  type MovementSpineReadiness,
} from "../_lib/movementSpineMetrics";
import type { MovementSpineGoal } from "../_lib/movementTypes";
import {
  type MovementGameplayMessage,
} from "../_lib/movementGameplayEvents";
import {
  resolveMovementMatchScoringGameplaySummary,
} from "../_lib/movementGameplayScoring";
import {
  accumulateMovementSessionScoreFrame,
  createMovementSessionScoreState,
  resolveMovementSessionScoreResult,
  type MovementSessionScoreResult,
} from "../_lib/movementSessionScore";
import type { MovementMotionFrame } from "../_lib/movementMotionFrame";

export type { MovementSessionScoreResult } from "../_lib/movementSessionScore";

export {
  resolveMovementMatchScoringGameplaySummary,
  type MovementMatchScoringGameplaySummary,
} from "../_lib/movementGameplayScoring";

type FeedbackMessage = { text: string; id: number } | null;

type InstructorPlaybackAdvance = {
  status: "empty" | "complete" | "advanced";
  lagFrame?: VrmMotionFrame;
};

type UseMovementMatchScoringInput = {
  isPlaying: boolean;
  isScoringEnabled?: boolean;
  setIsPlaying: (isPlaying: boolean) => void;
  playerMotionFrameRef?: RefObject<MovementMotionFrame | null>;
  instructorMotionFrameRef?: RefObject<MovementMotionFrame | null>;
  advanceInstructorFrame: () => InstructorPlaybackAdvance;
  spineGoal?: MovementSpineGoal | null;
};

const SCORE_UPDATE_INTERVAL_MS = 140;
/** How long a piece of encouragement stays on screen before it clears itself. */
const FEEDBACK_MESSAGE_LIFETIME_MS = 2000;
const DEFAULT_SPINE_CUE = "Review the spine guide and try one calmer pass.";

const GAMEPLAY_FEEDBACK_TEXT: Record<MovementGameplayMessage, string> = {
  "great-effort": "Great effort!",
  "nice-clear-move": "Nice clear move!",
  "try-a-little-bigger": "Try making the next one a little bigger.",
  "match-the-coach": "Follow the coach's shape.",
  "move-where-i-can-see-you": "Move where I can see you.",
  "step-back": "Step back so I can see you.",
  "step-closer": "Step a little closer.",
  "show-your-hands": "Show your hands.",
  "show-your-feet": "Show your feet.",
  "tracking-back": "Tracking is back.",
  "streak-celebration": "Brilliant streak!",
};

/**
 * Whether a piece of encouragement is new enough to say out loud.
 *
 * The scoring tick runs every 140ms and will happily report the same message
 * on each one. Saying it again resets its dismissal timer, which is how a
 * two-second message became a permanent one — Anthony, on the practice screen:
 * *"the messages come on the screen and never disappear"*.
 *
 * So a message is only announced when it differs from the one already being
 * said. Silence is announced too, once, so the overlay clears.
 */
export function shouldAnnounceMovementFeedback(
  currentText: string | null,
  nextText: string | null,
) {
  return currentText !== nextText;
}

type MovementMatchHudFrame = {
  spineCue: string;
  spineReadiness: MovementSpineReadiness["status"];
  spineScore: number;
  sync: number;
};

function selectMotionFrameScoreLandmarks(
  playerMotionFrame: MovementMotionFrame,
  instructorMotionFrame: MovementMotionFrame,
) {
  const playerWorldLandmarks = playerMotionFrame.displayLandmarks.worldPose;
  const instructorWorldLandmarks = instructorMotionFrame.displayLandmarks.worldPose;

  if (playerWorldLandmarks.length >= 33 && instructorWorldLandmarks.length >= 33) {
    return {
      instructorLandmarks: instructorWorldLandmarks as ScoreLandmark[],
      playerLandmarks: playerWorldLandmarks as ScoreLandmark[],
    };
  }

  return {
    instructorLandmarks: instructorMotionFrame.displayLandmarks.pose as ScoreLandmark[],
    playerLandmarks: playerMotionFrame.displayLandmarks.pose as ScoreLandmark[],
  };
}

export function resolveMovementMatchHudFrame({
  instructorMotionFrame,
  playerMotionFrame,
  spineGoal,
}: {
  instructorMotionFrame: MovementMotionFrame;
  playerMotionFrame: MovementMotionFrame;
  spineGoal?: MovementSpineGoal | null;
}): MovementMatchHudFrame | null {
  // HUD sync/spine is a presentation diagnostic against the instructor frame.
  // Gameplay score and feedback must come from resolveMovementMatchScoringGameplaySummary.
  const {
    instructorLandmarks,
    playerLandmarks,
  } = selectMotionFrameScoreLandmarks(playerMotionFrame, instructorMotionFrame);

  if (playerLandmarks.length < 33 || instructorLandmarks.length < 33) {
    return null;
  }

  const syncResult = calculateMovementSync({
    playerLandmarks,
    instructorLandmarks,
    playerHands: playerMotionFrame.source.landmarks.hands as ScoreHandsPayload | undefined,
    instructorHands: instructorMotionFrame.source.landmarks.hands as ScoreHandsPayload | undefined,
    playerBlendshapes: playerMotionFrame.source.landmarks.blendshapes,
  });
  const spineMatch = compareMovementSpineModels(
    buildMovementSpineModel(playerLandmarks),
    buildMovementSpineModel(instructorLandmarks),
    spineGoal,
  );

  return {
    spineCue: spineMatch.cue,
    spineReadiness: spineMatch.playerReadiness.status,
    spineScore: spineMatch.score,
    sync: syncResult.sync,
  };
}

export function resolveMovementPlayerSpineHudFrame(
  playerMotionFrame: MovementMotionFrame,
): Pick<MovementMatchHudFrame, "spineCue" | "spineReadiness" | "spineScore"> | null {
  const model = buildMovementSpineModel(playerMotionFrame.source.landmarks.pose);
  const readiness = evaluateMovementSpineReadiness(model);

  return {
    spineCue: readiness.cue,
    spineReadiness: readiness.status,
    spineScore: Math.round(model?.neutralStackScore ?? 0),
  };
}

export function useMovementMatchScoring({
  isPlaying,
  isScoringEnabled = true,
  setIsPlaying,
  playerMotionFrameRef,
  instructorMotionFrameRef,
  advanceInstructorFrame,
  spineGoal = null,
}: UseMovementMatchScoringInput) {
  const [finalScore, setFinalScore] = useState(0);
  const [feedbackMsg, setFeedbackMsg] = useState<FeedbackMessage>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [hudScore, setHudScore] = useState(0);
  const [hudSync, setHudSync] = useState(0);
  const [hudSpine, setHudSpine] = useState(0);
  const [hudSpineCue, setHudSpineCue] = useState("Waiting for spine tracking.");
  const [hudSpineReadiness, setHudSpineReadiness] = useState<MovementSpineReadiness["status"]>("blocked");
  const [finalSpineScore, setFinalSpineScore] = useState(0);
  const [finalSpineCue, setFinalSpineCue] = useState(DEFAULT_SPINE_CUE);
  const [finalSessionResult, setFinalSessionResult] = useState<MovementSessionScoreResult | null>(null);
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const syncRef = useRef(0);
  const sessionScoreRef = useRef(createMovementSessionScoreState());
  const lastHudUpdateRef = useRef(0);
  const lastPlayerMotionFrameRef = useRef<MovementMotionFrame | null>(null);
  const lastScoreUpdateRef = useRef(0);
  /**
   * The encouragement currently being said, so it is only said once.
   *
   * The scoring tick re-issued the same message every 140ms with a fresh id,
   * and the dismissal timer below restarts on every change — so a message that
   * was meant to show for two seconds never got to leave. Anthony, on the
   * practice screen: *"the messages come on the screen and never disappear"*.
   *
   * Holding the text here means an unchanged message is not re-issued, the
   * timer runs out, and it goes. The same words can be said again once the game
   * has said something different, or nothing at all.
   */
  const feedbackTextRef = useRef<string | null>(null);

  useEffect(() => {
    if (!feedbackMsg) return;

    const timeoutId = setTimeout(() => setFeedbackMsg(null), FEEDBACK_MESSAGE_LIFETIME_MS);
    return () => clearTimeout(timeoutId);
  }, [feedbackMsg]);

  useEffect(() => {
    let active = true;
    let animationFrameId: number;

    const gameLoop = () => {
      if (!active) return;
      animationFrameId = requestAnimationFrame(gameLoop);

      if (!isPlaying) return;

      const playback = advanceInstructorFrame();

      if (playback.status === "empty") return;
      if (playback.status === "complete") {
        if (isPlaying) {
          const sessionResult = resolveMovementSessionScoreResult(sessionScoreRef.current);
          setFinalSessionResult(sessionResult);
          setFinalScore(sessionResult.points);
          // Averaged across the session: a single well-held frame used to be
          // reported as the whole practice.
          setFinalSpineScore(sessionResult.spinePercent);
          setFinalSpineCue(sessionResult.spineCue ?? DEFAULT_SPINE_CUE);
          setHudScore(sessionResult.points);
          setHudSync(Math.round(syncRef.current));
          setIsPlaying(false);
          setIsComplete(true);
        }
        return;
      }

      const playerMotionFrame = playerMotionFrameRef?.current ?? null;
      const instructorMotionFrame = instructorMotionFrameRef?.current ?? null;
      const hudFrame = playerMotionFrame && instructorMotionFrame
        ? resolveMovementMatchHudFrame({
            instructorMotionFrame,
            playerMotionFrame,
            spineGoal,
          })
        : null;

      if (hudFrame) {
        syncRef.current = hudFrame.sync;

        const now = performance.now();
        const shouldUpdateScore = now - lastScoreUpdateRef.current >= SCORE_UPDATE_INTERVAL_MS;

        if (!isScoringEnabled) {
          comboRef.current = 0;
          if (shouldAnnounceMovementFeedback(feedbackTextRef.current, null)) {
            feedbackTextRef.current = null;
            setFeedbackMsg(null);
          }
        } else if (shouldUpdateScore) {
          lastScoreUpdateRef.current = now;

          if (!playerMotionFrame) {
            comboRef.current = 0;
            setFeedbackMsg(null);
          } else {
            const { gameplayEventFrame, gameplaySummary } = resolveMovementMatchScoringGameplaySummary({
              // Scoring is graded against the coach, not against movement alone.
              instructorSync: instructorMotionFrame ? hudFrame.sync : null,
              playerMotionFrame,
              previousPlayerMotionFrame: lastPlayerMotionFrameRef.current,
              streak: comboRef.current,
            });
            lastPlayerMotionFrameRef.current = playerMotionFrame;
            comboRef.current = gameplayEventFrame.nextStreak;
            scoreRef.current += gameplaySummary.scoreDeltaTotal;
            accumulateMovementSessionScoreFrame(sessionScoreRef.current, {
              gameplayEventFrame,
              instructorSync: instructorMotionFrame ? hudFrame.sync : null,
              scoreDeltaTotal: gameplaySummary.scoreDeltaTotal,
              spineCue: hudFrame.spineCue,
              spineScore: hudFrame.spineScore,
            });

            if (!gameplaySummary.feedbackMessage) {
              if (shouldAnnounceMovementFeedback(feedbackTextRef.current, null)) {
                feedbackTextRef.current = null;
                setFeedbackMsg(null);
              }
            } else {
              const feedbackText = GAMEPLAY_FEEDBACK_TEXT[gameplaySummary.feedbackMessage];
              if (shouldAnnounceMovementFeedback(feedbackTextRef.current, feedbackText)) {
                feedbackTextRef.current = feedbackText;
                setFeedbackMsg({ text: feedbackText, id: Date.now() });
              }
            }
          }
        }

        if (now - lastHudUpdateRef.current > 100) {
          lastHudUpdateRef.current = now;
          setHudScore(scoreRef.current);
          setHudSync(Math.round(hudFrame.sync));
          setHudSpine(hudFrame.spineScore);
          setHudSpineCue(hudFrame.spineCue);
          setHudSpineReadiness(hudFrame.spineReadiness);
        }
      }
    };

    animationFrameId = requestAnimationFrame(gameLoop);
    return () => {
      active = false;
      cancelAnimationFrame(animationFrameId);
    };
  }, [
    advanceInstructorFrame,
    instructorMotionFrameRef,
    isPlaying,
    isScoringEnabled,
    playerMotionFrameRef,
    setIsPlaying,
    spineGoal,
  ]);

  useEffect(() => {
    let active = true;
    let animationFrameId: number;

    const idleHudLoop = () => {
      if (!active) return;
      animationFrameId = requestAnimationFrame(idleHudLoop);
      if (isPlaying) return;

      const playerMotionFrame = playerMotionFrameRef?.current ?? null;
      if (!playerMotionFrame) return;

      const instructorMotionFrame = instructorMotionFrameRef?.current ?? null;
      const hudFrame = instructorMotionFrame
        ? resolveMovementMatchHudFrame({
            instructorMotionFrame,
            playerMotionFrame,
            spineGoal,
          })
        : resolveMovementPlayerSpineHudFrame(playerMotionFrame);
      if (!hudFrame) return;

      const now = performance.now();
      if (now - lastHudUpdateRef.current <= 150) return;

      lastHudUpdateRef.current = now;
      const syncValue = "sync" in hudFrame && typeof hudFrame.sync === "number"
        ? hudFrame.sync
        : null;
      if (syncValue !== null) {
        syncRef.current = syncValue;
        setHudSync(Math.round(syncValue));
      }
      setHudSpine(hudFrame.spineScore);
      setHudSpineCue(hudFrame.spineCue);
      setHudSpineReadiness(hudFrame.spineReadiness);
    };

    animationFrameId = requestAnimationFrame(idleHudLoop);
    return () => {
      active = false;
      cancelAnimationFrame(animationFrameId);
    };
  }, [
    instructorMotionFrameRef,
    isPlaying,
    playerMotionFrameRef,
    spineGoal,
  ]);

  const resetScoring = useCallback(() => {
    setIsComplete(false);
    scoreRef.current = 0;
    comboRef.current = 0;
    syncRef.current = 0;
    sessionScoreRef.current = createMovementSessionScoreState();
    lastPlayerMotionFrameRef.current = null;
    lastScoreUpdateRef.current = 0;
    setFinalSessionResult(null);
    setFinalScore(0);
    setFinalSpineScore(0);
    setFinalSpineCue(DEFAULT_SPINE_CUE);
    setHudScore(0);
    setHudSync(0);
    setHudSpine(0);
    setHudSpineCue("Waiting for spine tracking.");
    setHudSpineReadiness("blocked");
    setFeedbackMsg(null);
  }, []);

  return {
    finalScore,
    finalSessionResult,
    finalSpineScore,
    finalSpineCue,
    feedbackMsg,
    isComplete,
    hudScore,
    hudSync,
    hudSpine,
    hudSpineCue,
    hudSpineReadiness,
    syncRef,
    resetScoring,
  };
}
