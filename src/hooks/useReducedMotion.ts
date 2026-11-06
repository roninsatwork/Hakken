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
 * Whether the reader has asked for less motion, for a part that sets its motion on the element. It has to set it there: the
 * theme's `* { transition-property }` in `globals.css` outranks every `transition-*` class, so a class moves nothing, and
 * `motion-reduce:` on one stops nothing (Live's bars, 2026-11-06: their tests read the class, and the bars jumped).
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
