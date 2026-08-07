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

  test("white-label readiness is super-admin scoped and includes widget evidence", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyId, superAdminId, adminId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: Date.now() });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      });
      const adminId = await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "ADMIN",
        companyId,
        createdAt: Date.now(),
      });
      await ctx.db.insert("systemSettings", {
        platformName: "Acme Ops",
        brandColorHex: "#123456",
        logoUrlLight: "https://cdn.example/light.png",
        logoUrlDark: "https://cdn.example/dark.png",
        emailSenderAddress: "ops@example.com",
        diagnosticRoutingEnabled: false,
      });
      await ctx.db.insert("widgets", {
        companyId,
        name: "Acme Widget",
        allowedDomains: ["https://acme.example"],
        themePrimaryColor: "#123456",
        themeGreeting: "Hello from Acme",
        themeLogoUrl: "https://cdn.example/widget.png",
        themePlaceholder: "Ask Acme",
        isActive: true,
        createdBy: superAdminId,
        createdAt: Date.now(),
      });
      return { companyId, superAdminId, adminId };
    });

    const superAdminClient = t.withIdentity({ subject: superAdminId });
    const adminClient = t.withIdentity({ subject: adminId });

    await expect(adminClient.query(api.settings.getWhiteLabelReadiness, {})).rejects.toThrow("Unauthorized");

    const readiness = await superAdminClient.query(api.settings.getWhiteLabelReadiness, {});
    expect(readiness).toMatchObject({
      readyCount: 6,
      pendingCount: 0,
      manualCount: 1,
      nextActions: ["production"],
    });
    expect(readiness.items.find((item) => item.key === "widget")).toMatchObject({
      status: "ready",
      evidence: "active-branded-widget",
    });
    expect(companyId).toBeDefined();
  });

  test("white-label module presets are super-admin scoped and code-backed", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { superAdminId, adminId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: Date.now() });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      });
      const adminId = await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "ADMIN",
        companyId,
        createdAt: Date.now(),
      });
      return { superAdminId, adminId };
    });

    const superAdminClient = t.withIdentity({ subject: superAdminId });
    const adminClient = t.withIdentity({ subject: adminId });

    await expect(adminClient.query(api.settings.getWhiteLabelModulePresets, {})).rejects.toThrow("Unauthorized");

    const presets = await superAdminClient.query(api.settings.getWhiteLabelModulePresets, {});
    expect(presets.map((preset) => preset.key)).toEqual([
      "knowledgeAssistant",
      "supportWidget",
      "operatorWorkspace",
    ]);
    expect(presets[1]).toMatchObject({
      href: "/admin/ai/widget",
      linkLabelKey: "widget",
      readinessDependencies: ["identity", "brandColor", "widget", "email", "production"],
    });
  });

  test("white-label handoff summary is super-admin scoped and composes brand, widget, and email posture", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyId, superAdminId, adminId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: Date.now() });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      });
      const adminId = await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "ADMIN",
        companyId,
        createdAt: Date.now(),
      });
      await ctx.db.insert("systemSettings", {
        platformName: "Acme Ops",
        brandColorHex: "#123456",
        logoUrlLight: "https://cdn.example/light.png",
        logoUrlDark: "https://cdn.example/dark.png",
        emailSenderName: "Acme Ops",
        emailSenderAddress: "ops@example.com",
        diagnosticRoutingEnabled: false,
      });
      await ctx.db.insert("widgets", {
        companyId,
        name: "Acme Widget",
        allowedDomains: ["https://acme.example"],
        themePrimaryColor: "#123456",
        themeGreeting: "Hello from Acme",
        themeLogoUrl: "https://cdn.example/widget.png",
        themePlaceholder: "Ask Acme",
        isActive: true,
        createdBy: superAdminId,
        createdAt: Date.now(),
      });
      return { companyId, superAdminId, adminId };
    });

    const superAdminClient = t.withIdentity({ subject: superAdminId });
    const adminClient = t.withIdentity({ subject: adminId });

    await expect(adminClient.query(api.settings.getWhiteLabelHandoffSummary, {})).rejects.toThrow("Unauthorized");

    const summary = await superAdminClient.query(api.settings.getWhiteLabelHandoffSummary, {});
    expect(summary).toMatchObject({
      productName: "Acme Ops",
      brandColorHex: "#123456",
      logoMode: "light-and-dark",
      emailFromAddress: "Acme Ops <ops@example.com>",
      widgetStatus: "ready",
      widgetEvidence: "active-branded-widget",
      diagnosticsStatus: "ready",
      productionStatus: "manual",
      nextActions: ["production"],
      recommendedPresetKeys: ["knowledgeAssistant", "supportWidget", "operatorWorkspace"],
    });
    expect(summary.readinessScore).toBeCloseTo(6 / 7);
    expect(companyId).toBeDefined();
  });

  test("white-label navigation profiles are super-admin scoped and code-backed", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { superAdminId, adminId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: Date.now() });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      });
      const adminId = await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "ADMIN",
        companyId,
        createdAt: Date.now(),
      });
      return { superAdminId, adminId };
    });

    const superAdminClient = t.withIdentity({ subject: superAdminId });
    const adminClient = t.withIdentity({ subject: adminId });

    await expect(adminClient.query(api.settings.getWhiteLabelNavigationProfiles, {})).rejects.toThrow("Unauthorized");

    const profiles = await superAdminClient.query(api.settings.getWhiteLabelNavigationProfiles, {});
    expect(profiles.map((profile) => profile.key)).toEqual([
      "customerWorkspace",
      "supportWidget",
      "operatorConsole",
    ]);
    expect(profiles[2]).toMatchObject({
      visible: ["adminDashboard", "agents", "workflows", "approvals", "runObservatory"],
      owner: ["releaseCenter", "systemHealth", "auditLogs"],
      implementationNotes: ["superAdminOnly", "auditRouteChanges", "documentHiddenRoutes"],
    });
  });

  test("white-label packaging checklist is super-admin scoped and composes handoff evidence", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { superAdminId, adminId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: Date.now() });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      });
      const adminId = await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "ADMIN",
        companyId,
        createdAt: Date.now(),
      });
      await ctx.db.insert("systemSettings", {
        platformName: "Acme Ops",
        brandColorHex: "#123456",
        logoUrlLight: "https://cdn.example/light.png",
        logoUrlDark: "https://cdn.example/dark.png",
        emailSenderName: "Acme Ops",
        emailSenderAddress: "ops@example.com",
        diagnosticRoutingEnabled: false,
      });
      await ctx.db.insert("widgets", {
        companyId,
        name: "Acme Widget",
        allowedDomains: ["https://acme.example"],
        themePrimaryColor: "#123456",
        themeGreeting: "Hello from Acme",
        themeLogoUrl: "https://cdn.example/widget.png",
        themePlaceholder: "Ask Acme",
        isActive: true,
        createdBy: superAdminId,
        createdAt: Date.now(),
      });
      return { superAdminId, adminId };
    });

    const superAdminClient = t.withIdentity({ subject: superAdminId });
    const adminClient = t.withIdentity({ subject: adminId });

    await expect(adminClient.query(api.settings.getWhiteLabelPackagingChecklist, {})).rejects.toThrow("Unauthorized");

    const checklist = await superAdminClient.query(api.settings.getWhiteLabelPackagingChecklist, {});
    expect(checklist).toMatchObject({
      title: "Acme Ops white-label packaging checklist",
      productName: "Acme Ops",
      readinessPercent: 86,
    });
    expect(checklist.sections.map((section) => section.key)).toEqual([
      "brand",
      "readiness",
      "modules",
      "navigation",
      "domains",
      "developerFollowUp",
    ]);
    expect(checklist.markdown).toContain("Runtime sender: Acme Ops <ops@example.com>");
    expect(checklist.markdown).toContain("customerWorkspace: show appDashboard");
    expect(checklist.markdown).toContain("Custom domain readiness");
    expect(checklist.markdown).toContain("ready - widgetDomains: https://acme.example");
  });

  test("white-label custom domain checklist is super-admin scoped and includes widget and email evidence", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyId, superAdminId, adminId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: Date.now() });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      });
      const adminId = await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "ADMIN",
        companyId,
        createdAt: Date.now(),
      });
      await ctx.db.insert("systemSettings", {
        platformName: "Acme Ops",
        brandColorHex: "#123456",
        emailSenderAddress: "ops@example.com",
        diagnosticRoutingEnabled: false,
      });
      await ctx.db.insert("widgets", {
        companyId,
        name: "Acme Widget",
        allowedDomains: ["https://acme.example"],
        isActive: true,
        createdBy: superAdminId,
        createdAt: Date.now(),
      });
      return { companyId, superAdminId, adminId };
    });

    const superAdminClient = t.withIdentity({ subject: superAdminId });
    const adminClient = t.withIdentity({ subject: adminId });

    await expect(adminClient.query(api.settings.getWhiteLabelCustomDomainChecklist, {})).rejects.toThrow("Unauthorized");

    const checklist = await superAdminClient.query(api.settings.getWhiteLabelCustomDomainChecklist, {});
    expect(checklist).toMatchObject({
      readyCount: 2,
      manualCount: 4,
      pendingCount: 0,
      totalCount: 6,
    });
    expect(checklist.items.find((item) => item.key === "widgetDomains")).toMatchObject({
      status: "ready",
      evidence: "https://acme.example",
    });
    expect(checklist.items.find((item) => item.key === "emailDomain")).toMatchObject({
      status: "ready",
      evidence: "example.com",
    });
    expect(companyId).toBeDefined();
  });
});
