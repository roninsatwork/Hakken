import { describe, expect, test } from "vitest";
import { readFixture } from "@/src/test/readFixture";
import { expectEyeHolds } from "@/src/test/eyeHolds";
import { factsByKey, type Fact } from "../insightFacts";
import { seesFrom, withoutTypedUnits } from "../seesAsk";
import { pageFacts } from "./pageData";
import { pageFindings } from "./pageFindings";

/**
 * Real answers the eye's writer gave, held to the checker's rules as they stand (eye-code-first-brief-plan-2026-11-07.md, "Tests
 * that stop the eye drifting"; Anthony, 2026-11-07: "We need plenty of tests around the eye to stop drift"). Each is the writer's
 * own words on 7 November, with the very page figures it was handed (`src/test/fixtures/eyeRealAnswers.json`). The figures it may
 * name are worked out again here as a press works them out: the page's own, keyed, and its findings'. A change to the checker,
 * the page's figures or its rules that starts sending good words back fails here, before anyone pays for a press to find out.
 * Running a fresh press stays a hand check, as it costs money.
 */

type Saved = { screen: string; links: Array<{ label: string; href: string }>; data: unknown; answer: { says: string[]; steps: Array<{ words: string; link: number }> } };
const SAVED = readFixture<{ answers: Saved[] }>("eyeRealAnswers").answers;

/** Every figure a press could name on this page: its own, keyed as the writer names them, and its findings'. */
function figuresFor(screen: string, data: unknown): ReadonlyMap<string, Fact> {
  const own = pageFacts(screen, data).facts;
  const found = pageFindings(screen, data).flatMap((finding) => finding.facts.map((fact) => ({ key: fact.key, value: fact.value, unit: fact.unit, label: fact.label, source: own[0]?.source ?? ("analytics" as const) })));
  return factsByKey([...own, ...found]);
}

describe("real answers still pass the checker's rules", () => {
  test("there are real answers from more than one section to hold", () => {
    expect(SAVED.length).toBeGreaterThanOrEqual(6);
    expect(new Set(SAVED.map((one) => one.screen.split(".")[0])).size).toBeGreaterThanOrEqual(3);
  });

  test.each(SAVED.map((one) => [one.screen, one] as const))("%s", (_screen, saved) => {
    // The brief its writer is handed on these real figures keeps its promises too.
    expectEyeHolds(saved.screen, saved.data);
    const figures = figuresFor(saved.screen, saved.data);
    const tidied = withoutTypedUnits(saved.answer, figures);
    const verdict = seesFrom(tidied, figures, saved.links, { salvage: true, analytics: saved.screen.startsWith("googleAnalytics.") });
    expect(verdict.ok, verdict.ok ? "" : verdict.why).toBe(true);
    if (!verdict.ok) return;
    // Its faulty parts may be left off, as after a rewrite, but most of what it said stands, with a step to take.
    expect(verdict.says.length, (verdict.left ?? []).join("\n")).toBeGreaterThanOrEqual(Math.ceil(saved.answer.says.length / 2));
    expect(verdict.steps.length, (verdict.left ?? []).join("\n")).toBeGreaterThanOrEqual(1);
  });
});
