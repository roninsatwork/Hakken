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

    const plainUserId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "plain@test.com", role: "USER", createdAt: Date.now() })
    );
    const userClient = t.withIdentity({ subject: plainUserId });

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
      brandColorHex: "#123456",
      lightBg: "#ffffff",
      darkBg: "#000000",
      diagnosticRoutingEnabled: true,
    });

    // The login screen is unauthenticated, so what this query returns is what a
    // stranger receives. It used to be the whole row — including what the
    // platform charges and who to contact about it — because the validator
    // spread every column and inherited each new one automatically.
    expect(settings).not.toHaveProperty("monthlyBasePrice");
    expect(settings).not.toHaveProperty("monthlySeatPrice");
    expect(settings).not.toHaveProperty("currencySymbol");
    expect(settings).not.toHaveProperty("salesContactEmail");
    expect(settings).not.toHaveProperty("emailSenderAddress");
    expect(settings).not.toHaveProperty("emailSenderName");

    // The screens that edit those fields read them from the admin door.
    await expect(t.query(api.settings.getForAdmin, {})).rejects.toThrow();
    await expect(userClient.query(api.settings.getForAdmin, {})).rejects.toThrow();
    expect(await superAdminClient.query(api.settings.getForAdmin, {})).toMatchObject({
      platformName: "Sonae Ops Updated",
      currencySymbol: "$",
      monthlyBasePrice: 100,
      monthlySeatPrice: 10,
      emailSenderName: "Sonae Ops",
      emailSenderAddress: "ops@example.com",
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

  test("a wrong logo can be taken off, and only by a super admin", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { superAdminId, adminId, storageId } = await t.run(async (ctx) => {
      const superAdminId = await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      });
      const adminId = await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "ADMIN",
        createdAt: Date.now(),
      });
      const storageId = await ctx.storage.store(new Blob(["light-logo"], { type: "image/png" }));
      await ctx.db.insert("systemSettings", {
        platformName: "Acme Ops",
        logoUrlLight: storageId,
        logoUrlDark: "https://cdn.example/dark.png",
      });
      return { superAdminId, adminId, storageId };
    });

    await expect(
      t.withIdentity({ subject: adminId }).mutation(api.settings.clearLogo, { mode: "light" })
    ).rejects.toThrow("Unauthorized");

    const superAdminClient = t.withIdentity({ subject: superAdminId });
    await expect(superAdminClient.mutation(api.settings.clearLogo, { mode: "light" })).resolves.toBe(true);

    const afterLight = await t.query(api.settings.get, {});
    expect(afterLight.logoUrlLight).toBeUndefined();
    expect(afterLight.logoUrlDark).toBe("https://cdn.example/dark.png");

    // The uploaded file goes with the setting that pointed at it.
    expect(await t.run(async (ctx) => ctx.storage.getUrl(storageId))).toBeNull();

    await expect(superAdminClient.mutation(api.settings.clearLogo, { mode: "dark" })).resolves.toBe(true);
    expect((await t.query(api.settings.get, {})).logoUrlDark).toBeUndefined();

    // Nothing left to remove is not a change worth recording.
    await expect(superAdminClient.mutation(api.settings.clearLogo, { mode: "dark" })).resolves.toBe(false);

    const auditLogs = await t.run(async (ctx) => ctx.db.query("auditLogs").collect());
    expect(auditLogs).toHaveLength(2);
    expect(auditLogs[0]).toMatchObject({
      actionType: "UPDATE_SYSTEM_PREFERENCES",
      actorId: superAdminId,
      entityType: "systemSettings",
    });
    expect(JSON.parse(auditLogs[0].metadata as string)).toMatchObject({
      modifiedFields: ["logoUrlLight"],
      changes: [{ field: "logoUrlLight", from: storageId, to: null }],
    });
  });

});
