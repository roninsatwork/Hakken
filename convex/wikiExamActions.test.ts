import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { WIKI_EXAM_QUESTIONS } from "./wikiExamService";

/**
 * The exam that gates the wiki cutover (wiki-replaces-knowledge plan,
 * stage two), with the model stubbed at its boundary. Under test is the
 * grading arithmetic the switch stands on: both paths sit every question,
 * the bar is match-or-beat with no BLOCKER regression, a judge that
 * produces no verdict fails the answer rather than wedging the run, and
 * the result is written to the audit trail so the decision is a record.
 */

const generateMock = vi.hoisted(() => vi.fn());

vi.mock("./aiProviderRegistry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./aiProviderRegistry")>();
  return {
    ...actual,
    generateTextWithResolvedModel: (...args: unknown[]) => generateMock(...args),
  };
});

// Knowledge search runs for real but finds nothing: the embedding step is
// stubbed to answer null, so both paths ask their question over an empty
// shelf without touching an embedding model. Retrieval's own behaviour is
// proven in ai.test.ts; the exam's job is comparing the two paths' grades,
// not performing the search.
vi.mock("./knowledgeRetrieval", () => ({
  embedRetrievalQuery: vi.fn(async () => null),
  searchKnowledgeScope: vi.fn(async () => []),
}));

const makeTest = () => convexTest(schema, import.meta.glob("./**/*.*s"));

type Tester = ReturnType<typeof makeTest>;

beforeEach(() => {
  generateMock.mockReset();
});

const TOTAL = WIKI_EXAM_QUESTIONS.length;
const byPrompt = new Map(WIKI_EXAM_QUESTIONS.map((question) => [question.prompt, question]));
const blocker = WIKI_EXAM_QUESTIONS.find((question) => question.severity === "BLOCKER")!;
const [warningA, warningB] = WIKI_EXAM_QUESTIONS.filter(
  (question) => question.severity === "WARNING"
);

type GenerateArgs = { systemInstruction?: string; contents: Array<{ type: string; text: string }> };
type ScriptedVerdict = { pass: boolean } | { raw: string };

/**
 * Answers every model call. Both paths' answers to a question are graded in
 * one `Promise.all([judge(chunks…), judge(wiki…)])`, and each judge reaches
 * its model call synchronously — so per question, the first grading request
 * is always the chunks answer and the second always the wiki answer. The
 * script decides each (path, question) verdict on that ordering.
 */
function scriptExam(decide: (mode: "chunks" | "wiki", questionKey: string) => ScriptedVerdict) {
  const judgeCallsSeen = new Map<string, number>();
  generateMock.mockImplementation(async (args: GenerateArgs) => {
    const text = args.contents[0].text;
    if (args.systemInstruction?.startsWith("You grade one customer-service answer")) {
      const prompt = text.match(/^Question: (.*)$/m)?.[1] ?? "";
      const seen = judgeCallsSeen.get(prompt) ?? 0;
      judgeCallsSeen.set(prompt, seen + 1);
      const mode = seen === 0 ? ("chunks" as const) : ("wiki" as const);
      const verdict = decide(mode, byPrompt.get(prompt)!.key);
      return {
        text:
          "raw" in verdict
            ? verdict.raw
            : JSON.stringify({ pass: verdict.pass, reason: `graded the ${mode} answer` }),
        inputTokens: 10,
        outputTokens: 5,
      };
    }
    const prompt = text.match(/Customer question: (.*)$/m)?.[1] ?? "";
    return { text: `A short grounded answer to: ${prompt}`, inputTokens: 10, outputTokens: 5 };
  });
}

const seedCompany = (t: Tester) =>
  t.run(async (ctx) => ctx.db.insert("companies", { name: "Wiki Corp", createdAt: Date.now() }));

const runExam = (t: Tester, companyId: Awaited<ReturnType<typeof seedCompany>>) =>
  t.action(internal.wikiExamActions.runWikiExam, { companyId });

describe("sitting the exam", () => {
  test("every question is sat on both paths, the result is filed, and every call lands on the meter", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    await t.mutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});
    scriptExam(() => ({ pass: true }));

    const result = await runExam(t, companyId);
    expect(result.total).toBe(TOTAL);
    expect(result.chunksScore).toBe(TOTAL);
    expect(result.wikiScore).toBe(TOTAL);
    expect(result.wikiPasses).toBe(true);
    expect(result.results).toHaveLength(TOTAL);
    // Two answers and two gradings per question, nothing skipped.
    expect(generateMock).toHaveBeenCalledTimes(TOTAL * 4);

    const { audits, transactions } = await t.run(async (ctx) => ({
      audits: (await ctx.db.query("auditLogs").collect()).filter(
        (row) => row.actionType === "WIKI_EXAM_RUN"
      ),
      transactions: await ctx.db.query("agentTransactions").collect(),
    }));
    // The decision is a record, not a memory: one audit row with the detail.
    expect(audits).toHaveLength(1);
    const metadata = JSON.parse(audits[0].metadata ?? "{}");
    expect(metadata).toMatchObject({
      chunksScore: TOTAL,
      wikiScore: TOTAL,
      total: TOTAL,
      wikiPasses: true,
    });
    expect(JSON.parse(metadata.detail)).toHaveLength(TOTAL);
    // Every model call is on the Examiner's meter, walled to the company.
    expect(transactions).toHaveLength(TOTAL * 4);
    expect(transactions.every((row) => row.companyId === companyId)).toBe(true);
  });

  test("a wiki that scores below the old path does not pass", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    scriptExam((mode, key) => ({ pass: !(mode === "wiki" && key === warningA.key) }));

    const result = await runExam(t, companyId);
    expect(result.chunksScore).toBe(TOTAL);
    expect(result.wikiScore).toBe(TOTAL - 1);
    expect(result.wikiPasses).toBe(false);
    const flunked = result.results.find((entry) => entry.key === warningA.key)!;
    expect(flunked.chunks.pass).toBe(true);
    expect(flunked.wiki.pass).toBe(false);
  });

  test("a tied score hiding a BLOCKER regression still fails — discipline must not regress anywhere", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    // The wiki drops a BLOCKER the old path passed, but wins back a WARNING
    // the old path failed. The totals tie; the bar must still refuse.
    scriptExam((mode, key) => {
      if (mode === "wiki" && key === blocker.key) return { pass: false };
      if (mode === "chunks" && key === warningA.key) return { pass: false };
      return { pass: true };
    });

    const result = await runExam(t, companyId);
    expect(result.wikiScore).toBe(result.chunksScore);
    expect(result.wikiPasses).toBe(false);
  });

  test("a tie made of WARNING trades passes — only BLOCKER regressions are unforgivable", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    scriptExam((mode, key) => {
      if (mode === "wiki" && key === warningB.key) return { pass: false };
      if (mode === "chunks" && key === warningA.key) return { pass: false };
      return { pass: true };
    });

    const result = await runExam(t, companyId);
    expect(result.wikiScore).toBe(result.chunksScore);
    expect(result.wikiPasses).toBe(true);
  });

  test("a judge with no verdict fails that answer instead of wedging or passing the run", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    scriptExam((mode, key) => {
      if (key !== warningA.key) return { pass: true };
      // The wiki side's judge rambles without JSON; the chunks side's judge
      // returns JSON whose pass is the *string* "true", not the boolean.
      return mode === "wiki"
        ? { raw: "The vibes seem broadly fine to me." }
        : { raw: '{"pass": "true", "reason": 42}' };
    });

    const result = await runExam(t, companyId);
    const entry = result.results.find((item) => item.key === warningA.key)!;
    expect(entry.wiki.pass).toBe(false);
    expect(entry.wiki.reason).toBe("The judge produced no verdict.");
    // "true" the string is not true the verdict: anything but strict JSON
    // boolean true reads as a fail, and a non-string reason as silence.
    expect(entry.chunks.pass).toBe(false);
    expect(entry.chunks.reason).toBe("");
    // The run finished and scored everything else; nothing wedged.
    expect(result.total).toBe(TOTAL);
    expect(result.chunksScore).toBe(TOTAL - 1);
    expect(result.wikiScore).toBe(TOTAL - 1);
  });
});
