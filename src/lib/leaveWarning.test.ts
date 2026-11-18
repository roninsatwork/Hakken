import { afterEach, describe, expect, it } from "vitest";
import { readOnly, savingNow, warnOnLeaveWhileSaving, type RequestsOnTheirWay } from "./leaveWarning";

/**
 * "Leave site?" only while something may still be saving (speed fixes, 18 November 2026): a save on its way warns, and so
 * does any action that isn't a read a screen asks of Google; leaving while a screen only reads from Google never does.
 */

/** A read that answers when told to: an action, or a screen's bookkeeping save. */
function pendingRead(kind: "action" | "mutation" = "action") {
  let answer: (value: string) => void = () => undefined;
  const asked = readOnly(new Promise<string>((resolve) => {
    answer = resolve;
  }), kind);
  return { asked, answer: async () => {
    answer("done");
    await asked;
  } };
}

/** Whether leaving now asks, as the browser decides: the event's default stopped. */
function leavingAsks(state: RequestsOnTheirWay): boolean {
  const off = warnOnLeaveWhileSaving({ connectionState: () => state });
  const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
  window.dispatchEvent(event);
  off();
  return event.defaultPrevented;
}

let left: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const answer of left) await answer();
  left = [];
});

describe("the leave-page warning", () => {
  it("asks while a save is on its way, and not when nothing is", () => {
    expect(leavingAsks({ inflightMutations: 1, inflightActions: 0 })).toBe(true);
    expect(leavingAsks({ inflightMutations: 0, inflightActions: 0 })).toBe(false);
  });

  it("never asks while a screen only reads from Google", async () => {
    const read = pendingRead();
    left.push(read.answer);
    expect(savingNow({ inflightMutations: 0, inflightActions: 1 })).toBe(false);
    expect(leavingAsks({ inflightMutations: 0, inflightActions: 1 })).toBe(false);
  });

  it("asks while any other action is on its way beside a read, and while a save is", () => {
    const read = pendingRead();
    left.push(read.answer);
    expect(leavingAsks({ inflightMutations: 0, inflightActions: 2 })).toBe(true);
    expect(leavingAsks({ inflightMutations: 1, inflightActions: 1 })).toBe(true);
  });

  // Leaving Pages a second after it opened still warned, for the catch-up it asked for and its eye's note (18 November 2026).
  it("never asks for a screen's own bookkeeping marked readOnly, a save, but asks for any other save beside it", async () => {
    const note = pendingRead("mutation");
    left.push(note.answer);
    expect(leavingAsks({ inflightMutations: 1, inflightActions: 0 })).toBe(false);
    expect(leavingAsks({ inflightMutations: 2, inflightActions: 0 })).toBe(true);
  });

  // The review, 18 November 2026: one shared count let a read stuck on its way cancel out a person's save.
  it("a read stuck on its way never cancels out a save", () => {
    const stuck = pendingRead("action");
    left.push(stuck.answer);
    expect(leavingAsks({ inflightMutations: 1, inflightActions: 0 })).toBe(true);
    expect(leavingAsks({ inflightMutations: 1, inflightActions: 1 })).toBe(true);
  });

  it("an action that isn't a read asks once the reads have answered", async () => {
    const read = pendingRead();
    await read.answer();
    expect(leavingAsks({ inflightMutations: 0, inflightActions: 1 })).toBe(true);
  });

  it("a read that fails is let go too", async () => {
    await readOnly(Promise.reject(new Error("Google busy"))).catch(() => undefined);
    expect(leavingAsks({ inflightMutations: 0, inflightActions: 1 })).toBe(true);
  });
});
