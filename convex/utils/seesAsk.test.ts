import { describe, expect, test } from "vitest";
import type { Fact } from "./insightFacts";
import { factsOf, fromSeesKey, seesFrom, seesKey, seesPath, writerFor } from "./seesAsk";
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

  test("a screen about one record keeps one answer per record: each page's own screen its own (page-screen-redo-plan-2026-11-03.md)", () => {
    const page = { screen: "googleAnalytics.page", period: "lastMonth", country: "", device: "" };
    const pageA = seesKey({ ...page, path: "/app/analytics/s1/all-pages/page?key=~fu&period=lastMonth&from=all-pages" });
    expect(pageA).toBe("googleAnalytics.page?key=~fu|lastMonth||||");
    expect(seesKey({ ...page, path: "/app/analytics/s1/all-pages/page?key=~1u" })).not.toBe(pageA);
    // Filters and views are no record: the same page under another filter is the same answer, its figures checked.
    expect(seesKey({ ...page, path: "/app/analytics/s1/all-pages/page?key=%7Efu&device=mobile&chartShow=less" })).toBe(pageA);
    // A screen about no one record is keyed as before.
    expect(seesKey({ ...page, path: "/app/analytics/s1/products?chartShow=less" })).toBe("googleAnalytics.page|lastMonth||||");
    expect(fromSeesKey(pageA)).toEqual({ screen: "googleAnalytics.page", record: "key=~fu", period: "lastMonth", country: "", device: "" });
    expect(fromSeesKey("googleAnalytics.conversions|custom|2026-10-01|2026-10-14|gbr|mobile")).toEqual({ screen: "googleAnalytics.conversions", period: "custom", from: "2026-10-01", to: "2026-10-14", country: "gbr", device: "mobile" });
    // The address the chat is told: the path and its record, never its filters.
    expect(seesPath("/app/analytics/s1/conversions/pages", "?event=purchase&by=channel&key=Organic%20Search&period=lastWeek")).toBe("/app/analytics/s1/conversions/pages?key=Organic%20Search&event=purchase&by=channel");
    expect(seesPath("/app/analytics/s1/all-pages/page", "?key=~fu")).toBe("/app/analytics/s1/all-pages/page?key=~fu");
    expect(seesPath("/app/analytics/s1/products", "")).toBe("/app/analytics/s1/products");
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

  test("every fault is named at once for the rewrite; after it a sentence with a fault is left off, never the whole bubble (Anthony, 2026-11-03: \"this is really poor from the ai\")", () => {
    const facts = factsByKey(factsOf(ask));
    const long = "Even though people browse a great deal deeper when they stay, [[conv.total.now]] conversions came, against [[conv.total.before]] for the month before that one.";
    const answer = { says: ["Conversions fell to [[conv.total.now]] from [[conv.total.before]].", "[[conv.baskets.left]] baskets were left.", long], steps: [{ words: "Check checkout on phones.", link: 0 }, { words: "Grow sales.", link: 7 }] };
    // The first check names all three faults, so the one rewrite can mend them all.
    const first = seesFrom(answer, facts, links);
    expect(first.ok).toBe(false);
    if (!first.ok) for (const fault of ["neither on the page nor read", "ran past 20 words", "link was not one of the page's"]) expect(first.why).toContain(fault);
    // After the rewrite the sound sentence and step stand; the run's log is told what was left off.
    const kept = seesFrom(answer, facts, links, { salvage: true });
    expect(kept).toMatchObject({ ok: true, says: ["Conversions fell to 28,623 from 31,880."], steps: [{ words: "Check checkout on phones.", link: "Tracking health" }] });
    expect(kept.ok && kept.left).toHaveLength(3);
    // A first sentence with no figure is left off and the next one leads; nothing sound at all still goes back.
    expect(seesFrom({ says: ["Nothing much happened here.", "Conversions fell to [[conv.total.now]]."], steps: [] }, facts, links, { salvage: true })).toMatchObject({ ok: true, says: ["Conversions fell to 28,623."] });
    expect(seesFrom({ says: ["3 in 4 baskets were left."], steps: [] }, facts, links, { salvage: true })).toMatchObject({ ok: false, why: expect.stringContaining("Every sentence had a fault") });
  });

  test("a sentence never names a part of the page: a leading one is cut off, any other goes back (the Visits eye, 2026-11-03)", () => {
    const facts = factsByKey(factsOf(ask));
    expect(seesFrom({ says: ["In the table, [[conv.total.now]] conversions came last month."], steps: [] }, facts, links)).toMatchObject({ ok: true, says: ["28,623 conversions came last month."] });
    expect(seesFrom({ says: ["Conversions fell to [[conv.total.now]], as the chart shows clearly."], steps: [] }, facts, links)).toMatchObject({ ok: false, why: expect.stringContaining("named a part of the page") });
    // A place on Google Maps is a figure of its own, never a part of the page.
    expect(seesFrom({ says: ["Your place on the map fell, with [[conv.total.now]] conversions."], steps: [] }, facts, links)).toMatchObject({ ok: true });
    expect(seesFrom({ says: ["Conversions on the chart fell to [[conv.total.now]]."], steps: [] }, facts, links)).toMatchObject({ ok: false, why: expect.stringContaining("named a part of the page") });
  });

  test("a sentence starts with a capital, but a name that starts small keeps its spelling (the Visits eye, 2026-11-04: \"IOS led\")", () => {
    const facts = factsByKey(factsOf(ask));
    expect(seesFrom({ says: ["iOS led with [[conv.total.now]] conversions."], steps: [] }, facts, links)).toMatchObject({ ok: true, says: ["iOS led with 28,623 conversions."] });
    expect(seesFrom({ says: ["conversions came to [[conv.total.now]]."], steps: [] }, facts, links)).toMatchObject({ ok: true, says: ["Conversions came to 28,623."] });
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
    // Tracking health has no eye since 2026-11-04 (Anthony: "We dont need the eye on non website data related pages"):
    // Visits names its own writer instead of the section's.
    expect(writerFor("googleAnalytics.visitors", [])).toBe("INSIGHTS_BEHAVIOUR");
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
  test("a sentence that leans on one left off goes too, so it never points at the wrong thing (Campaigns, 2026-11-05: \"Its purchases also jumped\" read as another campaign's)", () => {
    const facts = factsByKey(factsOf(ask));
    const crowded = "Purchases reached [[conv.purchases.now]], worth [[conv.worth.now]], at [[conv.rate.now]].";
    const answer = { says: ["Conversions fell to [[conv.total.now]].", crowded, "Its share rose to [[conv.rate.now]].", "Purchases reached [[conv.purchases.now]]."], steps: [] };
    expect(seesFrom(answer, facts, links)).toMatchObject({ ok: true, says: ["Conversions fell to 28,623.", "Purchases reached 1,258."] });
    // Each word that leans on the last, and a sentence that stands by itself is kept.
    for (const leaning of ["It rose to [[conv.rate.now]].", "They rose to [[conv.rate.now]].", "This rose to [[conv.rate.now]].", "Those rose to [[conv.rate.now]].", "Also, it rose to [[conv.rate.now]]."]) {
      expect(seesFrom({ says: ["Conversions fell to [[conv.total.now]].", crowded, leaning], steps: [] }, facts, links)).toMatchObject({ ok: true, says: ["Conversions fell to 28,623."] });
    }
    expect(seesFrom({ says: ["Conversions fell to [[conv.total.now]].", crowded, "Italy rose to [[conv.rate.now]]."], steps: [] }, facts, links)).toMatchObject({ says: ["Conversions fell to 28,623.", "Italy rose to 3.5%."] });
    // With the last one kept, it has something to lean on.
    expect(seesFrom({ says: ["Conversions fell to [[conv.total.now]].", "Its rate is [[conv.rate.now]]."], steps: [] }, facts, links)).toMatchObject({ says: ["Conversions fell to 28,623.", "Its rate is 3.5%."] });
  });

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
  test("after the rewrite, one figure over stands if it alone carries a finding, and the rest of a crowded sentence's rule holds", () => {
    const facts = factsByKey(factsOf(ask));
    const crowded = "They made [[conv.total.now]] and [[conv.purchases.now]], under [[conv.rate.now]].";
    const answer = { says: ["Conversions fell to [[conv.worth.now]].", crowded], steps: [] };
    const carrying = [{ keys: ["conv.purchases.now"], words: "Purchases fell" }];
    // It carries a finding not yet said: it stands.
    expect(seesFrom(answer, facts, links, { mustCover: carrying, salvage: true })).toMatchObject({ ok: true, says: [expect.any(String), expect.stringContaining("They made")] });
    // Before the rewrite it's still left off, and the finding goes back to the writer, to say in a sentence of its own.
    expect(seesFrom(answer, facts, links, { mustCover: carrying })).toMatchObject({ ok: false, why: expect.stringContaining("in a sentence of its own") });
    // A finding already said is no reason to keep it.
    const said = { says: ["Purchases fell to [[conv.purchases.now]].", crowded], steps: [] };
    expect(seesFrom(said, facts, links, { mustCover: carrying, salvage: true })).toMatchObject({ ok: true, says: [expect.stringContaining("Purchases fell")] });
    // No finding to carry: left off as ever. Nor two figures over, whatever it carries.
    expect(seesFrom(answer, facts, links, { salvage: true })).toMatchObject({ ok: true, says: [expect.stringContaining("Conversions fell")] });
    const fourFigures = { says: ["Conversions fell to [[conv.worth.now]].", "They made [[conv.total.now]] and [[conv.purchases.now]], under [[conv.rate.now]] and [[conv.worth.now]]."], steps: [] };
    expect(seesFrom(fourFigures, facts, links, { mustCover: carrying, salvage: true, coverIfItCan: true })).toMatchObject({ ok: true, says: [expect.stringContaining("Conversions fell")] });
  });

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
