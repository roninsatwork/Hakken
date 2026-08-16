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

describe("the weekly report", () => {
  test("counts real events and knows a quiet week from a busy one", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);

    const quiet = await t.query(internal.wikiReport.buildWeeklyReportInternal, {
      companyId,
      since: Date.now() - 7 * 24 * 60 * 60 * 1000,
    });
    expect(quiet.quiet).toBe(true);

    await seedPage(t, companyId);
    await t.mutation(internal.wikiFeedback.recordAnswerOutcomeInternal, {
      companyId,
      question: "Do you deliver on Sundays?",
      pageKeys: ["POLICY:delivery"],
    });
    await t.mutation(internal.wikiFeedback.recordAnswerOutcomeInternal, {
      companyId,
      question: "Do you build apps for the NHS?",
      pageKeys: [],
    });

    const busy = await t.query(internal.wikiReport.buildWeeklyReportInternal, {
      companyId,
      since: Date.now() - 7 * 24 * 60 * 60 * 1000,
    });
    expect(busy.quiet).toBe(false);
    expect(busy.answered).toBe(1);
    expect(busy.unanswered).toBe(1);
    expect(busy.openUnanswered).toBe(1);
  });

  test("the rota tells each admin once and audits the send", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    const adminId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "admin@test.com", role: "ADMIN", companyId, createdAt: Date.now() })
    );
    await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "member@test.com", role: "USER", companyId, createdAt: Date.now() })
    );

    const told = await t.mutation(internal.wikiReport.notifyCompanyAdminsInternal, {
      companyId,
      title: "Your wiki's week",
      body: "2 new pages.",
    });
    expect(told).toBe(1);

    const notifications = await t.run(async (ctx) => ctx.db.query("notifications").collect());
    expect(notifications).toHaveLength(1);
    expect(notifications[0].userId).toBe(adminId);

    const audit = await t.run(async (ctx) => ctx.db.query("auditLogs").collect());
    expect(audit.some((row) => row.actionType === "WIKI_WEEKLY_REPORT_SENT")).toBe(true);
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
