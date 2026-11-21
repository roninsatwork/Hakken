import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { finishScheduled } from "@/src/test/finishScheduled";
import { WIKI_SOURCE_PASSAGE_CHARS } from "./wikiCheckup";
import { SELF_IMPROVEMENT_CONFIG_KEY } from "./selfImprovementConfig";

/**
 * The daily check-up (wiki-daily-checkup-plan.md), end to end against the
 * real schema, with the model mocked at the aiProviderRegistry boundary —
 * the same seam the other wiki tests use. Nothing here contacts a model or
 * the web.
 *
 * What must stay true: every wiki is visited, quiet ones included; one press
 * runs everything on one wiki and a second press starts nothing; a full run
 * covers every page and fills the bar; disputed facts are settled by the
 * rules and the rule is on the record; when nothing settles it both versions
 * stay; with the switch off nothing is fixed; pins, goals and source notes
 * are never touched; a removed file takes its facts with it; a person's tag
 * is never removed; a failure shows on Health; a wiki with nothing to do
 * costs nothing; and one company's run never touches another's wiki.
 */

const generateMock = vi.hoisted(() => vi.fn());

vi.mock("./aiProviderRegistry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./aiProviderRegistry")>();
  return {
    ...actual,
    generateTextWithResolvedModel: (...args: unknown[]) => generateMock(...args),
  };
});

type Reply = { when: string; reply: (prompt: string) => string };
let replies: Reply[] = [];

function respondWith(...next: Reply[]) {
  replies = next;
}

const day = 24 * 60 * 60 * 1000;
type T = ReturnType<typeof convexTest>;

function makeTest() {
  return convexTest(schema, import.meta.glob("./**/*.*s"));
}

beforeEach(() => {
  vi.useFakeTimers();
  delete process.env.FIRECRAWL_API_KEY;
  replies = [];
  generateMock.mockReset();
  generateMock.mockImplementation(async (args: { systemInstruction?: string; contents: Array<{ text: string }> }) => {
    const system = args.systemInstruction ?? "";
    const prompt = args.contents[0]?.text ?? "";
    const match = replies.find((entry) => system.includes(entry.when));
    return { text: match ? match.reply(prompt) : "{}", inputTokens: 1, outputTokens: 1 };
  });
});

afterEach(() => {
  vi.useRealTimers();
});

async function seedCompany(t: T, name = "Wiki Corp") {
  return await t.run(async (ctx) => ctx.db.insert("companies", { name, createdAt: Date.now() }));
}

async function seedModel(t: T) {
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

async function seedAdmin(t: T, companyId: Id<"companies">, email = "admin@test.com") {
  return await t.run(async (ctx) => ctx.db.insert("users", { email, role: "ADMIN", companyId, createdAt: Date.now() }));
}

async function seedSuperAdmin(t: T) {
  return await t.run(async (ctx) => ctx.db.insert("users", { email: "owner@test.com", role: "SUPER_ADMIN", createdAt: Date.now() }));
}

/** A document already read into the wiki, so the intake leaves it alone. */
async function seedDocument(t: T, companyId: Id<"companies">, args: { title: string; text: string; age: number }) {
  return await t.run(async (ctx) =>
    ctx.db.insert("knowledgeDocuments", {
      title: args.title,
      textContent: args.text,
      companyId,
      status: "ready",
      format: "text/plain",
      wikiDistilledAt: Date.now(),
      createdAt: Date.now() - args.age,
    })
  );
}

async function seedPage(
  t: T,
  companyId: Id<"companies"> | undefined,
  args: { kind?: "PRODUCT" | "POLICY" | "ISSUE"; subjectKey: string; content: string; source: string }
) {
  await t.mutation(internal.wikiPages.applyRewriteInternal, {
    companyId,
    kind: args.kind ?? "POLICY",
    subjectKey: args.subjectKey,
    title: args.subjectKey,
    content: args.content,
    source: args.source,
  });
  return (await t.query(internal.wikiPages.getPageOfKindInternal, {
    companyId,
    kind: args.kind ?? "POLICY",
    subjectKey: args.subjectKey,
  }))!;
}

async function pageById(t: T, pageId: Id<"wikiPages">): Promise<Doc<"wikiPages"> | null> {
  return await t.run(async (ctx) => ctx.db.get(pageId));
}

/** A hand-run check-up over every page, run to the end. */
async function runFull(t: T, companyId: Id<"companies"> | undefined) {
  const { runId } = await t.mutation(internal.wikiCheckup.beginRunInternal, {
    ...(companyId ? { companyId } : {}),
    trigger: "MANUAL",
    mode: "FULL",
  });
  await t.action(internal.wikiCheckupActions.runCheckupStep, { runId, stepKey: "INTAKE" });
  await finishScheduled(t);
  return (await t.run(async (ctx) => ctx.db.get(runId)))!;
}

describe("which wikis the check-up visits", () => {
  test("every company with a wiki is visited, including one that has gone quiet", async () => {
    const t = makeTest();
    const quiet = await seedCompany(t, "Quiet Co");
    const busy = await seedCompany(t, "Busy Co");
    await seedPage(t, quiet, { subjectKey: "opening-hours", content: "Open nine to five.", source: "DOCUMENT:old" });
    // A thousand newer pages elsewhere: the old rule only looked at the
    // newest thousand pages on the platform, and lost the quiet wiki.
    await t.run(async (ctx) => {
      for (let index = 0; index < 1001; index += 1) {
        await ctx.db.insert("wikiPages", {
          companyId: busy,
          kind: "SOURCE",
          subjectKey: `doc-${index}`,
          title: `Doc ${index}`,
          content: "x",
          links: [],
          pinnedCorrections: [],
          rewriteCount: 1,
          lastRewriteSource: "DOCUMENT:x",
          createdAt: Date.now(),
          updatedAt: Date.now() + day,
        });
      }
    });
    const scopes = await t.query(internal.wikiTending.listCompaniesWithPagesInternal, {});
    expect(scopes).toContain(quiet);
    expect(scopes).toContain(busy);
  });
});

describe("the one-press button", () => {
  test("one press starts a full check-up; a second press while it runs starts nothing", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    const admin = t.withIdentity({ subject: await seedAdmin(t, companyId) });
    const first = await admin.mutation(api.wikiCheckup.startWikiCheckupForCompany, { companyId });
    const second = await admin.mutation(api.wikiCheckup.startWikiCheckupForCompany, { companyId });
    expect(first.alreadyRunning).toBe(false);
    expect(second).toEqual({ runId: first.runId, alreadyRunning: true });
    const view = await admin.query(api.wikiCheckup.getLatestCheckupForCompany, { companyId });
    expect(view).toMatchObject({ status: "RUNNING", trigger: "MANUAL", step: 1, stepCount: 7 });
  });

  test("an admin of one company cannot run or read another company's check-up", async () => {
    const t = makeTest();
    const mine = await seedCompany(t, "Mine");
    const theirs = await seedCompany(t, "Theirs");
    const admin = t.withIdentity({ subject: await seedAdmin(t, mine) });
    await expect(admin.mutation(api.wikiCheckup.startWikiCheckupForCompany, { companyId: theirs })).rejects.toThrow();
    await expect(admin.query(api.wikiCheckup.getLatestCheckupForCompany, { companyId: theirs })).rejects.toThrow();
    await expect(admin.mutation(api.wikiCheckup.startWikiCheckupForGlobal, {})).rejects.toThrow();
  });
});

describe("a full check-up", () => {
  test("covers every page on every rota, tags them, and fills the bar", async () => {
    const t = makeTest();
    await seedModel(t);
    const companyId = await seedCompany(t);
    const pages = [
      await seedPage(t, companyId, { kind: "PRODUCT", subjectKey: "linen-hire", content: "Weekly linen hire.", source: "PHONE_CALL:c1" }),
      await seedPage(t, companyId, { kind: "POLICY", subjectKey: "delivery-times", content: "Deliveries on Tuesdays.", source: "PHONE_CALL:c2" }),
      await seedPage(t, companyId, { kind: "POLICY", subjectKey: "payment-terms", content: "Thirty days net.", source: "PHONE_CALL:c3" }),
      await seedPage(t, companyId, { kind: "ISSUE", subjectKey: "late-collections", content: "Collections sometimes run late.", source: "PHONE_CALL:c4" }),
    ];
    respondWith({
      when: "You tag pages",
      reply: (prompt) =>
        JSON.stringify({
          pages: [...prompt.matchAll(/^([a-z0-9-]+) \(/gm)].map((match) => ({ name: match[1], tags: ["Operations"] })),
        }),
    });

    const run = await runFull(t, companyId);
    expect(run.status).toBe("SUCCESS");
    expect(run.percent).toBe(100);
    expect(run.summary).toContain("tag");

    for (const seeded of pages) {
      const page = (await pageById(t, seeded._id))!;
      expect(page.lastLinkCheckedAt).toBeDefined();
      expect(page.lastContradictionCheckedAt).toBeDefined();
      expect(page.lastRefileCheckedAt).toBeDefined();
      expect(page.lastTagCheckedAt).toBeDefined();
      expect(page.tags).toEqual(["operations"]);
    }
  });

  test("touches the company it was run for and no other", async () => {
    const t = makeTest();
    await seedModel(t);
    const mine = await seedCompany(t, "Mine");
    const theirs = await seedCompany(t, "Theirs");
    const myPage = await seedPage(t, mine, { subjectKey: "returns", content: "Returns within 30 days.", source: "PHONE_CALL:c1" });
    const theirPage = await seedPage(t, theirs, { subjectKey: "returns", content: "Returns within 30 days.", source: "PHONE_CALL:c2" });
    await runFull(t, mine);
    expect((await pageById(t, myPage._id))!.lastLinkCheckedAt).toBeDefined();
    const untouched = (await pageById(t, theirPage._id))!;
    expect(untouched.lastLinkCheckedAt).toBeUndefined();
    expect(untouched.lastContradictionCheckedAt).toBeUndefined();
    expect(untouched.content).toBe("Returns within 30 days.");
  });

  test("a wiki with nothing due costs nothing", async () => {
    const t = makeTest();
    await seedModel(t);
    const companyId = await seedCompany(t);
    const page = await seedPage(t, companyId, { subjectKey: "returns", content: "Returns within 30 days.", source: "PHONE_CALL:c1" });
    // Checked after it was written: the database's clock can run a
    // millisecond ahead of the test's, and a page written after its last
    // check is a changed page, due again (2026-11-12).
    const now = Math.max(Date.now(), page.updatedAt);
    await t.run(async (ctx) => {
      await ctx.db.patch(page._id, {
        lastLinkCheckedAt: now,
        lastContradictionCheckedAt: now,
        lastRefileCheckedAt: now,
        lastTagCheckedAt: now,
        lastVerifiedAt: now,
        lastTendedAt: now,
      });
    });
    const { runId } = await t.mutation(internal.wikiCheckup.beginRunInternal, { companyId, trigger: "NIGHTLY", mode: "SLICE" });
    await t.action(internal.wikiCheckupActions.runCheckupStep, { runId, stepKey: "INTAKE" });
    await finishScheduled(t);
    const run = (await t.run(async (ctx) => ctx.db.get(runId)))!;
    expect(run.status).toBe("SUCCESS");
    expect(generateMock).not.toHaveBeenCalled();
  });
});

describe("settling disputed facts, with nobody asked", () => {
  async function seedDisagreement(t: T, options: { sourced: boolean }) {
    const companyId = await seedCompany(t);
    let sourceA = "PHONE_CALL:call-a";
    let sourceB = "PHONE_CALL:call-b";
    if (options.sourced) {
      sourceA = `DOCUMENT:${await seedDocument(t, companyId, { title: "Old terms", text: "Returns within 30 days.", age: 10 * day })}`;
      sourceB = `DOCUMENT:${await seedDocument(t, companyId, { title: "New terms", text: "Returns within 14 days.", age: 1 * day })}`;
    }
    const returns = await seedPage(t, companyId, { subjectKey: "returns", content: "Returns within 30 days. Customers pay postage.", source: sourceA });
    const refunds = await seedPage(t, companyId, { subjectKey: "refunds", content: "Returns within 14 days. Refunds in five days.", source: sourceB });
    return { companyId, returns, refunds };
  }

  const finding = {
    when: "report claims that GENUINELY disagree",
    reply: () =>
      JSON.stringify({
        contradictions: [
          { pageA: "POLICY:returns", claimA: "Returns within 30 days.", pageB: "POLICY:refunds", claimB: "Returns within 14 days." },
        ],
      }),
  };

  test("the newer source wins: the losing page is corrected and the rule is on the record", async () => {
    const t = makeTest();
    await seedModel(t);
    const { companyId, returns, refunds } = await seedDisagreement(t, { sourced: true });
    await t.run(async (ctx) => {
      await ctx.db.patch(returns._id, { pinnedCorrections: [{ text: "Postage is free for trade customers.", pinnedAt: 1 }] });
    });
    respondWith(
      finding,
      {
        when: "check a disagreement between two wiki pages",
        reply: () => JSON.stringify({ genuine: true, a: { pinned: false, supportedBy: [1] }, b: { pinned: false, supportedBy: [1] } }),
      },
      { when: "You correct one fact", reply: () => "Returns within 14 days. Customers pay postage." }
    );

    const run = await runFull(t, companyId);
    expect(run.status).toBe("SUCCESS");

    const corrected = (await pageById(t, returns._id))!;
    expect(corrected.content).toBe("Returns within 14 days. Customers pay postage.");
    // The pinned layer is never touched by a fix.
    expect(corrected.pinnedCorrections).toEqual([{ text: "Postage is free for trade customers.", pinnedAt: 1 }]);
    expect((await pageById(t, refunds._id))!.content).toBe("Returns within 14 days. Refunds in five days.");

    const audits = await t.run(async (ctx) => ctx.db.query("auditLogs").collect());
    const fix = audits.find((row) => row.actionType === "WIKI_CHECKUP_FIX");
    expect(JSON.parse(fix!.metadata as string)).toMatchObject({ rule: "NEWER", pageKey: "POLICY:returns" });
    // The old words are kept, so the fix can be undone.
    const revisions = await t.run(async (ctx) =>
      ctx.db.query("wikiPageRevisions").withIndex("by_page", (q) => q.eq("pageId", returns._id)).collect()
    );
    expect(revisions.some((revision) => revision.content === "Returns within 30 days. Customers pay postage.")).toBe(true);
  });

  test("when nothing settles it, both versions stay, marked as disagreeing", async () => {
    const t = makeTest();
    await seedModel(t);
    const { companyId, returns, refunds } = await seedDisagreement(t, { sourced: false });
    respondWith(finding, {
      when: "check a disagreement between two wiki pages",
      reply: () => JSON.stringify({ genuine: true, a: { pinned: false, supportedBy: [] }, b: { pinned: false, supportedBy: [] } }),
    });
    await runFull(t, companyId);
    const a = (await pageById(t, returns._id))!;
    const b = (await pageById(t, refunds._id))!;
    expect(a.content).toContain("Returns within 30 days. Customers pay postage.");
    expect(a.content).toContain("Sources disagree:");
    expect(a.content).toContain("[[refunds]]");
    expect(b.content).toContain("Sources disagree:");
    expect(b.content).toContain("[[returns]]");
  });

  test("a disagreement the check finds is not genuine changes nothing", async () => {
    const t = makeTest();
    await seedModel(t);
    const { companyId, returns } = await seedDisagreement(t, { sourced: true });
    respondWith(finding, { when: "check a disagreement between two wiki pages", reply: () => JSON.stringify({ genuine: false }) });
    await runFull(t, companyId);
    expect((await pageById(t, returns._id))!.content).toBe("Returns within 30 days. Customers pay postage.");
  });

  test("with the switch off, nothing is fixed and the finding waits as a question", async () => {
    const t = makeTest();
    await seedModel(t);
    const { companyId, returns } = await seedDisagreement(t, { sourced: true });
    await t.run(async (ctx) => {
      await ctx.db.insert("systemConfig", {
        key: SELF_IMPROVEMENT_CONFIG_KEY,
        value: JSON.stringify({ autonomousWiki: false }),
        updatedAt: Date.now(),
      });
    });
    respondWith(finding);
    await runFull(t, companyId);
    expect((await pageById(t, returns._id))!.content).toBe("Returns within 30 days. Customers pay postage.");
    const questions = await t.run(async (ctx) => ctx.db.query("wikiOpenQuestions").collect());
    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({ kind: "CONTRADICTION", status: "OPEN" });
  });
});

describe("following the files people add and remove", () => {
  test("a removed file takes its facts with it: a page only it backed goes, a page with other sources is rewritten", async () => {
    const t = makeTest();
    await seedModel(t);
    const companyId = await seedCompany(t);
    const admin = t.withIdentity({ subject: await seedAdmin(t, companyId) });
    const removed = await seedDocument(t, companyId, { title: "Gift cards and returns", text: "Gift cards never expire. Returns within 30 days.", age: day });
    const kept = await seedDocument(t, companyId, { title: "Returns", text: "Returns within 30 days.", age: day });
    const giftCards = await seedPage(t, companyId, { subjectKey: "gift-cards", content: "Gift cards never expire.", source: `DOCUMENT:${removed}` });
    const returns = await seedPage(t, companyId, { subjectKey: "returns", content: "Returns within 30 days. Gift cards never expire.", source: `DOCUMENT:${removed}` });
    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      companyId,
      kind: "POLICY",
      subjectKey: "returns",
      title: "returns",
      content: "Returns within 30 days. Gift cards never expire.",
      source: `DOCUMENT:${kept}`,
    });
    respondWith({ when: "has been removed", reply: () => "Returns within 30 days." });

    await admin.mutation(api.knowledge.deleteDocument, { documentId: removed });
    await finishScheduled(t);

    expect(await pageById(t, giftCards._id)).toBeNull();
    const rewritten = (await pageById(t, returns._id))!;
    expect(rewritten.content).toBe("Returns within 30 days.");
    const receipts = await t.run(async (ctx) =>
      ctx.db.query("wikiPageSources").withIndex("by_page", (q) => q.eq("pageId", returns._id)).collect()
    );
    expect(receipts.map((receipt) => receipt.ref)).toEqual([kept]);
  });

  test("a changed file brings the pages it taught in line", async () => {
    const t = makeTest();
    await seedModel(t);
    const companyId = await seedCompany(t);
    const document = await seedDocument(t, companyId, { title: "Opening hours", text: "Open nine to six.", age: day });
    const page = await seedPage(t, companyId, { subjectKey: "opening-hours", content: "Open nine to five.", source: `DOCUMENT:${document}` });
    respondWith({ when: "has changed", reply: () => "Open nine to six." });
    await t.mutation(internal.wikiCheckupPages.recordSourceChangeInternal, {
      companyId,
      documentId: document,
      kind: "CHANGED",
      title: "Opening hours",
      oldContent: "Open nine to five.",
      newContent: "Open nine to six.",
    });
    await finishScheduled(t);
    expect((await pageById(t, page._id))!.content).toBe("Open nine to six.");
  });

  test("an edit deep in a long file reaches the page, and only the edit is sent (2026-11-12)", async () => {
    const t = makeTest();
    await seedModel(t);
    const companyId = await seedCompany(t);
    const opening = "Opening sentence about other clients. ".repeat(300);
    const before = `${opening}Papa Johns app ratings rose to four stars.`;
    const after = `${opening}Papa Johns app ratings rose to five stars.`;
    const document = await seedDocument(t, companyId, { title: "Clients", text: after, age: day });
    const page = await seedPage(t, companyId, { subjectKey: "papa-johns", content: "Ratings rose to four stars.", source: `DOCUMENT:${document}` });
    let sent = "";
    respondWith({ when: "has changed", reply: (prompt) => { sent = prompt; return "Ratings rose to five stars."; } });
    await t.mutation(internal.wikiCheckupPages.recordSourceChangeInternal, {
      companyId,
      documentId: document,
      kind: "CHANGED",
      title: "Clients",
      oldContent: before,
      newContent: after,
    });
    await finishScheduled(t);
    expect((await pageById(t, page._id))!.content).toBe("Ratings rose to five stars.");
    expect(sent).toContain("Papa Johns app ratings rose to four stars.");
    expect(sent).toContain("Papa Johns app ratings rose to five stars.");
    expect(sent).not.toContain("Opening sentence about other clients.");
  });

  test("website pages are re-read once a month and not more often", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    const [stale, fresh] = await t.run(async (ctx) => [
      await ctx.db.insert("knowledgeDocuments", {
        title: "About us",
        sourceUrl: "https://example.com/about",
        companyId,
        status: "ready",
        format: "url",
        lastQueuedAt: Date.now() - 40 * day,
        createdAt: Date.now() - 60 * day,
      }),
      await ctx.db.insert("knowledgeDocuments", {
        title: "Prices",
        sourceUrl: "https://example.com/prices",
        companyId,
        status: "ready",
        format: "url",
        lastQueuedAt: Date.now() - 10 * day,
        createdAt: Date.now() - 60 * day,
      }),
    ]);
    const queued = await t.mutation(internal.wikiCheckupPages.queueWebsiteRereadsInternal, { companyId, limit: 25 });
    expect(queued).toBe(1);
    const rows = await t.run(async (ctx) => [await ctx.db.get(stale), await ctx.db.get(fresh)]);
    expect(rows[0]!.status).toBe("pending");
    expect(rows[1]!.status).toBe("ready");
  });
});

describe("page types, merges and tags", () => {
  test("moving a page to its right type keeps every link to it working", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    const misfiled = await seedPage(t, companyId, { kind: "PRODUCT", subjectKey: "returns", content: "Returns within 30 days.", source: "PHONE_CALL:c1" });
    const linker = await seedPage(t, companyId, { kind: "ISSUE", subjectKey: "broken-items", content: "See [[returns]].", source: "PHONE_CALL:c2" });
    await t.mutation(internal.wikiPages.addLinksInternal, { companyId, kind: "ISSUE", subjectKey: "broken-items", add: ["PRODUCT:returns"] });
    await t.mutation(internal.wikiPages.addLinksInternal, { companyId, kind: "PRODUCT", subjectKey: "returns", add: ["ISSUE:broken-items"] });

    const result = await t.mutation(internal.wikiCheckupPages.movePageKindInternal, { companyId, pageId: misfiled._id, toKind: "POLICY" });
    expect(result).toEqual({ moved: true, conflictPageId: null });
    expect((await pageById(t, misfiled._id))!.kind).toBe("POLICY");
    const neighbour = (await pageById(t, linker._id))!;
    expect(neighbour.links).toContain("POLICY:returns");
    expect(neighbour.links).not.toContain("PRODUCT:returns");
  });

  test("a page whose right type is taken is merged into the page already there", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    const keep = await seedPage(t, companyId, { kind: "POLICY", subjectKey: "returns", content: "Returns within 30 days.", source: "DOCUMENT:doc-1" });
    const drop = await seedPage(t, companyId, { kind: "PRODUCT", subjectKey: "returns", content: "Returns are free.", source: "DOCUMENT:doc-2" });
    await t.run(async (ctx) => {
      await ctx.db.patch(drop._id, { pinnedCorrections: [{ text: "Trade returns need a code.", pinnedAt: 5 }] });
    });
    const conflict = await t.mutation(internal.wikiCheckupPages.movePageKindInternal, { companyId, pageId: drop._id, toKind: "POLICY" });
    expect(conflict).toEqual({ moved: false, conflictPageId: keep._id });

    await t.mutation(internal.wikiCheckupPages.mergePagesInternal, {
      companyId,
      keepPageId: keep._id,
      dropPageId: drop._id,
      content: "Returns within 30 days, free of charge.",
      rule: "REFILE_MERGE",
    });
    expect(await pageById(t, drop._id)).toBeNull();
    const merged = (await pageById(t, keep._id))!;
    expect(merged.content).toBe("Returns within 30 days, free of charge.");
    expect(merged.pinnedCorrections).toEqual([{ text: "Trade returns need a code.", pinnedAt: 5 }]);
    const receipts = await t.run(async (ctx) =>
      ctx.db.query("wikiPageSources").withIndex("by_page", (q) => q.eq("pageId", keep._id)).collect()
    );
    expect(receipts.map((receipt) => receipt.ref).sort()).toEqual(["doc-1", "doc-2"]);
  });

  test("goals and source notes are never moved, merged away or corrected", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    const goal = await t.run(async (ctx) =>
      ctx.db.insert("wikiPages", {
        companyId,
        kind: "GOAL",
        subjectKey: "grow-trade",
        title: "Grow trade",
        content: "Double trade accounts.",
        links: [],
        pinnedCorrections: [],
        rewriteCount: 1,
        lastRewriteSource: "HUMAN:x",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    const fixed = await t.mutation(internal.wikiCheckupPages.applyCheckupFixInternal, { companyId, pageId: goal, content: "Something else.", rule: "NEWER" });
    expect(fixed).toBe(false);
    const moved = await t.mutation(internal.wikiCheckupPages.movePageKindInternal, { companyId, pageId: goal, toKind: "POLICY" });
    expect(moved.moved).toBe(false);
    expect((await pageById(t, goal))!.content).toBe("Double trade accounts.");
  });

  test("a person's tag is never removed by the machine, and spellings fold together", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    const admin = t.withIdentity({ subject: await seedAdmin(t, companyId) });
    const page = await seedPage(t, companyId, { subjectKey: "returns", content: "Returns within 30 days.", source: "PHONE_CALL:c1" });
    await admin.mutation(api.wikiCheckupPages.addTagForCompany, { companyId, pageId: page._id, tag: "Trade Customers" });
    await t.mutation(internal.wikiCheckupPages.setMachineTagsInternal, { companyId, pageId: page._id, tags: ["refunds"] });
    await t.mutation(internal.wikiCheckupPages.setMachineTagsInternal, { companyId, pageId: page._id, tags: ["returns"] });
    expect((await pageById(t, page._id))!.tags).toEqual(["returns", "trade-customers"]);

    await t.mutation(internal.wikiCheckupPages.renameTagInternal, { companyId, from: "trade-customers", to: "trade" });
    const rows = await t.run(async (ctx) =>
      ctx.db.query("wikiPageTags").withIndex("by_page", (q) => q.eq("pageId", page._id)).collect()
    );
    expect(rows.find((row) => row.tag === "trade")?.byHuman).toBe(true);

    const filtered = await admin.query(api.wikiPages.listPagesForCompany, {
      companyId,
      paginationOpts: { numItems: 15, cursor: null },
      tag: "trade",
    });
    expect(filtered.page.map((row) => row.subjectKey)).toEqual(["returns"]);
  });
});

describe("undo and Health", () => {
  test("an earlier version can be put back, and only within its own company", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    const other = await seedCompany(t, "Other");
    const page = await seedPage(t, companyId, { subjectKey: "returns", content: "Returns within 30 days.", source: "PHONE_CALL:c1" });
    await t.mutation(internal.wikiCheckupPages.applyCheckupFixInternal, { companyId, pageId: page._id, content: "Returns within 14 days.", rule: "NEWER" });
    const revision = (await t.run(async (ctx) =>
      ctx.db.query("wikiPageRevisions").withIndex("by_page", (q) => q.eq("pageId", page._id)).first()
    ))!;
    const outsider = t.withIdentity({ subject: await seedAdmin(t, other, "other@test.com") });
    await expect(outsider.mutation(api.wikiCheckupPages.restoreRevisionForCompany, { companyId: other, revisionId: revision._id })).rejects.toThrow();
    const admin = t.withIdentity({ subject: await seedAdmin(t, companyId) });
    await admin.mutation(api.wikiCheckupPages.restoreRevisionForCompany, { companyId, revisionId: revision._id });
    expect((await pageById(t, page._id))!.content).toBe("Returns within 30 days.");
  });

  test("a failed check-up shows as failed on Health, and one that stopped responding does too", async () => {
    const t = makeTest();
    const failedCo = await seedCompany(t, "Failed Co");
    const stuckCo = await seedCompany(t, "Stuck Co");
    const fineCo = await seedCompany(t, "Fine Co");
    for (const companyId of [failedCo, stuckCo, fineCo]) {
      await seedPage(t, companyId, { subjectKey: "returns", content: "Returns within 30 days.", source: "PHONE_CALL:c1" });
    }
    const failed = await t.mutation(internal.wikiCheckup.beginRunInternal, { companyId: failedCo, trigger: "NIGHTLY", mode: "SLICE" });
    await t.mutation(internal.wikiCheckup.finishRunInternal, { runId: failed.runId, status: "FAILED", error: "The model was unavailable." });
    const stuck = await t.mutation(internal.wikiCheckup.beginRunInternal, { companyId: stuckCo, trigger: "NIGHTLY", mode: "SLICE" });
    await t.run(async (ctx) => {
      await ctx.db.patch(stuck.runId, { updatedAt: Date.now() - 2 * 60 * 60 * 1000 });
    });
    const fine = await t.mutation(internal.wikiCheckup.beginRunInternal, { companyId: fineCo, trigger: "NIGHTLY", mode: "SLICE" });
    await t.mutation(internal.wikiCheckup.finishRunInternal, { runId: fine.runId, status: "SUCCESS" });

    const owner = t.withIdentity({ subject: await seedSuperAdmin(t) });
    const rows = await owner.query(api.wikiCheckup.listCheckupHealth, {});
    const state = (name: string) => rows.find((row) => row.name === name)?.state;
    expect(state("Failed Co")).toBe("FAILED");
    expect(state("Stuck Co")).toBe("FAILED");
    expect(state("Fine Co")).toBe("OK");
    expect(rows[0].state).toBe("FAILED");
  });

  test("the bar never moves backwards when a step finds more work than planned", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    const { runId } = await t.mutation(internal.wikiCheckup.beginRunInternal, { companyId, trigger: "MANUAL", mode: "FULL" });
    await t.mutation(internal.wikiCheckup.advanceRunInternal, { runId, addTotal: 10, addDone: 6 });
    const before = (await t.run(async (ctx) => ctx.db.get(runId)))!.percent;
    await t.mutation(internal.wikiCheckup.advanceRunInternal, { runId, addTotal: 90, addDone: 1 });
    const after = (await t.run(async (ctx) => ctx.db.get(runId)))!;
    expect(before).toBe(60);
    expect(after.percent).toBe(60);
    await t.mutation(internal.wikiCheckup.finishRunInternal, { runId, status: "SUCCESS" });
    expect((await t.run(async (ctx) => ctx.db.get(runId)))!.percent).toBe(100);
  });
});

describe("the weekly report", () => {
  test("counts what the wiki settled by itself and suggests what is worth adding", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    const page = await seedPage(t, companyId, { subjectKey: "returns", content: "Returns within 30 days.", source: "PHONE_CALL:c1" });
    await t.mutation(internal.wikiCheckupPages.applyCheckupFixInternal, { companyId, pageId: page._id, content: "Returns within 14 days.", rule: "NEWER" });
    await t.run(async (ctx) => {
      await ctx.db.insert("wikiUnansweredQuestions", {
        companyId,
        question: "Do you deliver on Saturdays?",
        normalizedKey: "do you deliver on saturdays",
        askCount: 4,
        status: "OPEN",
        firstAskedAt: Date.now(),
        lastAskedAt: Date.now(),
      });
    });
    const report = await t.query(internal.wikiReport.buildWeeklyReportInternal, { companyId, since: Date.now() - 7 * day });
    expect(report.factsSettled).toBe(1);
    expect(report.suggestions[0]).toContain("Do you deliver on Saturdays?");
    expect(report.suggestions.some((line) => line.includes("returns"))).toBe(true);
  });
});

describe("checking pages against their sources", () => {
  test("a full run checks a page a person changed today, and the newer source wins", async () => {
    const t = makeTest();
    await seedModel(t);
    const companyId = await seedCompany(t);
    const older = await seedDocument(t, companyId, { title: "Returns 2025", text: "Returns within 30 days.", age: 10 * day });
    const newer = await seedDocument(t, companyId, { title: "Terms 2026", text: "Returns within 14 days.", age: 1 * day });
    await seedPage(t, companyId, { subjectKey: "returns", content: "Returns within 14 days.", source: `DOCUMENT:${older}` });
    const page = await seedPage(t, companyId, { subjectKey: "returns", content: "Returns within 14 days.", source: `DOCUMENT:${newer}` });
    // A person puts the old wording back: changed today, but not by a document.
    await t.run(async (ctx) => {
      await ctx.db.patch(page._id, { content: "Returns within 30 days.", lastRewriteSource: "HUMAN:someone", updatedAt: Date.now() });
    });
    respondWith(
      {
        when: "You check whether a wiki page's claims are still supported",
        reply: (prompt) => {
          expect(prompt).toContain("Returns 2025");
          expect(prompt).toContain("Terms 2026");
          return JSON.stringify({ supported: false, unsupportedClaim: "Returns within 30 days." });
        },
      },
      { when: "You keep one page of a company's wiki true to its source documents", reply: () => "Returns within 14 days." }
    );
    await runFull(t, companyId);
    expect((await pageById(t, page._id))!.content).toBe("Returns within 14 days.");
    const fix = (await t.run(async (ctx) => ctx.db.query("auditLogs").collect())).find((row) => row.actionType === "WIKI_CHECKUP_FIX");
    expect(JSON.parse(fix!.metadata as string)).toMatchObject({ rule: "SOURCES", pageKey: "POLICY:returns" });
  });

  test("a nightly slice leaves a page a document wrote today until tomorrow", async () => {
    const t = makeTest();
    await seedModel(t);
    const companyId = await seedCompany(t);
    const document = await seedDocument(t, companyId, { title: "Terms", text: "Returns within 14 days.", age: day });
    const page = await seedPage(t, companyId, { subjectKey: "returns", content: "Returns within 14 days.", source: `DOCUMENT:${document}` });
    const { runId } = await t.mutation(internal.wikiCheckup.beginRunInternal, { companyId, trigger: "NIGHTLY", mode: "SLICE" });
    await t.action(internal.wikiCheckupActions.runCheckupStep, { runId, stepKey: "INTAKE" });
    await finishScheduled(t);
    expect((await pageById(t, page._id))!.lastVerifiedAt).toBeUndefined();
    const sourceChecks = generateMock.mock.calls.filter(([args]) =>
      String((args as { systemInstruction?: string }).systemInstruction).includes("still supported by the source documents")
    );
    expect(sourceChecks).toHaveLength(0);
  });
});

describe("only re-check what changed (2026-11-12)", () => {
  test("the nightly rota passes over a page that has not changed since its check, and brings back one that has", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    const quiet = await seedPage(t, companyId, { subjectKey: "opening-hours", content: "Open nine to five.", source: "PHONE_CALL:c1" });
    const edited = await seedPage(t, companyId, { subjectKey: "delivery", content: "Delivery on Fridays.", source: "PHONE_CALL:c2" });
    const now = Math.max(Date.now(), quiet.updatedAt, edited.updatedAt);
    // Both last checked 20 days ago: past the 14-day page-type cycle, so the
    // old rota would have paid to read both again.
    await t.run(async (ctx) => {
      await ctx.db.patch(quiet._id, { lastRefileCheckedAt: now - 20 * day, updatedAt: now - 30 * day });
      await ctx.db.patch(edited._id, { lastRefileCheckedAt: now - 20 * day, updatedAt: now - 2 * day });
    });

    const nightly = await t.query(internal.wikiCheckup.getKindRotaInternal, {
      companyId,
      rota: "REFILE",
      kinds: ["POLICY"],
      before: now - 13 * day,
      limit: 10,
    });
    expect(nightly.map((page) => page.subjectKey)).toEqual(["delivery"]);

    // A hand-run full check still reads everything.
    const full = await t.query(internal.wikiCheckup.getKindRotaInternal, {
      companyId,
      rota: "REFILE",
      kinds: ["POLICY"],
      before: now + day,
      limit: 10,
      full: true,
    });
    expect(full.map((page) => page.subjectKey).sort()).toEqual(["delivery", "opening-hours"]);
  });
});

describe("long files are followed from anywhere in them (2026-11-12)", () => {
  // The fact check read a source's first 2,500–3,000 characters, a removed
  // file's first 6,000 and a changed file's first 5,000. A page written from
  // page twelve of a long credentials file looked unsupported by its own
  // source, and an edit or a delete further in never reached the pages.
  const filler = (count: number) =>
    Array.from({ length: count }, (_, i) => `Client number ${i} had a website built for them.`).join(" ");

  test("the fact check reads the part of a long source that is about the page", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    const documentId = await seedDocument(t, companyId, {
      title: "Clients and case studies",
      text: `${filler(900)} Waterstones asked us for a bookshop app with reader reviews. ${filler(100)}`,
      age: day,
    });
    const page = await seedPage(t, companyId, {
      subjectKey: "waterstones",
      content: "A bookshop app with reader reviews.",
      source: `DOCUMENT:${documentId}`,
    });

    const sources = await t.query(internal.wikiCheckup.getSettlingSourcesInternal, { pageId: page._id });

    expect(sources.documents).toHaveLength(1);
    expect(sources.documents[0].text).toContain("Waterstones asked us for a bookshop app");
    expect(sources.documents[0].text.length).toBeLessThanOrEqual(WIKI_SOURCE_PASSAGE_CHARS);
  });

  test("deleting a long file keeps all of its words for the tidy-up, not only the first 24,000", async () => {
    const t = makeTest();
    const companyId = await seedCompany(t);
    const text = `${filler(900)} Waterstones asked us for a bookshop app.`;
    const documentId = await seedDocument(t, companyId, { title: "Clients and case studies", text, age: day });
    await seedPage(t, companyId, { subjectKey: "waterstones", content: "A bookshop app.", source: `DOCUMENT:${documentId}` });

    await t.run(async (ctx) => {
      const { removeDocumentFromWiki } = await import("./wikiCheckupPages");
      await removeDocumentFromWiki(ctx, { companyId, documentId, title: "Clients and case studies" });
    });

    const change = await t.run(async (ctx) => (await ctx.db.query("wikiSourceChanges").collect())[0]);
    expect(text.length).toBeGreaterThan(24_000);
    expect(change?.kind).toBe("REMOVED");
    expect(change?.oldContent).toContain("Waterstones asked us for a bookshop app.");
  });
});

describe("Knowledge articles in the wiki (Hakken's own, 21 November 2026)", () => {
  // A Knowledge article's copy is a person's writing, changed only in Admin, Content, Knowledge
  // (utils/knowledgePageGuard.ts). Sonae has no such pages, so its check-up never had to leave them alone.
  test("the check-up's fixes, moves, tags and removals leave a Knowledge article's page untouched", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const page = await seedPage(t, undefined, { kind: "PRODUCT", subjectKey: "door-handles", content: "Every handle we make.", source: "HUMAN:x" });
    await t.run(async (ctx) => {
      const articleId = await ctx.db.insert("knowledgeArticles", { titleEn: "Door handles", bodyEn: "Every handle we make.", status: "PUBLISHED", updatedAt: Date.now() });
      await ctx.db.patch(page._id, { knowledgeArticleId: articleId });
    });

    expect(await t.mutation(internal.wikiCheckupPages.applyCheckupFixInternal, {
      pageId: page._id, content: "Something else entirely.", rule: "test",
    })).toBe(false);
    expect(await t.mutation(internal.wikiCheckupPages.movePageKindInternal, { pageId: page._id, toKind: "POLICY" })).toMatchObject({ moved: false });
    expect(await t.mutation(internal.wikiCheckupPages.setMachineTagsInternal, { pageId: page._id, tags: ["handles"] })).toBe(0);
    expect(await t.mutation(internal.wikiCheckupPages.removePageInternal, { pageId: page._id, reason: "test" })).toBe(false);

    const after = await pageById(t, page._id);
    expect(after).toMatchObject({ kind: "PRODUCT", content: "Every handle we make." });
  });
});

describe("disagreements settled as a document comes in (beyond Sonae, 21 November 2026)", () => {
  // wiki-sonae-catch-up-plan-2026-11-21.md, 2.3: a new document's pages are read beside the pages they link to the moment
  // it's learned, by the nightly check-up's own rules, rather than waiting for the night.
  async function seedArrival(t: T) {
    const companyId = await seedCompany(t);
    const oldDoc = await seedDocument(t, companyId, { title: "Old terms", text: "Returns within 30 days.", age: 10 * day });
    const newDoc = await seedDocument(t, companyId, { title: "New terms", text: "Returns within 14 days.", age: 1 * day });
    const returns = await seedPage(t, companyId, { subjectKey: "returns", content: "Returns within 30 days. Customers pay postage.", source: `DOCUMENT:${oldDoc}` });
    const refunds = await seedPage(t, companyId, { subjectKey: "refunds", content: "Returns within 14 days. Refunds in five days.", source: `DOCUMENT:${newDoc}` });
    // The new document's page links to the older one, as the reader links related topics.
    await t.run(async (ctx) => { await ctx.db.patch(refunds._id, { links: ["POLICY:returns"] }); });
    return { companyId, newDoc, returns, refunds };
  }
  const contradiction = {
    when: "report claims that GENUINELY disagree",
    reply: () => JSON.stringify({
      contradictions: [{ pageA: "POLICY:returns", claimA: "Returns within 30 days.", pageB: "POLICY:refunds", claimB: "Returns within 14 days." }],
    }),
  };

  test("a newer document's fact replaces the older page's the same minute, and the night doesn't check them again", async () => {
    const t = makeTest();
    await seedModel(t);
    const { companyId, newDoc, returns, refunds } = await seedArrival(t);
    respondWith(
      contradiction,
      { when: "check a disagreement between two wiki pages", reply: () => JSON.stringify({ genuine: true, a: { pinned: false, supportedBy: [1] }, b: { pinned: false, supportedBy: [1] } }) },
      { when: "You correct one fact", reply: () => "Returns within 14 days. Customers pay postage." },
    );

    const tally = await t.action(internal.wikiSettleOnArrival.settleDocumentPagesInternal, { companyId, documentId: newDoc });

    expect(tally).toEqual({ checked: 1, settled: 1, raised: 0 });
    expect((await pageById(t, returns._id))!.content).toBe("Returns within 14 days. Customers pay postage.");
    expect((await pageById(t, refunds._id))!.lastContradictionCheckedAt).toBeDefined();
  });

  test("with the self-correcting switch off, the disagreement waits as an open question instead", async () => {
    const t = makeTest();
    await seedModel(t);
    const { companyId, newDoc, returns } = await seedArrival(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("systemConfig", { key: SELF_IMPROVEMENT_CONFIG_KEY, value: JSON.stringify({ autonomousWiki: false }), updatedAt: Date.now() });
    });
    respondWith(contradiction);

    const tally = await t.action(internal.wikiSettleOnArrival.settleDocumentPagesInternal, { companyId, documentId: newDoc });

    expect(tally).toEqual({ checked: 1, settled: 0, raised: 1 });
    expect((await pageById(t, returns._id))!.content).toBe("Returns within 30 days. Customers pay postage.");
    const questions = await t.run(async (ctx) => ctx.db.query("wikiOpenQuestions").collect());
    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({ kind: "CONTRADICTION", status: "OPEN" });
  });

  test("a page with nothing linked to it costs no model call", async () => {
    const t = makeTest();
    await seedModel(t);
    const { companyId, newDoc, refunds } = await seedArrival(t);
    await t.run(async (ctx) => { await ctx.db.patch(refunds._id, { links: [] }); });

    expect(await t.action(internal.wikiSettleOnArrival.settleDocumentPagesInternal, { companyId, documentId: newDoc })).toEqual({ checked: 0, settled: 0, raised: 0 });
    expect(generateMock).not.toHaveBeenCalled();
  });
});
