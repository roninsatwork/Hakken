import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { questionKey } from "./wikiFeedbackService";

/**
 * The Examiner's shelf and its doors (closing-the-loop plan, phase 4).
 * wikiFeedback.test.ts already proves a draft grows once per question and
 * that candidates come only from RESOLVED gaps; this file covers the rest:
 * demand-ranked candidate selection that stays inside the tenant wall, the
 * admin-facing drafts shelf, and the decision that activates a draft or
 * archives it for ever.
 */

type Tester = ReturnType<typeof convexTest>;

const makeTest = () => convexTest(schema, import.meta.glob("./**/*.*s"));

const seedCompany = (t: Tester, name: string) =>
  t.run(async (ctx) => ctx.db.insert("companies", { name, createdAt: Date.now() }));

const seedAdmin = (t: Tester, companyId: Awaited<ReturnType<typeof seedCompany>>, email: string) =>
  t.run(async (ctx) => ctx.db.insert("users", { email, role: "ADMIN", companyId }));

describe("choosing growth candidates", () => {
  test("candidates rank by demand, stop at eight, and never cross the tenant wall", async () => {
    const t = makeTest();
    const companyA = await seedCompany(t, "Comax");
    const companyB = await seedCompany(t, "Other Corp");
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let askCount = 1; askCount <= 10; askCount++) {
        await ctx.db.insert("wikiUnansweredQuestions", {
          companyId: companyA,
          question: `Company A question number ${askCount}, please?`,
          normalizedKey: `company a question number ${askCount} please`,
          askCount,
          status: "RESOLVED",
          firstAskedAt: now,
          lastAskedAt: now + askCount,
          resolvedAt: now,
        });
      }
      // Another company's most-asked question must never appear in A's list.
      await ctx.db.insert("wikiUnansweredQuestions", {
        companyId: companyB,
        question: "Company B's burning question?",
        normalizedKey: "company bs burning question",
        askCount: 99,
        status: "RESOLVED",
        firstAskedAt: now,
        lastAskedAt: now,
        resolvedAt: now,
      });
      // A platform-shelf row (no company) is its own scope, not anyone's.
      await ctx.db.insert("wikiUnansweredQuestions", {
        question: "A platform-wide question?",
        normalizedKey: "a platform wide question",
        askCount: 5,
        status: "RESOLVED",
        firstAskedAt: now,
        lastAskedAt: now,
        resolvedAt: now,
      });
    });

    const growth = await t.query(internal.wikiExamGrowth.listGrowthCandidatesInternal, {
      companyId: companyA,
    });
    expect(growth.candidates).toHaveLength(8);
    expect(growth.candidates.map((c) => c.askCount)).toEqual([10, 9, 8, 7, 6, 5, 4, 3]);
    expect(growth.candidates.some((c) => c.question.includes("Company B"))).toBe(false);
    expect(growth.candidates.some((c) => c.question.includes("platform"))).toBe(false);

    // The platform scope sees only its own row, never a company's.
    const platform = await t.query(internal.wikiExamGrowth.listGrowthCandidatesInternal, {});
    expect(platform.candidates.map((c) => c.question)).toEqual(["A platform-wide question?"]);
  });

  test("the existing-exam list shows live cases only — an archived case no longer crowds out drafting", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t, "Comax");
    await t.run(async (ctx) => {
      const now = Date.now();
      const base = {
        companyId,
        severity: "ADVISORY" as const,
        expectedBehavior: "Answers plainly.",
        createdAt: now,
        updatedAt: now,
      };
      await ctx.db.insert("companyEvalCases", {
        ...base,
        name: "Active",
        targetSurface: "COMPANY_CHAT",
        prompt: "An active prompt?",
        status: "ACTIVE",
      });
      await ctx.db.insert("companyEvalCases", {
        ...base,
        name: "Proposed",
        targetSurface: "COMPANY_CHAT",
        prompt: "A proposed prompt?",
        status: "PROPOSED",
      });
      await ctx.db.insert("companyEvalCases", {
        ...base,
        name: "Archived",
        targetSurface: "COMPANY_CHAT",
        prompt: "An archived prompt?",
        status: "ARCHIVED",
      });
      // A different surface's case is not part of the chat exam at all.
      await ctx.db.insert("companyEvalCases", {
        ...base,
        name: "Agent",
        targetSurface: "AGENT",
        prompt: "An agent-surface prompt?",
        status: "ACTIVE",
      });
    });

    const growth = await t.query(internal.wikiExamGrowth.listGrowthCandidatesInternal, {
      companyId,
    });
    expect(growth.existingPrompts.sort()).toEqual(["A proposed prompt?", "An active prompt?"]);
  });
});

describe("the drafts shelf", () => {
  test("an admin sees their company's drafts; another company's admin is turned away", async () => {
    const t = makeTest();
    const companyA = await seedCompany(t, "Comax");
    const companyB = await seedCompany(t, "Other Corp");
    await t.mutation(internal.wikiExamGrowth.proposeExamCaseInternal, {
      companyId: companyA,
      prompt: "Do you price-match?",
      expectedBehavior: "States the price-match policy as the wiki gives it.",
      grewFrom: "do you price match at all?",
    });

    const adminA = await seedAdmin(t, companyA, "a@test.com");
    const shelf = await t
      .withIdentity({ subject: adminA })
      .query(api.wikiExamGrowth.listProposedCasesForCompany, { companyId: companyA });
    expect(shelf).toHaveLength(1);
    expect(shelf[0]).toMatchObject({
      prompt: "Do you price-match?",
      expectedBehavior: "States the price-match policy as the wiki gives it.",
    });
    expect(shelf[0].name).toContain("Grown from a real question");

    const adminB = await seedAdmin(t, companyB, "b@test.com");
    await expect(
      t
        .withIdentity({ subject: adminB })
        .query(api.wikiExamGrowth.listProposedCasesForCompany, { companyId: companyA })
    ).rejects.toThrow("Unauthorized Access");
  });

  test("approval activates; rejection archives with the fingerprint kept; a decided draft cannot be re-decided", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t, "Comax");
    const adminId = await seedAdmin(t, companyId, "a@test.com");
    for (const grewFrom of ["do you deliver on saturdays?", "can we pay by invoice?"]) {
      await t.mutation(internal.wikiExamGrowth.proposeExamCaseInternal, {
        companyId,
        prompt: grewFrom,
        expectedBehavior: "Answers from the wiki.",
        grewFrom,
      });
    }
    const [toApprove, toReject] = await t.run(async (ctx) =>
      ctx.db.query("companyEvalCases").collect()
    );

    await t.withIdentity({ subject: adminId }).mutation(api.wikiExamGrowth.decideProposedCaseForCompany, {
      companyId,
      caseId: toApprove._id,
      approve: true,
    });
    await t.withIdentity({ subject: adminId }).mutation(api.wikiExamGrowth.decideProposedCaseForCompany, {
      companyId,
      caseId: toReject._id,
      approve: false,
    });

    const { approved, rejected, audits } = await t.run(async (ctx) => ({
      approved: await ctx.db.get(toApprove._id),
      rejected: await ctx.db.get(toReject._id),
      audits: (await ctx.db.query("auditLogs").collect()).filter((row) =>
        row.actionType.startsWith("WIKI_EXAM_DRAFT_")
      ),
    }));
    expect(approved?.status).toBe("ACTIVE");
    // Archived WITH its fingerprint: the same question is never proposed twice.
    expect(rejected?.status).toBe("ARCHIVED");
    expect(rejected?.archivedBy).toBe(adminId);
    expect(rejected?.proposalFingerprint).toBe(questionKey("can we pay by invoice?"));
    const decisionTypes = audits.map((row) => row.actionType).sort();
    expect(decisionTypes).toEqual(["WIKI_EXAM_DRAFT_APPROVED", "WIKI_EXAM_DRAFT_REJECTED"]);
    // Decisions are a person's act; the audit trail names them.
    expect(audits.every((row) => row.actorId === adminId)).toBe(true);

    // A second decision on a settled draft changes nothing — no flip-flop,
    // no second audit entry.
    await t.withIdentity({ subject: adminId }).mutation(api.wikiExamGrowth.decideProposedCaseForCompany, {
      companyId,
      caseId: toApprove._id,
      approve: false,
    });
    const after = await t.run(async (ctx) => ({
      row: await ctx.db.get(toApprove._id),
      decisionCount: (await ctx.db.query("auditLogs").collect()).filter(
        (entry) => entry.actionType === "WIKI_EXAM_DRAFT_APPROVED" || entry.actionType === "WIKI_EXAM_DRAFT_REJECTED"
      ).length,
    }));
    expect(after.row?.status).toBe("ACTIVE");
    expect(after.decisionCount).toBe(2);
  });

  test("a decision cannot reach a draft across the company wall", async () => {
    const t = makeTest();
    const companyA = await seedCompany(t, "Comax");
    const companyB = await seedCompany(t, "Other Corp");
    await t.mutation(internal.wikiExamGrowth.proposeExamCaseInternal, {
      companyId: companyA,
      prompt: "Do you price-match?",
      expectedBehavior: "States the policy.",
      grewFrom: "do you price match?",
    });
    const [draft] = await t.run(async (ctx) => ctx.db.query("companyEvalCases").collect());

    // Company B's admin names their own company (passing the access check)
    // but company A's draft: the row must be unreachable, not decidable.
    const adminB = await seedAdmin(t, companyB, "b@test.com");
    await expect(
      t.withIdentity({ subject: adminB }).mutation(api.wikiExamGrowth.decideProposedCaseForCompany, {
        companyId: companyB,
        caseId: draft._id,
        approve: true,
      })
    ).rejects.toThrow("Draft not found.");
    const untouched = await t.run(async (ctx) => ctx.db.get(draft._id));
    expect(untouched?.status).toBe("PROPOSED");
  });
});
