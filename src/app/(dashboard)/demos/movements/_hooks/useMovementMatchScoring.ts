"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  getVrmMotionLandmarks,
  type VrmMotionFrame,
  type VrmMotionPayload,
  type VrmMotionRef,
} from "../_lib/vrmRigging";
import {
  calculateLandmarkMotion,
  calculateMovementSync,
  updateMovementScore,
  type ScoreBlendshape,
  type ScoreHandsPayload,
  type ScoreLandmark,
} from "../_lib/movementScoring";

type FeedbackMessage = { text: string; id: number } | null;

type InstructorPlaybackAdvance = {
  status: "empty" | "complete" | "advanced";
  lagFrame?: VrmMotionFrame;
};

type UseMovementMatchScoringInput = {
  isPlaying: boolean;
  isScoringEnabled?: boolean;
  setIsPlaying: (isPlaying: boolean) => void;
  playerLiveLmRef: RefObject<VrmMotionPayload | null>;
  advanceInstructorFrame: () => InstructorPlaybackAdvance;
};

const PLAYER_MOTION_SCORE_THRESHOLD = 0.012;
const SCORE_UPDATE_INTERVAL_MS = 140;

export function useMovementMatchScoring({
  isPlaying,
  isScoringEnabled = true,
  setIsPlaying,
  playerLiveLmRef,
  advanceInstructorFrame,
}: UseMovementMatchScoringInput) {
  const [finalScore, setFinalScore] = useState(0);
  const [feedbackMsg, setFeedbackMsg] = useState<FeedbackMessage>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [hudScore, setHudScore] = useState(0);
  const [hudSync, setHudSync] = useState(0);
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const syncRef = useRef(0);
  const lastHudUpdateRef = useRef(0);
  const lastPlayerLandmarksRef = useRef<ScoreLandmark[] | null>(null);
  const lastScoreUpdateRef = useRef(0);

  useEffect(() => {
    if (!feedbackMsg) return;

    const timeoutId = setTimeout(() => setFeedbackMsg(null), 2000);
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
          setFinalScore(scoreRef.current);
          setHudScore(scoreRef.current);
          setHudSync(Math.round(syncRef.current));
          setIsPlaying(false);
          setIsComplete(true);
        }
        return;
      }

      const pData =
        playerLiveLmRef.current && !Array.isArray(playerLiveLmRef.current)
          ? playerLiveLmRef.current
          : null;
      const iData = (playback.lagFrame as VrmMotionRef) || {};
      const iPayload = !Array.isArray(iData) ? iData : null;

      let currentPL = pData?.landmarks || [];
      let instructorLandmarks = getVrmMotionLandmarks(iData);

      if (pData?.worldLandmarks?.length === 33 && iPayload?.worldLandmarks?.length === 33) {
        currentPL = pData.worldLandmarks;
        instructorLandmarks = iPayload.worldLandmarks;
      }

      if (currentPL.length >= 33 && instructorLandmarks.length >= 33) {
        const playerLandmarks = currentPL as ScoreLandmark[];
        const playerMotion = calculateLandmarkMotion(
          lastPlayerLandmarksRef.current,
          playerLandmarks,
        );
        lastPlayerLandmarksRef.current = playerLandmarks.map((landmark) => ({ ...landmark }));

        const syncResult = calculateMovementSync({
          playerLandmarks,
          instructorLandmarks: instructorLandmarks as ScoreLandmark[],
          playerHands: pData?.hands as ScoreHandsPayload | undefined,
          instructorHands: iPayload?.hands as ScoreHandsPayload | undefined,
          playerBlendshapes: pData?.blendshapes as ScoreBlendshape[] | undefined,
        });

        syncRef.current = syncResult.sync;

        const now = performance.now();
        const shouldUpdateScore = now - lastScoreUpdateRef.current >= SCORE_UPDATE_INTERVAL_MS;
        const hasMeaningfulPlayerMotion = playerMotion >= PLAYER_MOTION_SCORE_THRESHOLD;

        if (!isScoringEnabled || !hasMeaningfulPlayerMotion) {
          comboRef.current = 0;
          setFeedbackMsg(null);
        } else if (shouldUpdateScore) {
          lastScoreUpdateRef.current = now;
          const scoreUpdate = updateMovementScore({
            sync: syncResult.sync,
            combo: comboRef.current,
            score: scoreRef.current,
            isZenActive: syncResult.isZenActive,
          });

          comboRef.current = scoreUpdate.combo;
          scoreRef.current = scoreUpdate.score;

          if (scoreUpdate.feedbackText) {
            setFeedbackMsg({ text: scoreUpdate.feedbackText, id: Date.now() });
          } else if (scoreUpdate.shouldClearFeedback) {
            setFeedbackMsg(null);
          }
        }

        if (now - lastHudUpdateRef.current > 100) {
          lastHudUpdateRef.current = now;
          setHudScore(scoreRef.current);
          setHudSync(Math.round(syncResult.sync));
        }
      }
    };

    animationFrameId = requestAnimationFrame(gameLoop);
    return () => {
      active = false;
      cancelAnimationFrame(animationFrameId);
    };
  }, [advanceInstructorFrame, isPlaying, isScoringEnabled, playerLiveLmRef, setIsPlaying]);

  const resetScoring = useCallback(() => {
    setIsComplete(false);
    scoreRef.current = 0;
    comboRef.current = 0;
    syncRef.current = 0;
    lastPlayerLandmarksRef.current = null;
    lastScoreUpdateRef.current = 0;
    setFinalScore(0);
    setHudScore(0);
    setHudSync(0);
    setFeedbackMsg(null);
  }, []);

  return {
    finalScore,
    feedbackMsg,
    isComplete,
    hudScore,
    hudSync,
    syncRef,
    resetScoring,
  };
}
