import { describe, expect, test } from "vitest";
import {
  STREAM_FLUSH_CHARS,
  STREAM_FLUSH_INTERVAL_MS,
  STREAM_STALE_AFTER_MS,
  getStreamPresentation,
  isStreamStale,
  shouldFlushStreamedText,
} from "./streamingService";

describe("streamed reply flush policy", () => {
  test("holds back a small chunk that arrived moments ago", () => {
    // Writing per token would turn one answer into hundreds of transactions,
    // each fanned out to every subscribed client.
    expect(shouldFlushStreamedText({ pendingChars: 3, msSinceLastFlush: 10, isFinal: false })).toBe(false);
  });

  test("flushes once enough text has built up, without waiting for the timer", () => {
    expect(
      shouldFlushStreamedText({ pendingChars: STREAM_FLUSH_CHARS, msSinceLastFlush: 5, isFinal: false }),
    ).toBe(true);
  });

  test("flushes on the timer so a slow model still feels live", () => {
    expect(
      shouldFlushStreamedText({ pendingChars: 1, msSinceLastFlush: STREAM_FLUSH_INTERVAL_MS, isFinal: false }),
    ).toBe(true);
  });

  test("never writes when nothing is pending", () => {
    expect(shouldFlushStreamedText({ pendingChars: 0, msSinceLastFlush: 10_000, isFinal: false })).toBe(false);
    expect(shouldFlushStreamedText({ pendingChars: 0, msSinceLastFlush: 10_000, isFinal: true })).toBe(false);
  });

  test("always writes the last chunk however small", () => {
    // Otherwise a reply loses its closing words for good.
    expect(shouldFlushStreamedText({ pendingChars: 1, msSinceLastFlush: 0, isFinal: true })).toBe(true);
  });
});

describe("abandoned replies", () => {
  test("treats a reply older than the longest possible run as stale", () => {
    expect(isStreamStale({ startedAt: 0, now: STREAM_STALE_AFTER_MS - 1 })).toBe(false);
    expect(isStreamStale({ startedAt: 0, now: STREAM_STALE_AFTER_MS })).toBe(true);
  });

  test("a finished message is never presented as streaming", () => {
    expect(getStreamPresentation({ isStreaming: false, streamStartedAt: 0, now: 10 })).toBe("complete");
    expect(getStreamPresentation({ now: 10 })).toBe("complete");
  });

  test("a live reply shows as streaming", () => {
    expect(getStreamPresentation({ isStreaming: true, streamStartedAt: 1_000, now: 2_000 })).toBe("streaming");
  });

  test("a reply whose run was killed shows as stalled, not as still typing", () => {
    // A hard-killed action cannot clean up after itself, so without this the UI
    // blinks a caret forever against a reply that is never coming.
    expect(
      getStreamPresentation({ isStreaming: true, streamStartedAt: 0, now: STREAM_STALE_AFTER_MS + 1 }),
    ).toBe("stalled");
  });
});
