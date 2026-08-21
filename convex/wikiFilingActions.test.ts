import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

/**
 * The Filing Clerk's ground rules (wiki-agents plan, phase 5): a stood-down
 * clerk spends nothing, "no" is the normal answer and files nothing, a "yes"
 * goes through the audited rewrite door with its model spend on the meter,
 * a human's save bypasses the switch but never the validation, and junk or a
 * dead model can only ever mean nothing was filed.
 */

const { generateTextWithResolvedModelMock } = vi.hoisted(() => ({
  generateTextWithResolvedModelMock: vi.fn(),
}));

// Mocked shallow on purpose — the real module imports every provider SDK.
vi.mock("./aiProviderRegistry", () => ({
  generateTextWithResolvedModel: generateTextWithResolvedModelMock,
}));

beforeEach(() => {
  generateTextWithResolvedModelMock.mockReset();
});

async function seedCompany(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => ctx.db.insert("companies", { name: "Filing Corp", createdAt: Date.now() }));
}

async function standDownClerk(t: ReturnType<typeof convexTest>) {
  await t.mutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});
  await t.run(async (ctx) => {
    const clerk = (await ctx.db.query("agents").collect()).find(
      (agent) => agent.systemKey === "WIKI_FILING_CLERK"
    );
    await ctx.db.patch(clerk!._id, { isActive: false });
  });
}

function considerArgs(companyId: Id<"companies">, extra: Record<string, unknown> = {}) {
  return {
    companyId,
    threadId: "thread-1",
    question: "Which of our products suit hotels with under 20 rooms?",
    answer: "Combining the product and pricing pages: the compact range fits small hotels.",
    pageKeys: ["PRODUCT:compact-range", "POLICY:pricing"],
    ...extra,
  };
}

async function filedPages(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => ctx.db.query("wikiPages").collect());
}

describe("the Filing Clerk", () => {
  test("a stood-down clerk spends nothing and files nothing", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    await standDownClerk(t);

    await t.action(internal.wikiFilingActions.considerAnswer, considerArgs(companyId));

    expect(generateTextWithResolvedModelMock).not.toHaveBeenCalled();
    expect(await filedPages(t)).toHaveLength(0);
  });

  test("for most answers the correct decision is no — nothing filed, but the decision's spend is on the meter", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    generateTextWithResolvedModelMock.mockResolvedValue({
      text: JSON.stringify({ file: false, kind: "POLICY", slug: "pricing", note: "Nothing new." }),
      inputTokens: 100,
      outputTokens: 20,
    });

    await t.action(internal.wikiFilingActions.considerAnswer, considerArgs(companyId));

    expect(generateTextWithResolvedModelMock).toHaveBeenCalledTimes(1);
    expect(await filedPages(t)).toHaveLength(0);
    // The work is on the meter even when the answer is no (Anthony, 2026-08-20:
    // blank dashboards mean nobody can tell the staff ran at all).
    const transactions = await t.run(async (ctx) => ctx.db.query("agentTransactions").collect());
    expect(transactions).toHaveLength(1);
    expect(transactions[0].companyId).toBe(companyId);
    // No page, no run: the run history only records work that landed.
    expect(await t.run(async (ctx) => ctx.db.query("agentRuns").collect())).toHaveLength(0);
  });

  test("a yes files the synthesis through the audited rewrite door and records the run", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    generateTextWithResolvedModelMock
      .mockResolvedValueOnce({
        text: JSON.stringify({
          file: true,
          kind: "PRODUCT",
          slug: "Compact Range",
          note: "The compact range is the fit for hotels under 20 rooms.",
        }),
      })
      .mockResolvedValueOnce({ text: "The compact range suits hotels with under 20 rooms." });

    await t.action(internal.wikiFilingActions.considerAnswer, considerArgs(companyId));

    const pages = await filedPages(t);
    expect(pages).toHaveLength(1);
    // The slug is normalised, so "Compact Range" and "compact-range" are one page.
    expect(pages[0]).toMatchObject({
      companyId,
      kind: "PRODUCT",
      subjectKey: "compact-range",
      content: "The compact range suits hotels with under 20 rooms.",
      lastRewriteSource: "CHAT:thread-1",
    });

    const runs = await t.run(async (ctx) => ctx.db.query("agentRuns").collect());
    expect(runs).toHaveLength(1);
    expect(runs[0].finalOutput).toContain("Filed into PRODUCT:compact-range");
    // Two model calls, two lines on the meter.
    expect(await t.run(async (ctx) => ctx.db.query("agentTransactions").collect())).toHaveLength(2);
  });

  test("a human's save bypasses the switch — whether is already decided — but never the validation", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    await standDownClerk(t);

    // The model answers WHERE and WHAT only; no file flag comes back at all.
    generateTextWithResolvedModelMock
      .mockResolvedValueOnce({
        text: JSON.stringify({ kind: "POLICY", slug: "small-hotel-fit", note: "Durable insight." }),
      })
      .mockResolvedValueOnce({ text: "Small hotels take the compact range." });

    await t.action(
      internal.wikiFilingActions.considerAnswer,
      considerArgs(companyId, { vouchedByHuman: true })
    );

    const pages = await filedPages(t);
    expect(pages).toHaveLength(1);
    expect(pages[0].subjectKey).toBe("small-hotel-fit");

    // Vouching decides whether, never what kind: an off-menu kind still files nothing.
    generateTextWithResolvedModelMock.mockReset();
    generateTextWithResolvedModelMock.mockResolvedValue({
      text: JSON.stringify({ kind: "CUSTOMER", slug: "harbour-hotel", note: "Personal detail." }),
    });
    await t.action(
      internal.wikiFilingActions.considerAnswer,
      considerArgs(companyId, { vouchedByHuman: true })
    );
    expect(await filedPages(t)).toHaveLength(1);
  });

  test("junk from the model files nothing and does not crash", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);

    for (const text of ["no JSON here", JSON.stringify({ file: true, kind: "POLICY", slug: "x", note: "" })]) {
      generateTextWithResolvedModelMock.mockReset();
      generateTextWithResolvedModelMock.mockResolvedValue({ text });
      await t.action(internal.wikiFilingActions.considerAnswer, considerArgs(companyId));
    }
    expect(await filedPages(t)).toHaveLength(0);
  });

  test("a dead model files nothing and does not crash", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    generateTextWithResolvedModelMock.mockRejectedValue(new Error("503 provider down"));

    await expect(
      t.action(internal.wikiFilingActions.considerAnswer, considerArgs(companyId))
    ).resolves.not.toThrow();
    expect(await filedPages(t)).toHaveLength(0);
  });

  test("a refused rewrite files no page and records no run — the wiki never learns an empty page", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    generateTextWithResolvedModelMock
      .mockResolvedValueOnce({
        text: JSON.stringify({ file: true, kind: "POLICY", slug: "pricing", note: "Real insight." }),
      })
      .mockResolvedValueOnce({ text: "   " });

    await t.action(internal.wikiFilingActions.considerAnswer, considerArgs(companyId));

    expect(await filedPages(t)).toHaveLength(0);
    expect(await t.run(async (ctx) => ctx.db.query("agentRuns").collect())).toHaveLength(0);
    // Both model calls still landed on the meter.
    expect(await t.run(async (ctx) => ctx.db.query("agentTransactions").collect())).toHaveLength(2);
  });
});
