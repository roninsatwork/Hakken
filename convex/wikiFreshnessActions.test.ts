import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { WIKI_FRESHNESS_AGE_MS } from "./wikiFreshness";

/**
 * The Freshness Checker's action half (wiki-agents plan, phase 2). The
 * reading-list queries under it are tested in wikiFreshness.test.ts; what
 * lives here is the sweep's self-gating — a stood-down checker spends
 * nothing, a page younger than three weeks is never considered, a company
 * with nothing due costs nothing — and the checker's one hard rule: it
 * never rewrites a page. A supported page gets a stamp, an unsupported
 * claim becomes an open question raised once, and a model call that throws
 * leaves the page unstamped for tomorrow rather than wedging the sweep.
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

async function seedCompany(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) =>
    ctx.db.insert("companies", { name: "Wiki Corp", createdAt: Date.now() })
  );
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

/** A document-taught POLICY page, then aged past the three-week line. */
async function seedAgingPage(
  t: ReturnType<typeof convexTest>,
  companyId: Awaited<ReturnType<typeof seedCompany>>,
  args: { subjectKey: string; content: string; source: string; age?: number }
): Promise<Id<"wikiPages">> {
  await t.mutation(internal.wikiPages.applyRewriteInternal, {
    companyId,
    kind: "POLICY",
    subjectKey: args.subjectKey,
    title: args.subjectKey,
    content: args.content,
    source: args.source,
  });
  const old = Date.now() - (args.age ?? WIKI_FRESHNESS_AGE_MS + 60_000);
  return await t.run(async (ctx) => {
    const page = (await ctx.db.query("wikiPages").collect()).find(
      (candidate) => candidate.subjectKey === args.subjectKey
    )!;
    await ctx.db.patch(page._id, { updatedAt: old });
    return page._id;
  });
}

async function seedReadyDocument(
  t: ReturnType<typeof convexTest>,
  companyId: Awaited<ReturnType<typeof seedCompany>>,
  textContent: string
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("knowledgeDocuments", {
      companyId,
      title: "How we work",
      status: "ready",
      format: "text/plain",
      textContent,
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

afterEach(() => {
  generateMock.mockReset();
});

describe("the freshness sweep's gates", () => {
  test("a stood-down checker spends nothing: no company gets a round", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    await seedModel(t);
    const documentId = await seedReadyDocument(t, companyId, "Discovery is paid.");
    await seedAgingPage(t, companyId, {
      subjectKey: "how-we-work",
      content: "Discovery is paid.",
      source: `DOCUMENT:${documentId}`,
    });
    await standDown(t, "WIKI_FRESHNESS_CHECKER");

    await expect(t.action(internal.wikiFreshnessActions.freshnessSweep, {})).resolves.toEqual({
      companies: 0,
    });
    expect(generateMock).not.toHaveBeenCalled();
  });

  test("pages younger than three weeks, and pages no document taught, are never considered — no model, no phantom run", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    await seedModel(t);
    const documentId = await seedReadyDocument(t, companyId, "Discovery is paid.");
    // Fresh and document-taught: too young to question.
    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      companyId,
      kind: "POLICY",
      subjectKey: "fresh",
      title: "fresh",
      content: "A fresh claim.",
      source: `DOCUMENT:${documentId}`,
    });
    // Aging but conversation-taught: no document to check it against.
    await seedAgingPage(t, companyId, {
      subjectKey: "call-taught",
      content: "From a call.",
      source: "PHONE_CALL:1",
    });

    const result = await t.action(internal.wikiFreshnessActions.checkCompanyFreshness, {
      companyId,
    });

    expect(result).toEqual({ verified: 0, raised: 0 });
    expect(generateMock).not.toHaveBeenCalled();
    expect(await staffRuns(t, "WIKI_FRESHNESS_CHECKER")).toHaveLength(0);
  });
});

describe("the checker's verdicts", () => {
  test("a supported page gets its check stamped and nothing else — never a rewrite", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    await seedModel(t);
    await t.mutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});
    const documentId = await seedReadyDocument(
      t,
      companyId,
      "Every project starts with a paid discovery week."
    );
    const pageId = await seedAgingPage(t, companyId, {
      subjectKey: "how-we-work",
      content: "Discovery is paid.",
      source: `DOCUMENT:${documentId}`,
    });
    generateMock.mockResolvedValue({ text: '{"supported": true, "unsupportedClaim": ""}' });

    const result = await t.action(internal.wikiFreshnessActions.checkCompanyFreshness, {
      companyId,
    });

    expect(result).toEqual({ verified: 1, raised: 0 });
    const page = await t.run(async (ctx) => ctx.db.get(pageId));
    expect(page?.content).toBe("Discovery is paid.");
    expect(page?.lastVerifiedAt).toBeGreaterThan(0);
    const questions = await t.run(async (ctx) => ctx.db.query("wikiOpenQuestions").collect());
    expect(questions).toHaveLength(0);

    const runs = await staffRuns(t, "WIKI_FRESHNESS_CHECKER");
    expect(runs).toHaveLength(1);
    expect(runs[0].finalOutput).toContain("Verified 1");
  });

  test("a claim the sources no longer support becomes an open question, quoted, raised once however many nights it stands", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    await seedModel(t);
    const documentId = await seedReadyDocument(t, companyId, "Discovery is now free.");
    const pageId = await seedAgingPage(t, companyId, {
      subjectKey: "how-we-work",
      content: "Discovery is paid.",
      source: `DOCUMENT:${documentId}`,
    });
    generateMock.mockResolvedValue({
      text: '{"supported": false, "unsupportedClaim": "Discovery is paid."}',
    });

    const first = await t.action(internal.wikiFreshnessActions.checkCompanyFreshness, {
      companyId,
    });
    expect(first).toEqual({ verified: 0, raised: 1 });

    // The next cycle, with the question still standing: due again, same
    // verdict — and the same disagreement is not raised twice.
    await t.run(async (ctx) =>
      ctx.db.patch(pageId, {
        updatedAt: Date.now() - WIKI_FRESHNESS_AGE_MS - 60_000,
        lastVerifiedAt: Date.now() - WIKI_FRESHNESS_AGE_MS - 60_000,
      })
    );
    const second = await t.action(internal.wikiFreshnessActions.checkCompanyFreshness, {
      companyId,
    });
    expect(second).toEqual({ verified: 0, raised: 0 });

    const questions = await t.run(async (ctx) => ctx.db.query("wikiOpenQuestions").collect());
    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({
      kind: "FRESHNESS",
      status: "OPEN",
      pageKeyA: "POLICY:how-we-work",
      claimA: "Discovery is paid.",
    });
    // Never a silent rewrite: the page's own text is untouched.
    const page = await t.run(async (ctx) => ctx.db.get(pageId));
    expect(page?.content).toBe("Discovery is paid.");
  });

  test("a page whose sources are gone is itself the finding: a question without a model call", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    await seedModel(t);
    // The receipt points at a document id nothing can resolve any more.
    const pageId = await seedAgingPage(t, companyId, {
      subjectKey: "how-we-work",
      content: "Discovery is paid.",
      source: "DOCUMENT:doc-1",
    });

    const result = await t.action(internal.wikiFreshnessActions.checkCompanyFreshness, {
      companyId,
    });

    expect(result).toEqual({ verified: 0, raised: 1 });
    expect(generateMock).not.toHaveBeenCalled();
    const questions = await t.run(async (ctx) => ctx.db.query("wikiOpenQuestions").collect());
    expect(questions).toHaveLength(1);
    expect(questions[0].detail).toContain("no longer available");
    // Stamped, so the same unverifiable page is not re-raised every night.
    const page = await t.run(async (ctx) => ctx.db.get(pageId));
    expect(page?.lastVerifiedAt).toBeGreaterThan(0);
  });

  test("a model call that throws does not wedge the sweep: the round is recorded and the page waits unstamped for tomorrow", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    await seedModel(t);
    await t.mutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});
    const documentId = await seedReadyDocument(t, companyId, "Discovery is paid.");
    const pageId = await seedAgingPage(t, companyId, {
      subjectKey: "how-we-work",
      content: "Discovery is paid.",
      source: `DOCUMENT:${documentId}`,
    });
    generateMock.mockRejectedValue(new Error("model unavailable"));

    const result = await t.action(internal.wikiFreshnessActions.checkCompanyFreshness, {
      companyId,
    });

    expect(result).toEqual({ verified: 0, raised: 0 });
    // Unstamped: a failed check is not a passed one, and tomorrow retries.
    const page = await t.run(async (ctx) => ctx.db.get(pageId));
    expect(page?.lastVerifiedAt).toBeUndefined();

    const runs = await staffRuns(t, "WIKI_FRESHNESS_CHECKER");
    expect(runs).toHaveLength(1);
    expect(runs[0].finalOutput).toContain("Verified 0");
  });
});
