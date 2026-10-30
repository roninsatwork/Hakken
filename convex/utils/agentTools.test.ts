import { describe, expect, test } from "vitest";
import { findingsCheck, keyedRead, keysNamed, unitOf } from "./agentTools";
import { factsByKey, fillFacts } from "./insightFacts";

/**
 * A screen's answer as an Insights agent reads it (stronger-agents-plan-2026-10-30.md A1): every number given its
 * own key, so the agent names figures it read exactly as it names the page's, and the Editor fills them in.
 */
describe("keyed reads", () => {
  // The Conversions screen's read, in the shape Ask Hakken's read gives it (assistantAnalyticsReads.ts).
  const conversions = {
    ok: true, website: "acme-shop.test", screen: "conversions", period: "lastMonth", currency: "GBP", rule: "…", link: "/app/analytics/s1/conversions",
    visits: 36640,
    kinds: [
      { event: "add_to_cart", count: 18344, countBefore: 17638, value: null },
      { event: "purchase", count: 1246, countBefore: 1080, value: 104165.5 },
    ],
    byPageClassification: [{ classification: "Cupboard handles", visits: 5198, conversions: 1172 }],
    whatPeopleDidBeforeConverting: { over: "the last 12 months", websitePercent: 3.4, actions: [{ event: "view_item", people: 9000, wentOnToConvert: 900, percent: 10 }] },
    figures: { visitsShare: 0.42, visitsSharePercent: 42 },
  };

  test("every number is replaced by its words and its key, named by the answer's own fields and each row's name", () => {
    const { shown, facts } = keyedRead(conversions, "r1.conversions", { source: "analytics", from: "2026-09-01", to: "2026-09-30", currency: "GBP" });
    const text = JSON.stringify(shown);
    expect(text).toContain("\"visits\":\"36,640 [[r1.conversions.visits]]\"");
    expect(text).toContain("\"count\":\"18,344 [[r1.conversions.kinds.add_to_cart.count]]\"");
    expect(text).toContain("\"value\":\"GBP 104,165.5 [[r1.conversions.kinds.purchase.value]]\"");
    expect(text).toContain("[[r1.conversions.byPageClassification.Cupboard_handles.visits]]");
    // What the screen's reader needs and an agent never says is left out; a share kept as a fraction gives way to its percentage.
    for (const gone of ["\"rule\"", "\"link\"", "\"website\"", "\"currency\"", "\"screen\"", "visitsShare\":"]) expect(text).not.toContain(gone);
    expect(text).toContain("\"visitsSharePercent\":\"42% [[r1.conversions.figures.visitsSharePercent]]\"");
    // Each fact is the number as held, with its unit, span and currency, and fills in as a reader will see it.
    const byKey = factsByKey(facts);
    expect(byKey.get("r1.conversions.kinds.purchase.count")).toMatchObject({ value: 1246, unit: "count", source: "analytics", from: "2026-09-01", to: "2026-09-30" });
    expect(byKey.get("r1.conversions.kinds.purchase.value")).toMatchObject({ value: 104165.5, unit: "money", currency: "GBP" });
    expect(byKey.get("r1.conversions.whatPeopleDidBeforeConverting.websitePercent")).toMatchObject({ value: 3.4, unit: "percent" });
    expect(fillFacts("[[r1.conversions.kinds.add_to_cart.count]] baskets became [[r1.conversions.kinds.purchase.count]] purchases.", byKey).text)
      .toBe("18,344 baskets became 1,246 purchases.");
  });

  test("two rows with the same name keep their own keys, and a read carries a screen's rows, never thousands", () => {
    const { facts } = keyedRead({ rows: [{ name: "Home", visits: 5 }, { name: "Home", visits: 7 }] }, "r2.allPages", { source: "analytics" });
    expect(facts.map((fact) => [fact.key, fact.value])).toEqual([["r2.allPages.rows.Home.visits", 5], ["r2.allPages.rows.Home.visits.2", 7]]);
    const many = keyedRead({ rows: Array.from({ length: 500 }, (_, at) => ({ name: `p${at}`, visits: at, views: at })) }, "r3", { source: "analytics" });
    expect(many.facts.length).toBe(50);
  });

  test("a figure's unit comes from its name", () => {
    expect(unitOf("value")).toBe("money");
    expect(unitOf("revenue")).toBe("money");
    expect(unitOf("changeInRevenuePercent")).toBe("percent");
    expect(unitOf("basketsLeftPercent")).toBe("percent");
    expect(unitOf("visitsForOneConversion")).toBe("ratio");
    expect(unitOf("timesCountedAVisit")).toBe("score");
    expect(unitOf("visits")).toBe("count");
  });
});

describe("a weekly specialist's findings, before they leave the conversation", () => {
  test("go back when not findings, or when they name a figure neither given nor read", () => {
    const given = new Map([["ga.conversions.30.now", 1]]);
    const read = new Map([["conversion.r1.lastMonth.channels.rows.Organic_Search.visits", 1]]);
    expect(findingsCheck({ paragraph: "…" }, given, read)).toBe("It did not reply with the findings asked for.");
    expect(findingsCheck({ findings: [{ story: "[[ga.conversions.30.now]] conversions, [[conversion.r1.lastMonth.channels.rows.Organic_Search.visits]] from Google." }] }, given, read)).toBeNull();
    expect(findingsCheck({ findings: [{ story: "[[ga.visits.made.up]] visits." }] }, given, read)).toBe("It named figures neither given nor read: ga.visits.made.up.");
    expect(keysNamed({ a: "[[x]] and [[ y ]]", b: ["[[x]]"] })).toEqual(["x", "y"]);
  });
});
