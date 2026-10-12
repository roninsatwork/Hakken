import { describe, expect, test } from "vitest";
import { claimAgainstEvidence, couldBeChance, editFinding, typedNumbers, unlike, type DraftFinding } from "./insightEditor";
import { candidatesFor } from "./insightChecks";
import { enquiryCheck } from "./insightEnquiryCheck";
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

  test("a figure a year before must be the same month a year back (insights-intelligence-plan.md phase 6)", () => {
    const month = (key: string, to: string) => ({ key, value: 10, unit: "count" as const, source: "market" as const, label: key, from: to, to });
    expect(unlike(month("seo.rival.test.traffic.now", "2026-11-30"), month("seo.rival.test.traffic.year", "2025-10-31"))).toMatch(/not the same month a year before/);
    expect(unlike(month("seo.rival.test.traffic.now", "2026-11-30"), month("seo.rival.test.traffic.year", "2025-11-30"))).toBeNull();
    // A month against the month before is no year-on-year claim.
    expect(unlike(month("ai.rival.test.mentions.now", "2026-11-28"), month("ai.rival.test.mentions.before", "2026-10-28"))).toBeNull();
  });

  test("unlike comparisons are sent back: one country against every country, an estimate against a count", () => {
    expect(unlike(facts.get("sc.clicks.90.now")!, facts.get("sc.clicksWorld.90.now")!)).toMatch(/different countries/);
    expect(unlike(facts.get("seo.ronins.co.uk.traffic.now")!, facts.get("sc.clicks.90.now")!)).toMatch(/estimate/);
    expect(editFinding(draft({ comparisons: [["sc.clicks.90.now", "sc.clicksWorld.90.now"]] }), facts)).toMatchObject({ ok: false });
  });

  test("a move small enough to be chance is not called a change, unless the finding says it is too early to tell", () => {
    expect(couldBeChance(12, 9)).toBe(true);
    expect(couldBeChance(101, 171)).toBe(false);
    const small = draft({ headline: "Enquiries in the last 30 days: [[ga.conversions.30.now]], against [[ga.conversions.30.before]].", comparisons: [["ga.conversions.30.now", "ga.conversions.30.before"]] });
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

describe("the enquiry check (I42)", () => {
  const count = (key: string, value: number): Fact => ({ key, value, unit: "count", source: "analytics", label: key });

  test("nearly everyone who leaves by a link going on to enquire is the form counted as leaving, or bots", () => {
    const check = enquiryCheck([count("ga.counted.form_submission.times.365.now", 260), count("ga.event.form_submission.people.365.now", 255), count("ga.funnel.click.did.365.now", 271), count("ga.funnel.click.then.365.now", 255)]);
    expect(check).toEqual({ ok: false, problems: [{ code: "leavesBefore", event: "click", other: null, a: 255, b: 271 }] });
  });

  test("two ways of counting that rise together, and repeats from the same people", () => {
    const check = enquiryCheck([
      count("ga.counted.form_submission.times.365.now", 100), count("ga.counted.generate_lead.times.365.now", 96),
      count("ga.event.form_submission.people.365.now", 40), count("ga.event.generate_lead.people.365.now", 90),
    ]);
    expect(check.problems.map((problem) => problem.code)).toEqual(["countedTwice", "repeated"]);
  });

  test("small counts say nothing either way", () => {
    expect(enquiryCheck([count("ga.counted.form_submission.times.365.now", 12), count("ga.event.form_submission.people.365.now", 4)]).ok).toBe(true);
  });
});

describe("keeping score and the change log (§2.7, I25)", () => {

  test("a finding is proved right when its figure moved the way it said, and too early when the move could be chance", async () => {
    const { outcomeOf } = await import("./insightTrack");
    expect(outcomeOf(101, 140, "UP", "count")).toBe("RIGHT");
    expect(outcomeOf(101, 70, "UP", "count")).toBe("WRONG");
    expect(outcomeOf(10, 12, "UP", "count")).toBe("TOO_EARLY");
  });

  test("a page that brought enquiries and is gone is replaced when a new page shares its words, with what its enquiries did", async () => {
    const { pageChanges } = await import("./insightTrack");
    const changes = pageChanges(
      [{ path: "/blockchain-development-company/", visits: 300, enquiries: 3 }, { path: "/", visits: 900, enquiries: 40 }, { path: "/web-design-surrey/", visits: 30, enquiries: 4 }],
      [{ path: "/blockchain-developers/", visits: 400, enquiries: 13 }, { path: "/old-offer/", visits: 200, enquiries: 4 }, { path: "/", visits: 900, enquiries: 50 }, { path: "/web-design-surrey/", visits: 50, enquiries: 6 }],
    );
    expect(changes).toEqual([
      { kind: "REPLACED", from: "/blockchain-developers/", to: "/blockchain-development-company/", before: 13, after: 3, result: "LOST" },
      { kind: "REMOVED", from: "/old-offer/", to: null, before: 4, after: 0, result: "LOST" },
    ]);
  });
});

describe("claims against their evidence (I21)", () => {
  const year = (key: string, value: number, to: string): Fact => ({ key, value, unit: "count", source: "analytics", label: key, from: `${Number(to.slice(0, 4)) - 1}${to.slice(4)}`, to });
  const now = year("ga.conversions.365.now", 101, "2026-10-10"), before = year("ga.conversions.365.before", 171, "2025-10-10");

  test("a headline saying its figures rose when they fell is sent back, and the other way", () => {
    expect(claimAgainstEvidence("Enquiries from search grew to [[ga.conversions.365.now]]", [[now, before]])).toContain("rose");
    expect(claimAgainstEvidence("Enquiries fell to [[ga.conversions.365.now]] from [[ga.conversions.365.before]]", [[now, before]])).toBeNull();
    expect(claimAgainstEvidence("Enquiries fell", [[{ ...now, value: 200 }, before]])).toContain("fell");
  });

  test("a headline saying both ways, neither, or resting on a small move is left to its story", () => {
    expect(claimAgainstEvidence("Visits rose but enquiries fell", [[now, before]])).toBeNull();
    expect(claimAgainstEvidence("Search brings the same visitors", [[now, before]])).toBeNull();
    expect(claimAgainstEvidence("Enquiries grew", [[{ ...now, value: 168 }, before]])).toBeNull();
  });

  test("the Editor sends such a finding back", () => {
    const verdict = editFinding(draft({ headline: "Search sent more enquiries: [[ga.channel.Organic Search.conversions.365.now]] against [[ga.channel.Organic Search.conversions.365.before]]." }), facts);
    expect(verdict).toMatchObject({ ok: false });
  });
});
