import { describe, expect, test } from "vitest";
import type { Fact } from "./insightFacts";
import { factsOf, seesFrom, seesKey, writerFor } from "./seesAsk";
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
      steps: [{ words: "Find why [[conv.total.now]] conversions hold so few purchases.", link: 0 }],
    }, factsByKey(factsOf(ask)), links);
    expect(verdict).toEqual({
      ok: true,
      says: ["1,258 purchases last month, worth £104,165.", "Conversions fell to 28,623 from 31,880."],
      steps: [{ words: "Find why 28,623 conversions hold so few purchases.", link: "Tracking health", href: "/app/analytics/s1/tracking-health" }],
    });
  });

  test("the Editor sends back a typed number, a figure neither on the page nor read, a long sentence, a stray link (S5, S7)", () => {
    const facts = factsByKey(factsOf(ask));
    expect(seesFrom({ says: ["3 in 4 baskets were left without buying."], steps: [] }, facts, links)).toMatchObject({ ok: false, why: expect.stringContaining("typed a number") });
    expect(seesFrom({ says: ["[[conv.baskets.left]] baskets were left."], steps: [] }, facts, links)).toMatchObject({ ok: false, why: expect.stringContaining("neither on the page nor read") });
    expect(seesFrom({ says: ["[[conv.total.now]] conversions, which is a great many more words than any client should ever be asked to read in one sentence of a bubble that opens for two seconds."], steps: [] }, facts, links)).toMatchObject({ ok: false, why: expect.stringContaining("20 words") });
    expect(seesFrom({ says: ["[[conv.total.now]] conversions."], steps: [{ words: "Grow [[conv.total.now]] conversions.", link: 7 }] }, facts, links)).toMatchObject({ ok: false, why: expect.stringContaining("link") });
    // A step names the thing to fix in words; it need not carry a figure (2026-10-30: "to correct 28,623" read like a robot).
    expect(seesFrom({ says: ["[[conv.total.now]] conversions."], steps: [{ words: "Go through checkout on a phone and find where people stop.", link: 0 }] }, facts, links)).toMatchObject({ ok: true });
    expect(seesFrom({ says: ["Nothing much happened here."], steps: [] }, facts, links)).toMatchObject({ ok: false, why: expect.stringContaining("names no figure") });
    expect(seesFrom({ says: [] }, facts, links)).toMatchObject({ ok: false });
  });

  test("the screen list names each page's writer, every section by its own specialist (sees-every-page-plan)", () => {
    expect(writerFor("googleAnalytics.conversions", [])).toBe("INSIGHTS_CONVERSION");
    expect(writerFor("googleAnalytics.trackingHealth", [])).toBe("INSIGHTS_MEASUREMENT");
    expect(writerFor("searchConsole.keywords", [])).toBe("INSIGHTS_SEARCH");
    expect(writerFor("bing.crawling", [])).toBe("INSIGHTS_TECHNICAL");
    expect(writerFor("clarity.pages", [])).toBe("INSIGHTS_BEHAVIOUR");
    expect(writerFor("visibility.backlinksAnchors", [])).toBe("INSIGHTS_LINKS");
    expect(writerFor("visibility.localMaps", [])).toBe("INSIGHTS_LOCAL");
    expect(writerFor("visibility.aiShare", [])).toBe("INSIGHTS_AI_VISIBILITY");
    expect(writerFor("visibility.somethingNew", [])).toBe("INSIGHTS_SEARCH");
  });
});

describe("once the team has read the website's screens (A1)", () => {
  test("a bubble that only says the page's own figures goes back; one that names a figure read beyond them passes", () => {
    const read: Array<[string, Fact]> = [["r1.products.steps.basketsLeftPercent", { key: "r1.products.steps.basketsLeftPercent", value: 93.1, unit: "percent", source: "analytics", label: "baskets left" }]];
    const facts = new Map([...factsByKey(factsOf(ask)), ...read]);
    const pageKeys = new Set(factsOf(ask).map((fact) => fact.key));
    expect(seesFrom({ says: ["[[conv.purchases.now]] purchases last month."], steps: [] }, facts, links, { pageKeys })).toMatchObject({ ok: false, why: expect.stringContaining("only said the page's own figures") });
    expect(seesFrom({ says: ["[[conv.purchases.now]] purchases last month.", "[[r1.products.steps.basketsLeftPercent]] of baskets never became a purchase."], steps: [] }, facts, links, { pageKeys }))
      .toMatchObject({ ok: true, says: ["1,258 purchases last month.", "93.1% of baskets never became a purchase."] });
  });
});

describe("a bubble readable in one go (2026-10-30: \"a wall of numbers\")", () => {
  test("a first sentence with more than two figures goes back, a later one is left off; past eight figures the rest is left off; words the page never says go back", () => {
    const facts = factsByKey(factsOf(ask));
    expect(seesFrom({ says: ["[[conv.total.now]], [[conv.total.before]] and [[conv.purchases.now]] all moved."], steps: [] }, facts, links)).toMatchObject({ ok: false, why: expect.stringContaining("more than 2 figures") });
    expect(seesFrom({ says: ["[[conv.total.now]] conversions.", "[[conv.total.now]], [[conv.total.before]] and [[conv.purchases.now]] all moved.", "[[conv.purchases.now]] purchases."], steps: [] }, facts, links)).toMatchObject({ ok: true, says: ["28,623 conversions.", "1,258 purchases."] });
    const five = Array.from({ length: 5 }, () => "[[conv.total.now]] conversions, against [[conv.total.before]].");
    expect(seesFrom({ says: five, steps: [] }, facts, links)).toMatchObject({ ok: true, says: expect.arrayContaining([]) });
    expect((seesFrom({ says: five, steps: [] }, facts, links) as { says: string[] }).says).toHaveLength(4);
    expect(seesFrom({ says: ["[[conv.total.now]] conversions came from fewer clicks."], steps: [] }, facts, links, { analytics: true })).toMatchObject({ ok: false, why: expect.stringContaining("\"clicks\", which the page never says") });
  });
});

describe("the findings code found (sees-findings plan, phase 3)", () => {
  test("words that leave out a finding to cover go back; naming one of its figures covers it", () => {
    const finding: Array<[string, Fact]> = [["f1.rate", { key: "f1.rate", value: 9.2, unit: "percent", source: "analytics", label: "Paid Search buying" }], ["f1.siteRate", { key: "f1.siteRate", value: 3.4, unit: "percent", source: "analytics", label: "the website buying" }]];
    const facts = new Map([...factsByKey(factsOf(ask)), ...finding]);
    const mustCover = [{ keys: ["f1.rate", "f1.siteRate"], words: "Paid Search buys at 9.2%." }];
    expect(seesFrom({ says: ["[[conv.purchases.now]] purchases last month."], steps: [] }, facts, links, { mustCover })).toMatchObject({ ok: false, why: expect.stringContaining("It left out a finding: \"Paid Search buys at 9.2%.\"") });
    expect(seesFrom({ says: ["[[f1.rate]] of Paid Search visits bought, against [[f1.siteRate]] across the website."], steps: [] }, facts, links, { mustCover })).toMatchObject({ ok: true });
  });
});

describe("tracking advice and who writes (Anthony, 2026-10-30: \"the advice is still really shit\")", () => {
  test("with nothing wrong in tracking health, words about tracking or about changing what counts go back", () => {
    const facts = factsByKey(factsOf(ask));
    const quiet = { noTrackingTalk: true };
    for (const words of [
      "[[conv.total.now]] conversions are recorded because basket additions count as goals.",
      "[[conv.purchases.now]] checkout completes double-count alongside tracked purchases.",
    ]) expect(seesFrom({ says: [words], steps: [] }, facts, links, quiet)).toMatchObject({ ok: false, why: expect.stringContaining("tracking health found nothing wrong") });
    for (const step of ["Stop counting basket additions as conversions.", "Remove duplicate checkout tracking."]) {
      expect(seesFrom({ says: ["[[conv.total.now]] conversions."], steps: [{ words: step, link: 0 }] }, facts, links, quiet)).toMatchObject({ ok: false, why: expect.stringContaining("advised on tracking") });
    }
    // Saying what counts, as the page does, is not advice; and with a fault found, tracking may be spoken of.
    expect(seesFrom({ says: ["[[conv.total.now]] conversions; newsletter sign-ups count as conversions."], steps: [] }, facts, links, quiet)).toMatchObject({ ok: true });
    expect(seesFrom({ says: ["[[conv.purchases.now]] checkout completes double-count alongside tracked purchases."], steps: [] }, facts, links)).toMatchObject({ ok: true });
  });

  test("a page about conversions goes to the Measurement specialist only when tracking health found a fault that breaks its figures", () => {
    expect(writerFor("googleAnalytics.conversions", [])).toBe("INSIGHTS_CONVERSION");
    expect(writerFor("googleAnalytics.event:purchase", [])).toBe("INSIGHTS_CONVERSION");
    expect(writerFor("googleAnalytics.conversions", ["nothing is counted as a conversion yet"])).toBe("INSIGHTS_MEASUREMENT");
    expect(writerFor("googleAnalytics.channels", ["nothing is counted as a conversion yet"])).toBe("INSIGHTS_CONVERSION");
  });

  test("only faults that break the conversion figures count; housekeeping never lets tracking in", async () => {
    const { seriousFaults } = await import("./seesAsk");
    expect(seriousFaults(["NO_VALUE", "TOO_MUCH_UNKNOWN", "STRANGERS", "COUNTED_AGAIN", "NEVER_HAPPENS"])).toEqual([]);
    expect(seriousFaults(["NO_VALUE", "SOMETHING_ELSE"])).toEqual(["a conversion is really something else, counting day for day with another event"]);
  });
});

describe("a saved bubble and the page's figures (S3)", () => {
  test("stands only while every figure is the same, key for key and value for value", async () => {
    const { sameFigures } = await import("./seesAsk");
    const now = [{ key: "a", value: 1 }, { key: "b", value: 2 }];
    expect(sameFigures(now, [{ key: "b", value: 2 }, { key: "a", value: 1 }])).toBe(true);
    expect(sameFigures(now, [{ key: "a", value: 1 }, { key: "b", value: 3 }])).toBe(false);
    expect(sameFigures(now, [{ key: "a", value: 1 }])).toBe(false);
    expect(sameFigures(undefined, now)).toBe(false);
  });
});

describe("the eval grading (stronger-agents-plan-2026-10-30.md A6)", () => {
  test("Anthony's figures are graded by whether the bubble names them", async () => {
    const { gradeSees, numbersIn } = await import("./seesAsk");
    expect(numbersIn("1,258 purchases, 3.5% of 36,459 visits, worth £104,165")).toEqual(["1258", "3.5", "36459", "104165"]);
    expect(gradeSees(["1,258 purchases, up from 1,091"], ["1,258 purchases last month, up from 1,091."])).toMatchObject({ score: 1 });
    expect(gradeSees(["1,258 purchases, up from 1,091"], ["28,623 conversions."])).toMatchObject({ score: 0, notes: expect.arrayContaining([expect.stringContaining("Not named: 1258, 1091.")]) });
    expect(gradeSees(["1,258 purchases, up from 1,091"], ["1,258 purchases."])).toMatchObject({ score: 0.5 });
    expect(gradeSees(["Nothing to worry about this month."], ["28,623 conversions."])).toMatchObject({ score: 1 });
    expect(gradeSees(["Nothing to worry about this month."], [])).toMatchObject({ score: 0 });
  });
});
