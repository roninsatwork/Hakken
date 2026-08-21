import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { WIKI_TENDING_LENGTH_THRESHOLD } from "./wikiTending";

/**
 * The nightly gardener's action half (wiki plan, phase 4). The queries under
 * it are tested in wikiTending.test.ts; what lives here is the sweep's
 * self-gating — a stood-down Tidier spends nothing, a tidy garden costs
 * nothing tonight — and the two ways a model answer must fail safely: a tidy
 * that grew the page is refused, and a model call that throws leaves the
 * page standing and the sweep moving. These run unattended on every
 * deployment; a silent regression here is invisible until someone notices
 * the wiki has stopped tending itself.
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

/** The fast tier the sweeps resolve; without it nothing can price a call. */
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

async function seedCustomerPage(
  t: ReturnType<typeof convexTest>,
  companyId: Awaited<ReturnType<typeof seedCompany>>,
  overrides: Partial<{ subjectKey: string; content: string; links: string[] }> = {}
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("wikiPages", {
      companyId,
      kind: "CUSTOMER" as const,
      subjectKey: overrides.subjectKey ?? "acme",
      title: overrides.subjectKey ?? "acme",
      content: overrides.content ?? "Short note.",
      links: overrides.links ?? [],
      pinnedCorrections: [],
      rewriteCount: 1,
      lastRewriteSource: "PHONE_CALL:1",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );
}

/** The switch the sweeps honour: the agent row's own isActive flag. */
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

const OVERGROWN = "x".repeat(WIKI_TENDING_LENGTH_THRESHOLD + 10);

afterEach(() => {
  generateMock.mockReset();
});

describe("the tending dispatcher's gates", () => {
  test("a stood-down Tidier spends nothing: no company is visited, no model is called, no run appears", async () => {
    vi.useFakeTimers();
    try {
      const t = makeTest();
      const companyId = await seedCompany(t);
      await seedModel(t);
      await seedCustomerPage(t, companyId, { content: OVERGROWN });
      await standDown(t, "WIKI_TIDIER");

      const result = await t.action(internal.wikiTendingActions.tendDispatcher, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      expect(result).toEqual({ companies: 0 });
      expect(generateMock).not.toHaveBeenCalled();
      expect(await staffRuns(t, "WIKI_TIDIER")).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  test("only gardens with weeds get a visit: the tidy company costs nothing, the overgrown page comes back shorter", async () => {
    vi.useFakeTimers();
    try {
      const t = makeTest();
      const weedy = await seedCompany(t, "Weedy Corp");
      const tidy = await seedCompany(t, "Tidy Corp");
      await seedModel(t);
      const overgrownId = await seedCustomerPage(t, weedy, { content: OVERGROWN });
      const tidyPageId = await seedCustomerPage(t, tidy, { content: "Already brief." });
      generateMock.mockResolvedValue({ text: "Tidied.", inputTokens: 7, outputTokens: 3 });

      const result = await t.action(internal.wikiTendingActions.tendDispatcher, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      expect(result).toEqual({ companies: 1 });
      // Exactly one model call: the tidy company's round never reached one.
      expect(generateMock).toHaveBeenCalledTimes(1);

      const { overgrown, untouched } = await t.run(async (ctx) => ({
        overgrown: await ctx.db.get(overgrownId),
        untouched: await ctx.db.get(tidyPageId),
      }));
      // The tidy lands through the audited rewrite door, marked as tending.
      expect(overgrown?.content).toBe("Tidied.");
      expect(overgrown?.lastRewriteSource).toBe("TENDING");
      expect(untouched?.content).toBe("Already brief.");

      const runs = await staffRuns(t, "WIKI_TIDIER");
      expect(runs).toHaveLength(1);
      expect(runs[0].finalOutput).toContain("tidied 1");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("a tidy that must be refused", () => {
  test("a tidy that grew the page is not a tidy: the page stands, but still rests for the week", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    await seedModel(t);
    const pageId = await seedCustomerPage(t, companyId, { content: OVERGROWN });
    // Valid text, just longer than the page it was asked to shorten.
    generateMock.mockResolvedValue({ text: `${OVERGROWN} and more.` });

    const result = await t.action(internal.wikiTendingActions.tendCompany, { companyId });

    expect(result).toEqual({ repairedLinks: 0, tidiedPages: 0 });
    const page = await t.run(async (ctx) => ctx.db.get(pageId));
    expect(page?.content).toBe(OVERGROWN);
    // Seen tonight either way — not offered again for a week.
    expect(page?.lastTendedAt).toBeGreaterThan(0);
  });

  test("a model call that throws does not wedge the visit: links still get repaired and the run is recorded", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    await seedModel(t);
    // The dispatcher normally seeds the staff before any visit; a direct
    // visit needs them standing so its run has an agent to land on.
    await t.mutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});
    const overgrownId = await seedCustomerPage(t, companyId, { content: OVERGROWN });
    const brokenId = await seedCustomerPage(t, companyId, {
      subjectKey: "brightwater",
      links: ["CUSTOMER:vanished"],
    });
    generateMock.mockRejectedValue(new Error("model unavailable"));

    const result = await t.action(internal.wikiTendingActions.tendCompany, { companyId });

    // The free half of the night happened even though the model half failed.
    expect(result).toEqual({ repairedLinks: 1, tidiedPages: 0 });
    const { overgrown, repaired } = await t.run(async (ctx) => ({
      overgrown: await ctx.db.get(overgrownId),
      repaired: await ctx.db.get(brokenId),
    }));
    expect(overgrown?.content).toBe(OVERGROWN);
    expect(overgrown?.lastTendedAt).toBeGreaterThan(0);
    expect(repaired?.links).toEqual([]);

    // Recorded whatever happened — a failing night must not read as an
    // agent that never ran.
    const runs = await staffRuns(t, "WIKI_TIDIER");
    expect(runs).toHaveLength(1);
    expect(runs[0].finalOutput).toContain("Repaired 1");
  });
});

describe("the linking round's gates", () => {
  test("a stood-down Linker spends nothing: no company gets a round", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    await seedCustomerPage(t, companyId);
    await standDown(t, "WIKI_LINKER");

    const result = await t.action(internal.wikiTendingActions.linkDispatcher, {});

    expect(result).toEqual({ companies: 0 });
    expect(generateMock).not.toHaveBeenCalled();
  });

  test("a wiki with nothing sparse and no orphans returns before touching a model", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    await seedModel(t);
    // Customer pages are never the Linker's business; nothing here is sparse.
    await seedCustomerPage(t, companyId);

    const result = await t.action(internal.wikiTendingActions.crossLinkSweep, { companyId });

    expect(result).toEqual({ linked: 0 });
    expect(generateMock).not.toHaveBeenCalled();
  });
});

describe("the linking round's work", () => {
  test("genuinely related names become links both ways, visited pages rest, and the finished chain refreshes the hubs", async () => {
    vi.useFakeTimers();
    try {
      const t = makeTest();
      const companyId = await seedCompany(t);
      await seedModel(t);
      // One sparse topic page, one rested target, one orphan source note.
      await t.mutation(internal.wikiPages.applyRewriteInternal, {
        companyId,
        kind: "POLICY",
        subjectKey: "how-we-work",
        title: "how-we-work",
        content: "Every project starts with a paid discovery week.",
        source: "DOCUMENT:doc-1",
      });
      await t.mutation(internal.wikiPages.applyRewriteInternal, {
        companyId,
        kind: "PRODUCT",
        subjectKey: "web-development",
        title: "web-development",
        content: "Bespoke builds, discovery first.",
        source: "DOCUMENT:doc-1",
      });
      await t.mutation(internal.wikiPages.upsertSourceNoteInternal, {
        companyId,
        documentId: "doc-9",
        title: "The deck",
        text: "Discovery, then build.",
        sourceLabel: "Document · The deck",
      });
      // The target rests tonight, so exactly two pages are read: the sparse
      // topic first, then the orphan note.
      await t.run(async (ctx) => {
        const pages = await ctx.db.query("wikiPages").collect();
        const target = pages.find((page) => page.subjectKey === "web-development");
        await ctx.db.patch(target!._id, { lastTendedAt: Date.now() });
      });
      generateMock
        .mockResolvedValueOnce({ text: '{"related": ["web-development"]}' })
        .mockResolvedValueOnce({ text: '{"related": ["how-we-work"]}' });

      const result = await t.action(internal.wikiTendingActions.crossLinkSweep, { companyId });
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      expect(result).toEqual({ linked: 2 });
      const pages = await t.run(async (ctx) => ctx.db.query("wikiPages").collect());
      const byKey = (subjectKey: string) => pages.find((page) => page.subjectKey === subjectKey);
      // Metadata both ways, no text churn.
      expect(byKey("how-we-work")?.links).toContain("PRODUCT:web-development");
      expect(byKey("how-we-work")?.links).toContain("SOURCE:doc-9");
      expect(byKey("web-development")?.links).toContain("POLICY:how-we-work");
      expect(byKey("doc-9")?.links).toContain("POLICY:how-we-work");
      // Visited pages rest, so a page nothing relates to is not asked nightly.
      expect(byKey("how-we-work")?.lastTendedAt).toBeGreaterThan(0);
      expect(byKey("doc-9")?.lastTendedAt).toBeGreaterThan(0);
      // The chain's quiet second pass ended by refreshing the hub spine.
      expect(byKey("policies-index")).toBeDefined();

      const runs = await staffRuns(t, "WIKI_LINKER");
      expect(runs.length).toBeGreaterThanOrEqual(1);
      expect(runs[0].finalOutput).toContain("Added 2 connections");
    } finally {
      vi.useRealTimers();
    }
  });

  test("a model that throws does not wedge the round: the pass is still recorded and the chain stops", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    await seedModel(t);
    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      companyId,
      kind: "POLICY",
      subjectKey: "how-we-work",
      title: "how-we-work",
      content: "Every project starts with a paid discovery week.",
      source: "DOCUMENT:doc-1",
    });
    generateMock.mockRejectedValue(new Error("model unavailable"));

    const result = await t.action(internal.wikiTendingActions.crossLinkSweep, { companyId });

    expect(result).toEqual({ linked: 0 });
    // A pass that read pages and connected none is a real, recorded result —
    // recording only productive passes is how the Linker once read as an
    // agent that never ran.
    const runs = await staffRuns(t, "WIKI_LINKER");
    expect(runs).toHaveLength(1);
    expect(runs[0].finalOutput).toContain("found nothing genuinely related");
  });
});
