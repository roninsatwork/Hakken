"use client";

import { useEffect, useState } from "react";

/** Often enough that "10 minutes ago" is never wrong, rarely enough to cost nothing. */
const DEFAULT_TICK_MS = 30_000;

/**
 * The current time, as a value the screen can re-render against.
 *
 * Reading `Date.now()` in a render body is impure — the same render would
 * produce a different result each time — and it also freezes: a screen showing
 * "10 minutes ago" that is left open all afternoon goes on saying ten minutes.
 * This ticks instead, so the relative times stay true while somebody watches.
 */
export function useNow(intervalMs: number = DEFAULT_TICK_MS): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
