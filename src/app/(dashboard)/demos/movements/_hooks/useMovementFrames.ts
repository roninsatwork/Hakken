"use client";

import { readMovementRecordingPacket } from "../_lib/movementRecordingPacketTransport";
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import {
  isInlinePoseData,
  parseMovementFramePayload,
} from "../_lib/movementFrameCodec";
import type { MovementDataFormat, MovementFrame } from "../_lib/movementTypes";

type MovementFrameSource = Pick<Doc<"movements">, "_id" | "poseData"> & {
  poseDataFormat?: MovementDataFormat;
};

export function useMovementFrames(movement: MovementFrameSource | null | undefined) {
  const [frames, setFrames] = useState<MovementFrame[]>([]);
  const [format, setFormat] = useState<MovementDataFormat | null>(null);
  const [fps, setFps] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const poseData = movement?.poseData;
  const shouldFetchStorage = typeof poseData === "string" && !isInlinePoseData(poseData);
  const fileUrl = useQuery(
    api.movements.getFileUrl,
    shouldFetchStorage && poseData ? { movementId: movement._id } : "skip"
  );

  const reload = useCallback(() => {
    setReloadToken((current) => current + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadFrames() {
      if (!movement || !poseData) {
        setFrames([]);
        setFormat(null);
        setError(null);
        setIsLoading(false);
        return;
      }

      if (shouldFetchStorage && !fileUrl) {
        setIsLoading(true);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const sourceFormat: MovementDataFormat = shouldFetchStorage
          ? "legacy-storage-json"
          : "legacy-inline-json";
        const payload = shouldFetchStorage
          ? await fetch(fileUrl as string).then(readMovementRecordingPacket)
          : poseData;
        const parsed = parseMovementFramePayload(payload, movement.poseDataFormat ?? sourceFormat);

        if (!cancelled) {
          setFrames(parsed.frames);
          setFormat(parsed.format);
          setFps(parsed.fps);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setFrames([]);
          setFormat(null);
          setError(loadError instanceof Error ? loadError.message : "Failed to load movement frames.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadFrames();

    return () => {
      cancelled = true;
    };
  }, [fileUrl, movement, poseData, reloadToken, shouldFetchStorage]);

  return {
    frames,
    format,
    fps,
    isLoading,
    error,
    reload,
  };
}
