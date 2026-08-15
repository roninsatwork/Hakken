import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { WIKI_FRESHNESS_AGE_MS, WIKI_FRESHNESS_BATCH } from "./wikiFreshness";

/**
 * Phase 2's ground rules (wiki-agents plan): only aging, document-taught
 * synthesis pages are checked, a handful per night; verification stamps
 * without rewriting; and the sources' own text is what pages are read
 * against.
 */

async function seedCompany(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => ctx.db.insert("companies", { name: "Wiki Corp", createdAt: Date.now() }));
}

describe("the freshness checker's reading list", () => {
  test("only aging, document-taught pages are due — a handful at most", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    const old = Date.now() - WIKI_FRESHNESS_AGE_MS - 60_000;

    // Aging pages taught by a document: due.
    for (let i = 0; i < WIKI_FRESHNESS_BATCH + 2; i++) {
      await t.mutation(internal.wikiPages.applyRewriteInternal, {
        companyId,
        kind: "POLICY",
        subjectKey: `aging-${i}`,
        title: `aging-${i}`,
        content: "An aging claim.",
        source: "DOCUMENT:doc-1",
      });
    }
    // A fresh page, a conversation-taught page, and a source note: not due.
    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      companyId,
      kind: "POLICY",
      subjectKey: "fresh",
      title: "fresh",
      content: "A fresh claim.",
      source: "DOCUMENT:doc-1",
    });
    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      companyId,
      subjectKey: "call-taught",
      title: "call-taught",
      content: "From a call.",
      source: "PHONE_CALL:1",
    });
    await t.run(async (ctx) => {
      for (const page of await ctx.db.query("wikiPages").collect()) {
        if (page.subjectKey.startsWith("aging-") || page.subjectKey === "call-taught") {
          await ctx.db.patch(page._id, { updatedAt: old });
        }
      }
    });

    const due = await t.query(internal.wikiFreshness.getFreshnessCandidatesInternal, { companyId });
    expect(due.length).toBe(WIKI_FRESHNESS_BATCH);
    expect(due.every((page) => page.pageKey.startsWith("POLICY:aging-"))).toBe(true);

    // A verified page leaves the list without being rewritten.
    await t.mutation(internal.wikiFreshness.markVerifiedInternal, { pageId: due[0].pageId });
    const after = await t.query(internal.wikiFreshness.getFreshnessCandidatesInternal, { companyId });
    expect(after.map((page) => page.pageId)).not.toContain(due[0].pageId);
    const page = await t.run(async (ctx) => ctx.db.get(due[0].pageId));
    expect(page?.content).toBe("An aging claim.");
    expect(page?.lastVerifiedAt).toBeGreaterThan(0);
  });

  test("the check reads the kept document text behind the page", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    const documentId = await t.run(async (ctx) =>
      ctx.db.insert("knowledgeDocuments", {
        companyId,
        title: "How we work",
        status: "ready",
        format: "text/plain",
        textContent: "Every project starts with a paid discovery week.",
        createdAt: Date.now(),
      })
    );
    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      companyId,
      kind: "POLICY",
      subjectKey: "how-we-work",
      title: "how-we-work",
      content: "Discovery is paid.",
      source: `DOCUMENT:${documentId}`,
    });
    const pageId = await t.run(async (ctx) => (await ctx.db.query("wikiPages").first())!._id);

    const sources = await t.query(internal.wikiFreshness.getSourceTextsForPageInternal, { pageId });
    expect(sources.texts).toHaveLength(1);
    expect(sources.texts[0]).toContain("paid discovery week");
    expect(sources.missingSources).toBe(0);
  });
});
