"use client";

import { useEffect, useState } from "react";
import {
  STREAM_STALE_AFTER_MS,
  getStreamPresentation,
  type StreamPresentation,
} from "@/convex/streamingService";

/**
 * Re-check often enough that an abandoned reply resolves promptly after it ages
 * out, but rarely enough that an open conversation is not re-rendering on a
 * timer for no reason.
 */
export const STREAM_STALE_CHECK_INTERVAL_MS = Math.round(STREAM_STALE_AFTER_MS / 20);

/**
 * How a streamed reply should be presented right now.
 *
 * Staleness depends on the clock, and reading the clock during render is impure:
 * the value is captured once and never revisited, so a reply abandoned by a
 * killed run would keep its caret until something unrelated re-rendered the
 * component. Ticking in an effect makes the stalled state actually arrive.
 *
 * The tick only runs while a reply is streaming, so a settled conversation
 * schedules no timers at all.
 */
export function useStreamPresentation(message: {
  isStreaming?: boolean;
  streamStartedAt?: number;
  streamUpdatedAt?: number;
}): StreamPresentation {
  // Zero until the first effect runs. `getStreamPresentation` reads that as
  // "not yet stale", which is the correct first impression for a live reply.
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!message.isStreaming) return;

    // Scheduled rather than set synchronously: a setState during the effect
    // itself triggers a second render pass on every mount, for a value that is
    // not needed until the reply has had time to go stale.
    let cancelled = false;
    const tick = () => {
      if (!cancelled) setNow(Date.now());
    };

    const initial = setTimeout(tick, 0);
    const interval = setInterval(tick, STREAM_STALE_CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [message.isStreaming]);

  return getStreamPresentation({
    isStreaming: message.isStreaming,
    streamStartedAt: message.streamStartedAt,
    streamUpdatedAt: message.streamUpdatedAt,
    now,
  });
}

