import { describe, expect, test } from "vitest";
import type { Fact } from "./insightFacts";
import { funnelFrom, perEnquiry, sourcesFrom, verdictByRule } from "./insightConversion";
import { pageFactsOf } from "./moneyPageChecks";

/**
 * The Conversion specialist's pages (insights-analyst-plan.md §4.1, phase 14):
 * Google's funnel against a year before, each source's rate, a page's verdict
 * by rule when the specialist can't be asked, and what a page's words show.
 */

const count = (key: string, value: number): Fact => ({ key, value, unit: "count", source: "analytics", label: key });

describe("the funnel and the sources", () => {
  test("shown, clicked, visited and enquired, each from the source that counts it", () => {
    const funnel = funnelFrom([count("sc.impressions.90.now", 1_272_709), count("sc.clicks.90.now", 2062), count("ga.channel.Organic Search.visits.90.now", 1371), count("ga.channel.Organic Search.visits.90.year", 1387), count("ga.channel.Organic Search.conversions.90.now", 21), count("ga.channel.Organic Search.conversions.90.year", 59)]);
    expect(funnel).toEqual([
      { step: "SHOWN", now: 1_272_709, year: null, source: "searchConsole" },
      { step: "CLICKED", now: 2062, year: null, source: "searchConsole" },
      { step: "VISITED", now: 1371, year: 1387, source: "analytics" },
      { step: "ENQUIRED", now: 21, year: 59, source: "analytics" },
    ]);
  });

  test("every source with visits over 12 months, the most first", () => {
    const sources = sourcesFrom([count("ga.channel.AI assistants.visits.365.now", 83), count("ga.channel.AI assistants.conversions.365.now", 4), count("ga.channel.Organic Search.visits.365.now", 3302), count("ga.channel.Organic Search.conversions.365.now", 101), count("ga.channel.Organic Search.visits.365.before", 3237), count("ga.channel.Organic Search.conversions.365.before", 171)]);
    expect(sources.map((row) => [row.channel, row.visits, row.enquiries, row.enquiriesBefore])).toEqual([["Organic Search", 3302, 101, 171], ["AI assistants", 83, 4, null]]);
    expect(perEnquiry(3302, 101)).toBe(33);
    expect(perEnquiry(10, 0)).toBeNull();
  });
});

describe("a page's verdict by rule, and what its words show", () => {
  const html = (body: string) => `<html><head><title>AI Agency | Ronins</title></head><body><nav>Home Services</nav><h1>AI agency in London</h1>${body}</body></html>`;

  test("its headline, price, proof, form and how far down it first asks", () => {
    const words = Array.from({ length: 300 }, () => "word").join(" ");
    const facts = pageFactsOf(html(`<p>${words}</p><p>Our clients say great things. Prices from £5,000.</p><p>${words}</p><form><p>Get in touch</p></form>`));
    expect(facts).toMatchObject({ title: "AI Agency | Ronins", headline: "AI agency in London", price: true, proof: true, form: true });
    expect(facts.firstAsk).toBeGreaterThan(0.9);
    expect(facts.words).toBeGreaterThan(600);
  });

  test("the first rule that applies: harder to win, company facts, a late ask, no price, no proof", () => {
    const page = { kind: "SERVICE", visits: 1000, enquiries: 20, visitsBefore: 1000, enquiriesBefore: 40 };
    const facts = { title: null, headline: null, words: 900, price: true, proof: true, form: true, firstAsk: 0.1, opening: "" };
    expect(verdictByRule(page, facts, [])).toBe("REWRITE_TOP");
    expect(verdictByRule({ ...page, kind: "HOME", enquiries: 40 }, facts, ["WebSite"])).toBe("ADD_COMPANY_FACTS");
    expect(verdictByRule({ ...page, enquiries: 40 }, { ...facts, firstAsk: 0.6 }, [])).toBe("MOVE_BUTTON");
    expect(verdictByRule({ ...page, enquiries: 40 }, { ...facts, price: false }, [])).toBe("ADD_PRICE");
    expect(verdictByRule({ ...page, enquiries: 40 }, { ...facts, proof: false }, [])).toBe("ADD_PROOF");
    expect(verdictByRule({ ...page, enquiries: 40 }, facts, ["Service"])).toBe("KEEP");
  });
});
