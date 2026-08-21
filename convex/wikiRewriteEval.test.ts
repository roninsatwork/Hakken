import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { WIKI_PAGE_MAX_CHARS } from "./wikiRewriteService";

/**
 * The rewrite eval's own plumbing, with the model stubbed at its boundary.
 * The fixtures' judgement of a real model needs a real deployment; what
 * must hold everywhere is the harness itself: every fixture gets its
 * verdict, an unusable rewrite is refused without spending a judge call,
 * and the judge's PASS/FAIL line is read exactly — because a harness that
 * mis-reads its judge reports a broken loop as working.
 */

const generateMock = vi.hoisted(() => vi.fn());

vi.mock("./aiProviderRegistry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./aiProviderRegistry")>();
  return {
    ...actual,
    generateTextWithResolvedModel: (...args: unknown[]) => generateMock(...args),
  };
});

const makeTest = () => convexTest(schema, import.meta.glob("./**/*.*s"));

beforeEach(() => {
  generateMock.mockReset();
});

type GenerateArgs = { systemInstruction?: string; contents: Array<{ type: string; text: string }> };

const isJudgeCall = (args: GenerateArgs) =>
  args.systemInstruction?.includes("You grade a rewritten customer-wiki page") ?? false;

/** Answers rewrite calls and judge calls from two scripts. */
function scriptModel(rewrite: () => string, judge: () => string) {
  generateMock.mockImplementation(async (args: GenerateArgs) => ({
    text: isJudgeCall(args) ? judge() : rewrite(),
    inputTokens: 10,
    outputTokens: 5,
  }));
}

describe("running the rewrite fixtures", () => {
  test("each fixture's rewrite is judged against its own rubric and the verdicts come back named", async () => {
    const t = makeTest();
    scriptModel(
      () => "The refurbishment finished; discuss the winter linen contract with pricing.",
      () => "PASS — the stale fact is gone and the new one is in."
    );

    const verdicts = await t.action(internal.wikiRewriteEval.runFixtures, {});
    expect(verdicts).toHaveLength(2);
    expect(verdicts.map((verdict) => verdict.pass)).toEqual([true, true]);
    expect(verdicts.map((verdict) => verdict.fixture)).toEqual([
      "a changed fact is replaced, not accumulated",
      "a pinned correction is respected and not contradicted",
    ]);
    expect(verdicts[0].rewrittenChars).toBeGreaterThan(0);

    // The judge saw the rewrite and the fixture's own rubric — including the
    // claim the rewrite must NOT contain. A judge shown the wrong rubric
    // grades the wrong thing and the eval means nothing.
    const judgeCalls = generateMock.mock.calls
      .map(([args]) => args as GenerateArgs)
      .filter(isJudgeCall);
    expect(judgeCalls).toHaveLength(2);
    expect(judgeCalls[0].contents[0].text).toContain(
      "The refurbishment finished; discuss the winter linen contract with pricing."
    );
    expect(judgeCalls[0].contents[0].text).toContain("Must NOT state: 12 rooms out of service");
    expect(judgeCalls[1].contents[0].text).toContain(
      "invoice will be sent to the school directly"
    );
  });

  test("an unusable rewrite is refused outright — no judge call is spent on it", async () => {
    const t = makeTest();
    // First fixture: an empty rewrite. Second: one past the hard ceiling.
    const rewrites = ["   ", "x".repeat(WIKI_PAGE_MAX_CHARS * 2 + 1)];
    scriptModel(
      () => rewrites.shift() ?? "",
      () => "PASS — should never be asked."
    );

    const verdicts = await t.action(internal.wikiRewriteEval.runFixtures, {});
    expect(verdicts).toEqual([
      expect.objectContaining({ pass: false, judge: "refused: empty", rewrittenChars: 0 }),
      expect.objectContaining({ pass: false, judge: "refused: too_long", rewrittenChars: 0 }),
    ]);
    // Two rewrite attempts, zero judge calls: a refused rewrite spends nothing more.
    expect(generateMock).toHaveBeenCalledTimes(2);
  });

  test("the judge's first word decides, case-insensitively — anything but PASS is a fail", async () => {
    const t = makeTest();
    const judgements = ["pass\nReads cleanly and the stale fact is gone.", "FAIL — it invented a price."];
    scriptModel(
      () => "A perfectly reasonable rewrite.",
      () => judgements.shift() ?? ""
    );

    const verdicts = await t.action(internal.wikiRewriteEval.runFixtures, {});
    expect(verdicts.map((verdict) => verdict.pass)).toEqual([true, false]);
    // The judge's own words are kept, so a failure reads as a reason, not a boolean.
    expect(verdicts[1].judge).toContain("invented a price");
  });
});
