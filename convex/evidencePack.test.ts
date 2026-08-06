import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

/**
 * The evidence pack end to end: who may take one, whose records it holds, and
 * the record that it was taken.
 *
 * Scope is the part that matters. A customer's pack containing another
 * customer's records would be worse than having no pack at all, so it is
 * decided in the action from who is asking rather than passed in by a screen —
 * and these are the tests that hold that true.
 */
describe("the evidence pack", () => {
  const setUp = async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const ids = await t.run(async (ctx) => {
      const companyA = await ctx.db.insert("companies", { name: "Acme", createdAt: Date.now() });
      const companyB = await ctx.db.insert("companies", { name: "Other", createdAt: Date.now() });

      const superAdminId = await ctx.db.insert("users", { email: "super@test", role: "SUPER_ADMIN" });
      const adminA = await ctx.db.insert("users", { email: "a@test", role: "ADMIN", companyId: companyA });
      const auditorA = await ctx.db.insert("users", { email: "aud@test", role: "AUDITOR", companyId: companyA });
      const ordinary = await ctx.db.insert("users", { email: "u@test", role: "USER", companyId: companyA });

      const now = Date.now();
      const agentBase = {
        modelId: "model-under-test",
        thinkingMode: false,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      await ctx.db.insert("agents", { ...agentBase, name: "Acme assistant", companyId: companyA });
      await ctx.db.insert("agents", { ...agentBase, name: "Other assistant", companyId: companyB });

      await ctx.db.insert("aiRules", {
        companyId: companyA,
        trigger: "always",
        instruction: "Never spend money.",
        priority: "CRITICAL",
        isActive: true,
        createdBy: adminA,
        createdAt: now,
      });

      return { companyA, superAdminId, adminA, auditorA, ordinary };
    });

    return { t, ...ids };
  };

  const period = { from: 0, to: Date.now() + 60_000 };

  test("a workspace pack holds that workspace's systems and nobody else's", async () => {
    const { t, adminA } = await setUp();

    const pack = await t.withIdentity({ subject: adminA }).action(api.evidencePack.produce, period);

    expect(pack.scope).toBe("WORKSPACE");
    const names = pack.register.map((entry) => entry.name);
    expect(names).toContain("Acme assistant");
    expect(names).not.toContain("Other assistant");
  });

  test("a platform pack holds every workspace", async () => {
    const { t, superAdminId } = await setUp();

    const pack = await t.withIdentity({ subject: superAdminId }).action(api.evidencePack.produce, period);

    expect(pack.scope).toBe("PLATFORM");
    expect(pack.register.map((entry) => entry.name)).toEqual(
      expect.arrayContaining(["Acme assistant", "Other assistant"])
    );
  });

  test("an auditor can take one, because an export they cannot take is not evidence", async () => {
    const { t, auditorA } = await setUp();

    const pack = await t.withIdentity({ subject: auditorA }).action(api.evidencePack.produce, period);

    expect(pack.scope).toBe("WORKSPACE");
  });

  test("an ordinary user cannot", async () => {
    const { t, ordinary } = await setUp();

    await expect(
      t.withIdentity({ subject: ordinary }).action(api.evidencePack.produce, period)
    ).rejects.toThrow("Unauthorized");
  });

  test("taking a pack is itself recorded, on the trail the pack is drawn from", async () => {
    const { t, adminA, companyA } = await setUp();

    await t.withIdentity({ subject: adminA }).action(api.evidencePack.produce, period);

    const exports = await t.run(async (ctx) =>
      ctx.db
        .query("auditLogs")
        .filter((q) => q.eq(q.field("actionType"), "EXPORT_EVIDENCE_PACK"))
        .collect()
    );

    expect(exports).toHaveLength(1);
    expect(exports[0].actorId).toBe(adminA);
    expect(exports[0].companyId).toBe(companyA);
    // The counts go on the record, so an auditor can tell a full export from a
    // near-empty one without opening the file.
    expect(JSON.parse(exports[0].metadata ?? "{}").counts.systems).toBeGreaterThan(0);
  });

  test("the policies in force are the workspace's own", async () => {
    const { t, adminA } = await setUp();

    const pack = await t.withIdentity({ subject: adminA }).action(api.evidencePack.produce, period);

    expect(pack.policies.map((policy) => policy.instruction)).toContain("Never spend money.");
  });
});
