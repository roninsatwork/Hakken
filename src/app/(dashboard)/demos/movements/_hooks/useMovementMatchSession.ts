"use client";

import { useCallback, useState } from "react";
import { AVATAR_ROSTER } from "@/src/lib/constants/avatars";

const DEFAULT_PLAYER_AVATAR_URL = "/models/VIPE_Hero__1793.vrm";
const DEFAULT_INSTRUCTOR_AVATAR_URL = "/models/VIPE_Hero__1914.vrm";

type ResetMatchOptions = {
  returnToLobby?: boolean;
  startPlaying?: boolean;
  resetInstructorPlayback: () => void;
  resetScoring: () => void;
};

type UseMovementMatchSessionInput = {
  isVisionReady: boolean;
};

function getAvatarName(url: string) {
  return AVATAR_ROSTER.find((avatar) => avatar.path === url)?.name || "Unknown";
}

export function useMovementMatchSession({ isVisionReady }: UseMovementMatchSessionInput) {
  const [isLobby, setIsLobby] = useState(true);
  const [playerAvatarUrl, setPlayerAvatarUrl] = useState(DEFAULT_PLAYER_AVATAR_URL);
  const [instructorAvatarUrl, setInstructorAvatarUrl] = useState(DEFAULT_INSTRUCTOR_AVATAR_URL);
  const [isPlaying, setIsPlaying] = useState(false);
  const [calibrationStatus, setCalibrationStatus] = useState("Ready");

  const startMatch = useCallback(() => {
    setIsLobby(false);
  }, []);

  const markBodyTracked = useCallback(() => {
    setCalibrationStatus("Ready");
  }, []);

  const togglePlaying = useCallback(() => {
    if (!isVisionReady) return;
    setIsPlaying((currentIsPlaying) => !currentIsPlaying);
  }, [isVisionReady]);

  const resetMatch = useCallback(
    ({
      returnToLobby,
      startPlaying,
      resetInstructorPlayback,
      resetScoring,
    }: ResetMatchOptions) => {
      setIsLobby(returnToLobby ?? false);
      resetInstructorPlayback();
      resetScoring();
      setCalibrationStatus("Ready");
      setIsPlaying(Boolean(startPlaying && isVisionReady));
    },
    [isVisionReady],
  );

  return {
    isLobby,
    playerAvatarUrl,
    playerAvatarName: getAvatarName(playerAvatarUrl),
    instructorAvatarUrl,
    instructorAvatarName: getAvatarName(instructorAvatarUrl),
    isPlaying,
    calibrationStatus,
    setPlayerAvatarUrl,
    setInstructorAvatarUrl,
    setIsPlaying,
    startMatch,
    markBodyTracked,
    togglePlaying,
    resetMatch,
  };
}
