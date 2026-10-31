import { describe, expect, test } from "vitest";
import { MOST_FINDINGS, findingWords, findingsFrom, type FindingView } from "./findings";

/**
 * What the figures show, found by code (sees-findings-in-code-plan-2026-10-31.md, phase 1): general rules over the
 * Conversions map's views. The figures below are shaped like a real shop's last month (morehandles.co.uk, read from
 * the saved map on 2026-10-31), so each rule is tested on the sizes it meets.
 */

const rate = (did: number, visits: number) => Math.round((did / visits) * 1000) / 10;

/** A view from groups' visits and, per conversion, the visits that did it now and before. */
function view(by: FindingView["by"], groups: Record<string, { visits: number; before?: number }>, conversions: Record<string, Record<string, [number, number?]>>, extra: Partial<FindingView> = {}): FindingView {
  const visits = Object.entries(groups).map(([column, one]) => ({ column, visits: one.visits, visitsBefore: one.before ?? null }));
  const site = visits.reduce((sum, one) => sum + one.visits, 0);
  return {
    by,
    visits,
    everyConversionTogether: [],
    conversions: Object.entries(conversions).map(([event, cells]) => {
      const did = Object.values(cells).reduce((sum, [now]) => sum + now, 0);
      return {
        event,
        visitsThatDidIt: did,
        visitsForOne: did > 0 ? Math.round((site / did) * 10) / 10 : null,
        by: Object.entries(cells).map(([column, [now, before]]) => ({
          column,
          visitsThatDidIt: now,
          ratePercent: rate(now, groups[column].visits),
          ...(before !== undefined && groups[column].before ? { ratePercentBefore: rate(before, groups[column].before!) } : {}),
        })),
      };
    }),
    ...extra,
  };
}

const CHANNELS = {
  "Organic Search": { visits: 12_808, before: 13_382 },
  "Cross-network": { visits: 10_720, before: 9_000 },
  Direct: { visits: 4_491, before: 4_200 },
  "Paid Shopping": { visits: 4_386, before: 4_100 },
  "Paid Search": { visits: 1_198, before: 1_140 },
  "AI Assistant": { visits: 1_004, before: 800 },
  Referral: { visits: 756, before: 630 },
  "(other)": { visits: 40, before: 30 },
};

const channels = view("channel", CHANNELS, {
  purchase: { "Organic Search": [282, 281], "Cross-network": [418, 333], Direct: [189, 164], "Paid Shopping": [158, 135], "Paid Search": [110, 90], "AI Assistant": [32, 29], Referral: [14, 12], "(other)": [10, 1] },
  newsletter_sign_ups: { "Organic Search": [371, 361], "Cross-network": [257, 189], Direct: [108, 88], "Paid Shopping": [83, 66], "Paid Search": [71, 55], "AI Assistant": [34, 14], Referral: [23, 34], "(other)": [0, 0] },
}, { shopSteps: [{ step: "add_to_cart to begin_checkout", wentOnPercent: 44.4, wentOnPercentBefore: 42.7 }, { step: "begin_checkout to purchase", wentOnPercent: 53.9, wentOnPercentBefore: 55.8 }] });

const devices = view("device", { mobile: { visits: 18_614, before: 18_000 }, desktop: { visits: 17_580, before: 17_400 } }, {
  purchase: { mobile: [560, 520], desktop: [686, 560] },
  add_to_cart: { mobile: [2_085, 2_000], desktop: [2_936, 2_500] },
  newsletter_sign_ups: { mobile: [130, 120], desktop: [774, 700] },
});

describe("findings, by code, for any website", () => {
  test("a shop's step is weighed by the visits it loses of every visit, and said as the map reads down a column", () => {
    // morehandles.co.uk's September, as the map showed it: 14.2% of visits added to basket, 6.3% started checkout,
    // 3.4% bought — the basket step loses about 8 visits in every 100, more than twice the share that buys.
    const shop = view("channel", { all: { visits: 36_677 } }, {
      purchase: { all: [1_246] },
      add_to_cart: { all: [5_208] },
      begin_checkout: { all: [2_311] },
    }, { shopSteps: [{ step: "add_to_cart to begin_checkout", wentOnPercent: 44.4, wentOnPercentBefore: 42.7 }, { step: "begin_checkout to purchase", wentOnPercent: 53.9, wentOnPercentBefore: 55.8 }] });
    const found = findingsFrom([shop]);
    const basket = found.find((one) => one.id === "step:add_to_cart to begin_checkout")!;
    const checkout = found.find((one) => one.id === "step:begin_checkout to purchase")!;
    expect(basket.params).toMatchObject({ fromShare: 14.2, toShare: 6.3, lost: 7.9 });
    expect(basket.score).toBeGreaterThan(checkout.score);
    expect(basket.facts.map((fact) => fact.key)).toEqual(expect.arrayContaining([expect.stringMatching(/\.lost$/)]));
    expect(findingWords(basket)).toBe("14.2% of all visits did add to cart and 6.3% did begin checkout: 7.9 visits in every 100 lost at this step.");
    // Said one way only: the share that went on is not handed to the writer beside it.
    expect(basket.facts.some((fact) => fact.key.endsWith(".wentOn"))).toBe(false);
  });

  test("the visits it took for one keeps its place however many findings outrank it", () => {
    const many = findingsFrom([channels, devices, view("kind", { Blog: { visits: 9_000 }, Brand: { visits: 6_000 }, Hinges: { visits: 7_000 }, Locks: { visits: 8_000 } }, {
      purchase: { Blog: [40], Brand: [340], Hinges: [180], Locks: [330] },
    })]);
    expect(many.length).toBeLessThanOrEqual(MOST_FINDINGS);
    expect(many.map((one) => one.id)).toContain("visitsForOne:purchase");
  });

  test("the visits it took for one purchase, a shop's steps, a channel far above the website, and a device gap to check as tracking", () => {
    const found = findingsFrom([channels, devices]);
    expect(found.length).toBeLessThanOrEqual(MOST_FINDINGS);
    const ids = found.map((one) => one.id);
    expect(ids).toContain("visitsForOne:purchase");
    expect(ids).toContain("step:add_to_cart to begin_checkout");
    expect(ids).toContain("above:channel:purchase:Paid Search");
    expect(ids).toContain("trackingGap:newsletter_sign_ups:desktop:mobile");
    // A group with too few visits to trust is never weighed, however its rate looks.
    expect(ids.some((id) => id.includes("(other)"))).toBe(false);
    // Each finding's figures keyed in order, for the team to name and the Editor to fill.
    expect(found[0].facts[0].key).toMatch(/^f1\./);
    const paid = found.find((one) => one.id === "above:channel:purchase:Paid Search")!;
    expect(paid.params).toMatchObject({ by: "channel", group: "Paid Search", event: "purchase", rate: 9.2 });
    expect(paid.facts.map((fact) => fact.unit)).toEqual(["percent", "percent"]);
  });

  test("never more than two from one view, never the same group twice, the best first", () => {
    const found = findingsFrom([channels, devices]);
    const byView = new Map<string, number>();
    for (const one of found) if (typeof one.params.by === "string") byView.set(one.params.by, (byView.get(one.params.by) ?? 0) + 1);
    for (const count of byView.values()) expect(count).toBeLessThanOrEqual(2);
    const scores = found.map((one) => one.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  test("a move small enough to be chance is not a finding; a website with no visits has none", () => {
    const quiet = view("channel", { A: { visits: 300, before: 300 }, B: { visits: 300, before: 300 } }, { purchase: { A: [6, 4], B: [5, 5] } });
    expect(findingsFrom([quiet]).filter((one) => one.kind === "rose" || one.kind === "fell")).toEqual([]);
    expect(findingsFrom([])).toEqual([]);
    expect(findingsFrom([view("kind", { A: { visits: 0 } }, {})])).toEqual([]);
  });
});
