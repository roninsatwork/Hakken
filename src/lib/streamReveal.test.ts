import { describe, expect, test } from "vitest";
import {
  REVEAL_BASE_CHARS_PER_SECOND,
  REVEAL_CLOSING_MS,
  REVEAL_MAX_LAG_MS,
  nextRevealCount,
} from "./streamReveal";

/**
 * The failure this pacing prevents: the database receives a reply in lumps by
 * design, and a screen that renders each lump as it lands reads as blocks
 * appearing, not as an answer being written.
 */
describe("stream reveal pacing", () => {
  test("reveals at the base pace while the backlog is small", () => {
    const next = nextRevealCount({
      revealed: 0,
      targetLength: 40,
      elapsedMs: 100,
      isStreamClosed: false,
    });
    expect(next).toBe(Math.floor(REVEAL_BASE_CHARS_PER_SECOND * 0.1));
  });

  test("accelerates so the screen never trails a big lump by more than the ceiling", () => {
    const backlog = 2_000; // a fast model's burst
    const next = nextRevealCount({
      revealed: 0,
      targetLength: backlog,
      elapsedMs: 100,
      isStreamClosed: false,
    });
    // At the lag ceiling's pace, a tenth of a second clears a tenth of the
    // window's worth of backlog.
    const expected = Math.floor(((backlog * 1000) / REVEAL_MAX_LAG_MS) * 0.1);
    expect(next).toBe(expected);
    expect(next).toBeGreaterThan(Math.floor(REVEAL_BASE_CHARS_PER_SECOND * 0.1));
  });

  test("finishes promptly once the stream closes rather than snapping or dawdling", () => {
    const remaining = 300;
    const next = nextRevealCount({
      revealed: 0,
      targetLength: remaining,
      elapsedMs: REVEAL_CLOSING_MS,
      isStreamClosed: true,
    });
    // One closing window of elapsed time clears the whole remainder.
    expect(next).toBe(remaining);
  });

  test("never overshoots what has arrived", () => {
    const next = nextRevealCount({
      revealed: 95,
      targetLength: 100,
      elapsedMs: 10_000,
      isStreamClosed: false,
    });
    expect(next).toBe(100);
  });

  test("a shrunken target is snapped to, not held above", () => {
    // The finish patch stores trimmed text, which can be shorter than the sum
    // of the fragments already revealed.
    const next = nextRevealCount({
      revealed: 105,
      targetLength: 100,
      elapsedMs: 16,
      isStreamClosed: true,
    });
    expect(next).toBe(100);
  });

  test("a zero-elapsed frame reveals nothing", () => {
    const next = nextRevealCount({
      revealed: 10,
      targetLength: 100,
      elapsedMs: 0,
      isStreamClosed: false,
    });
    expect(next).toBe(10);
  });
});
