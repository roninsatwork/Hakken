import { useSyncExternalStore } from "react";

/**
 * Which What Hakken sees boxes a person has folded
 * (search-console-volatility-plan.md §8, HS3): per screen — its address, so one
 * website's box is apart from another's — the advice the box held when it was
 * folded. A box reads folded only while its advice is still that advice, so
 * new advice opens it again by itself.
 *
 * A preference rather than data, so it lives in the browser as a Sites
 * table's rows per page do (`siteTableRows.ts`). A browser that refuses
 * storage keeps the fold for this visit only.
 */

const PREFIX = "hakken.sees.folded.";
const kept = new Map<string, string>();
const listeners = new Set<() => void>();

/** The advice a screen's box held when it was folded, or null when it is open. */
export function foldedAdvice(screen: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(PREFIX + screen);
  } catch {
    // Storage refused: the fold kept for this visit stands in.
    return kept.get(screen) ?? null;
  }
}

/** Fold a screen's box on its advice, or open it again with null. */
export function rememberFolded(screen: string, advice: string | null) {
  try {
    if (advice === null) window.localStorage.removeItem(PREFIX + screen);
    else window.localStorage.setItem(PREFIX + screen, advice);
  } catch {
    if (advice === null) kept.delete(screen);
    else kept.set(screen, advice);
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** The advice a screen's box was folded on, kept in step with every box and tab; open while drawn on the server. */
export function useFoldedAdvice(screen: string): string | null {
  return useSyncExternalStore(subscribe, () => foldedAdvice(screen), () => null);
}
