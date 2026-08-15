import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

/**
 * Phase 1's ground rules (wiki-agents plan): a disagreement is raised once
 * however many nights it stands, closes itself when the pages change so
 * the claim no longer stands, is dismissable by a person with an audit
 * row, and never leaks across the tenant wall.
 */

async function seedCompany(t: ReturnType<typeof convexTest>, name = "Wiki Corp") {
  return await t.run(async (ctx) => ctx.db.insert("companies", { name, createdAt: Date.now() }));
}

async function seedPolicyPage(
  t: ReturnType<typeof convexTest>,
  companyId: Awaited<ReturnType<typeof seedCompany>>,
  subjectKey: string,
  content: string
) {
  await t.mutation(internal.wikiPages.applyRewriteInternal, {
    companyId,
    kind: "POLICY",
    subjectKey,
    title: subjectKey,
    content,
    source: "DOCUMENT:doc-1",
  });
}

describe("open questions", () => {
  test("the same disagreement is raised once, and closes itself when a page changes", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    await seedPolicyPage(t, companyId, "delivery-times", "Deliveries go out Tuesdays and Fridays.");
    await seedPolicyPage(t, companyId, "shipping", "Deliveries go out only on Mondays.");

    const raise = () =>
      t.mutation(internal.wikiQuestions.raiseQuestionInternal, {
        companyId,
        kind: "CONTRADICTION",
        pageKeyA: "POLICY:delivery-times",
        claimA: "Deliveries go out Tuesdays and Fridays.",
        pageKeyB: "POLICY:shipping",
        claimB: "Deliveries go out only on Mondays.",
        dedupeKey: "CONTRADICTION::pair::claims",
      });
    await expect(raise()).resolves.toBe(true);
    await expect(raise()).resolves.toBe(false);

    // A person settles it by editing the wrong page; the sweep notices.
    await seedPolicyPage(t, companyId, "shipping", "Deliveries follow the delivery-times page.");
    const resolved = await t.mutation(internal.wikiQuestions.autoResolveStaleQuestionsInternal, {
      companyId,
    });
    expect(resolved).toBe(1);
    const open = await t.run(async (ctx) =>
      (await ctx.db.query("wikiOpenQuestions").collect()).filter((q) => q.status === "OPEN")
    );
    expect(open).toHaveLength(0);
  });

  test("dismissal is audited and walled to the company", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyA = await seedCompany(t, "Company A");
    const companyB = await seedCompany(t, "Company B");
    await seedPolicyPage(t, companyA, "delivery-times", "Tuesdays and Fridays.");
    await t.mutation(internal.wikiQuestions.raiseQuestionInternal, {
      companyId: companyA,
      kind: "CONTRADICTION",
      pageKeyA: "POLICY:delivery-times",
      claimA: "Tuesdays and Fridays.",
      dedupeKey: "k1",
    });
    const questionId = await t.run(async (ctx) => (await ctx.db.query("wikiOpenQuestions").first())!._id);

    const adminB = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "b@test.com", role: "ADMIN", companyId: companyB })
    );
    await expect(
      t
        .withIdentity({ subject: adminB })
        .mutation(api.wikiQuestions.dismissOpenQuestionForCompany, {
          companyId: companyB,
          questionId,
        })
    ).rejects.toThrow();

    const adminA = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "a@test.com", role: "ADMIN", companyId: companyA })
    );
    await t
      .withIdentity({ subject: adminA })
      .mutation(api.wikiQuestions.dismissOpenQuestionForCompany, {
        companyId: companyA,
        questionId,
      });
    const { question, auditRows } = await t.run(async (ctx) => ({
      question: await ctx.db.get(questionId),
      auditRows: (await ctx.db.query("auditLogs").collect()).filter(
        (entry) => entry.actionType === "WIKI_QUESTION_DISMISSED"
      ),
    }));
    expect(question?.status).toBe("DISMISSED");
    expect(auditRows).toHaveLength(1);
  });

  test("the finder's reading list is synthesis pages only", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    await seedPolicyPage(t, companyId, "delivery-times", "Tuesdays and Fridays.");
    await t.mutation(internal.wikiPages.upsertSourceNoteInternal, {
      companyId,
      documentId: "doc-1",
      title: "The raw document",
      text: "Full document text.",
      sourceLabel: "Website · x",
    });
    await t.mutation(internal.wikiPages.refreshHubPagesInternal, { companyId });

    const cluster = await t.query(internal.wikiQuestions.getContradictionClusterInternal, {
      companyId,
      kind: "POLICY",
    });
    expect(cluster.map((page) => page.pageKey)).toEqual(["POLICY:delivery-times"]);
  });
});
