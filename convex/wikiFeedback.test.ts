import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { isSubstantiveQuestion, questionKey } from "./wikiFeedbackService";

/**
 * The loop's ground rules (closing-the-loop-plan.md, phases 1–2): a real
 * unanswered question is logged once and counted on repeats, junk never
 * is, a later answered asking closes the row itself, dismissal sticks,
 * and the pages under an answer get their marks.
 */

async function seedCompany(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) =>
    ctx.db.insert("companies", { name: "Loop Corp", createdAt: Date.now() })
  );
}

async function seedPage(
  t: ReturnType<typeof convexTest>,
  companyId: Awaited<ReturnType<typeof seedCompany>>
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("wikiPages", {
      companyId,
      kind: "POLICY",
      subjectKey: "delivery",
      title: "delivery",
      content: "We deliver on Fridays.",
      links: [],
      pinnedCorrections: [],
      rewriteCount: 1,
      lastRewriteSource: "DOCUMENT:doc-1",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );
}

describe("the junk filter", () => {
  test("greetings and one-worders never qualify; real questions do", () => {
    expect(isSubstantiveQuestion("hi")).toBe(false);
    expect(isSubstantiveQuestion("Thanks!")).toBe(false);
    expect(isSubstantiveQuestion("ok")).toBe(false);
    expect(isSubstantiveQuestion("Do you deliver on Sundays?")).toBe(true);
    expect(isSubstantiveQuestion("What's your day rate for a senior designer?")).toBe(true);
  });

  test("two askings of the same thing share a key despite punctuation and case", () => {
    expect(questionKey("Do you deliver on Sundays?")).toBe(questionKey("do you DELIVER on sundays"));
  });
});

describe("the couldn't-answer list", () => {
  test("logged once, counted on repeats, junk kept out", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);

    await t.mutation(internal.wikiFeedback.recordAnswerOutcomeInternal, {
      companyId,
      question: "Do you build apps for the NHS?",
      pageKeys: [],
    });
    await t.mutation(internal.wikiFeedback.recordAnswerOutcomeInternal, {
      companyId,
      question: "do you build apps for the NHS",
      pageKeys: [],
    });
    await t.mutation(internal.wikiFeedback.recordAnswerOutcomeInternal, {
      companyId,
      question: "hi",
      pageKeys: [],
    });

    const rows = await t.run(async (ctx) => ctx.db.query("wikiUnansweredQuestions").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].askCount).toBe(2);
    expect(rows[0].status).toBe("OPEN");
    expect(rows[0].question).toBe("Do you build apps for the NHS?");
  });

  test("an answered asking closes the row itself, and a fresh failure reopens it", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    await seedPage(t, companyId);

    await t.mutation(internal.wikiFeedback.recordAnswerOutcomeInternal, {
      companyId,
      question: "Do you deliver on Sundays?",
      pageKeys: [],
    });
    await t.mutation(internal.wikiFeedback.recordAnswerOutcomeInternal, {
      companyId,
      question: "Do you deliver on Sundays?",
      pageKeys: ["POLICY:delivery"],
    });
    let [row] = await t.run(async (ctx) => ctx.db.query("wikiUnansweredQuestions").collect());
    expect(row.status).toBe("RESOLVED");

    await t.mutation(internal.wikiFeedback.recordAnswerOutcomeInternal, {
      companyId,
      question: "Do you deliver on Sundays?",
      pageKeys: [],
    });
    [row] = await t.run(async (ctx) => ctx.db.query("wikiUnansweredQuestions").collect());
    expect(row.status).toBe("OPEN");
    expect(row.askCount).toBe(2);
  });

  test("a dismissed question stays dismissed however often it repeats", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    await t.mutation(internal.wikiFeedback.recordAnswerOutcomeInternal, {
      companyId,
      question: "What colour is your office carpet?",
      pageKeys: [],
    });
    await t.run(async (ctx) => {
      const [row] = await ctx.db.query("wikiUnansweredQuestions").collect();
      await ctx.db.patch(row._id, { status: "DISMISSED" });
    });
    await t.mutation(internal.wikiFeedback.recordAnswerOutcomeInternal, {
      companyId,
      question: "What colour is your office carpet?",
      pageKeys: [],
    });
    const [row] = await t.run(async (ctx) => ctx.db.query("wikiUnansweredQuestions").collect());
    expect(row.status).toBe("DISMISSED");
    expect(row.askCount).toBe(2);
  });
});

describe("usage marks", () => {
  test("the pages under an answer get their tallies; the wall holds for global keys", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    const pageId = await seedPage(t, companyId);

    await t.mutation(internal.wikiFeedback.recordAnswerOutcomeInternal, {
      companyId,
      question: "Do you deliver on Sundays?",
      pageKeys: ["POLICY:delivery", "POLICY:missing-page"],
    });
    await t.mutation(internal.wikiFeedback.recordAnswerOutcomeInternal, {
      companyId,
      question: "When do deliveries arrive?",
      pageKeys: ["POLICY:delivery"],
    });

    const page = await t.run(async (ctx) => ctx.db.get(pageId));
    expect(page?.usageCount).toBe(2);
    expect(page?.lastUsedAt).toEqual(expect.any(Number));
  });

  test("a global page key marks the platform shelf's page, not a company page", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    const globalPageId = await t.run(async (ctx) =>
      ctx.db.insert("wikiPages", {
        kind: "POLICY",
        subjectKey: "billing",
        title: "billing",
        content: "Billing runs monthly.",
        links: [],
        pinnedCorrections: [],
        rewriteCount: 1,
        lastRewriteSource: "DOCUMENT:doc-2",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    await t.mutation(internal.wikiFeedback.recordAnswerOutcomeInternal, {
      companyId,
      question: "When does billing run?",
      pageKeys: ["global/POLICY:billing"],
    });
    const page = await t.run(async (ctx) => ctx.db.get(globalPageId));
    expect(page?.usageCount).toBe(1);
  });
});
