import { describe, expect, test } from "vitest";
import { ASK_EVERY_MS, PAUSE_AFTER_MS, liveStep, type LiveMoment } from "./liveTiming";

/**
 * Live asks Google once a minute, and only while its page is open and in
 * front (google-analytics-plan.md GA34; Anthony, 2026-10-11: "when the pge is
 * not open it does not poll at all right").
 */

const at = (moment: Partial<LiveMoment>): LiveMoment => ({ visible: true, paused: false, asking: false, askedAt: 0, touchedAt: 0, now: 0, ...moment });

describe("when the Live page asks Google", () => {
  test("at once when opened, then once a minute while in front", () => {
    expect(liveStep(at({ askedAt: null }))).toBe("ask");
    expect(liveStep(at({ now: ASK_EVERY_MS - 1 }))).toBe("wait");
    expect(liveStep(at({ now: ASK_EVERY_MS }))).toBe("ask");
    // Never two at once.
    expect(liveStep(at({ askedAt: null, asking: true }))).toBe("wait");
  });

  test("never while behind another tab, however long; at once on coming back after a minute", () => {
    expect(liveStep(at({ visible: false, askedAt: null }))).toBe("wait");
    expect(liveStep(at({ visible: false, now: 10 * ASK_EVERY_MS, touchedAt: 10 * ASK_EVERY_MS }))).toBe("wait");
    expect(liveStep(at({ visible: true, now: 10 * ASK_EVERY_MS, touchedAt: 10 * ASK_EVERY_MS }))).toBe("ask");
  });

  test("pauses after 30 minutes untouched, and asks nothing until someone carries on", () => {
    expect(liveStep(at({ now: PAUSE_AFTER_MS - 1, askedAt: PAUSE_AFTER_MS - ASK_EVERY_MS - 1 }))).toBe("ask");
    expect(liveStep(at({ now: PAUSE_AFTER_MS }))).toBe("pause");
    expect(liveStep(at({ now: PAUSE_AFTER_MS + ASK_EVERY_MS, paused: true }))).toBe("wait");
  });
});
