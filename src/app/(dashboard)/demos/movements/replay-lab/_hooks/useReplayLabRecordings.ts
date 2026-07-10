"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { MovementDebugReplaySession } from "../../_lib/movementDebugReplay";
import {
  loadMovementReplayRecording,
  type MovementReplayRecordingSource,
} from "../../_lib/movementRecordingReplay";
import type { LoadedReplayRecording, ReplayLabRecording } from "../_lib/replayLabHelpers";

export function useReplayLabRecordings({
  activeRecordingId,
  hasRunBatch,
  onDebugSessionReady,
  selectedRecordingIds,
}: {
  activeRecordingId: Id<"movements"> | null;
  hasRunBatch: boolean;
  onDebugSessionReady: (debugRecordingId: Id<"movements">) => void;
  selectedRecordingIds: Array<Id<"movements">>;
}) {
  const [loadedRecordings, setLoadedRecordings] = useState<Record<string, LoadedReplayRecording>>({});
  const loadedRecordingsRef = useRef<Record<string, LoadedReplayRecording>>({});
  const recordingsToLoadRef = useRef<MovementReplayRecordingSource[]>([]);
  const [debugReplaySession, setDebugReplaySession] = useState<MovementDebugReplaySession | null>(null);
  const [debugReplayError, setDebugReplayError] = useState<string | null>(null);

  const recordings = useQuery(api.movements.listReplayAlignmentRecordings, { limit: 50 });
  const debugRecordingId = debugReplaySession?.id as Id<"movements"> | undefined;
  const debugRecording = useMemo<ReplayLabRecording | null>(() => {
    if (!debugReplaySession || !debugRecordingId) return null;

    return {
      _id: debugRecordingId,
      captureFps: debugReplaySession.fps,
      createdAt: debugReplaySession.createdAt ?? debugReplaySession.startedAt,
      difficulty: "debug",
      durationMs: debugReplaySession.durationMs,
      frameCount: debugReplaySession.sampleCount,
      poseData: "debug-replay-session",
      poseDataFormat: "legacy-inline-json",
      spineGoal: debugReplaySession.trigger,
      title: debugReplaySession.warningSummary ?? "Debug replay session",
    };
  }, [debugRecordingId, debugReplaySession]);
  const replayRecordings = useMemo<ReplayLabRecording[] | undefined>(() => {
    const savedRecordings = recordings as ReplayLabRecording[] | undefined;
    if (!debugRecording) return savedRecordings;
    return [debugRecording, ...(savedRecordings ?? []).filter((recording) => recording._id !== debugRecording._id)];
  }, [debugRecording, recordings]);
  const recordingsToLoad = useMemo(() => {
    if (!replayRecordings) return [];
    const idsToLoad = new Set<string>(hasRunBatch ? selectedRecordingIds : []);
    if (activeRecordingId) idsToLoad.add(activeRecordingId);
    return replayRecordings.filter((recording) => (
      idsToLoad.has(recording._id) &&
      recording._id !== debugRecordingId
    ));
  }, [activeRecordingId, debugRecordingId, hasRunBatch, replayRecordings, selectedRecordingIds]);
  const recordingsToLoadKey = useMemo(() => (
    recordingsToLoad
      .map((recording) => [
        recording._id,
        recording.poseDataUrl ?? "",
        recording.poseData,
        recording.poseDataFormat ?? "",
        recording.frameCount ?? "",
        recording.durationMs ?? "",
      ].join(":"))
      .join("|")
  ), [recordingsToLoad]);
  const effectiveLoadedRecordings = useMemo<Record<string, LoadedReplayRecording>>(() => {
    if (!debugReplaySession || !debugRecordingId) return loadedRecordings;

    return {
      ...loadedRecordings,
      [debugRecordingId]: {
        error: null,
        isLoading: false,
        session: debugReplaySession,
      },
    };
  }, [debugRecordingId, debugReplaySession, loadedRecordings]);

  useEffect(() => {
    loadedRecordingsRef.current = loadedRecordings;
  }, [loadedRecordings]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;

    const debugReplaySessionUrl = new URLSearchParams(window.location.search).get("debugReplaySessionUrl");
    if (!debugReplaySessionUrl) return;

    let cancelled = false;
    void fetch(debugReplaySessionUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load debug replay session (${response.status}).`);
        return response.json() as Promise<MovementDebugReplaySession>;
      })
      .then((session) => {
        if (cancelled) return;
        if (!session.id || !Array.isArray(session.samples)) {
          throw new Error("Debug replay session must include an id and samples.");
        }
        setDebugReplayError(null);
        setDebugReplaySession(session);
      })
      .catch((error) => {
        if (cancelled) return;
        setDebugReplayError(error instanceof Error ? error.message : "Could not load debug replay session.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!debugReplaySession || !debugRecordingId) return;

    onDebugSessionReady(debugRecordingId);
  }, [debugRecordingId, debugReplaySession, onDebugSessionReady]);

  useEffect(() => {
    recordingsToLoadRef.current = recordingsToLoad;
  }, [recordingsToLoad]);

  useEffect(() => {
    const queuedRecordings = recordingsToLoadRef.current;
    if (queuedRecordings.length === 0) return;

    let cancelled = false;
    const missingRecordings = queuedRecordings.filter((recording) => !loadedRecordingsRef.current[recording._id]);
    if (missingRecordings.length === 0) return;

    setLoadedRecordings((current) => {
      const next = { ...current };
      missingRecordings.forEach((recording) => {
        next[recording._id] = {
          error: null,
          isLoading: true,
          session: null,
        };
      });
      return next;
    });

    missingRecordings.forEach((recording) => {
      void loadMovementReplayRecording(recording as MovementReplayRecordingSource)
        .then((result) => {
          if (cancelled) return;
          setLoadedRecordings((current) => ({
            ...current,
            [recording._id]: {
              error: null,
              isLoading: false,
              session: result.session,
            },
          }));
        })
        .catch((error) => {
          if (cancelled) return;
          setLoadedRecordings((current) => ({
            ...current,
            [recording._id]: {
              error: error instanceof Error ? error.message : "Could not load recording.",
              isLoading: false,
              session: null,
            },
          }));
        });
    });

    return () => {
      cancelled = true;
    };
    // Loading is keyed on the stable recordingsToLoadKey digest, matching the
    // original page effect.
  }, [recordingsToLoadKey]);

  const replaySession = activeRecordingId ? effectiveLoadedRecordings[activeRecordingId]?.session ?? null : null;
  const replayLoadError = activeRecordingId ? effectiveLoadedRecordings[activeRecordingId]?.error ?? null : null;
  const replayIsLoading = Boolean(activeRecordingId && effectiveLoadedRecordings[activeRecordingId]?.isLoading);
  const recordingTitleById = useMemo(() => (
    new Map<string, string>((replayRecordings ?? []).map((recording) => [
      recording._id,
      recording.title ?? recording._id,
    ]))
  ), [replayRecordings]);

  return {
    debugRecordingId,
    debugReplayError,
    loadedRecordings: effectiveLoadedRecordings,
    recordingTitleById,
    replayIsLoading,
    replayLoadError,
    replayRecordings,
    replaySession,
  };
}
