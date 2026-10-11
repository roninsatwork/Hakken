import { describe, expect, test } from "vitest";
import { couldBeChance, editFinding, typedNumbers, unlike, type DraftFinding } from "./insightEditor";
import { candidatesFor } from "./insightChecks";
import { factsByKey, type Fact } from "./insightFacts";

/**
 * The Editor (insights-analyst-plan.md I21, I29) and the specialists'
 * checklists (§2.2, §3): a finding's figures come only from facts Hakken
 * holds, are compared like with like, and a move small enough to be chance
 * is not called a change; the checklists find the patterns on real-shaped
 * facts and hold back on small numbers.
 */

const span = (from: string, to: string) => ({ from, to });
const ga = (key: string, value: number, when: { from: string; to: string }): Fact => ({ key, value, unit: "count", source: "analytics", label: key, country: "gbr", ...when });
const YEAR = span("2025-10-11", "2026-10-10");
const YEAR_BEFORE = span("2024-10-11", "2025-10-10");

const facts = factsByKey([
  ga("ga.channel.Organic Search.visits.365.now", 3302, YEAR),
  ga("ga.channel.Organic Search.visits.365.before", 3237, YEAR_BEFORE),
  ga("ga.channel.Organic Search.conversions.365.now", 101, YEAR),
  ga("ga.channel.Organic Search.conversions.365.before", 171, YEAR_BEFORE),
  ga("ga.conversions.30.now", 12, span("2026-09-11", "2026-10-10")),
  ga("ga.conversions.30.before", 9, span("2026-08-12", "2026-09-10")),
  { key: "sc.clicksWorld.90.now", value: 2062, unit: "count", source: "searchConsole", label: "Google clicks from every country", country: "world", ...span("2026-07-12", "2026-10-09") },
  { key: "sc.clicks.90.now", value: 1070, unit: "count", source: "searchConsole", label: "Google clicks", country: "gbr", ...span("2026-07-12", "2026-10-09") },
  { key: "seo.ronins.co.uk.traffic.now", value: 1054, unit: "count", source: "market", label: "estimated visitors" },
]);

const draft = (overrides: Partial<DraftFinding>): DraftFinding => ({
  headline: "Search sent the same visitors but [[ga.channel.Organic Search.conversions.365.now]] enquiries, down from [[ga.channel.Organic Search.conversions.365.before]].",
  story: "Visits from search held at [[ga.channel.Organic Search.visits.365.now]] against [[ga.channel.Organic Search.visits.365.before]] over the last 12 months.",
  action: "Look at which searches bring the visits now.",
  howWeKnow: "Search's enquiries over the next 90 days.",
  ruledOut: ["The form works: other channels still enquire."],
  comparisons: [["ga.channel.Organic Search.conversions.365.now", "ga.channel.Organic Search.conversions.365.before"]],
  ...overrides,
});

describe("the Editor", () => {
  test("a finding naming held facts, compared like with like, is filled in and passed", () => {
    const verdict = editFinding(draft({}), facts);
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.filled.headline).toBe("Search sent the same visitors but 101 enquiries, down from 171.");
    expect(verdict.used.map((fact) => fact.key)).toContain("ga.channel.Organic Search.visits.365.before");
  });

  test("a typed number is sent back; years and spans of days may be typed", () => {
    expect(editFinding(draft({ headline: "Enquiries fell by 41% from [[ga.conversions.30.before]]." }), facts)).toMatchObject({ ok: false });
    expect(typedNumbers("In the last 12 months of 2026, [[ga.x]] rose; check in 90 days.")).toEqual([]);
    expect(typedNumbers("about 70 fewer")).toEqual(["70"]);
  });

  test("a figure Hakken doesn't hold is sent back, never left blank", () => {
    expect(editFinding(draft({ story: "[[ga.nothing.held]] visits." }), facts)).toMatchObject({ ok: false, note: expect.stringContaining("ga.nothing.held") });
  });

  test("unlike comparisons are sent back: one country against every country, an estimate against a count", () => {
    expect(unlike(facts.get("sc.clicks.90.now")!, facts.get("sc.clicksWorld.90.now")!)).toMatch(/different countries/);
    expect(unlike(facts.get("seo.ronins.co.uk.traffic.now")!, facts.get("sc.clicks.90.now")!)).toMatch(/estimate/);
    expect(editFinding(draft({ comparisons: [["sc.clicks.90.now", "sc.clicksWorld.90.now"]] }), facts)).toMatchObject({ ok: false });
  });

  test("a move small enough to be chance is not called a change, unless the finding says it is too early to tell", () => {
    expect(couldBeChance(12, 9)).toBe(true);
    expect(couldBeChance(101, 171)).toBe(false);
    const small = draft({ comparisons: [["ga.conversions.30.now", "ga.conversions.30.before"]] });
    expect(editFinding(small, facts)).toMatchObject({ ok: false });
    expect(editFinding({ ...small, story: `${small.story} It is too early to tell whether [[ga.conversions.30.now]] is a rise.` }, facts).ok).toBe(true);
  });

  test("two counts within a tenth of each other are said to have held, with no test of chance", () => {
    expect(editFinding(draft({ comparisons: [["ga.channel.Organic Search.visits.365.now", "ga.channel.Organic Search.visits.365.before"]] }), facts).ok).toBe(true);
  });

  test("words a client never reads are sent back", () => {
    expect(editFinding(draft({ action: "Push the AI page onto page one." }), facts)).toMatchObject({ ok: false });
  });
});

describe("the checklists", () => {
  test("same visitors, fewer results: search's visits held while its conversions fell", () => {
    const found = candidatesFor([...facts.values()], "ronins.co.uk");
    expect(found.find((candidate) => candidate.pattern === "sameVisitorsFewerResults")).toMatchObject({ specialist: "search", stake: 70 });
  });

  test("small numbers raise nothing", () => {
    const few = [
      ga("ga.channel.Organic Search.visits.365.now", 300, YEAR),
      ga("ga.channel.Organic Search.visits.365.before", 290, YEAR_BEFORE),
      ga("ga.channel.Organic Search.conversions.365.now", 4, YEAR),
      ga("ga.channel.Organic Search.conversions.365.before", 9, YEAR_BEFORE),
    ];
    expect(candidatesFor(few, "acme.test")).toEqual([]);
  });

  test("an assistant that names rivals but never the website", () => {
    const ai = (key: string, value: number): Fact => ({ key, value, unit: "count", source: "ai", label: key });
    const found = candidatesFor([ai("ai.answers.chatgpt.asked", 40), ai("ai.answers.chatgpt.acme.test.named", 0), ai("ai.answers.chatgpt.rival.test.named", 3)], "acme.test");
    expect(found).toEqual([expect.objectContaining({ specialist: "aiVisibility", pattern: "missingFromAnAssistant", facts: ["ai.answers.chatgpt.acme.test.named", "ai.answers.chatgpt.asked", "ai.answers.chatgpt.rival.test.named"] })]);
  });
});
