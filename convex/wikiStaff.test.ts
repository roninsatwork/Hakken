import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { WIKI_STAFF } from "./wikiStaff";

/**
 * Phase 0's ground rules (wiki-agents plan): the staff are real agents —
 * seeded once, visible, switchable, run-recorded — and never deletable.
 */

describe("the wiki's staff on the Agents screen", () => {
  test("seeding is idempotent, and a stood-down agent stays stood down", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await t.mutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});
    await t.mutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});

    const staff = await t.run(async (ctx) =>
      (await ctx.db.query("agents").collect()).filter((agent) => agent.systemKey)
    );
    expect(staff).toHaveLength(WIKI_STAFF.length);
    expect(staff.map((agent) => agent.name).sort()).toEqual(
      [...WIKI_STAFF.map((member) => member.name)].sort()
    );

    // Stand one down; re-seeding must not switch it back on.
    await t.run(async (ctx) => {
      const tidier = (await ctx.db.query("agents").collect()).find(
        (agent) => agent.systemKey === "WIKI_TIDIER"
      );
      await ctx.db.patch(tidier!._id, { isActive: false });
    });
    await t.mutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});
    await expect(
      t.query(internal.wikiStaff.isStaffActiveInternal, { systemKey: "WIKI_TIDIER" })
    ).resolves.toBe(false);
    await expect(
      t.query(internal.wikiStaff.isStaffActiveInternal, { systemKey: "WIKI_DISTILLER" })
    ).resolves.toBe(true);
  });

  test("a run lands on the same run table every agent's history uses", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await t.mutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});
    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", { name: "Wiki Corp", createdAt: Date.now() })
    );

    const startedAt = Date.now() - 5_000;
    await t.mutation(internal.wikiStaff.recordStaffRunInternal, {
      systemKey: "WIKI_LINKER",
      companyId,
      trigger: "SCHEDULE",
      objective: "Connect sparsely linked pages.",
      summary: "Added 12 connections.",
      startedAt,
    });

    const runs = await t.run(async (ctx) => await ctx.db.query("agentRuns").collect());
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      title: "The Linker",
      status: "SUCCESS",
      triggerType: "SCHEDULE",
      companyId,
      finalOutput: "Added 12 connections.",
      startedAt,
    });
  });

  test("the staff can be stood down but never deleted", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await t.mutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});
    const superAdminId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "super@test.com", role: "SUPER_ADMIN" })
    );
    const distiller = await t.run(async (ctx) =>
      (await ctx.db.query("agents").collect()).find(
        (agent) => agent.systemKey === "WIKI_DISTILLER"
      )
    );

    await expect(
      t.withIdentity({ subject: superAdminId }).mutation(api.agents.deleteAgent, {
        id: distiller!._id,
      })
    ).rejects.toThrow("Switch it off instead");
  });
});
