import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { questionKey } from "./wikiFeedbackService";
import { finishScheduled } from "@/src/test/finishScheduled";

/**
 * The Examiner's drafting round (closing-the-loop plan, phase 4), with the
 * model stubbed at its boundary. Under test is the round's discipline: a
 * stood-down or history-less Examiner spends nothing, drafts land inert and
 * capped, a crashed model call still leaves a run on the record, and the
 * monthly rota visits companies only — never the global shelf, whose
 * drafts would wait for a reviewer that does not exist.
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

type Tester = ReturnType<typeof makeTest>;

beforeEach(() => {
  generateMock.mockReset();
});

const seedCompany = (t: Tester, name = "Wiki Corp") =>
  t.run(async (ctx) => ctx.db.insert("companies", { name, createdAt: Date.now() }));

const seedResolvedQuestion = (
  t: Tester,
  companyId: Awaited<ReturnType<typeof seedCompany>>,
  question: string,
  askCount = 3
) =>
  t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("wikiUnansweredQuestions", {
      companyId,
      question,
      normalizedKey: questionKey(question),
      askCount,
      status: "RESOLVED",
      firstAskedAt: now,
      lastAskedAt: now,
      resolvedAt: now,
    });
  });

const standDownExaminer = async (t: Tester) => {
  await t.mutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});
  await t.run(async (ctx) => {
    const examiner = (await ctx.db.query("agents").collect()).find(
      (agent) => agent.systemKey === "WIKI_EXAMINER"
    )!;
    await ctx.db.patch(examiner._id, { isActive: false });
  });
};

describe("drafting for one company", () => {
  test("a stood-down Examiner spends nothing and drafts nothing", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    await seedResolvedQuestion(t, companyId, "Do you deliver on Saturdays please?");
    await standDownExaminer(t);

    const result = await t.action(internal.wikiExamGrowthActions.growExamForCompany, {
      companyId,
    });
    expect(result).toEqual({ drafted: 0 });
    expect(generateMock).not.toHaveBeenCalled();
    const runs = await t.run(async (ctx) => ctx.db.query("agentRuns").collect());
    expect(runs).toHaveLength(0);
  });

  test("a company with no resolved couldn't-answer history spends nothing", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    const result = await t.action(internal.wikiExamGrowthActions.growExamForCompany, {
      companyId,
    });
    expect(result).toEqual({ drafted: 0 });
    expect(generateMock).not.toHaveBeenCalled();
  });

  test("drafts land inert and capped: malformed and repeated proposals are dropped, the rest wait PROPOSED", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    await seedResolvedQuestion(t, companyId, "Do you deliver on Saturdays please?", 5);
    await seedResolvedQuestion(t, companyId, "Can we pay by invoice instead?", 2);
    generateMock.mockResolvedValue({
      text: JSON.stringify({
        drafts: [
          {
            grewFrom: "Do you deliver on Saturdays please?",
            prompt: "Do you deliver at weekends?",
            expected: "States the delivery days as the wiki gives them.",
          },
          // Malformed: no expected behaviour — must be dropped, not inserted.
          { grewFrom: "Half a draft", prompt: "Half a draft?" },
          // The same question again in different clothes: the fingerprint
          // wall must refuse the second insert.
          {
            grewFrom: "do you deliver on saturdays please",
            prompt: "Weekend delivery, asked twice?",
            expected: "Same question, must not be proposed twice.",
          },
          {
            grewFrom: "Can we pay by invoice instead?",
            prompt: "Can businesses pay on invoice?",
            expected: "States the payment terms the wiki names.",
          },
        ],
      }),
      inputTokens: 50,
      outputTokens: 30,
    });

    const result = await t.action(internal.wikiExamGrowthActions.growExamForCompany, {
      companyId,
    });
    expect(result).toEqual({ drafted: 2 });

    const { cases, audits, runs, transactions } = await t.run(async (ctx) => ({
      cases: await ctx.db.query("companyEvalCases").collect(),
      audits: (await ctx.db.query("auditLogs").collect()).filter(
        (row) => row.actionType === "WIKI_EXAM_DRAFTED"
      ),
      runs: await ctx.db.query("agentRuns").collect(),
      transactions: await ctx.db.query("agentTransactions").collect(),
    }));
    expect(cases).toHaveLength(2);
    // Inert by construction: PROPOSED and merely ADVISORY until a person says.
    expect(cases.every((row) => row.status === "PROPOSED" && row.severity === "ADVISORY")).toBe(true);
    expect(cases.every((row) => row.companyId === companyId)).toBe(true);
    expect(cases.map((row) => row.proposalFingerprint).sort()).toEqual(
      [
        questionKey("Do you deliver on Saturdays please?"),
        questionKey("Can we pay by invoice instead?"),
      ].sort()
    );
    expect(audits).toHaveLength(2);
    // The month's work is on the record: one run, one model call on the meter.
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ title: "The Examiner", triggerType: "SCHEDULE", status: "SUCCESS" });
    expect(runs[0].finalOutput).toContain("Drafted 2 exam questions");
    expect(runs[0].finalOutput).toContain("Nothing was activated");
    expect(transactions).toHaveLength(1);
  });

  test("a failed model call drafts nothing but still proves the Examiner ran", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    await seedResolvedQuestion(t, companyId, "Do you deliver on Saturdays please?");
    generateMock.mockRejectedValue(new Error("model down"));

    const result = await t.action(internal.wikiExamGrowthActions.growExamForCompany, {
      companyId,
    });
    expect(result).toEqual({ drafted: 0 });

    const { cases, runs } = await t.run(async (ctx) => ({
      cases: await ctx.db.query("companyEvalCases").collect(),
      runs: await ctx.db.query("agentRuns").collect(),
    }));
    expect(cases).toHaveLength(0);
    // The run record is the proof of life: without it a crashed month is
    // indistinguishable from an Examiner that never runs at all.
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("SUCCESS");
    expect(runs[0].finalOutput).toContain("No new questions worth drafting");
  });
});

describe("the monthly rota", () => {
  test("visits companies with living pages and never the global shelf", async () => {
    vi.useFakeTimers();
    try {
      const t = makeTest();
      const companyA = await seedCompany(t, "Comax");
      const companyB = await seedCompany(t, "Other Corp");
      await t.run(async (ctx) => {
        const now = Date.now();
        const page = (companyId?: typeof companyA) => ({
          ...(companyId ? { companyId } : {}),
          kind: "POLICY" as const,
          subjectKey: "billing",
          title: "billing",
          content: "Billing runs monthly.",
          links: [],
          pinnedCorrections: [],
          rewriteCount: 0,
          lastRewriteSource: "TENDING",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("wikiPages", page(companyA));
        await ctx.db.insert("wikiPages", page(companyB));
        // The global brain has pages too — but no Evals screen, so its
        // round must not be dispatched: those drafts would wait for a
        // reviewer that does not exist.
        await ctx.db.insert("wikiPages", page());
      });

      const result = await t.action(internal.wikiExamGrowthActions.examGrowthSweep, {});
      expect(result).toEqual({ companies: 2 });
      // Drain the dispatched rounds: no history anywhere, so no model calls.
      await finishScheduled(t);
      expect(generateMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  test("a stood-down Examiner's rota dispatches nothing", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("wikiPages", {
        companyId,
        kind: "POLICY",
        subjectKey: "billing",
        title: "billing",
        content: "Billing runs monthly.",
        links: [],
        pinnedCorrections: [],
        rewriteCount: 0,
        lastRewriteSource: "TENDING",
        createdAt: now,
        updatedAt: now,
      });
    });
    await standDownExaminer(t);
    const result = await t.action(internal.wikiExamGrowthActions.examGrowthSweep, {});
    expect(result).toEqual({ companies: 0 });
  });
});
