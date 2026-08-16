import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

/**
 * The migration road's ground rules (one-brain-plan.md, phase 1):
 * knowledge becomes a pin, behaviour becomes a rule, memories are
 * archived never deleted, every move is audited, nothing happens twice,
 * and the stamp is refused while anything still waits.
 */

async function seedCompany(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) =>
    ctx.db.insert("companies", { name: "Move Corp", createdAt: Date.now() })
  );
}

async function seedMemory(
  t: ReturnType<typeof convexTest>,
  companyId: Awaited<ReturnType<typeof seedCompany>>,
  overrides: Partial<{ title: string; content: string; applyMode: "ALWAYS" | "WHEN_RELEVANT" }> = {}
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("companyMemories", {
      companyId,
      title: overrides.title ?? "Studio, not collective",
      content: overrides.content ?? "Ronins is a digital product studio, not a collective.",
      normalizedContent: "ronins is a digital product studio not a collective",
      category: "identity",
      ...(overrides.applyMode ? { applyMode: overrides.applyMode } : {}),
      status: "APPROVED",
      confidence: 0.9,
      sourceType: "MANUAL",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      usageCount: 3,
    })
  );
}

async function seedPage(
  t: ReturnType<typeof convexTest>,
  companyId: Awaited<ReturnType<typeof seedCompany>>
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("wikiPages", {
      companyId,
      kind: "POLICY",
      subjectKey: "brand-identity",
      title: "brand-identity",
      content: "How the company presents itself.",
      links: [],
      pinnedCorrections: [],
      rewriteCount: 1,
      lastRewriteSource: "DOCUMENT:doc-1",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );
}

describe("the migration road", () => {
  test("a searched memory becomes a pin; the memory is archived with its history", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    const pageId = await seedPage(t, companyId);
    const memoryId = await seedMemory(t, companyId);

    const move = await t.mutation(internal.memoryMigration.applyMigrationMoveInternal, {
      companyId,
      memoryId,
      target: { kind: "PIN", pageKind: "POLICY", subjectKey: "brand-identity" },
    });
    expect(move).toEqual({ moved: true, landedOn: "POLICY:brand-identity" });

    const page = await t.run(async (ctx) => ctx.db.get(pageId));
    expect(page?.pinnedCorrections).toHaveLength(1);
    expect(page?.pinnedCorrections[0].text).toContain("digital product studio");

    const memory = await t.run(async (ctx) => ctx.db.get(memoryId));
    expect(memory?.status).toBe("ARCHIVED");
    expect(memory?.usageCount).toBe(3);

    const audit = await t.run(async (ctx) => ctx.db.query("auditLogs").take(10));
    const row = audit.find((entry) => entry.actionType === "MEMORY_MIGRATED_TO_WIKI");
    expect(row).toBeTruthy();
    expect(JSON.parse(row!.metadata ?? "{}").landedOn).toBe("POLICY:brand-identity");

    // A move already made never happens twice.
    const again = await t.mutation(internal.memoryMigration.applyMigrationMoveInternal, {
      companyId,
      memoryId,
      target: { kind: "PIN", pageKind: "POLICY", subjectKey: "brand-identity" },
    });
    expect(again.moved).toBe(false);
    const pageAfter = await t.run(async (ctx) => ctx.db.get(pageId));
    expect(pageAfter?.pinnedCorrections).toHaveLength(1);
  });

  test("an ALWAYS memory becomes a rule at full strength", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    const memoryId = await seedMemory(t, companyId, {
      title: "Plain English",
      content: "Answer in plain, friendly English at all times.",
      applyMode: "ALWAYS",
    });

    const move = await t.mutation(internal.memoryMigration.applyMigrationMoveInternal, {
      companyId,
      memoryId,
      target: { kind: "RULE" },
    });
    expect(move).toEqual({ moved: true, landedOn: "rule" });

    const rules = await t.run(async (ctx) => ctx.db.query("aiRules").take(10));
    expect(rules).toHaveLength(1);
    expect(rules[0].isActive).toBe(true);
    expect(rules[0].instruction).toContain("plain, friendly English");
    expect(rules[0].trigger).toContain("moved from Memory");
  });

  test("the stamp is refused while anything still waits, and holds once given", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    const memoryId = await seedMemory(t, companyId);

    await expect(
      t.mutation(internal.memoryMigration.stampMigrationInternal, { companyId })
    ).resolves.toMatchObject({ stamped: false });

    await t.mutation(internal.memoryMigration.applyMigrationMoveInternal, {
      companyId,
      memoryId,
      target: { kind: "RULE" },
    });

    // An undecided suggestion also blocks: the queue must be empty-handed.
    await t.run(async (ctx) =>
      ctx.db.insert("companyMemoryCandidates", {
        companyId,
        content: "Maybe worth remembering",
        normalizedContent: "maybe worth remembering",
        category: "general",
        confidence: 0.5,
        status: "PROPOSED",
        sourceType: "CHAT",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    await expect(
      t.mutation(internal.memoryMigration.stampMigrationInternal, { companyId })
    ).resolves.toMatchObject({ stamped: false, reason: "suggestions still waiting for a decision" });

    await t.run(async (ctx) => {
      const candidate = await ctx.db.query("companyMemoryCandidates").first();
      await ctx.db.patch(candidate!._id, { status: "REJECTED" });
    });
    await expect(
      t.mutation(internal.memoryMigration.stampMigrationInternal, { companyId })
    ).resolves.toMatchObject({ stamped: true });

    const company = await t.run(async (ctx) => ctx.db.get(companyId));
    expect(company?.memoriesMigratedAt).toBeTruthy();
  });

  test("the about page is created once, mechanically, and only when needed", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const companyId = await seedCompany(t);
    await t.mutation(internal.memoryMigration.ensureAboutPageInternal, { companyId });
    await t.mutation(internal.memoryMigration.ensureAboutPageInternal, { companyId });
    const pages = await t.run(async (ctx) => ctx.db.query("wikiPages").take(10));
    expect(pages).toHaveLength(1);
    expect(pages[0].subjectKey).toBe("about-this-company");
    expect(pages[0].lastRewriteSource).toBe("TENDING");
  });
});
