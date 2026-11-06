"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(changed: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
  const asked = window.matchMedia(QUERY);
  asked.addEventListener?.("change", changed);
  return () => asked.removeEventListener?.("change", changed);
}

const read = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;

/**
 * Whether the reader has asked for less motion, for a part that sets its motion on the element and draws something different
 * without it, as Live's `MinuteBars` and `AgainstBars` do. A `transition-*` class needs none of this: `motion-reduce:` and the rule
 * in `globals.css` cover it.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
