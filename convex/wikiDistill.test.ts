import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { WIKI_DISTILL_BATCH_SIZE, WIKI_DISTILL_MAX_ATTEMPTS } from "./wikiDistill";
import { WIKI_STAFF } from "./wikiStaff";
import { isWikiStaffKey } from "./wikiStaffRunActions";
import { stitchChunks } from "./wikiDistill";
import {
  parseDocumentTopicSuggestions,
  parseSourceKey,
  changedSentences,
  relevantPassages,
  splitDocumentIntoSections,
  subjectWords,
  WIKI_TOPICS_PER_SECTION,
} from "./wikiRewriteService";
import { chunkKnowledgeText } from "./utils/knowledgeActionsService";

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
  test("bad kinds and bad slugs are dropped; client work counts; a section names at most twenty", () => {
    const suggestions = parseDocumentTopicSuggestions(
      JSON.stringify({
        topics: [
          { kind: "PRODUCT", slug: "Web Development", learned: "Bespoke builds." },
          { kind: "POLICY", slug: "How We Work!", learned: "Paid discovery first." },
          { kind: "NAVIGATION", slug: "menu", learned: "Dropped." },
          { kind: "ISSUE", slug: "hosting-questions", learned: "Keeps coming up." },
          { kind: "CLIENT", slug: "Papa Johns", learned: "An ordering app." },
          ...Array.from({ length: 25 }, (_, i) => ({ kind: "CLIENT", slug: `client-${i}`, learned: "Work." })),
        ],
      })
    );
    expect(suggestions).toHaveLength(WIKI_TOPICS_PER_SECTION);
    expect(suggestions.slice(0, 4).map((suggestion) => suggestion.slug)).toEqual([
      "web-development",
      "how-we-work",
      "hosting-questions",
      "papa-johns",
    ]);
    expect(suggestions[3].kind).toBe("CLIENT");
  });

  test("a document is cut into sections that keep every word, in order, none too long", () => {
    expect(splitDocumentIntoSections("  Short note.  ")).toEqual(["Short note."]);
    expect(splitDocumentIntoSections("   ")).toEqual([]);
    const paragraphs = Array.from({ length: 60 }, (_, i) => `Client ${i} asked us for help. We built it in ${i} weeks.`);
    const text = paragraphs.join("\n\n");
    const sections = splitDocumentIntoSections(text, 500);
    expect(sections.length).toBeGreaterThan(1);
    for (const section of sections) expect(section.length).toBeLessThanOrEqual(500);
    // Split between paragraphs, so no client is cut in half.
    expect(sections.join("\n\n")).toBe(text);
    // One endless line still splits, and still loses nothing.
    const endless = "word ".repeat(400).trim();
    const pieces = splitDocumentIntoSections(endless, 300);
    expect(pieces.join(" ")).toBe(endless);
  });

  test("stored pieces are joined back into the document's own text, without the repeats", () => {
    const original = Array.from({ length: 80 }, (_, i) => `Sentence number ${i} about a client project.`).join(" ");
    expect(stitchChunks(chunkKnowledgeText(original))).toBe(original);
  });
});

describe("finding what a long file says about one page (2026-11-12)", () => {
  test("a page's subject words come from its name", () => {
    expect(subjectWords("papa-johns", "papa-johns")).toEqual(["papa", "johns"]);
    expect(subjectWords("clients-index")).toEqual(["clients"]);
  });

  test("the parts about the subject are found wherever they are, in order", () => {
    const text = `${"Other client work. ".repeat(3000)}Waterstones asked us for a bookshop app. ${"More work. ".repeat(500)}`;
    const passages = relevantPassages(text, ["waterstones"], 6_000);
    expect(passages).toContain("Waterstones asked us for a bookshop app.");
    expect(passages.length).toBeLessThanOrEqual(6_000);
    // Nothing about the subject: the opening, as before.
    expect(relevantPassages(text, ["nobody"], 100)).toBe(text.slice(0, 100));
  });

  test("only the sentences that changed are reported, however far in", () => {
    const opening = "Opening sentence number one. ".repeat(400);
    const before = `${opening}Papa Johns launched on Black Friday. The app rating rose to four stars.`;
    const after = `${opening}Papa Johns launched on Black Friday. The app rating rose to five stars.`;
    const { removed, added } = changedSentences(before, after);
    expect(removed).toBe("The app rating rose to four stars.");
    expect(added).toBe("The app rating rose to five stars.");
    expect(changedSentences(before, before)).toEqual({ removed: "", added: "" });
  });
});

describe("reading the whole document (2026-11-12)", () => {
  async function seedChunks(
    t: ReturnType<typeof convexTest>,
    companyId: Awaited<ReturnType<typeof seedCompany>>,
    text: string
  ) {
    return await t.run(async (ctx) => {
      const documentId = await ctx.db.insert("knowledgeDocuments", {
        companyId,
        title: "Clients and case studies",
        status: "ready",
        format: "application/pdf",
        createdAt: Date.now(),
      });
      for (const chunk of chunkKnowledgeText(text)) {
        await ctx.db.insert("knowledgeChunks", {
          documentId,
          companyId,
          isGlobal: false,
          text: chunk,
          embedding: [0],
        });
      }
      return documentId;
    });
  }

  test("a long uploaded file is read past its first twelve pieces, to the last client", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    const text = Array.from({ length: 60 }, (_, i) => `Client number ${i} had an app built for them.`).join(" ") +
      " The last client was Waterstones.";
    const documentId = await seedChunks(t, companyId, text.repeat(4));
    const claimed = await t.mutation(internal.wikiDistill.claimDocumentForDistillInternal, { documentId });
    expect(claimed?.text.length).toBeGreaterThan(8_000);
    expect(claimed?.text.endsWith("The last client was Waterstones.")).toBe(true);
  });

  test("a later section is only handed out for a document the wiki has claimed", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    const long = "Papa Johns asked us for an app. ".repeat(600);
    const documentId = await seedDocument(t, companyId, { textContent: long });

    expect(await t.query(internal.wikiDistill.getDocumentSectionInternal, { documentId, sectionIndex: 1 })).toBeNull();
    await t.mutation(internal.wikiDistill.claimDocumentForDistillInternal, { documentId });
    const second = await t.query(internal.wikiDistill.getDocumentSectionInternal, { documentId, sectionIndex: 1 });
    expect(second?.sectionCount).toBeGreaterThan(1);
    expect(second?.section).toContain("Papa Johns");
    expect(
      await t.query(internal.wikiDistill.getDocumentSectionInternal, { documentId, sectionIndex: 99 })
    ).toBeNull();
  });

  test("re-learning hands back one company's read documents and nobody else's", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    const otherId = await seedCompany(t, "Other Corp");
    const read = await seedDocument(t, companyId, { wikiDistilledAt: 123 });
    const waiting = await seedDocument(t, companyId);
    const pending = await seedDocument(t, companyId, { status: "pending", wikiDistilledAt: 123 });
    const others = await seedDocument(t, otherId, { wikiDistilledAt: 123 });

    const result = await t.mutation(internal.wikiDistill.relearnCompanyDocumentsInternal, { companyId });

    expect(result.documents).toBe(1);
    const after = await t.run(async (ctx) => ({
      read: await ctx.db.get(read),
      waiting: await ctx.db.get(waiting),
      pending: await ctx.db.get(pending),
      others: await ctx.db.get(others),
    }));
    expect(after.read?.wikiDistilledAt).toBeUndefined();
    expect(after.waiting?.wikiDistilledAt).toBeUndefined();
    expect(after.pending?.wikiDistilledAt).toBe(123);
    expect(after.others?.wikiDistilledAt).toBe(123);
  });
});

/**
 * The lost-document bug (2026-08-20). The claim was stamped before the
 * model was called and never handed back, so one bad model call left the
 * document filed, listed on screen, and permanently unread by the wiki —
 * with nothing anywhere saying so.
 */
describe("a claim handed back after a failure", () => {
  test("the document goes back in the queue and the sweep can find it again", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    const documentId = await seedDocument(t, companyId, { textContent: "The deck." });

    const claimed = await t.mutation(internal.wikiDistill.claimDocumentForDistillInternal, {
      documentId,
    });
    expect(claimed).not.toBeNull();

    const released = await t.mutation(internal.wikiDistill.releaseDistillClaimInternal, {
      documentId,
    });
    expect(released).toEqual({ released: true, attempts: 1 });

    // Claimable again — which is the whole point.
    const reclaimed = await t.mutation(internal.wikiDistill.claimDocumentForDistillInternal, {
      documentId,
    });
    expect(reclaimed).not.toBeNull();
  });

  test("it gives up after the third failure rather than retrying for ever", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    const documentId = await seedDocument(t, companyId, { textContent: "The deck." });

    for (let attempt = 1; attempt < WIKI_DISTILL_MAX_ATTEMPTS; attempt += 1) {
      await t.mutation(internal.wikiDistill.claimDocumentForDistillInternal, { documentId });
      const outcome = await t.mutation(internal.wikiDistill.releaseDistillClaimInternal, {
        documentId,
      });
      expect(outcome).toEqual({ released: true, attempts: attempt });
    }

    await t.mutation(internal.wikiDistill.claimDocumentForDistillInternal, { documentId });
    expect(
      await t.mutation(internal.wikiDistill.releaseDistillClaimInternal, { documentId })
    ).toEqual({ released: false, attempts: WIKI_DISTILL_MAX_ATTEMPTS });

    // Stays claimed: a document that fails every time is not a retry
    // problem, and the run history is where that now shows.
    expect(
      await t.mutation(internal.wikiDistill.claimDocumentForDistillInternal, { documentId })
    ).toBeNull();
  });
});

/**
 * Pressing Run on a wiki agent (2026-08-20).
 *
 * The staff's work is a sweep over every wiki on the platform, not a model
 * call with a prompt. Starting one on the ordinary agent loop produced a
 * paragraph about the work and filed nothing, which on screen is
 * indistinguishable from an agent that never runs.
 */
describe("a wiki agent's Run does its round", () => {
  test("every staff member carries a standing job, so nothing asks what to do", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await t.mutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});

    const staff = await t.run(async (ctx) =>
      ctx.db
        .query("agents")
        .withIndex("by_active_created", (q) => q.eq("isActive", true))
        .take(100)
    );

    const wikiStaff = staff.filter((agent) => agent.systemKey?.startsWith("WIKI_"));
    expect(wikiStaff.length).toBe(WIKI_STAFF.length);
    for (const agent of wikiStaff) {
      expect(agent.standingObjective?.trim()).toBeTruthy();
    }
  });

  test("the staff are routed to their round rather than the ordinary agent loop", async () => {
    // Every member the registry names has a round or an honest reason it has
    // none, so Run can never land on a staff key nothing handles.
    for (const member of WIKI_STAFF) {
      expect(isWikiStaffKey(member.systemKey)).toBe(true);
    }
    expect(isWikiStaffKey("SOME_OTHER_AGENT")).toBe(false);
    expect(isWikiStaffKey(undefined)).toBe(false);
  });
});
