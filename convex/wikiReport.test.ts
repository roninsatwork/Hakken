import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

/**
 * The weekly brain report's ground rules (closing-the-loop-plan.md, phase 3):
 * assembled mechanically with no model call, silent for a quiet week, one
 * bell per admin, walled to the company — and the platform's week goes to
 * the platform's people, never to a company admin.
 */

async function seedCompany(t: ReturnType<typeof convexTest>, name = "Report Corp") {
  return await t.run(async (ctx) => ctx.db.insert("companies", { name, createdAt: Date.now() }));
}

async function seedUser(
  t: ReturnType<typeof convexTest>,
  role: "USER" | "ADMIN" | "SUPER_ADMIN" | "READ_ONLY",
  companyId?: Id<"companies">
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("users", { email: `${role.toLowerCase()}-${Math.random()}@test.com`, role, companyId })
  );
}

/** A page that teaches nothing this week: inserted directly, no audit row. */
async function seedSilentPage(t: ReturnType<typeof convexTest>, companyId?: Id<"companies">) {
  await t.run(async (ctx) =>
    ctx.db.insert("wikiPages", {
      ...(companyId ? { companyId } : {}),
      kind: "POLICY" as const,
      subjectKey: "delivery",
      title: "delivery",
      content: "We deliver on Fridays.",
      links: [],
      pinnedCorrections: [],
      rewriteCount: 1,
      lastRewriteSource: "DOCUMENT:doc-old",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );
}

const WEEK_AGO = () => Date.now() - 7 * 24 * 60 * 60 * 1000;

describe("who may read whose week", () => {
  test("an admin (and a read-only colleague) sees their own week; another company's admin is refused", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyA = await seedCompany(t, "Company A");
    const companyB = await seedCompany(t, "Company B");
    const adminA = await seedUser(t, "ADMIN", companyA);
    const readOnlyA = await seedUser(t, "READ_ONLY", companyA);
    const adminB = await seedUser(t, "ADMIN", companyB);

    for (const subject of [adminA, readOnlyA]) {
      const report = await t
        .withIdentity({ subject })
        .query(api.wikiReport.getWeeklyReportForCompany, { companyId: companyA });
      expect(report.quiet).toBe(true);
    }

    await expect(
      t.withIdentity({ subject: adminB }).query(api.wikiReport.getWeeklyReportForCompany, { companyId: companyA })
    ).rejects.toThrow("Unauthorized Access");
  });

  test("the platform's week answers to platform people only", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    const adminId = await seedUser(t, "ADMIN", companyId);
    const superId = await seedUser(t, "SUPER_ADMIN");
    const readOnlyId = await seedUser(t, "READ_ONLY");

    await expect(
      t.withIdentity({ subject: adminId }).query(api.wikiReport.getWeeklyReportForGlobal, {})
    ).rejects.toThrow("Unauthorized access to the platform wiki");

    for (const subject of [superId, readOnlyId]) {
      const report = await t.withIdentity({ subject }).query(api.wikiReport.getWeeklyReportForGlobal, {});
      expect(report.quiet).toBe(true);
    }
  });
});

describe("counting the week", () => {
  test("staff rounds are counted by badge, not by name — another agent's run is not the wiki's work", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    await t.mutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});
    await t.mutation(internal.wikiStaff.recordStaffRunInternal, {
      systemKey: "WIKI_LINKER",
      companyId,
      trigger: "SCHEDULE",
      objective: "Connect sparsely linked pages.",
      summary: "Added 3 connections.",
      startedAt: Date.now() - 5_000,
    });
    // A civilian agent's run in the same window must not inflate the count.
    await t.run(async (ctx) => {
      const now = Date.now();
      const civilianId = await ctx.db.insert("agents", {
        name: "Sales Researcher",
        modelId: "test-model",
        thinkingMode: false,
        isActive: true,
        companyId,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("agentRuns", {
        agentId: civilianId,
        triggerType: "MANUAL",
        objective: "Research a lead.",
        status: "SUCCESS",
        companyId,
        startedAt: now - 4_000,
        updatedAt: now,
      });
    });

    const report = await t.query(internal.wikiReport.buildWeeklyReportInternal, {
      companyId,
      since: WEEK_AGO(),
    });
    expect(report.staffRuns).toBe(1);
    expect(report.quiet).toBe(false);
  });

  test("the platform's unanswered count is its own open questions asked this week, not a company's", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    // A company WITH pages owns its own gap (the routing rule); the
    // platform's count must hold only the platform's.
    await seedSilentPage(t, companyId);
    await t.mutation(internal.wikiFeedback.recordAnswerOutcomeInternal, {
      companyId,
      question: "Do you build apps for the NHS?",
      pageKeys: [],
    });
    await t.mutation(internal.wikiFeedback.recordAnswerOutcomeInternal, {
      question: "How do I reset my password?",
      pageKeys: [],
    });

    const platform = await t.query(internal.wikiReport.buildWeeklyReportInternal, { since: WEEK_AGO() });
    expect(platform.unanswered).toBe(1);
    expect(platform.openUnanswered).toBe(1);
  });
});

describe("the platform's bell", () => {
  test("every super admin hears it once; nobody else does", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    const superA = await seedUser(t, "SUPER_ADMIN");
    const superB = await seedUser(t, "SUPER_ADMIN");
    await seedUser(t, "ADMIN", companyId);

    const told = await t.mutation(internal.wikiReport.notifySuperAdminsInternal, {
      title: "The platform wiki's week",
      body: "1 new pages, 0 improved.",
    });
    expect(told).toBe(2);

    const notifications = await t.run(async (ctx) => ctx.db.query("notifications").collect());
    expect(notifications.map((n) => n.userId).sort()).toEqual([superA, superB].sort());
  });
});

describe("the weekly rota", () => {
  test("quiet brains stay silent, busy ones tell their admins the numbers, and the platform reports to its own people", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    // A brain with pages but no events this week: on the rota, but silent.
    const quietCo = await seedCompany(t, "Quiet Co");
    const quietAdmin = await seedUser(t, "ADMIN", quietCo);
    await seedSilentPage(t, quietCo);

    // A busy brain: a new page, twenty answers, and one item waiting.
    const busyCo = await seedCompany(t, "Busy Co");
    const busyAdmin = await seedUser(t, "ADMIN", busyCo);
    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      companyId: busyCo,
      kind: "POLICY",
      subjectKey: "returns",
      title: "returns",
      content: "Returns within 30 days.",
      source: "DOCUMENT:doc-1",
    });
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("wikiAnswerTallies", {
        companyId: busyCo,
        dayKey: new Date(now).toISOString().slice(0, 10),
        answered: 20,
        unanswered: 0,
      });
      await ctx.db.insert("wikiOpenQuestions", {
        companyId: busyCo,
        kind: "CONTRADICTION" as const,
        pageKeyA: "POLICY:returns",
        claimA: "30 days.",
        dedupeKey: "k1",
        status: "OPEN" as const,
        raisedAt: now,
      });
    });

    // The platform shelf learned a page and missed a question this week.
    const superId = await seedUser(t, "SUPER_ADMIN");
    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      kind: "POLICY",
      subjectKey: "billing",
      title: "billing",
      content: "Billing runs monthly.",
      source: "DOCUMENT:doc-2",
    });
    await t.mutation(internal.wikiFeedback.recordAnswerOutcomeInternal, {
      question: "How do I reset my password?",
      pageKeys: [],
    });

    const result = await t.action(internal.wikiReport.sendWeeklyReports, {});
    // The busy company and the platform sent; the quiet company did not.
    expect(result).toEqual({ companies: 2 });

    const notifications = await t.run(async (ctx) => ctx.db.query("notifications").collect());
    expect(notifications.filter((n) => n.userId === quietAdmin)).toHaveLength(0);

    const busyBell = notifications.find((n) => n.userId === busyAdmin);
    expect(busyBell?.title).toBe("Your wiki's week");
    expect(busyBell?.body).toContain("1 new pages");
    expect(busyBell?.body).toContain("20 questions answered");
    // 20 answers x 7 minutes: the taster line prices the week in hours.
    expect(busyBell?.body).toContain("roughly 2 hours");
    expect(busyBell?.body).toContain("waiting on a person");

    const platformBell = notifications.find((n) => n.userId === superId);
    expect(platformBell?.title).toBe("The platform wiki's week");
    expect(platformBell?.body).toContain("1 questions the global brain couldn't answer");
    expect(platformBell?.body).toContain("waiting on you");
  });

  test("a week with nothing waiting says so instead of counting to zero", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    const adminId = await seedUser(t, "ADMIN", companyId);
    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      companyId,
      kind: "POLICY",
      subjectKey: "returns",
      title: "returns",
      content: "Returns within 30 days.",
      source: "DOCUMENT:doc-1",
    });

    await t.action(internal.wikiReport.sendWeeklyReports, {});

    const [bell] = await t.run(async (ctx) => ctx.db.query("notifications").collect());
    expect(bell.userId).toBe(adminId);
    expect(bell.body).toContain("Nothing waiting on anyone.");
    // A handful of answers rounds to no hours, so the taster line stays honest.
    expect(bell.body).not.toContain("roughly");
  });
});
