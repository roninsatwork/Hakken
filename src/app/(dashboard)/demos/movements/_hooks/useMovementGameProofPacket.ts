"use client";

import { useEffect, useState } from "react";
import {
  buildMovementGameProofPacket,
  type MovementGameProofPacket,
} from "../_lib/movementGameProofPacket";

export function useMovementGameProofPacket(packetUrl: string | null) {
  const [requestState, setRequestState] = useState<{
    error: string | null;
    packet: MovementGameProofPacket | null;
    url: string | null;
  }>({ error: null, packet: null, url: null });

  useEffect(() => {
    const abortController = new AbortController();
    if (!packetUrl) return () => abortController.abort();

    void fetch(packetUrl, { signal: abortController.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Game proof packet request failed (${response.status}).`);
        return response.json() as Promise<unknown>;
      })
      .then((value) => setRequestState({
        error: null,
        packet: buildMovementGameProofPacket(value),
        url: packetUrl,
      }))
      .catch((reason: unknown) => {
        if (abortController.signal.aborted) return;
        setRequestState({
          error: reason instanceof Error ? reason.message : String(reason),
          packet: null,
          url: packetUrl,
        });
      });

    return () => abortController.abort();
  }, [packetUrl]);

  const isCurrentRequest = requestState.url === packetUrl;
  return {
    error: isCurrentRequest ? requestState.error : null,
    isLoading: Boolean(packetUrl) && !isCurrentRequest,
    packet: isCurrentRequest ? requestState.packet : null,
  };
}
