import { describe, expect, test } from "vitest";
import {
  MEMORY_RANK_QUALITY_WEIGHT,
  MEMORY_RANK_TEXT_WEIGHT,
  blendedMemoryRank,
  companyQualityForRanking,
  memoryQualityScore,
  qualityForRanking,
  rankScore,
} from "./memoryRetrieval";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

describe("qualityForRanking (agent tier)", () => {
  test("cold start is exactly neutral — a new memory is not buried", () => {
    expect(qualityForRanking({ importance: 0.9, now: NOW })).toBe(0.5);
    expect(
      qualityForRanking({ importance: 0.1, successCount: 0, failureCount: 0, cancelledCount: 0, now: NOW })
    ).toBe(0.5);
  });

  test("a good track record scores above neutral, a bad one below", () => {
    const healthy = qualityForRanking({
      importance: 0.5,
      successCount: 8,
      failureCount: 0,
      cancelledCount: 0,
      lastOutcomeAt: NOW - DAY_MS,
      now: NOW,
    });
    const troubled = qualityForRanking({
      importance: 0.5,
      successCount: 0,
      failureCount: 8,
      cancelledCount: 0,
      lastOutcomeAt: NOW - DAY_MS,
      now: NOW,
    });
    expect(healthy).toBeGreaterThan(0.5);
    expect(troubled).toBeLessThan(0.5);
  });

  test("negative evidence decays: half toward neutral after 30 days, gone after 90", () => {
    const base = {
      importance: 0.5,
      successCount: 0,
      failureCount: 10,
      cancelledCount: 0,
      now: NOW,
    };
    const fresh = qualityForRanking({ ...base, lastOutcomeAt: NOW - 5 * DAY_MS });
    const aging = qualityForRanking({ ...base, lastOutcomeAt: NOW - 45 * DAY_MS });
    const ancient = qualityForRanking({ ...base, lastOutcomeAt: NOW - 91 * DAY_MS });

    expect(fresh).toBeLessThan(aging);
    expect(aging).toBeLessThan(0.5);
    expect(aging).toBeCloseTo(0.5 + (fresh - 0.5) / 2, 5);
    expect(ancient).toBe(0.5);
  });

  test("boundary days behave: 30 days is still full strength, 90 still counts", () => {
    const base = {
      importance: 0.5,
      successCount: 0,
      failureCount: 4,
      cancelledCount: 0,
      now: NOW,
    };
    const at30 = qualityForRanking({ ...base, lastOutcomeAt: NOW - 30 * DAY_MS });
    const at90 = qualityForRanking({ ...base, lastOutcomeAt: NOW - 90 * DAY_MS });
    const fresh = qualityForRanking({ ...base, lastOutcomeAt: NOW });
    expect(at30).toBe(fresh);
    expect(at90).not.toBe(0.5);
  });
});

describe("companyQualityForRanking", () => {
  test("no feedback and recent use is neutral; long-idle drifts below", () => {
    expect(
      companyQualityForRanking({ confidence: 0.8, updatedAt: NOW - DAY_MS, now: NOW })
    ).toBe(0.5);
    expect(
      companyQualityForRanking({ confidence: 0.8, updatedAt: NOW - 200 * DAY_MS, now: NOW })
    ).toBe(0.35);
    // Recent use rescues an old row.
    expect(
      companyQualityForRanking({
        confidence: 0.8,
        updatedAt: NOW - 200 * DAY_MS,
        lastUsedAt: NOW - DAY_MS,
        now: NOW,
      })
    ).toBe(0.5);
  });

  test("ratings move it: praised memories rise, criticised ones fall", () => {
    const praised = companyQualityForRanking({
      confidence: 0.5,
      positiveFeedbackCount: 6,
      negativeFeedbackCount: 0,
      lastFeedbackAt: NOW - DAY_MS,
      updatedAt: NOW - DAY_MS,
      now: NOW,
    });
    const criticised = companyQualityForRanking({
      confidence: 0.5,
      positiveFeedbackCount: 0,
      negativeFeedbackCount: 6,
      lastFeedbackAt: NOW - DAY_MS,
      updatedAt: NOW - DAY_MS,
      now: NOW,
    });
    expect(praised).toBeGreaterThan(0.5);
    expect(criticised).toBeLessThan(0.5);
  });

  test("old ratings decay to neutral so a memory can recover", () => {
    expect(
      companyQualityForRanking({
        confidence: 0.5,
        positiveFeedbackCount: 0,
        negativeFeedbackCount: 6,
        lastFeedbackAt: NOW - 91 * DAY_MS,
        updatedAt: NOW - DAY_MS,
        now: NOW,
      })
    ).toBe(0.5);
  });
});

describe("blendedMemoryRank", () => {
  test("weights sum to one and text stays dominant", () => {
    expect(MEMORY_RANK_TEXT_WEIGHT + MEMORY_RANK_QUALITY_WEIGHT).toBe(1);
    expect(MEMORY_RANK_TEXT_WEIGHT).toBeGreaterThan(MEMORY_RANK_QUALITY_WEIGHT);
  });

  test("neutral quality preserves the positional order exactly", () => {
    const first = blendedMemoryRank({ positionalScore: rankScore(0, 3), quality: 0.5 });
    const second = blendedMemoryRank({ positionalScore: rankScore(1, 3), quality: 0.5 });
    const third = blendedMemoryRank({ positionalScore: rankScore(2, 3), quality: 0.5 });
    expect(first).toBeGreaterThan(second);
    expect(second).toBeGreaterThan(third);
  });

  test("quality can move a memory past a neighbour but not past the whole list", () => {
    // Adjacent positions, maximal quality gap: the swap happens.
    const weakTextGreatRecord = blendedMemoryRank({ positionalScore: rankScore(1, 5), quality: 1 });
    const strongTextBadRecord = blendedMemoryRank({ positionalScore: rankScore(0, 5), quality: 0 });
    expect(weakTextGreatRecord).toBeGreaterThan(strongTextBadRecord);

    // Top of the list vs bottom: no record overturns that spread.
    const bottomPerfect = blendedMemoryRank({ positionalScore: rankScore(4, 5), quality: 1 });
    const topAwful = blendedMemoryRank({ positionalScore: rankScore(0, 5), quality: 0 });
    expect(topAwful).toBeGreaterThan(bottomPerfect);
  });
});

describe("memoryQualityScore (dashboard truth)", () => {
  test("matches its historical behaviour with the clock passed in", () => {
    expect(
      memoryQualityScore({
        importance: 0.5,
        usageCount: 4,
        successCount: 4,
        failureCount: 0,
        cancelledCount: 0,
        lastUsedAt: NOW,
        updatedAt: NOW,
        now: NOW,
      })
    ).toBeCloseTo(0.85, 5);
    // Stale and unused: importance minus the stale penalty.
    expect(
      memoryQualityScore({
        importance: 0.5,
        usageCount: 0,
        successCount: 0,
        failureCount: 0,
        cancelledCount: 0,
        updatedAt: NOW - 91 * DAY_MS,
        now: NOW,
      })
    ).toBeCloseTo(0.35, 5);
  });
});
