import { describe, expect, test } from "vitest";
import {
  STREAM_FLUSH_CHARS,
  STREAM_FLUSH_INTERVAL_MS,
  STREAM_STALE_AFTER_MS,
  getPresentableAssistantStage,
  getStreamPresentation,
  isStreamStale,
  STREAM_SILENT_AFTER_MS,
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

  test("a reply that has gone quiet is stale long before it is old", () => {
    // The gap that matters is since the last fragment, not since the run began.
    expect(
      isStreamStale({ startedAt: 0, updatedAt: 0, now: STREAM_SILENT_AFTER_MS - 1 })
    ).toBe(false);
    expect(isStreamStale({ startedAt: 0, updatedAt: 0, now: STREAM_SILENT_AFTER_MS })).toBe(true);
  });

  test("a long run still writing is never called stale", () => {
    // Half an hour in, well past the age ceiling, but a fragment landed a
    // second ago: this run is alive and the reader must keep seeing the caret.
    const halfAnHour = 30 * 60 * 1000;
    expect(
      isStreamStale({ startedAt: 0, updatedAt: halfAnHour - 1000, now: halfAnHour })
    ).toBe(false);
  });

  test("a reply written before replies recorded their fragments keeps the age rule", () => {
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

describe("the pre-reply stage pill", () => {
  test("shows a known stage the run wrote just now", () => {
    expect(
      getPresentableAssistantStage({ stage: "SEARCHING_KNOWLEDGE", stageAt: 1_000, now: 2_000 }),
    ).toBe("SEARCHING_KNOWLEDGE");
  });

  test("ignores a stage a crashed run left behind", () => {
    // A hard-killed action cannot clear its stage; showing it days later
    // would claim work that is not happening.
    expect(
      getPresentableAssistantStage({ stage: "WRITING", stageAt: 0, now: STREAM_STALE_AFTER_MS }),
    ).toBeNull();
  });

  test("drops an unknown stage value rather than guessing", () => {
    expect(
      getPresentableAssistantStage({ stage: "REticulating splines", stageAt: 1_000, now: 2_000 }),
    ).toBeNull();
  });

  test("no stage, no claim", () => {
    expect(getPresentableAssistantStage({ now: 1_000 })).toBeNull();
    expect(getPresentableAssistantStage({ stage: "WRITING", now: 1_000 })).toBeNull();
  });
});
