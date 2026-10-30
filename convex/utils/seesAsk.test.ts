import { describe, expect, test } from "vitest";
import { factsOf, seesFrom, seesKey, writerFrom, writersForHead } from "./seesAsk";
import { factsByKey } from "./insightFacts";

/**
 * The eye asks the Insights team (sees-conversion-specialist-plan-2026-10-30.md):
 * one answer per website, page, dates, country and device; the Editor's code
 * checks on what the specialist wrote — every number one the page handed
 * over, none typed, short plain sentences, a step's link one of the page's.
 */
const ask = {
  screen: "googleAnalytics.conversions",
  period: "lastMonth",
  country: "gbr",
  device: "",
  facts: [
    { key: "conv.total.now", value: 28623, unit: "count" as const, label: "conversions last month" },
    { key: "conv.total.before", value: 31880, unit: "count" as const, label: "conversions the month before" },
    { key: "conv.purchases.now", value: 1258, unit: "count" as const, label: "purchases last month" },
    { key: "conv.worth.now", value: 104165, unit: "money" as const, label: "worth of the purchases", currency: "GBP" },
    { key: "conv.rate.now", value: 3.5, unit: "percent" as const, label: "purchases in every hundred visits" },
  ],
};
const links = [{ label: "Tracking health", href: "/app/analytics/s1/tracking-health" }, { label: "Funnel", href: "/app/analytics/s1/funnel" }];

describe("the eye's ask", () => {
  test("one key per website, page, dates, country and device: change any and it is a new answer (S9)", () => {
    const key = seesKey(ask);
    expect(key).toBe("googleAnalytics.conversions|lastMonth|||gbr|");
    expect(seesKey({ ...ask, device: "mobile" })).not.toBe(key);
    expect(seesKey({ ...ask, country: "irl" })).not.toBe(key);
    expect(seesKey({ ...ask, period: "custom", from: "2026-10-01", to: "2026-10-14" })).not.toBe(key);
  });

  test("the page's figures become the team's facts, Analytics' and the home country's", () => {
    const facts = factsOf({ ...ask, from: "2026-09-01", to: "2026-09-30" });
    expect(facts[0]).toEqual({ key: "conv.total.now", value: 28623, unit: "count", source: "analytics", label: "conversions last month", from: "2026-09-01", to: "2026-09-30", country: "gbr" });
    expect(facts[3].currency).toBe("GBP");
  });

  test("the Editor passes sentences that name the page's figures, filled in, and steps with the page's links", () => {
    const verdict = seesFrom({
      says: ["[[conv.purchases.now]] purchases last month, worth [[conv.worth.now]].", "Conversions fell to [[conv.total.now]] from [[conv.total.before]]."],
      steps: [{ words: "Check the counts that never happened in Google Analytics.", link: 0 }],
    }, factsByKey(factsOf(ask)), links);
    expect(verdict).toEqual({
      ok: true,
      says: ["1,258 purchases last month, worth £104,165.", "Conversions fell to 28,623 from 31,880."],
      steps: [{ words: "Check the counts that never happened in Google Analytics.", link: "Tracking health", href: "/app/analytics/s1/tracking-health" }],
    });
  });

  test("the Editor sends back a typed number, a figure the page does not hold, a long sentence, a stray link (S5, S7)", () => {
    const facts = factsByKey(factsOf(ask));
    expect(seesFrom({ says: ["3 in 4 baskets were left without buying."], steps: [] }, facts, links)).toMatchObject({ ok: false, why: expect.stringContaining("typed a number") });
    expect(seesFrom({ says: ["[[conv.baskets.left]] baskets were left."], steps: [] }, facts, links)).toMatchObject({ ok: false, why: expect.stringContaining("does not hold") });
    expect(seesFrom({ says: ["[[conv.total.now]] conversions, which is a great many more words than any client should ever be asked to read in one sentence of a bubble that opens for two seconds."], steps: [] }, facts, links)).toMatchObject({ ok: false, why: expect.stringContaining("24 words") });
    expect(seesFrom({ says: ["[[conv.total.now]] conversions."], steps: [{ words: "Look at the funnel.", link: 7 }] }, facts, links)).toMatchObject({ ok: false, why: expect.stringContaining("link") });
    expect(seesFrom({ says: ["Nothing much happened here."], steps: [] }, facts, links)).toMatchObject({ ok: false, why: expect.stringContaining("names no figure") });
    expect(seesFrom({ says: [] }, facts, links)).toMatchObject({ ok: false });
  });

  test("the Head may hand a page to any writer on the team, never to itself, the Editor or the Report Writer (S8)", () => {
    const roles = writersForHead().map((writer) => writer.role);
    expect(roles).toContain("INSIGHTS_CONVERSION");
    expect(roles).toContain("INSIGHTS_ANALYST");
    expect(roles).not.toContain("INSIGHTS_HEAD_OF_STRATEGY");
    expect(roles).not.toContain("INSIGHTS_EDITOR");
    expect(roles).not.toContain("INSIGHTS_REPORT_WRITER");
    expect(writerFrom({ specialist: "INSIGHTS_CONVERSION" })).toBe("INSIGHTS_CONVERSION");
    expect(writerFrom({ specialist: "INSIGHTS_EDITOR" })).toBeNull();
    expect(writerFrom({ specialist: "someone else" })).toBeNull();
  });
});

describe("the second look and the eval grading (stronger-agents-plan-2026-10-30.md A5, A6)", () => {
  test("the Head's second look is kept as is, or read as a rewrite to check", async () => {
    const { secondLookFrom, gradeSees, numbersIn } = await import("./seesAsk");
    expect(secondLookFrom({ useful: true })).toEqual({ useful: true });
    expect(secondLookFrom({ useful: false, says: ["x"] })).toEqual({ useful: false, rewrite: { useful: false, says: ["x"] } });
    expect(secondLookFrom(null)).toEqual({ useful: false, rewrite: null });
    expect(numbersIn("1,258 purchases, 3.5% of 36,459 visits, worth £104,165")).toEqual(["1258", "3.5", "36459", "104165"]);
    expect(gradeSees(["1,258 purchases, up from 1,091"], ["1,258 purchases last month, up from 1,091."])).toMatchObject({ score: 1 });
    expect(gradeSees(["1,258 purchases, up from 1,091"], ["28,623 conversions."])).toMatchObject({ score: 0, notes: expect.arrayContaining([expect.stringContaining("Not named: 1258, 1091.")]) });
    expect(gradeSees(["1,258 purchases, up from 1,091"], ["1,258 purchases."])).toMatchObject({ score: 0.5 });
    expect(gradeSees(["Nothing to worry about this month."], ["28,623 conversions."])).toMatchObject({ score: 1 });
    expect(gradeSees(["Nothing to worry about this month."], [])).toMatchObject({ score: 0 });
  });
});
