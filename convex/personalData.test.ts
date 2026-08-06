import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

/**
 * Erasure and subject access, end to end.
 *
 * The unit tests prove the manifest covers every table. These prove the walk
 * actually deletes what it says, keeps what it says, and leaves the shared
 * records a workspace depends on standing.
 */
describe("personal data rights", () => {
  const setUp = async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const ids = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: Date.now() });
      const superAdminId = await ctx.db.insert("users", { email: "super@test", role: "SUPER_ADMIN" });
      const subjectId = await ctx.db.insert("users", {
        email: "leaver@test",
        name: "A Leaver",
        role: "USER",
        companyId,
      });
      const otherId = await ctx.db.insert("users", { email: "stays@test", role: "USER", companyId });

      // Theirs: goes.
      const threadId = await ctx.db.insert("threads", {
        userId: subjectId,
        title: "A chat",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("messages", {
        threadId,
        userId: subjectId,
        role: "user",
        content: "Something they said",
        createdAt: Date.now(),
      });
      await ctx.db.insert("logins", { userId: subjectId, timestamp: Date.now(), ip: "127.0.0.1", device: "Test", location: "Local", status: "SUCCESS" as const });

      // Someone else's: untouched.
      await ctx.db.insert("logins", { userId: otherId, timestamp: Date.now(), ip: "127.0.0.1", device: "Test", location: "Local", status: "SUCCESS" as const });

      // Shared: stays, minus the name.
      const ruleId = await ctx.db.insert("aiRules", {
        companyId,
        trigger: "always",
        instruction: "Never spend money.",
        priority: "CRITICAL",
        isActive: true,
        createdBy: subjectId,
        createdAt: Date.now(),
      });

      // Evidence: kept whole.
      await ctx.db.insert("auditLogs", {
        actorId: subjectId,
        actionType: "UPDATE_COMPANY",
        entityType: "companies",
        companyId,
        timestamp: Date.now(),
      });

      return { companyId, superAdminId, subjectId, otherId, ruleId };
    });

    return { t, ...ids };
  };

  test("what they said is gone", async () => {
    const { t, superAdminId } = await setUp();

    await t.withIdentity({ subject: superAdminId }).action(api.personalData.erase, { email: "leaver@test" });

    const left = await t.run(async (ctx) => ({
      threads: await ctx.db.query("threads").collect(),
      messages: await ctx.db.query("messages").collect(),
      person: await ctx.db.query("users").filter((q) => q.eq(q.field("email"), "leaver@test")).first(),
    }));

    expect(left.threads).toHaveLength(0);
    expect(left.messages).toHaveLength(0);
    expect(left.person).toBeNull();
  });

  test("somebody else's records are untouched", async () => {
    const { t, superAdminId, otherId } = await setUp();

    await t.withIdentity({ subject: superAdminId }).action(api.personalData.erase, { email: "leaver@test" });

    const logins = await t.run(async (ctx) => ctx.db.query("logins").collect());

    expect(logins).toHaveLength(1);
    expect(logins[0].userId).toBe(otherId);
  });

  test("the workspace's rules survive, with the name taken off", async () => {
    // Destroying a company's configuration because its author left is not what
    // erasure asks for, and would be a far worse outcome than the request.
    const { t, superAdminId, ruleId } = await setUp();

    await t.withIdentity({ subject: superAdminId }).action(api.personalData.erase, { email: "leaver@test" });

    const rule = await t.run(async (ctx) => ctx.db.get(ruleId));

    expect(rule?.instruction).toBe("Never spend money.");
    expect(rule?.createdBy).toBeUndefined();
  });

  test("the audit trail is kept whole, name and all", async () => {
    const { t, superAdminId, subjectId } = await setUp();

    await t.withIdentity({ subject: superAdminId }).action(api.personalData.erase, { email: "leaver@test" });

    const logs = await t.run(async (ctx) =>
      ctx.db.query("auditLogs").filter((q) => q.eq(q.field("actionType"), "UPDATE_COMPANY")).collect()
    );

    expect(logs).toHaveLength(1);
    expect(logs[0].actorId).toBe(subjectId);
  });

  test("the erasure is recorded, in sentences and without the data it erased", async () => {
    const { t, superAdminId } = await setUp();

    await t.withIdentity({ subject: superAdminId }).action(api.personalData.erase, { email: "leaver@test" });

    const record = await t.run(async (ctx) =>
      ctx.db.query("auditLogs").filter((q) => q.eq(q.field("actionType"), "ERASE_PERSONAL_DATA")).first()
    );

    const summary: string[] = JSON.parse(record?.metadata ?? "{}").summary;
    expect(summary[0]).toContain("leaver@test");
    expect(summary.some((line) => line.startsWith("Kept:"))).toBe(true);
    // A record that quoted what it erased would put it straight back.
    expect(record?.metadata).not.toContain("Something they said");
  });

  test("an administrator cannot erase themselves and end the session doing it", async () => {
    const { t, superAdminId } = await setUp();

    await expect(
      t.withIdentity({ subject: superAdminId }).action(api.personalData.erase, { email: "super@test" })
    ).rejects.toThrow("cannot erase your own account");
  });

  test("an unknown address is said to be unknown, rather than silently doing nothing", async () => {
    const { t, superAdminId } = await setUp();

    await expect(
      t.withIdentity({ subject: superAdminId }).action(api.personalData.erase, { email: "nobody@test" })
    ).rejects.toThrow("No account was found");
  });

  test("subject access returns what is held, and is itself recorded", async () => {
    const { t, superAdminId } = await setUp();

    const result = await t
      .withIdentity({ subject: superAdminId })
      .action(api.personalData.produceSubjectAccess, { email: "leaver@test" });

    expect(result.person.email).toBe("leaver@test");
    expect(result.sections.map((section) => section.table)).toEqual(
      expect.arrayContaining(["threads", "messages", "logins"])
    );

    const record = await t.run(async (ctx) =>
      ctx.db.query("auditLogs").filter((q) => q.eq(q.field("actionType"), "EXPORT_PERSONAL_DATA")).first()
    );
    expect(record).not.toBeNull();
  });

  test("an ordinary user can neither read nor erase", async () => {
    const { t, otherId } = await setUp();

    await expect(
      t.withIdentity({ subject: otherId }).action(api.personalData.produceSubjectAccess, { email: "leaver@test" })
    ).rejects.toThrow("Unauthorized");
    await expect(
      t.withIdentity({ subject: otherId }).action(api.personalData.erase, { email: "leaver@test" })
    ).rejects.toThrow("Unauthorized");
  });
});
