import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

/**
 * The Distiller's action half (wiki-replaces-knowledge plan, stage one).
 * The claim machinery under it is tested in wikiDistill.test.ts; what lives
 * here is the sweep's self-gating — a stood-down Distiller spends nothing,
 * only companies with unread documents get a round, the empty global shelf
 * schedules nothing — the mandatory order (full source note before any
 * synthesis), and the failure path: a model call that throws hands the
 * claim back and records the failed run, instead of leaving the document
 * filed, listed on screen and permanently unread.
 *
 * The model is mocked at the aiProviderRegistry boundary, the same seam
 * gmailWatcher.test.ts uses. Nothing here contacts a real model.
 */

const generateMock = vi.hoisted(() => vi.fn());

vi.mock("./aiProviderRegistry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./aiProviderRegistry")>();
  return {
    ...actual,
    generateTextWithResolvedModel: (...args: unknown[]) => generateMock(...args),
  };
});

function makeTest() {
  return convexTest(schema, import.meta.glob("./**/*.*s"));
}

async function seedCompany(t: ReturnType<typeof convexTest>, name = "Wiki Corp") {
  return await t.run(async (ctx) => ctx.db.insert("companies", { name, createdAt: Date.now() }));
}

async function seedModel(t: ReturnType<typeof convexTest>) {
  await t.run(async (ctx) => {
    await ctx.db.insert("aiModels", {
      modelId: "test-model",
      providerKey: "google",
      providerModelId: "test-provider-model",
      displayName: "Test Model",
      isEnabled: true,
      isDefault: true,
      lastSyncedAt: Date.now(),
    });
  });
}

async function seedDocument(
  t: ReturnType<typeof convexTest>,
  companyId: Awaited<ReturnType<typeof seedCompany>> | undefined,
  overrides: Partial<{
    title: string;
    status: "pending" | "ready";
    textContent: string;
    wikiDistilledAt: number;
  }> = {}
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("knowledgeDocuments", {
      ...(companyId ? { companyId } : {}),
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

async function standDown(t: ReturnType<typeof convexTest>, systemKey: string) {
  await t.mutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});
  await t.run(async (ctx) => {
    const agents = await ctx.db.query("agents").collect();
    const agent = agents.find((candidate) => candidate.systemKey === systemKey);
    if (!agent) throw new Error(`No staff agent seeded for ${systemKey}`);
    await ctx.db.patch(agent._id, { isActive: false });
  });
}

async function staffRuns(t: ReturnType<typeof convexTest>, systemKey: string) {
  return await t.run(async (ctx) => {
    const agents = await ctx.db.query("agents").collect();
    const agent = agents.find((candidate) => candidate.systemKey === systemKey);
    if (!agent) return [];
    const runs = await ctx.db.query("agentRuns").collect();
    return runs.filter((run) => run.agentId === agent._id);
  });
}

async function wikiPageBySubject(t: ReturnType<typeof convexTest>, subjectKey: string) {
  return await t.run(async (ctx) =>
    (await ctx.db.query("wikiPages").collect()).find((page) => page.subjectKey === subjectKey) ??
    null
  );
}

const NO_TOPICS = '{"topics": []}';

afterEach(() => {
  generateMock.mockReset();
});

describe("the catch-up sweep's gates", () => {
  test("a stood-down Distiller spends nothing: the sweep schedules no rounds and the hook reads nothing", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    await seedModel(t);
    const documentId = await seedDocument(t, companyId);
    await standDown(t, "WIKI_DISTILLER");

    await expect(t.action(internal.wikiDistillActions.distilSweep, {})).resolves.toEqual({
      companies: 0,
    });
    await t.action(internal.wikiDistillActions.distilNewDocument, { documentId });

    expect(generateMock).not.toHaveBeenCalled();
    // Never even claimed: standing the Distiller up again finds it waiting.
    const document = await t.run(async (ctx) => ctx.db.get(documentId));
    expect(document?.wikiDistilledAt).toBeUndefined();
  });

  test("only companies with unread documents get a round, and reading writes the full source note first", async () => {
    vi.useFakeTimers();
    try {
      const t = makeTest();
      const busy = await seedCompany(t, "Busy Corp");
      const idle = await seedCompany(t, "Idle Corp");
      await seedModel(t);
      const busyDocId = await seedDocument(t, busy);
      await seedDocument(t, idle, { title: "Old news", wikiDistilledAt: 123 });
      generateMock.mockResolvedValue({ text: NO_TOPICS });

      const result = await t.action(internal.wikiDistillActions.distilSweep, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      expect(result).toEqual({ companies: 1 });
      // The document is its own wiki note, substantially intact, even when
      // synthesis found no topics to write.
      const note = await wikiPageBySubject(t, busyDocId);
      expect(note?.kind).toBe("SOURCE");
      expect(note?.content).toContain("paid discovery week");
      // The idle company's already-read shelf was never touched.
      const pages = await t.run(async (ctx) => ctx.db.query("wikiPages").collect());
      expect(pages.every((page) => page.companyId === busy)).toBe(true);

      const runs = await staffRuns(t, "WIKI_DISTILLER");
      expect(runs).toHaveLength(1);
      expect(runs[0].finalOutput).toContain("Read 1 documents");
    } finally {
      vi.useRealTimers();
    }
  });

  test("the empty global shelf schedules nothing; a stocked one gets its own round", async () => {
    vi.useFakeTimers();
    try {
      const t = makeTest();
      await seedModel(t);
      // Nothing anywhere: no company rounds, no global round.
      await expect(t.action(internal.wikiDistillActions.distilSweep, {})).resolves.toEqual({
        companies: 0,
      });

      const globalDocId = await seedDocument(t, undefined, { title: "Platform handbook" });
      generateMock.mockResolvedValue({ text: NO_TOPICS });

      const result = await t.action(internal.wikiDistillActions.distilSweep, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      expect(result).toEqual({ companies: 1 });
      const note = await wikiPageBySubject(t, globalDocId);
      expect(note?.kind).toBe("SOURCE");
      expect(note?.companyId).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the on-ready hook", () => {
  test("it claims before it spends: an already-read document never reaches the model", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    await seedModel(t);
    const documentId = await seedDocument(t, companyId, { wikiDistilledAt: 123 });

    await t.action(internal.wikiDistillActions.distilNewDocument, { documentId });

    expect(generateMock).not.toHaveBeenCalled();
    expect(await wikiPageBySubject(t, documentId)).toBeNull();
    expect(await staffRuns(t, "WIKI_DISTILLER")).toHaveLength(0);
  });

  test("a new document teaches the wiki: source note, topic page, links both ways, and the work on the meter", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    await seedModel(t);
    const documentId = await seedDocument(t, companyId);
    generateMock
      .mockResolvedValueOnce({
        text: '{"topics": [{"kind": "POLICY", "slug": "how-we-work", "learned": "Discovery is paid."}]}',
        inputTokens: 11,
        outputTokens: 5,
      })
      .mockResolvedValueOnce({
        text: "Every project starts with a paid discovery week.",
        inputTokens: 13,
        outputTokens: 7,
      });

    await t.action(internal.wikiDistillActions.distilNewDocument, { documentId });

    const note = await wikiPageBySubject(t, documentId);
    const topic = await wikiPageBySubject(t, "how-we-work");
    expect(note?.kind).toBe("SOURCE");
    expect(topic?.content).toBe("Every project starts with a paid discovery week.");
    // Every topic links down to the note it stands on, the note up to each
    // topic it taught.
    expect(topic?.links).toContain(`SOURCE:${documentId}`);
    expect(note?.links).toContain("POLICY:how-we-work");

    const runs = await staffRuns(t, "WIKI_DISTILLER");
    expect(runs).toHaveLength(1);
    expect(runs[0].finalOutput).toContain("Wrote 1 pages");
    // Both model calls landed on the cost ledger the dashboards read — the
    // staff once worked for weeks with these screens reading zero.
    const transactions = await t.run(async (ctx) => ctx.db.query("agentTransactions").collect());
    expect(transactions).toHaveLength(2);
  });

  test("a model failure hands the claim back: the note is kept, the document queues again, and the failed run says so", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    await seedModel(t);
    const documentId = await seedDocument(t, companyId);
    generateMock.mockRejectedValue(new Error("model unavailable"));

    await t.action(internal.wikiDistillActions.distilNewDocument, { documentId });

    // Full import first means the mechanical note survives the failure.
    expect((await wikiPageBySubject(t, documentId))?.kind).toBe("SOURCE");
    // The claim went back, so the sweep can find the document again — the
    // lost-document bug (2026-08-20) was exactly this claim never returning.
    const document = await t.run(async (ctx) => ctx.db.get(documentId));
    expect(document?.wikiDistilledAt).toBeUndefined();
    expect(document?.wikiDistillAttempts).toBe(1);
    await expect(
      t.mutation(internal.wikiDistill.claimDocumentForDistillInternal, { documentId })
    ).resolves.not.toBeNull();

    // Recorded as a run either way: a failing Distiller must not show
    // "Active" with an empty history and read as merely idle.
    const runs = await staffRuns(t, "WIKI_DISTILLER");
    expect(runs).toHaveLength(1);
    expect(runs[0].finalOutput).toContain("Failed on attempt 1");
    expect(runs[0].finalOutput).toContain("back in the queue");
  });
});

describe("the batch worker", () => {
  test("an empty backlog returns without recording a phantom run", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    await seedModel(t);
    await t.mutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});

    await t.action(internal.wikiDistillActions.distilCompanyBatch, { companyId });

    expect(generateMock).not.toHaveBeenCalled();
    expect(await staffRuns(t, "WIKI_DISTILLER")).toHaveLength(0);
  });

  test("one bad document does not wedge the batch: the round is still recorded and the chain drains", async () => {
    vi.useFakeTimers();
    try {
      const t = makeTest();
      const companyId = await seedCompany(t);
      await seedModel(t);
      await t.mutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});
      await seedDocument(t, companyId, { title: "One" });
      await seedDocument(t, companyId, { title: "Two" });
      generateMock.mockRejectedValue(new Error("model unavailable"));

      await t.action(internal.wikiDistillActions.distilCompanyBatch, { companyId });
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const runs = await staffRuns(t, "WIKI_DISTILLER");
      expect(runs).toHaveLength(1);
      expect(runs[0].finalOutput).toContain("Read 2 documents");
      expect(runs[0].finalOutput).toContain("wrote 0 pages");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the mechanical source-note doors", () => {
  test("the backfill is idempotent: one note, one receipt, however often it runs, and never a model call", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    await seedDocument(t, companyId, { wikiDistilledAt: 123 });

    await expect(
      t.action(internal.wikiDistillActions.backfillSourceNotes, { companyId })
    ).resolves.toEqual({ notes: 1 });
    await expect(
      t.action(internal.wikiDistillActions.backfillSourceNotes, { companyId })
    ).resolves.toEqual({ notes: 1 });

    const { notes, receipts } = await t.run(async (ctx) => {
      const pages = (await ctx.db.query("wikiPages").collect()).filter(
        (page) => page.kind === "SOURCE"
      );
      return {
        notes: pages,
        receipts: await ctx.db.query("wikiPageSources").collect(),
      };
    });
    expect(notes).toHaveLength(1);
    expect(receipts).toHaveLength(1);
    expect(generateMock).not.toHaveBeenCalled();
  });

  test("a re-ingested document refreshes its note as a revision — no model anywhere", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    const documentId = await seedDocument(t, companyId, { wikiDistilledAt: 123 });

    await t.action(internal.wikiDistillActions.refreshSourceNote, { documentId });
    await t.run(async (ctx) =>
      ctx.db.patch(documentId, { textContent: "Discovery is now a fortnight." })
    );
    await t.action(internal.wikiDistillActions.refreshSourceNote, { documentId });

    const note = await wikiPageBySubject(t, documentId);
    expect(note?.content).toBe("Discovery is now a fortnight.");
    // The old text is a revision, not a loss.
    const revisions = await t.run(async (ctx) => ctx.db.query("wikiPageRevisions").collect());
    expect(revisions).toHaveLength(1);
    expect(revisions[0].content).toContain("paid discovery week");
    expect(generateMock).not.toHaveBeenCalled();
  });
});
