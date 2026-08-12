"use client";

import { useEffect, useRef, useState } from "react";
import { nextRevealCount } from "@/src/lib/streamReveal";

/**
 * Reveal a streamed reply at a readable pace instead of in write-sized lumps.
 *
 * The database receives the reply in throttled chunks by design, so rendering
 * the raw row reads as blocks landing. This hook types out whatever has
 * arrived, accelerating when a burst lands so the screen never trails far
 * behind, and finishing promptly once the stream closes.
 *
 * Only a reply that is streaming when first seen animates: a conversation
 * opened from history shows its answers whole rather than replaying them.
 */
export function useSmoothStreamText(args: { content: string; isStreaming: boolean }) {
  const { content, isStreaming } = args;

  // A row that mounts mid-stream starts from nothing so the whole answer
  // types; one that mounts settled is history and shows complete. The ref is
  // the loop's own ledger — written only inside the effect, so renders stay
  // pure — and the state is what the screen follows.
  const [revealed, setRevealed] = useState(() => (isStreaming ? 0 : content.length));
  const revealedRef = useRef(revealed);

  const isRevealing = revealed < content.length;

  useEffect(() => {
    if (revealedRef.current >= content.length) return;

    let frame = 0;
    let lastTick = performance.now();

    const tick = (now: number) => {
      const next = nextRevealCount({
        revealed: revealedRef.current,
        targetLength: content.length,
        elapsedMs: now - lastTick,
        isStreamClosed: !isStreaming,
      });
      lastTick = now;
      if (next !== revealedRef.current) {
        revealedRef.current = next;
        setRevealed(next);
      }
      if (next < content.length) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [content, isStreaming]);

  return {
    // The finish patch stores trimmed text, which can be shorter than what
    // was already revealed; slice never reads past the end either way.
    text: content.slice(0, Math.min(revealed, content.length)),
    /** Still typing out text that has already arrived. */
    isRevealing,
  };
}
