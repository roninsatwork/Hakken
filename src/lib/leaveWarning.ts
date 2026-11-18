/**
 * Leaving a page asks "Leave site?" only while something may still be saving (speed fixes, 18 November 2026).
 *
 * Convex's own warning (`unsavedChangesWarning`) asked whenever any request was on its way, a screen's question to
 * Google included: leaving Search Console's Pages while it asked Google said "Changes you made may not be saved" with
 * nothing to save. The app turns that off and warns here instead: while any request is on its way that isn't marked
 * `readOnly`, so every save a person makes still warns. `readOnly` marks the requests that carry nothing a person
 * changed: the reads a screen asks of Google, and the bookkeeping a screen does as it opens (asking for a catch-up,
 * noting what its eye said). Leaving Pages a second after opening it still warned for those two, on the first build of
 * this (18 November 2026).
 */

/**
 * The requests marked `readOnly` on their way, by kind. Actions and mutations are counted apart (review, 18 November
 * 2026): a read of Google stuck on its way could otherwise cancel out a person's save in one shared count, and leaving
 * would lose the save without a warning. A read can only ever cancel out a read.
 */
const quietOnTheirWay = { action: 0, mutation: 0 };

/** A request carrying nothing a person changed, counted while it's on its way, so leaving never warns for it. */
export function readOnly<T>(asked: Promise<T>, kind: "action" | "mutation" = "action"): Promise<T> {
  quietOnTheirWay[kind] += 1;
  // A stand-in for a request (a test's) may hand back no promise at all: it still counts until it settles.
  return Promise.resolve(asked).finally(() => {
    quietOnTheirWay[kind] -= 1;
  });
}

/** Convex's count of what is on its way (`ConvexReactClient.connectionState`). */
export type RequestsOnTheirWay = { inflightMutations: number; inflightActions: number };

/** Whether leaving now could lose a save: more of either kind on its way than of that kind marked `readOnly`. */
export function savingNow(state: RequestsOnTheirWay): boolean {
  return state.inflightMutations > quietOnTheirWay.mutation || state.inflightActions > quietOnTheirWay.action;
}

/** The app's own warning on leaving, in place of Convex's: on while `client` may still be saving. Returns how to take it off. */
export function warnOnLeaveWhileSaving(client: { connectionState: () => RequestsOnTheirWay }): () => void {
  const warn = (event: BeforeUnloadEvent) => {
    if (!savingNow(client.connectionState())) return;
    event.preventDefault();
    // Older browsers show the warning only when the event carries a value.
    event.returnValue = "";
  };
  window.addEventListener("beforeunload", warn);
  return () => window.removeEventListener("beforeunload", warn);
}
