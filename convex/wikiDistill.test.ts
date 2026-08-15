import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { WIKI_DISTILL_BATCH_SIZE } from "./wikiDistill";
import { parseDocumentTopicSuggestions, parseSourceKey } from "./wikiRewriteService";

/**
 * Stage one's ground rules (wiki-replaces-knowledge plan): a document is
 * claimed before any model reads it, so it is read exactly once whatever
 * the timing; the catch-up sweep only visits companies with unread
 * documents; receipts land once per page-and-source pair; and the tenant
 * wall holds everywhere.
 */

async function seedCompany(t: ReturnType<typeof convexTest>, name = "Wiki Corp") {
  return await t.run(async (ctx) => ctx.db.insert("companies", { name, createdAt: Date.now() }));
}

async function seedDocument(
  t: ReturnType<typeof convexTest>,
  companyId: Awaited<ReturnType<typeof seedCompany>>,
  overrides: Partial<{
    title: string;
    status: "pending" | "ready";
    textContent: string;
    wikiDistilledAt: number;
  }> = {}
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("knowledgeDocuments", {
      companyId,
      title: overrides.title ?? "How we work",
      status: overrides.status ?? "ready",
      format: "text/plain",
      textContent: overrides.textContent ?? "Every project starts with a paid discovery week.",
      ...(overrides.wikiDistilledAt !== undefined
        ? { wikiDistilledAt: overrides.wikiDistilledAt }
        : {}),
      createdAt: Date.now(),
    })
  );
}

describe("claiming before reading", () => {
  test("a ready document is claimed exactly once; pending and already-read never", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    const readyId = await seedDocument(t, companyId);
    const pendingId = await seedDocument(t, companyId, { status: "pending" });
    const doneId = await seedDocument(t, companyId, { wikiDistilledAt: 123 });

    const first = await t.mutation(internal.wikiDistill.claimDocumentForDistillInternal, {
      documentId: readyId,
    });
    expect(first?.text).toContain("paid discovery week");

    // The claim is the lock: the same document is never handed out again.
    await expect(
      t.mutation(internal.wikiDistill.claimDocumentForDistillInternal, { documentId: readyId })
    ).resolves.toBeNull();
    await expect(
      t.mutation(internal.wikiDistill.claimDocumentForDistillInternal, { documentId: pendingId })
    ).resolves.toBeNull();
    await expect(
      t.mutation(internal.wikiDistill.claimDocumentForDistillInternal, { documentId: doneId })
    ).resolves.toBeNull();
  });

  test("the sweep's batch claims a bounded set, then the rest, then nothing", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    const other = await seedCompany(t, "Other Corp");
    for (let i = 0; i < WIKI_DISTILL_BATCH_SIZE + 2; i++) {
      await seedDocument(t, companyId, { title: `Page ${i}` });
    }
    await seedDocument(t, other, { title: "Foreign page" });

    const first = await t.mutation(internal.wikiDistill.claimNextDistillBatchInternal, { companyId });
    expect(first).toHaveLength(WIKI_DISTILL_BATCH_SIZE);
    const second = await t.mutation(internal.wikiDistill.claimNextDistillBatchInternal, { companyId });
    expect(second).toHaveLength(2);
    // The wall: another company's documents were never touched.
    expect([...first, ...second].every((doc) => !doc.title.includes("Foreign"))).toBe(true);
    await expect(
      t.mutation(internal.wikiDistill.claimNextDistillBatchInternal, { companyId })
    ).resolves.toEqual([]);
  });

  test("only companies with unread documents are on the sweep's round", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const busy = await seedCompany(t, "Busy Corp");
    const idle = await seedCompany(t, "Idle Corp");
    await seedDocument(t, busy);
    await seedDocument(t, idle, { wikiDistilledAt: 123 });

    await expect(
      t.query(internal.wikiDistill.listCompaniesWithUndistilledInternal, {})
    ).resolves.toEqual([busy]);
  });
});

describe("progress the screen can trust", () => {
  test("progress accumulates and finishes honestly", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    await seedDocument(t, companyId, { title: "One" });
    await seedDocument(t, companyId, { title: "Two", wikiDistilledAt: 123 });

    await t.mutation(internal.wikiDistill.recordDistillProgressInternal, {
      companyId,
      documentsRead: 1,
      pagesWritten: 2,
      pagesImproved: 0,
      lastDocumentTitle: "Two",
    });
    await t.mutation(internal.wikiDistill.recordDistillProgressInternal, {
      companyId,
      documentsRead: 1,
      pagesWritten: 0,
      pagesImproved: 3,
    });

    const adminId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "admin@wiki.test", role: "ADMIN", companyId })
    );
    const progress = await t
      .withIdentity({ subject: adminId })
      .query(api.wikiDistill.getDistillProgressForCompany, { companyId });
    expect(progress).toMatchObject({
      totalDocuments: 2,
      remainingDocuments: 1,
      documentsRead: 2,
      pagesWritten: 2,
      pagesImproved: 3,
      lastDocumentTitle: "Two",
      isReading: true,
    });
  });
});

describe("receipts", () => {
  test("a document teaches a page once: one receipt, counted once, however often it looks", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);

    for (const content of ["First lesson.", "First lesson.", "Second lesson."]) {
      await t.mutation(internal.wikiPages.applyRewriteInternal, {
        companyId,
        kind: "POLICY",
        subjectKey: "how-we-work",
        title: "how-we-work",
        content,
        source: "DOCUMENT:doc-1",
        sourceLabel: "Website · ronins.co.uk/how-we-work",
      });
    }
    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      companyId,
      kind: "POLICY",
      subjectKey: "how-we-work",
      title: "how-we-work",
      content: "Third lesson.",
      source: "DOCUMENT:doc-2",
      sourceLabel: "Website · ronins.co.uk/discovery",
    });

    const { receipts, page } = await t.run(async (ctx) => {
      const page = await ctx.db
        .query("wikiPages")
        .withIndex("by_company_kind_subject", (q) =>
          q.eq("companyId", companyId).eq("kind", "POLICY").eq("subjectKey", "how-we-work")
        )
        .unique();
      return {
        page,
        receipts: await ctx.db
          .query("wikiPageSources")
          .withIndex("by_page", (q) => q.eq("pageId", page!._id))
          .collect(),
      };
    });
    expect(receipts.map((receipt) => receipt.label).sort()).toEqual([
      "Website · ronins.co.uk/discovery",
      "Website · ronins.co.uk/how-we-work",
    ]);
    expect(page?.documentSourceCount).toBe(2);
  });

  test("the source string decomposes honestly, and tending leaves no receipt", () => {
    expect(parseSourceKey("DOCUMENT:doc-1")).toEqual({ kind: "DOCUMENT", ref: "doc-1" });
    expect(parseSourceKey("PHONE_CALL:call-9")).toEqual({ kind: "PHONE_CALL", ref: "call-9" });
    expect(parseSourceKey("TENDING")).toBeNull();
    expect(parseSourceKey("MYSTERY:x")).toBeNull();
  });
});

describe("the document topic contract", () => {
  test("bad kinds, bad slugs and excess are dropped; three at most", () => {
    const suggestions = parseDocumentTopicSuggestions(
      JSON.stringify({
        topics: [
          { kind: "PRODUCT", slug: "Web Development", learned: "Bespoke builds." },
          { kind: "POLICY", slug: "How We Work!", learned: "Paid discovery first." },
          { kind: "NAVIGATION", slug: "menu", learned: "Dropped." },
          { kind: "ISSUE", slug: "hosting-questions", learned: "Keeps coming up." },
          { kind: "POLICY", slug: "over-the-cap", learned: "Fourth, dropped." },
        ],
      })
    );
    expect(suggestions.map((suggestion) => suggestion.slug)).toEqual([
      "web-development",
      "how-we-work",
      "hosting-questions",
    ]);
  });
});
