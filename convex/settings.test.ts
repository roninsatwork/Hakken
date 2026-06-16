import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

describe("OWASP: Broken Access Control - Settings", () => {
  test("Standard USER cannot update global platform settings", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const hackerUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "hacker@test.com",
        role: "USER"
      });
    });

    const maliciousClient = t.withIdentity({ subject: hackerUserId });

    await expect(
      maliciousClient.mutation(api.settings.update, {
        platformName: "Hacked Platform"
      })
    ).rejects.toThrow("Unauthorized");
  });

  test("Standard USER cannot generate system-level upload URLs", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const hackerUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "hacker@test.com",
        role: "USER"
      });
    });

    const maliciousClient = t.withIdentity({ subject: hackerUserId });

    await expect(
      maliciousClient.mutation(api.settings.generateUploadUrl)
    ).rejects.toThrow("Unauthorized");
  });

  test("settings read defaults and super admins can insert, update, audit, and upload", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const superAdminId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      })
    );
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    expect(await t.query(api.settings.get, {})).toMatchObject({
      platformName: "Sonae",
      brandColorHex: "#E26D28",
      diagnosticRoutingEnabled: false,
    });

    await expect(
      superAdminClient.mutation(api.settings.update, {
        platformName: "Sonae Ops",
        currencySymbol: "$",
        monthlyBasePrice: 100,
        monthlySeatPrice: 10,
        emailSenderName: "Sonae Ops",
        emailSenderAddress: "ops@example.com",
        brandColorHex: "#123456",
        headingFontFamily: "Inter",
        bodyFontFamily: "Arial",
        diagnosticRoutingEnabled: true,
      })
    ).resolves.toBe(true);
    await expect(
      superAdminClient.mutation(api.settings.update, {
        platformName: "Sonae Ops Updated",
        lightBg: "#ffffff",
        darkBg: "#000000",
      })
    ).resolves.toBe(true);
    await expect(superAdminClient.mutation(api.settings.generateUploadUrl, {})).resolves.toContain("http");

    const settings = await t.query(api.settings.get, {});
    const { settingsRows, auditLogs } = await t.run(async (ctx) => ({
      settingsRows: await ctx.db.query("systemSettings").collect(),
      auditLogs: await ctx.db.query("auditLogs").collect(),
    }));

    expect(settings).toMatchObject({
      platformName: "Sonae Ops Updated",
      currencySymbol: "$",
      monthlyBasePrice: 100,
      monthlySeatPrice: 10,
      emailSenderName: "Sonae Ops",
      emailSenderAddress: "ops@example.com",
      brandColorHex: "#123456",
      lightBg: "#ffffff",
      darkBg: "#000000",
      diagnosticRoutingEnabled: true,
    });
    expect(settingsRows).toHaveLength(1);
    expect(auditLogs.map((log) => log.actionType)).toEqual(["UPDATE_SYSTEM_PREFERENCES", "UPDATE_SYSTEM_PREFERENCES"]);
    expect(auditLogs[0]).toMatchObject({
      actorId: superAdminId,
      entityType: "systemSettings",
      entityId: "global_settings",
    });
    expect(auditLogs[1].entityId).toBe(settingsRows[0]._id);
  });
});
