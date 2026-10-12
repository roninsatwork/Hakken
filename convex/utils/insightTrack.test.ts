import { describe, expect, test } from "vitest";
import { fingerprintChanges, measuredAround, profileChangesOf, type PageFingerprint } from "./insightTrack";
import type { PageFacts } from "./moneyPageChecks";

/**
 * The change log's page and profile changes (docs/plans/active/
 * insights-analyst-plan.md I25): what a money page's weekly check saw change,
 * and each change judged on the enquiries the 30 days either side of it.
 */

const facts = (over: Partial<PageFacts> = {}): PageFacts => ({
  title: "AI Agency", headline: "AI that works for you", words: 900, price: false, proof: false, form: false, firstAsk: 0.6, opening: "We build", ...over,
});
const page = (over: Partial<PageFacts> = {}, structured: string[] | null = []): PageFingerprint => ({ kind: "SERVICE", facts: facts(over), structured });

describe("a money page's changes week to week", () => {
  test("names each part that changed", () => {
    expect(fingerprintChanges(page(), page({ headline: "The AI agency for growing firms", price: true, proof: true, form: true, firstAsk: 0.2 }, ["Service"]))).toEqual([
      "TOP_REWRITTEN", "PRICE_ADDED", "PROOF_ADDED", "FORM_ADDED", "ASK_MOVED_UP", "STRUCTURED_DATA_ADDED",
    ]);
    expect(fingerprintChanges(page({ price: true, proof: true, form: true }), page())).toEqual(["PRICE_REMOVED", "PROOF_REMOVED", "FORM_REMOVED"]);
  });

  test("sees nothing in spacing or case, a small move, or a week whose read failed", () => {
    expect(fingerprintChanges(page(), page({ headline: "  ai THAT works   for you ", firstAsk: 0.5 }))).toEqual([]);
    expect(fingerprintChanges(page(), { kind: "SERVICE", facts: null, structured: null })).toEqual([]);
    expect(fingerprintChanges(page({ words: 0 }), page({ price: true }))).toEqual([]);
  });
});

/** The 1st of May to the 1st of July, one enquiry a day before the 1st of June and two a day after. */
const days = Array.from({ length: 62 }, (_, index) => {
  const day = new Date(Date.UTC(2026, 4, 1 + index)).toISOString().slice(0, 10);
  return { day, enquiries: day < "2026-06-01" ? 1 : 2 };
});

describe("a change judged on the 30 days either side", () => {
  test("too early until all the days after are in, then grew, held or lost", () => {
    expect(measuredAround(days, "2026-06-01", "2026-06-20")).toEqual({ before: 30, after: 38, result: "TOO_EARLY" });
    expect(measuredAround(days, "2026-06-01", "2026-07-01")).toEqual({ before: 30, after: 60, result: "GREW" });
  });

  test("never judged on half a month before it", () => {
    expect(measuredAround(days, "2026-05-10", "2026-07-01")).toBeNull();
  });

  test("the company's own profile changes over the year, hours without their detail", () => {
    const lines = [
      { kind: "CATEGORY_ADDED", day: "2026-06-01", text: "Web designer" },
      { kind: "HOURS_CHANGED", day: "2026-06-01", text: "5:Closed>10:00–14:00" },
      { kind: "POST", day: "2026-06-01", text: "Our new work" },
      { kind: "NAME_CHANGED", day: "2025-01-01", text: "Old name" },
    ];
    expect(profileChangesOf(lines, days, "2026-07-01", "2025-07-01")).toEqual([
      { kind: "PROFILE_CATEGORY_ADDED", from: "Web designer", to: null, day: "2026-06-01", before: 30, after: 60, result: "GREW" },
      { kind: "PROFILE_HOURS_CHANGED", from: null, to: null, day: "2026-06-01", before: 30, after: 60, result: "GREW" },
    ]);
  });
});
