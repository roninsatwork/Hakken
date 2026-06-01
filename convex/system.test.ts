import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

describe("OWASP: Broken Access Control - System", () => {
  test("Standard USER cannot update the global System Prompt", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const hackerUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "hacker@test.com",
        role: "USER"
      });
    });

    const maliciousClient = t.withIdentity({ subject: hackerUserId });

    await expect(
      maliciousClient.mutation(api.system.updateSystemPrompt, { prompt: "You are a hacked bot." })
    ).rejects.toThrow("Unauthorized");
  });

  test("Standard USER cannot modify the Google Analytics tracking ID", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const hackerUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "hacker@test.com",
        role: "USER"
      });
    });

    const maliciousClient = t.withIdentity({ subject: hackerUserId });

    await expect(
      maliciousClient.mutation(api.system.updateAnalyticsId, { trackingId: "G-HACKEDID" })
    ).rejects.toThrow("Unauthorized");
  });

  test("Standard USER cannot alter the PII Redaction Firewall configuration", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const hackerUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "hacker@test.com",
        role: "USER"
      });
    });

    const maliciousClient = t.withIdentity({ subject: hackerUserId });

    await expect(
      maliciousClient.mutation(api.system.updatePiiConfig, { configStr: "{ enabled: false }" })
    ).rejects.toThrow("Unauthorized");
  });

  test("system prompt and analytics ID reads, writes, trimming, and audits work", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const superAdminId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      })
    );
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    expect(await t.query(api.system.getSystemPrompt, {})).toBeNull();
    expect(await t.query(api.system.getAnalyticsId, {})).toBeNull();

    const promptConfigId = await superAdminClient.mutation(api.system.updateSystemPrompt, {
      prompt: "Be helpful.",
    });
    await expect(superAdminClient.mutation(api.system.updateSystemPrompt, { prompt: "Be precise." })).resolves.toBe(
      promptConfigId
    );
    const analyticsConfigId = await superAdminClient.mutation(api.system.updateAnalyticsId, {
      trackingId: "  G-ABC123  ",
    });
    await expect(superAdminClient.mutation(api.system.updateAnalyticsId, { trackingId: " G-XYZ789 " })).resolves.toBe(
      analyticsConfigId
    );

    expect(await superAdminClient.query(api.system.getSystemPrompt, {})).toBe("Be precise.");
    expect(await t.run(async (ctx) => ctx.runQuery(internal.system.getInternalSystemPrompt, {}))).toBe("Be precise.");
    expect(await t.query(api.system.getAnalyticsId, {})).toBe("G-XYZ789");

    const auditLogs = await t.run(async (ctx) => ctx.db.query("auditLogs").collect());

    expect(auditLogs.map((log) => log.actionType)).toEqual([
      "UPDATE_SYSTEM_PROMPT",
      "UPDATE_SYSTEM_PROMPT",
      "UPDATE_ANALYTICS_ID",
      "UPDATE_ANALYTICS_ID",
    ]);
    expect(auditLogs[1]).toMatchObject({
      actorId: superAdminId,
      entityId: "SYSTEM_PROMPT",
    });
    expect(auditLogs[3]).toMatchObject({
      actorId: superAdminId,
      entityId: "GOOGLE_ANALYTICS_ID",
    });
  });

  test("admins can read PII config, only super admins can update it", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminId, superAdminId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
      const adminId = await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "ADMIN",
        companyId,
        createdAt: Date.now(),
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      });

      return { adminId, superAdminId };
    });

    const adminClient = t.withIdentity({ subject: adminId });
    const superAdminClient = t.withIdentity({ subject: superAdminId });
    const configStr = JSON.stringify({ enabled: false, maskCharacter: "#" });

    expect(await adminClient.query(api.system.getPiiConfig, {})).toMatchObject({ enabled: false });
    await expect(adminClient.mutation(api.system.updatePiiConfig, { configStr })).rejects.toThrow("Unauthorized");
    await expect(superAdminClient.mutation(api.system.updatePiiConfig, { configStr })).resolves.toBe(true);
    expect(await adminClient.query(api.system.getPiiConfig, {})).toMatchObject({
      enabled: false,
      maskCharacter: "#",
    });

    const auditLog = await t.run(async (ctx) => ctx.db.query("auditLogs").first());

    expect(auditLog).toMatchObject({
      actionType: "UPDATE_PII_FIREWALL",
      actorId: superAdminId,
      entityType: "systemConfig",
      entityId: "PII_REDACTION_CONFIG",
      metadata: configStr,
    });
  });
});
