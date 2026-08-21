import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { askCore } from "./wikiAsk";

/**
 * The Ask box's ground rules (watch-it-think plan, phase 3): one press runs
 * the REAL answering pipeline in an EVAL-purpose thread scoped to the right
 * brain — and nobody reaches a brain that is not theirs. The tenant wall and
 * the platform gate must both refuse before a single token is spent.
 */

const { askRecorder, pipelineReply } = vi.hoisted(() => ({
  askRecorder: vi.fn(),
  // When set, the stubbed pipeline writes this assistant reply into the
  // thread — the same door (saveAssistantMessage) and the same evidence
  // field the real pipeline uses — so the outcome query runs for real.
  pipelineReply: {
    current: null as null | { content: string; companyRuntimeEvidenceJson: string },
  },
}));

// These tests are about the Ask box, not the pipeline behind it, so the
// pipeline is a stub that records what it was handed. Mocked shallow on
// purpose: the real aiChat.ts pulls in the whole reply pipeline (provider
// registry, retrieval, model turn) transitively, which these tests must
// stay isolated from.
vi.mock("./aiChat", async () => {
  const { internalAction } = await import("./_generated/server");
  const { v } = await import("convex/values");
  return {
    generateSonaeResponse: internalAction({
      args: {
        threadId: v.id("threads"),
        content: v.string(),
        modelId: v.optional(v.string()),
        thinkingLevel: v.optional(v.string()),
        fileIds: v.optional(v.array(v.id("_storage"))),
      },
      handler: async (ctx, args) => {
        askRecorder(args);
        if (pipelineReply.current) {
          const { internal } = await import("./_generated/api");
          await ctx.runMutation(internal.chat.saveAssistantMessage, {
            threadId: args.threadId,
            content: pipelineReply.current.content,
            companyRuntimeEvidenceJson: pipelineReply.current.companyRuntimeEvidenceJson,
          });
        }
      },
    }),
  };
});

beforeEach(() => {
  askRecorder.mockReset();
  pipelineReply.current = null;
});

async function seedCompany(t: ReturnType<typeof convexTest>, name = "Ask Corp") {
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

describe("asking for a company", () => {
  test("one press creates one EVAL thread scoped to the company, and the real pipeline runs in it", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    const adminId = await seedUser(t, "ADMIN", companyId);

    const result = await t
      .withIdentity({ subject: adminId })
      .action(api.wikiAsk.askBrainForCompany, { companyId, question: "Do we deliver on Sundays?" });

    const threads = await t.run(async (ctx) => ctx.db.query("threads").collect());
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({
      companyId,
      userId: adminId,
      purpose: "EVAL",
      title: "Ask the brain",
    });
    expect(askRecorder).toHaveBeenCalledTimes(1);
    expect(askRecorder.mock.calls[0][0]).toMatchObject({
      threadId: threads[0]._id,
      content: "Do we deliver on Sundays?",
    });
    // The stub wrote no reply: an unanswered run comes back empty, never a crash.
    expect(result).toEqual({ answer: "", pages: [] });
  });

  test("the question is capped at 500 characters before it can spend anything", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    const adminId = await seedUser(t, "ADMIN", companyId);

    await t
      .withIdentity({ subject: adminId })
      .action(api.wikiAsk.askBrainForCompany, { companyId, question: "x".repeat(600) });

    expect(askRecorder.mock.calls[0][0].content).toHaveLength(500);
  });
});

describe("the tenant wall", () => {
  test("an admin of another company is refused before any thread exists or model spend happens", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyA = await seedCompany(t, "Company A");
    const companyB = await seedCompany(t, "Company B");
    const adminB = await seedUser(t, "ADMIN", companyB);

    await expect(
      t
        .withIdentity({ subject: adminB })
        .action(api.wikiAsk.askBrainForCompany, { companyId: companyA, question: "What is Company A hiding?" })
    ).rejects.toThrow("Unauthorized Access");

    expect(await t.run(async (ctx) => ctx.db.query("threads").collect())).toHaveLength(0);
    expect(askRecorder).not.toHaveBeenCalled();
  });

  test("a plain USER and a read-only account never reach the ask — it spends money, so it needs a writing admin", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    const userId = await seedUser(t, "USER", companyId);
    const readOnlyId = await seedUser(t, "READ_ONLY", companyId);

    for (const subject of [userId, readOnlyId]) {
      await expect(
        t
          .withIdentity({ subject })
          .action(api.wikiAsk.askBrainForCompany, { companyId, question: "Do we deliver?" })
      ).rejects.toThrow("Unauthorized");
    }
    expect(askRecorder).not.toHaveBeenCalled();
  });
});

describe("the platform ask", () => {
  test("the global wiki answers only to a super admin; a company admin is turned away", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    const adminId = await seedUser(t, "ADMIN", companyId);

    await expect(
      t.withIdentity({ subject: adminId }).action(api.wikiAsk.askBrainForGlobal, { question: "Platform secrets?" })
    ).rejects.toThrow("Unauthorized access to the platform wiki");
    expect(await t.run(async (ctx) => ctx.db.query("threads").collect())).toHaveLength(0);
  });

  test("a super admin's ask lands on the platform shelf — no company on the thread", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const superId = await seedUser(t, "SUPER_ADMIN");

    const result = await t
      .withIdentity({ subject: superId })
      .action(api.wikiAsk.askBrainForGlobal, { question: "How does billing work?" });

    const [thread] = await t.run(async (ctx) => ctx.db.query("threads").collect());
    expect(thread.companyId).toBeUndefined();
    expect(thread.purpose).toBe("EVAL");
    expect(thread.userId).toBe(superId);
    expect(result).toEqual({ answer: "", pages: [] });
  });
});

/**
 * Reading the evidence back into pages: askCore driven directly with a fake
 * ctx, so the key-parsing rules can be pinned without the whole runtime.
 */
describe("reading the evidence back into pages", () => {
  type FakePage = { title: string; _id: string } | null;

  function fakeCtx(options: {
    outcome: { answer: string; evidenceJson?: string };
    /** Keyed "company POLICY:x" / "global POLICY:x". */
    pages?: Record<string, FakePage>;
  }) {
    const mutations: Array<{ name: string; args: Record<string, unknown> }> = [];
    const actions: Array<{ name: string; args: Record<string, unknown> }> = [];
    const queries: Array<{ name: string; args: Record<string, unknown> }> = [];
    const ctx = {
      runMutation: async (ref: unknown, args: Record<string, unknown>) => {
        mutations.push({ name: getFunctionName(ref as never), args });
        return "thread-1";
      },
      runAction: async (ref: unknown, args: Record<string, unknown>) => {
        actions.push({ name: getFunctionName(ref as never), args });
      },
      runQuery: async (ref: unknown, args: Record<string, unknown>) => {
        const name = getFunctionName(ref as never);
        queries.push({ name, args });
        if (name.includes("getEvalThreadOutcomeInternal")) return options.outcome;
        if (name.includes("getPageOfKindInternal")) {
          const scope = args.companyId ? "company" : "global";
          return options.pages?.[`${scope} ${args.kind}:${args.subjectKey}`] ?? null;
        }
        throw new Error(`Unexpected query ${name}`);
      },
    };
    return { ctx, mutations, actions, queries };
  }

  const companyId = "company-1" as Id<"companies">;
  const userId = "user-1" as Id<"users">;

  test("a global key resolves on the platform shelf and wears its badge; a company key stays scoped", async () => {
    const { ctx, queries } = fakeCtx({
      outcome: {
        answer: "We deliver Fridays; billing is monthly.",
        evidenceJson: JSON.stringify({ wikiPageKeys: ["POLICY:delivery", "global/POLICY:billing"] }),
      },
      pages: {
        "company POLICY:delivery": { title: "delivery", _id: "p1" },
        "global POLICY:billing": { title: "billing", _id: "p2" },
      },
    });

    const result = await askCore(ctx, { companyId, userId, question: "When do you deliver?" });
    expect(result.answer).toBe("We deliver Fridays; billing is monthly.");
    expect(result.pages).toEqual([
      { title: "delivery", pageId: "p1", isPlatform: false },
      { title: "billing", pageId: "p2", isPlatform: true },
    ]);

    const pageLookups = queries.filter((q) => q.name.includes("getPageOfKindInternal"));
    expect(pageLookups[0].args).toMatchObject({ companyId, kind: "POLICY", subjectKey: "delivery" });
    // The global page is fetched off the platform shelf, never scoped to the company.
    expect(pageLookups[1].args.companyId).toBeUndefined();
    expect(pageLookups[1].args).toMatchObject({ kind: "POLICY", subjectKey: "billing" });
  });

  test("junk keys and unknown kinds are skipped, and a missing page is not invented", async () => {
    const { ctx, queries } = fakeCtx({
      outcome: {
        answer: "Answered.",
        evidenceJson: JSON.stringify({
          wikiPageKeys: ["nonsense", "BADKIND:x", ":no-kind", "POLICY:missing"],
        }),
      },
    });

    const result = await askCore(ctx, { companyId, userId, question: "Q" });
    expect(result.pages).toEqual([]);
    // Only the well-formed key of a real kind even reaches the database.
    expect(queries.filter((q) => q.name.includes("getPageOfKindInternal"))).toHaveLength(1);
  });

  test("unreadable or absent evidence degrades to an answer with no pages, never a crash", async () => {
    for (const evidenceJson of ["not json at all", undefined]) {
      const { ctx, queries } = fakeCtx({ outcome: { answer: "Still answered.", evidenceJson } });
      const result = await askCore(ctx, { companyId, userId, question: "Q" });
      expect(result).toEqual({ answer: "Still answered.", pages: [] });
      expect(queries.filter((q) => q.name.includes("getPageOfKindInternal"))).toHaveLength(0);
    }
  });

  test("the global ask scopes nothing to a company — thread and page lookups both companyless", async () => {
    const { ctx, mutations, queries } = fakeCtx({
      outcome: {
        answer: "Platform answer.",
        evidenceJson: JSON.stringify({ wikiPageKeys: ["POLICY:billing"] }),
      },
      pages: { "global POLICY:billing": { title: "billing", _id: "g1" } },
    });

    const result = await askCore(ctx, { companyId: undefined, userId, question: "Billing?" });
    expect(mutations[0].args.companyId).toBeUndefined();
    const [lookup] = queries.filter((q) => q.name.includes("getPageOfKindInternal"));
    expect(lookup.args.companyId).toBeUndefined();
    expect(result.pages).toEqual([{ title: "billing", pageId: "g1", isPlatform: false }]);
  });
});

describe("the pages an answer stood on", () => {
  /**
   * Regression for the wiring gap found 2026-08-21: the chat path records
   * wikiPageKeys in companyRuntimeEvidenceJson, but getEvalThreadOutcomeInternal
   * rebuilt evidenceJson without them, so the Ask box's sources list was
   * always empty through the real pipeline. This test goes through the real
   * outcome query — only the model call is stubbed.
   */
  test("page references recorded on the reply survive to the Ask result", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    const adminId = await seedUser(t, "ADMIN", companyId);
    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      companyId,
      kind: "POLICY",
      subjectKey: "sunday-delivery",
      title: "Sunday delivery",
      content: "We deliver on Sundays.",
      source: "TEST",
    });

    pipelineReply.current = {
      content: "Yes — Sunday delivery runs as normal.",
      companyRuntimeEvidenceJson: JSON.stringify({
        sourceIds: [],
        skillIds: [],
        wikiPageKeys: ["POLICY:sunday-delivery"],
      }),
    };

    const result = await t
      .withIdentity({ subject: adminId })
      .action(api.wikiAsk.askBrainForCompany, { companyId, question: "Do we deliver on Sundays?" });

    expect(result.answer).toBe("Yes — Sunday delivery runs as normal.");
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]).toMatchObject({ title: "Sunday delivery", isPlatform: false });
  });
});
