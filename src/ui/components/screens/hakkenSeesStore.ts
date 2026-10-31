import { useSyncExternalStore } from "react";
import type { HakkenSeesStep, SeesAsk, SeesPage } from "./HakkenSees";

/**
 * What the screen's What Hakken sees box holds, and whether it is open
 * (docs/plans/active/sees-header-and-rolling-dates-plan.md, part one): the
 * box publishes its sentences and steps here as it mounts, with the screen's
 * address, and the header's eye (`HakkenSeesEye`) reads them — so the eye is
 * drawn by the header without any screen wiring it up. One screen is on show
 * at a time, so one box is held.
 *
 * The box is closed on every screen until the eye opens it. Opening it
 * marks its advice read in this browser (`hakken.sees.read.<screen>`), as the
 * fold was remembered (search-console-volatility-plan.md §8, HS3): the eye
 * counts the box's steps as new only while the advice is not the one last
 * read, so the same advice on today's numbers is not new again. A browser
 * that refuses storage keeps the reads for this visit only.
 */

/**
 * `ask`: the page's figures and links, handed to the Insights team when the
 * eye is pressed (sees-conversion-specialist-plan-2026-10-30.md S4); a page
 * without one shows the rule's words alone.
 */
export type SeesBox = { screen: string; says: string[]; steps: HakkenSeesStep[]; advice: string; ask?: SeesAsk; name?: (eventName: string) => string; page?: SeesPage };

const PREFIX = "hakken.sees.read.";
let current: SeesBox | null = null;
let open = false;
/** The headers that have asked to draw the eye, in the order they mounted: the first draws it. */
let claims: string[] = [];
const readKept = new Map<string, string>();
const listeners = new Set<() => void>();

function changed() {
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

const useStore = <T>(read: () => T, onServer: () => T) => useSyncExternalStore(subscribe, read, onServer);

/** The box the screen has published, or null as it leaves: called by `HakkenSees`. A screen leaving clears only its own. */
export function publishSees(box: SeesBox | null, leaving?: string) {
  if (box) {
    if (current?.screen !== box.screen) open = false;
    current = box;
  } else if (!leaving || current?.screen === leaving) {
    current = null;
    open = false;
  }
  changed();
}

export function useSeesBox(): SeesBox | null {
  return useStore(() => current, () => null);
}

export function useSeesOpen(): boolean {
  return useStore(() => open, () => false);
}

/** The advice last read on a screen, or null. */
export function readAdvice(screen: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(PREFIX + screen);
  } catch {
    // Storage refused: what was read this visit stands in.
    return readKept.get(screen) ?? null;
  }
}

function markRead(screen: string, advice: string) {
  try {
    window.localStorage.setItem(PREFIX + screen, advice);
  } catch {
    readKept.set(screen, advice);
  }
}

/**
 * Open the bubble, marking its advice read, or close it. Each press opens it on a new conversation (Anthony,
 * 2026-10-31: "every time we press the eye it should open a new chat thread"): the last one stays in Ask Hakken's list.
 */
export function toggleSees() {
  open = !open;
  if (open && current) markRead(current.screen, current.advice);
  if (open) forgetSeesThreads();
  changed();
}

/** Close the bubble: a click outside it, or Escape (the speech bubble of 2026-10-30). */
export function closeSees() {
  if (!open) return;
  open = false;
  changed();
}

/**
 * What the Insights team said when the eye asked for a page (its key):
 * "RESEARCHING" while it writes, then what it saved, "FAILED" when there
 * was no team to ask, or "NO_CREDITS" when the company has none left. Kept here, outside React, so the eye's effect updates
 * it as an external system and the bubble reads it.
 */
export type SeesAsked = { key: string; status: "RESEARCHING" | "WRITTEN" | "FAILED" | "NO_CREDITS" };
let asked: SeesAsked | null = null;

export function noteAsked(key: string, status: SeesAsked["status"]) {
  // A later ask (another page, other filters) is never overwritten by an earlier one's answer.
  if (asked && asked.key !== key && status !== "RESEARCHING") return;
  asked = { key, status };
  changed();
}

export function useSeesAsked(): SeesAsked | null {
  return useStore(() => asked, () => null);
}

/** Whether the box holds advice not yet read in this browser. */
export function useSeesNew(): boolean {
  return useStore(() => (current ? readAdvice(current.screen) !== current.advice : false), () => false);
}

/**
 * A header asks to draw the eye. Where a page's own header sits under its
 * section's (Google Analytics' "Overview" under the website's), the
 * outermost mounts first and draws it; the rest draw nothing.
 */
export function claimEye(id: string) {
  if (!claims.includes(id)) claims = [...claims, id];
  changed();
  return () => {
    claims = claims.filter((other) => other !== id);
    changed();
  };
}

export function useDrawsEye(id: string): boolean {
  return useStore(() => claims[0] === id, () => false);
}

/** Everything forgotten: for tests. */
export function resetSees() {
  current = null;
  open = false;
  claims = [];
  asked = null;
  readKept.clear();
  changed();
}

/**
 * The Ask Hakken conversation started from the eye's panel on each page, by the page's key (`seesKey`), while the
 * panel stays open (sees-side-panel-plan-2026-10-31.md, phase 3); each press of the eye starts a new one
 * (ask-hakken-every-chart-plan-2026-10-31.md, §2b). The conversations themselves are in Ask Hakken's list.
 */
const seesThreads = new Map<string, string>();
let threadsVersion = 0;
const threadListeners = new Set<() => void>();
export function noteSeesThread(key: string, threadId: string) {
  seesThreads.set(key, threadId);
  threadsVersion += 1;
  for (const listener of threadListeners) listener();
}
function forgetSeesThreads() {
  if (seesThreads.size === 0) return;
  seesThreads.clear();
  threadsVersion += 1;
  for (const listener of threadListeners) listener();
}
export function useSeesThread(key: string | null): string | null {
  useSyncExternalStore((listener) => { threadListeners.add(listener); return () => threadListeners.delete(listener); }, () => threadsVersion, () => 0);
  return key ? seesThreads.get(key) ?? null : null;
}
