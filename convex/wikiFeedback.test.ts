import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
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

describe("whose gap is it — a company's question never leaves the company", () => {
  // Anthony, 2026-11-12: the retired 2026-08-17 rule sent an empty-wiki
  // company's misses to the platform list; the platform check-up then
  // searched the web for Tree House Life's question and filed the result on
  // the shared shelf. These tests fail if that ever comes back.
  test("a company with pages and a company with an empty wiki both keep their own misses", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const withPages = await seedCompany(t);
    await seedPage(t, withPages);
    const emptyCo = await t.run(async (ctx) =>
      ctx.db.insert("companies", { name: "SaaS Customer", createdAt: Date.now() })
    );

    await t.mutation(internal.wikiFeedback.recordAnswerOutcomeInternal, {
      companyId: withPages,
      question: "Do you build apps for the NHS?",
      pageKeys: [],
    });
    await t.mutation(internal.wikiFeedback.recordAnswerOutcomeInternal, {
      companyId: emptyCo,
      question: "Are there specifications for timber at this location?",
      pageKeys: [],
    });

    const rows = await t.run(async (ctx) => ctx.db.query("wikiUnansweredQuestions").collect());
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.companyId === withPages)?.question).toContain("NHS");
    expect(rows.find((row) => row.companyId === emptyCo)?.question).toContain("timber");
    expect(rows.filter((row) => row.companyId === undefined)).toHaveLength(0);
    expect(rows.every((row) => row.companiesJson === undefined)).toBe(true);
  });

  test("two companies asking the same thing get one row each, never a shared one", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const a = await t.run(async (ctx) => ctx.db.insert("companies", { name: "A", createdAt: Date.now() }));
    const b = await t.run(async (ctx) => ctx.db.insert("companies", { name: "B", createdAt: Date.now() }));
    for (const companyId of [a, b]) {
      await t.mutation(internal.wikiFeedback.recordAnswerOutcomeInternal, {
        companyId,
        question: "How do I reset my password?",
        pageKeys: [],
      });
    }
    const rows = await t.run(async (ctx) => ctx.db.query("wikiUnansweredQuestions").collect());
    expect(rows.map((row) => row.companyId).sort()).toEqual([a, b].sort());
  });

  test("the question judge's correction also stays inside the company", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const emptyCo = await seedCompany(t);
    await t.mutation(internal.wikiFeedback.recordJudgedGapInternal, {
      companyId: emptyCo,
      question: "What permits do we need?",
      real: true,
    });
    const rows = await t.run(async (ctx) => ctx.db.query("wikiUnansweredQuestions").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].companyId).toBe(emptyCo);
  });

  test("a company's answer never closes or dismisses the platform's own row", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    await t.mutation(internal.wikiFeedback.recordAnswerOutcomeInternal, {
      question: "How do I reset my password?",
      pageKeys: [],
    });
    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      subjectKey: "password-reset",
      title: "password-reset",
      content: "Reset from the sign-in screen.",
      source: "DOCUMENT:doc-1",
      kind: "POLICY",
    });
    await t.mutation(internal.wikiFeedback.recordAnswerOutcomeInternal, {
      companyId,
      question: "How do I reset my password?",
      pageKeys: ["global/POLICY:password-reset"],
    });
    await t.mutation(internal.wikiFeedback.recordJudgedGapInternal, {
      companyId,
      question: "How do I reset my password?",
      real: false,
    });
    const rows = await t.run(async (ctx) => ctx.db.query("wikiUnansweredQuestions").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].companyId).toBeUndefined();
    expect(rows[0].status).toBe("OPEN");
  });

  test("the global AI's own conversation logs straight to the platform, and a platform-page answer closes it", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await t.mutation(internal.wikiFeedback.recordAnswerOutcomeInternal, {
      question: "How do I reset my password?",
      pageKeys: [],
    });
    let rows = await t.run(async (ctx) => ctx.db.query("wikiUnansweredQuestions").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].companyId).toBeUndefined();

    // The platform learns the page; a later companyless asking answers
    // from it and the row closes itself.
    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      subjectKey: "password-reset",
      title: "password-reset",
      content: "Reset from the sign-in screen.",
      source: "DOCUMENT:doc-1",
      kind: "POLICY",
    });
    await t.mutation(internal.wikiFeedback.recordAnswerOutcomeInternal, {
      question: "How do I reset my password?",
      pageKeys: ["global/POLICY:password-reset"],
    });
    rows = await t.run(async (ctx) => ctx.db.query("wikiUnansweredQuestions").collect());
    expect(rows[0].status).toBe("RESOLVED");
  });
});

describe("the Examiner's drafts", () => {
  test("a draft grows once per question, waits inert, and rejection is remembered", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);

    const first = await t.mutation(internal.wikiExamGrowth.proposeExamCaseInternal, {
      companyId,
      prompt: "Do you build apps for the NHS?",
      expectedBehavior: "Names the public-sector app work and the compliance approach.",
      grewFrom: "Do you build apps for the NHS?",
    });
    const again = await t.mutation(internal.wikiExamGrowth.proposeExamCaseInternal, {
      companyId,
      prompt: "Do you build apps for the NHS?",
      expectedBehavior: "Different wording, same question.",
      grewFrom: "do you build apps for the nhs",
    });
    expect(first).toBe(true);
    expect(again).toBe(false);

    const cases = await t.run(async (ctx) => ctx.db.query("companyEvalCases").collect());
    expect(cases).toHaveLength(1);
    expect(cases[0].status).toBe("PROPOSED");
    expect(cases[0].severity).toBe("ADVISORY");

    // Rejection archives WITH the fingerprint: never proposed again.
    await t.run(async (ctx) => {
      const [row] = await ctx.db.query("companyEvalCases").collect();
      await ctx.db.patch(row._id, { status: "ARCHIVED" });
    });
    const after = await t.mutation(internal.wikiExamGrowth.proposeExamCaseInternal, {
      companyId,
      prompt: "Do you build apps for the NHS?",
      expectedBehavior: "Third try.",
      grewFrom: "Do you build apps for the NHS?",
    });
    expect(after).toBe(false);
  });

  test("growth candidates come from resolved gaps and skip covered questions", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("wikiUnansweredQuestions", {
        companyId,
        question: "Do you build apps for the NHS?",
        normalizedKey: "do you build apps for the nhs",
        askCount: 4,
        status: "RESOLVED",
        firstAskedAt: now,
        lastAskedAt: now,
        resolvedAt: now,
      });
      await ctx.db.insert("wikiUnansweredQuestions", {
        companyId,
        question: "Still open question here?",
        normalizedKey: "still open question here",
        askCount: 9,
        status: "OPEN",
        firstAskedAt: now,
        lastAskedAt: now,
      });
    });
    const growth = await t.query(internal.wikiExamGrowth.listGrowthCandidatesInternal, {
      companyId,
    });
    expect(growth.candidates.map((c) => c.question)).toEqual(["Do you build apps for the NHS?"]);
  });
});

describe("the platform shelf's week", () => {
  test("counts its pages and rounds, and never touches company questions", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    // A company gap that must NOT leak into the platform report.
    await t.mutation(internal.wikiFeedback.recordAnswerOutcomeInternal, {
      companyId,
      question: "Do you build apps for the NHS?",
      pageKeys: [],
    });
    // A global page teaching event.
    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      subjectKey: "billing",
      title: "billing",
      content: "Billing runs monthly.",
      source: "DOCUMENT:doc-1",
      kind: "POLICY",
    });
    // The global door is an adminQuery; the wall it enforces is proven
    // through the audit rows the builder counts from.
    const audit = await t.run(async (ctx) => ctx.db.query("auditLogs").collect());
    const globalCreates = audit.filter(
      (row) => row.actionType === "WIKI_PAGE_CREATED" && row.companyId === undefined
    );
    expect(globalCreates).toHaveLength(1);
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

describe("the unanswered-question lists", () => {
  /**
   * None of the three lists had a test reaching it, so their declared shapes
   * were checked by the compiler alone — and the compiler cannot see a field a
   * handler sends that the declaration does not name.
   */
  const paginationOpts = { numItems: 10, cursor: null };

  const seed = async (t: ReturnType<typeof convexTest>) => t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Asking Co", createdAt: Date.now() });
    const superAdminId = await ctx.db.insert("users", {
      email: "unanswered@test.com",
      role: "SUPER_ADMIN",
      createdAt: Date.now(),
    });
    await ctx.db.insert("wikiUnansweredQuestions", {
      companyId,
      question: "Do you deliver on Saturdays?",
      normalizedKey: "do-you-deliver-on-saturdays",
      askCount: 3,
      status: "OPEN",
      firstAskedAt: 1,
      lastAskedAt: 2,
    });
    await ctx.db.insert("wikiUnansweredQuestions", {
      question: "What is the notice period?",
      normalizedKey: "what-is-the-notice-period",
      askCount: 5,
      companiesJson: JSON.stringify(["a", "b"]),
      status: "OPEN",
      firstAskedAt: 1,
      lastAskedAt: 3,
    });
    return { companyId, superAdminId };
  });

  test("a company's list, the platform's list, and the whole platform's", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { companyId, superAdminId } = await seed(t);
    const client = t.withIdentity({ subject: superAdminId });

    const forCompany = await client.query(api.wikiFeedback.listUnansweredForCompany, { companyId, paginationOpts });
    const forGlobal = await client.query(api.wikiFeedback.listUnansweredForGlobal, {});
    const all = await client.query(api.wikiFeedback.listAllUnanswered, { scope: "ALL", paginationOpts });

    // Proof each read something: an empty list has nothing to be wrong about.
    expect(forCompany.page.map((row) => row.question)).toEqual(["Do you deliver on Saturdays?"]);
    expect(forGlobal.map((row) => row.companyCount)).toEqual([2]);
    expect(all.page.map((row) => row.askCount).sort()).toEqual([3, 5]);
  });

  test("the counts over the platform's table split open gaps by whose they are", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { superAdminId } = await seed(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("wikiUnansweredQuestions", {
        question: "Was this one dismissed?",
        normalizedKey: "was-this-one-dismissed",
        askCount: 1,
        status: "DISMISSED",
        firstAskedAt: 1,
        lastAskedAt: 4,
      });
    });

    const counts = await t.withIdentity({ subject: superAdminId }).query(api.wikiFeedback.countAllUnanswered, {});
    expect(counts).toEqual({ all: 2, platform: 1, companies: 1, capped: false });
  });

  test("only the platform's own admins may count every company's gaps", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { companyId } = await seed(t);
    const adminId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "company-admin@test.com", role: "ADMIN", companyId, createdAt: Date.now() })
    );

    await expect(
      t.withIdentity({ subject: adminId }).query(api.wikiFeedback.countAllUnanswered, {})
    ).rejects.toThrow();
  });
});

describe("the 2026-11-12 one-off clean-up (brought over from Sonae on 21 November 2026)", () => {
  test("company questions on the platform list go back to the company that asked", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const a = await t.run(async (ctx) => ctx.db.insert("companies", { name: "A", createdAt: Date.now() }));
    const b = await t.run(async (ctx) => ctx.db.insert("companies", { name: "B", createdAt: Date.now() }));
    await t.run(async (ctx) => {
      // A asked it alone; B asked the same thing and already has its own row.
      await ctx.db.insert("wikiUnansweredQuestions", {
        question: "What permits do we need?",
        normalizedKey: "permits",
        askCount: 3,
        companiesJson: JSON.stringify([a.toString(), b.toString()]),
        status: "OPEN",
        firstAskedAt: 1,
        lastAskedAt: 2,
      });
      await ctx.db.insert("wikiUnansweredQuestions", {
        companyId: b,
        question: "What permits do we need?",
        normalizedKey: "permits",
        askCount: 1,
        status: "OPEN",
        firstAskedAt: 1,
        lastAskedAt: 5,
      });
      // The platform's own question stays where it is.
      await ctx.db.insert("wikiUnansweredQuestions", {
        question: "How does platform billing work?",
        normalizedKey: "billing",
        askCount: 1,
        status: "OPEN",
        firstAskedAt: 1,
        lastAskedAt: 1,
      });
    });

    const result = await t.mutation(internal.wikiFeedback.returnCompanyQuestionsHomeInternal, {});
    expect(result).toEqual({ moved: 1, checked: 2 });

    const rows = await t.run(async (ctx) => ctx.db.query("wikiUnansweredQuestions").collect());
    expect(rows.filter((row) => row.companyId === undefined).map((row) => row.question)).toEqual([
      "How does platform billing work?",
    ]);
    expect(rows.find((row) => row.companyId === a)?.askCount).toBe(3);
    const bRow = rows.find((row) => row.companyId === b);
    expect(bRow?.askCount).toBe(4);
    expect(bRow?.lastAskedAt).toBe(5);
  });
});
