import { describe, expect, test } from "vitest";
import {
  WIKI_CHECKUP_CYCLE_DAYS,
  WIKI_ROTA_BOUNDS,
  buildSourcesDisagreeNote,
  cleanMachineTags,
  findDuplicateCandidates,
  hasDisagreeNote,
  nextPercent,
  nextStep,
  normaliseTag,
  parseFound,
  planTagMerges,
  rotaShare,
  settleDisagreement,
  summariseFound,
  EMPTY_FOUND,
  type SettlingSide,
} from "./wikiCheckupRules";

/**
 * The daily check-up's pure rules (wiki-daily-checkup-plan.md). The settling
 * order decides what the wiki says with nobody asked, so every rule and the
 * order between them is pinned here; so is the promise that every page is
 * covered within its cycle, on wikis from five pages to two thousand.
 */

const day = 24 * 60 * 60 * 1000;
const company = (at: number) => ({ at, fromWeb: false });
const web = (at: number) => ({ at, fromWeb: true });
const side = (overrides: Partial<SettlingSide> = {}): SettlingSide => ({ pinned: false, sources: [], ...overrides });

describe("settling a disputed fact", () => {
  test("a pinned correction wins over everything, even a newer source", () => {
    expect(settleDisagreement(side({ pinned: true }), side({ sources: [company(10 * day)] }))).toEqual({
      winner: "A",
      rule: "PINNED",
    });
    expect(settleDisagreement(side({ sources: [company(10 * day)] }), side({ pinned: true }))).toEqual({
      winner: "B",
      rule: "PINNED",
    });
  });

  test("two pins that disagree settle nothing — the machine never overrules a person", () => {
    expect(settleDisagreement(side({ pinned: true }), side({ pinned: true }))).toEqual({ winner: null, rule: "UNSETTLED" });
  });

  test("what the sources say beats what they don't", () => {
    expect(settleDisagreement(side({ sources: [company(1)] }), side())).toEqual({ winner: "A", rule: "SOURCED" });
    // Even an old source beats no source at all.
    expect(settleDisagreement(side(), side({ sources: [web(1)] }))).toEqual({ winner: "B", rule: "SOURCED" });
  });

  test("the company's own documents beat pages found on the web, however new", () => {
    expect(settleDisagreement(side({ sources: [web(100 * day)] }), side({ sources: [company(1)] }))).toEqual({
      winner: "B",
      rule: "COMPANY_DOCUMENT",
    });
  });

  test("between sources of the same standing, the newer one wins", () => {
    expect(settleDisagreement(side({ sources: [company(5 * day)] }), side({ sources: [company(9 * day)] }))).toEqual({
      winner: "B",
      rule: "NEWER",
    });
    expect(settleDisagreement(side({ sources: [web(9 * day)] }), side({ sources: [web(5 * day)] }))).toEqual({
      winner: "A",
      rule: "NEWER",
    });
  });

  test("a side's newest company document is what counts, not a newer web page beside it", () => {
    const a = side({ sources: [company(5 * day), web(50 * day)] });
    const b = side({ sources: [company(9 * day)] });
    expect(settleDisagreement(a, b)).toEqual({ winner: "B", rule: "NEWER" });
  });

  test("when nothing settles it, nothing is chosen", () => {
    expect(settleDisagreement(side(), side())).toEqual({ winner: null, rule: "UNSETTLED" });
    expect(settleDisagreement(side({ sources: [company(3)] }), side({ sources: [company(3)] }))).toEqual({
      winner: null,
      rule: "UNSETTLED",
    });
  });

  test("the disagreement note is built in code, names the other page, and is added once", () => {
    const note = buildSourcesDisagreeNote({ claimHere: "Returns within 30 days.", claimThere: "Returns within 14 days.", otherPage: "returns" });
    expect(note).toContain("Sources disagree:");
    expect(note).toContain("[[returns]]");
    expect(note).toContain("30 days");
    expect(note).toContain("14 days");
    expect(hasDisagreeNote(`Some page.\n\n${note}`, "returns")).toBe(true);
    expect(hasDisagreeNote("Some page.", "returns")).toBe(false);
  });
});

/**
 * The nightly rota exactly as the check-up runs it: each night, pages whose
 * stamp is missing or older than the cycle less a day come due, and the
 * night visits up to its share of them, oldest first.
 */
function simulateRota(pages: number, cycleDays: number, bounds: { min: number; max: number }, nights: number) {
  const stamps: Array<number | undefined> = Array.from({ length: pages }, () => undefined);
  const visits: number[][] = Array.from({ length: pages }, () => []);
  const share = rotaShare({ eligible: pages, cycleDays, min: bounds.min, max: bounds.max });
  for (let night = 0; night < nights; night += 1) {
    const now = night * day;
    const due = stamps
      .map((stamp, index) => ({ stamp, index }))
      .filter(({ stamp }) => stamp === undefined || stamp < now - (cycleDays - 1) * day)
      .sort((left, right) => (left.stamp ?? -Infinity) - (right.stamp ?? -Infinity))
      .slice(0, share);
    for (const { index } of due) {
      stamps[index] = now;
      visits[index].push(night);
    }
  }
  return visits;
}

function longestGap(visits: number[], nights: number): number {
  if (visits.length === 0) return Infinity;
  let gap = visits[0] + 1;
  for (let index = 1; index < visits.length; index += 1) gap = Math.max(gap, visits[index] - visits[index - 1]);
  return Math.max(gap, nights - visits[visits.length - 1]);
}

describe("every page covered within its cycle", () => {
  const sizes = [5, 40, 300, 2000];
  const rotas = [
    { name: "links", cycle: WIKI_CHECKUP_CYCLE_DAYS.links, bounds: WIKI_ROTA_BOUNDS.links },
    { name: "contradictions", cycle: WIKI_CHECKUP_CYCLE_DAYS.contradictions, bounds: WIKI_ROTA_BOUNDS.contradictions },
    { name: "sources", cycle: WIKI_CHECKUP_CYCLE_DAYS.sources, bounds: WIKI_ROTA_BOUNDS.sources },
  ] as const;

  for (const rota of rotas) {
    for (const size of sizes) {
      test(`${rota.name}: a ${size}-page wiki has every page visited at least every ${rota.cycle} days`, () => {
        const nights = rota.cycle * 4;
        const visits = simulateRota(size, rota.cycle, rota.bounds, nights);
        for (const pageVisits of visits) {
          expect(longestGap(pageVisits, nights)).toBeLessThanOrEqual(rota.cycle);
        }
      });
    }
  }

  test("a small wiki finishes its rota in a night, a big one spreads it", () => {
    expect(rotaShare({ eligible: 30, cycleDays: 7, min: 50, max: 500 })).toBe(30);
    expect(rotaShare({ eligible: 2000, cycleDays: 7, min: 50, max: 500 })).toBe(286);
    expect(rotaShare({ eligible: 0, cycleDays: 7, min: 50, max: 500 })).toBe(0);
  });
});

describe("tags", () => {
  test("one spelling for a tag", () => {
    expect(normaliseTag("  Delivery Times ")).toBe("delivery-times");
    expect(normaliseTag("#Refunds")).toBe("refunds");
    expect(normaliseTag("x")).toBeNull();
  });

  test("near-duplicate tags fold onto the most used spelling", () => {
    const merges = planTagMerges([
      { tag: "refund", count: 9 },
      { tag: "refunds", count: 2 },
      { tag: "delivery", count: 4 },
      { tag: "policies", count: 1 },
      { tag: "policy", count: 1 },
    ]);
    expect(merges.get("refunds")).toBe("refund");
    expect(merges.has("refund")).toBe(false);
    expect(merges.has("delivery")).toBe(false);
    // A tie goes to the shorter spelling.
    expect(merges.get("policies")).toBe("policy");
  });

  test("the machine's tags never crowd out or repeat a person's", () => {
    expect(cleanMachineTags(["Refunds", "delivery", "refunds", 7, "x"], ["delivery"])).toEqual(["refunds"]);
    expect(cleanMachineTags(["a1", "b2", "c3", "d4", "e5"], ["mine-1", "mine-2", "mine-3", "mine-4"])).toEqual(["a1"]);
    expect(cleanMachineTags("not a list", [])).toEqual([]);
  });
});

describe("progress and the result line", () => {
  test("the bar only ever moves forward, and stops short of full until the run finishes", () => {
    let percent = 0;
    percent = nextPercent({ previous: percent, done: 5, total: 10 });
    expect(percent).toBe(50);
    // More work found grows the total; the bar does not move backwards.
    percent = nextPercent({ previous: percent, done: 6, total: 30 });
    expect(percent).toBe(50);
    percent = nextPercent({ previous: percent, done: 30, total: 30 });
    expect(percent).toBe(99);
  });

  test("the result line names only what happened, in plain words", () => {
    expect(summariseFound({ ...EMPTY_FOUND })).toBe("Everything was already in order.");
    expect(summariseFound({ ...EMPTY_FOUND, linksFixed: 10, linksAdded: 4, factsSettled: 3, pagesWritten: 1 })).toBe(
      "14 links fixed or added, 1 missing page written, 3 disagreements settled."
    );
  });

  test("a damaged progress record reads as nothing done, never as a crash", () => {
    expect(parseFound("not json")).toEqual(EMPTY_FOUND);
    expect(parseFound(JSON.stringify({ linksFixed: -4, factsSettled: 2, nonsense: 9 }))).toEqual({ ...EMPTY_FOUND, factsSettled: 2 });
  });

  test("the steps run in the plan's order and end after tidying", () => {
    expect(nextStep("INTAKE")).toBe("RELINK");
    expect(nextStep("RELINK")).toBe("GAPS");
    expect(nextStep("GAPS")).toBe("REFILE");
    expect(nextStep("REFILE")).toBe("TAGS");
    expect(nextStep("TAGS")).toBe("CORRECT");
    expect(nextStep("CORRECT")).toBe("TIDY");
    expect(nextStep("TIDY")).toBeNull();
  });
});

describe("duplicates", () => {
  test("only same-kind pages with near-identical names are asked about", () => {
    const pairs = findDuplicateCandidates([
      { kind: "POLICY", subjectKey: "returns-policy" },
      { kind: "POLICY", subjectKey: "return-policy" },
      { kind: "PRODUCT", subjectKey: "returns-policy" },
      { kind: "POLICY", subjectKey: "delivery-times" },
    ]);
    expect(pairs).toEqual([["POLICY:returns-policy", "POLICY:return-policy"]]);
  });
});
