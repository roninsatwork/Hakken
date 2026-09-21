/**
 * Remembering how the composer was left.
 *
 * The thinking level reset to Fast on every page load, so anyone who works at
 * a deeper setting had to reselect it each time. It is a preference, not
 * data, so it lives in the browser rather than costing a database write per
 * change.
 *
 * The read is defensive on purpose: storage can be unavailable (private
 * windows, embedded frames, blocked cookies) and can hold a value written by
 * an older or newer build. Anything unrecognised falls back to the default
 * rather than putting the composer into a state the screen cannot show.
 */

export const THINKING_LEVEL_IDS = ["NONE", "LOW", "MEDIUM", "HIGH"] as const;
export type ThinkingLevelId = (typeof THINKING_LEVEL_IDS)[number];

export const DEFAULT_THINKING_LEVEL: ThinkingLevelId = "NONE";
const THINKING_LEVEL_KEY = "hakken.composer.thinkingLevel";

export function isThinkingLevelId(value: unknown): value is ThinkingLevelId {
  return typeof value === "string" && (THINKING_LEVEL_IDS as readonly string[]).includes(value);
}

export function readRememberedThinkingLevel(): ThinkingLevelId {
  if (typeof window === "undefined") return DEFAULT_THINKING_LEVEL;
  try {
    const stored = window.localStorage.getItem(THINKING_LEVEL_KEY);
    return isThinkingLevelId(stored) ? stored : DEFAULT_THINKING_LEVEL;
  } catch {
    return DEFAULT_THINKING_LEVEL;
  }
}

export function rememberThinkingLevel(level: ThinkingLevelId) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THINKING_LEVEL_KEY, level);
  } catch {
    // A browser that refuses storage still gets a working composer for this
    // session; only the memory across loads is lost.
  }
}

/**
 * What to send for a given model.
 *
 * Only some providers act on the thinking level — the rest ignore it — so the
 * remembered choice is held for the models that use it and `NONE` is sent to
 * the models that do not. Without this the request would claim a setting the
 * screen never offered, because the control is hidden for those models.
 */
export function resolveThinkingLevelForModel(args: {
  remembered: ThinkingLevelId;
  modelSupportsThinking: boolean;
}): ThinkingLevelId {
  return args.modelSupportsThinking ? args.remembered : DEFAULT_THINKING_LEVEL;
}

/** Which providers act on the thinking level on the plain assistant path. */
export function modelSupportsThinking(providerKey: string | undefined) {
  return providerKey === "google";
}
