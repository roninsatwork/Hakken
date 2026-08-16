import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

/**
 * The brain's diary (watch-it-think plan, phase 4): built purely from
 * audit rows that already exist, newest first, walled per scope — a
 * company sees its own brain's days, the platform seat the global
 * brain's, and rows outside the wiki's story never appear.
 */

describe("the brain's diary", () => {
  test("company feed shows wiki rows only, resolves living pages, walls scopes", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const now = Date.now();

    const { companyId, otherCompanyId, adminId, superAdminId, pageId } = await t.run(
      async (ctx) => {
        const companyId = await ctx.db.insert("companies", {
          name: "Diary Corp",
          createdAt: now,
        });
        const otherCompanyId = await ctx.db.insert("companies", {
          name: "Other Corp",
          createdAt: now,
        });
        const adminId = await ctx.db.insert("users", {
          email: "admin@diary.test",
          role: "ADMIN",
          companyId,
        });
        const superAdminId = await ctx.db.insert("users", {
          email: "super@diary.test",
          role: "SUPER_ADMIN",
        });
        const pageId = await ctx.db.insert("wikiPages", {
          companyId,
          kind: "POLICY",
          subjectKey: "opening-hours",
          title: "Opening hours",
          content: "We open at nine.",
          links: [],
          pinnedCorrections: [],
          rewriteCount: 0,
          lastRewriteSource: "HUMAN:test",
          createdAt: now,
          updatedAt: now,
        });
        const audit = (
          row: Partial<{
            actorId: typeof adminId;
            companyId: typeof companyId | undefined;
            entityId: string;
            metadata: string;
          }> & { actionType: string; timestamp: number }
        ) =>
          ctx.db.insert("auditLogs", {
            entityType: row.entityId ? "wikiPages" : "companies",
            ...row,
          });
        // The company brain's day, oldest to newest.
        await audit({
          actionType: "WIKI_PAGE_CREATED",
          companyId,
          entityId: pageId,
          timestamp: now - 3000,
        });
        await audit({
          actionType: "WIKI_PAGE_HUMAN_EDIT",
          companyId,
          actorId: adminId,
          entityId: pageId,
          timestamp: now - 2000,
        });
        // Noise the diary must not repeat.
        await audit({ actionType: "UPDATE_COMPANY", companyId, timestamp: now - 1500 });
        // A page that no longer exists: the entry survives, nameless.
        const goneId = await ctx.db.insert("wikiPages", {
          companyId,
          kind: "ISSUE",
          subjectKey: "gone",
          title: "Gone",
          content: "x",
          links: [],
          pinnedCorrections: [],
          rewriteCount: 0,
          lastRewriteSource: "HUMAN:test",
          createdAt: now,
          updatedAt: now,
        });
        await audit({
          actionType: "WIKI_PAGE_REWRITE",
          companyId,
          entityId: goneId,
          metadata: JSON.stringify({ subjectKey: "ISSUE:gone" }),
          timestamp: now - 1000,
        });
        await ctx.db.delete(goneId);
        // Another company's row, and a platform row: both invisible here.
        await audit({
          actionType: "WIKI_PAGE_CREATED",
          companyId: otherCompanyId,
          timestamp: now - 900,
        });
        await audit({
          actionType: "WIKI_PAGE_CREATED",
          companyId: undefined,
          timestamp: now - 800,
        });
        return { companyId, otherCompanyId, adminId, superAdminId, pageId };
      }
    );

    const asAdmin = t.withIdentity({ subject: adminId });
    const paging = { numItems: 25, cursor: null };
    const { page: entries } = await asAdmin.query(api.wikiDiary.listDiaryForCompany, {
      companyId,
      paginationOpts: paging,
    });

    // Newest first, wiki rows only, no other company's and no platform rows.
    expect(entries.map((entry) => entry.action)).toEqual([
      "WIKI_PAGE_REWRITE",
      "WIKI_PAGE_HUMAN_EDIT",
      "WIKI_PAGE_CREATED",
    ]);
    // The living page resolves to its title; the deleted one stays nameless
    // but keeps its metadata fragment.
    const [rewrite, humanEdit, created] = entries;
    expect(rewrite.pageTitle).toBeNull();
    expect(rewrite.detail).toBe("ISSUE:gone");
    expect(humanEdit.pageTitle).toBe("Opening hours");
    expect(humanEdit.pageId).toBe(pageId);
    expect(humanEdit.byPerson).toBe(true);
    expect(created.byPerson).toBe(false);

    // The platform feed sees only the global brain's row.
    const asSuper = t.withIdentity({ subject: superAdminId });
    const { page: platformEntries } = await asSuper.query(api.wikiDiary.listDiaryForGlobal, {
      paginationOpts: paging,
    });
    expect(platformEntries).toHaveLength(1);
    expect(platformEntries[0].action).toBe("WIKI_PAGE_CREATED");

    // The walls: a company admin can read neither another company's diary
    // nor the platform's.
    await expect(
      asAdmin.query(api.wikiDiary.listDiaryForCompany, {
        companyId: otherCompanyId,
        paginationOpts: paging,
      })
    ).rejects.toThrow();
    await expect(
      asAdmin.query(api.wikiDiary.listDiaryForGlobal, { paginationOpts: paging })
    ).rejects.toThrow();
  });
});
