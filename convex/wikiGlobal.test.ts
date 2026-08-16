import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

/**
 * The global shelf's ground rules (global-wiki-plan.md, phase 1): a wiki
 * page with no company on it belongs to the platform's own brain. Nothing
 * company-specific may live there, agent- and thread-scoped documents
 * belong to neither brain, and the wall between shelves holds both ways.
 */

async function seedCompany(t: ReturnType<typeof convexTest>, name = "Wiki Corp") {
  return await t.run(async (ctx) => ctx.db.insert("companies", { name, createdAt: Date.now() }));
}

async function seedGlobalDocument(
  t: ReturnType<typeof convexTest>,
  overrides: Partial<{ title: string; wikiReviewRequested: boolean; agentId: unknown }> = {}
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("knowledgeDocuments", {
      title: overrides.title ?? "How the platform works",
      status: "ready",
      format: "text/plain",
      textContent: "Billing runs monthly. Every workspace gets one shared inbox.",
      ...(overrides.wikiReviewRequested ? { wikiReviewRequested: true } : {}),
      createdAt: Date.now(),
    })
  );
}

describe("the global shelf", () => {
  test("a global document is claimable and comes back with no company", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const documentId = await seedGlobalDocument(t);
    const claim = await t.mutation(internal.wikiDistill.claimDocumentForDistillInternal, {
      documentId,
    });
    expect(claim?.companyId).toBeNull();
    expect(claim?.text).toContain("shared inbox");
  });

  test("an agent-scoped document belongs to neither brain and is never claimed", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    const agentId = await t.run(async (ctx) =>
      ctx.db.insert("agents", {
        name: "Helper",
        description: "",
        systemPrompt: "",
        modelId: "m",
        thinkingMode: false,
        isActive: true,
        isGlobal: false,
        companyId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    const documentId = await t.run(async (ctx) =>
      ctx.db.insert("knowledgeDocuments", {
        agentId,
        title: "Agent notes",
        status: "ready",
        format: "text/plain",
        textContent: "Private to the agent.",
        createdAt: Date.now(),
      })
    );
    await expect(
      t.mutation(internal.wikiDistill.claimDocumentForDistillInternal, { documentId })
    ).resolves.toBeNull();
    await expect(
      t.query(internal.wikiReviews.getReviewableDocumentInternal, { documentId })
    ).resolves.toBeNull();
  });

  test("the catch-up round lists companies only; the global backlog is not a company", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await seedGlobalDocument(t);
    const companies = await t.query(internal.wikiDistill.listCompaniesWithUndistilledInternal, {});
    expect(companies).toEqual([]);
  });

  test("the global shelf refuses CUSTOMER pages, with a trace", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      subjectKey: "acme-ltd",
      title: "Acme Ltd",
      content: "A customer.",
      source: "HUMAN:someone",
      kind: "CUSTOMER",
    });
    const pages = await t.run(async (ctx) => ctx.db.query("wikiPages").take(10));
    expect(pages).toEqual([]);
    const audit = await t.run(async (ctx) => ctx.db.query("auditLogs").take(10));
    expect(audit.some((row) => row.actionType === "WIKI_PAGE_REFUSED")).toBe(true);
  });

  test("a global topic page lands with no company, and the wall holds both ways", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      subjectKey: "billing",
      title: "billing",
      content: "Billing runs monthly.",
      source: "DOCUMENT:doc-1",
      kind: "POLICY",
    });
    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      companyId,
      subjectKey: "delivery",
      title: "delivery",
      content: "We deliver on Fridays.",
      source: "DOCUMENT:doc-2",
      kind: "POLICY",
    });

    const globalIndex = await t.query(internal.wikiPages.getWikiIndexInternal, {
      includeCustomerPages: false,
    });
    const companyIndex = await t.query(internal.wikiPages.getWikiIndexInternal, {
      companyId,
      includeCustomerPages: false,
    });
    expect(globalIndex.map((entry) => entry.key)).toEqual(["POLICY:billing"]);
    expect(companyIndex.map((entry) => entry.key)).toEqual(["POLICY:delivery"]);
  });

  test("the content-carried cutover: the probe flips when the first global page lands", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      companyId,
      subjectKey: "delivery",
      title: "delivery",
      content: "We deliver on Fridays.",
      source: "DOCUMENT:doc-1",
      kind: "POLICY",
    });
    // A company page alone does not flip it: the probe asks about the
    // global shelf, not the wiki at large.
    await expect(t.query(internal.wikiPages.hasGlobalWikiPagesInternal, {})).resolves.toBe(false);
    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      subjectKey: "billing",
      title: "billing",
      content: "Billing runs monthly.",
      source: "DOCUMENT:doc-2",
      kind: "POLICY",
    });
    await expect(t.query(internal.wikiPages.hasGlobalWikiPagesInternal, {})).resolves.toBe(true);
  });

  test("the global shelf answers with its own name on the door", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      subjectKey: "billing",
      title: "billing",
      content: "Billing runs monthly on the first.",
      source: "DOCUMENT:doc-1",
      kind: "POLICY",
    });
    const read = await t.query(internal.wikiPages.getWikiAnswerContextInternal, {
      query: "when does billing run",
      includeCustomerPages: false,
    });
    expect(read.context).toContain("Platform wiki pages that apply to every company");
    expect(read.context).toContain("Billing runs monthly");
    expect(read.pageKeys).toEqual(["POLICY:billing"]);

    const opened = await t.query(internal.wikiPages.getPagesByKeysInternal, {
      keys: ["POLICY:billing"],
      includeCustomerPages: false,
    });
    expect(opened.pageKeys).toEqual(["POLICY:billing"]);
  });

  test("the staff's rotas include the global shelf as one more round", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      companyId,
      subjectKey: "delivery",
      title: "delivery",
      content: "We deliver on Fridays.",
      source: "DOCUMENT:doc-1",
      kind: "POLICY",
    });
    // No global pages: the rota is companies only.
    await expect(
      t.query(internal.wikiTending.listCompaniesWithPagesInternal, {})
    ).resolves.toEqual([companyId]);

    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      subjectKey: "billing",
      title: "billing",
      content: "Billing runs monthly.",
      source: "DOCUMENT:doc-2",
      kind: "POLICY",
    });
    const scopes = await t.query(internal.wikiTending.listCompaniesWithPagesInternal, {});
    expect(scopes).toContain(companyId);
    expect(scopes).toContain(null);

    // The round's reading is walled: the global round sees only the shelf.
    const candidates = await t.query(internal.wikiTending.getTendingCandidatesInternal, {});
    expect(candidates.overgrown.every((page) => page.subjectKey !== "delivery")).toBe(true);
  });

  test("the catch-up sweep knows when the global shelf has unread documents", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await expect(t.query(internal.wikiDistill.hasGlobalUndistilledInternal, {})).resolves.toBe(
      false
    );
    await seedGlobalDocument(t);
    await expect(t.query(internal.wikiDistill.hasGlobalUndistilledInternal, {})).resolves.toBe(
      true
    );
  });

  test("a review-marked global document is readable by the Reviewer", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const documentId = await seedGlobalDocument(t, { wikiReviewRequested: true });
    const reviewable = await t.query(internal.wikiReviews.getReviewableDocumentInternal, {
      documentId,
    });
    expect(reviewable?.companyId).toBeNull();
    expect(reviewable?.title).toBe("How the platform works");
  });
});
