import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const widgetInput = {
  name: "Website Bot",
  allowedDomains: ["https://example.com"],
  isActive: true,
};

describe("Widget Authorization", () => {
  test("only admins can manage company widgets and only super admins can manage global widgets", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const companyId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Widget Corp", createdAt: Date.now() });
    });

    const { userId, adminId, superAdminId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "user@example.com",
        role: "USER",
        companyId,
      });
      const adminId = await ctx.db.insert("users", {
        email: "admin@example.com",
        role: "ADMIN",
        companyId,
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });

      return { userId, adminId, superAdminId };
    });

    const userClient = t.withIdentity({ subject: userId });
    const adminClient = t.withIdentity({ subject: adminId });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    await expect(
      userClient.mutation(api.widgets.saveWidget, {
        ...widgetInput,
        companyId,
      })
    ).rejects.toThrow("Unauthorized");

    const companyWidgetId = await adminClient.mutation(api.widgets.saveWidget, {
      ...widgetInput,
      companyId,
    });
    const companyWidget = await t.run(async (ctx) => await ctx.db.get(companyWidgetId));
    expect(companyWidget?.companyId).toBe(companyId);

    await expect(
      adminClient.mutation(api.widgets.saveWidget, {
        ...widgetInput,
        isGlobal: true,
      })
    ).rejects.toThrow("Unauthorized: Only Super Admins can manage global widgets.");

    const globalWidgetId = await superAdminClient.mutation(api.widgets.saveWidget, {
      ...widgetInput,
      isGlobal: true,
    });
    const globalWidget = await t.run(async (ctx) => await ctx.db.get(globalWidgetId));
    expect(globalWidget?.isGlobal).toBe(true);
  });

  test("widget queries, updates, deletes, and public config are scoped and audited", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyAId, companyBId, adminAId, adminBId, superAdminId, agentId } = await t.run(async (ctx) => {
      const companyAId = await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
      const companyBId = await ctx.db.insert("companies", { name: "Company B", createdAt: Date.now() });
      const adminAId = await ctx.db.insert("users", {
        email: "admin-a@test.com",
        role: "ADMIN",
        companyId: companyAId,
        createdAt: Date.now(),
      });
      const adminBId = await ctx.db.insert("users", {
        email: "admin-b@test.com",
        role: "ADMIN",
        companyId: companyBId,
        createdAt: Date.now(),
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      });
      const agentId = await ctx.db.insert("agents", {
        name: "Widget Agent",
        avatar: "agent.png",
        modelId: "safe-model",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      return { companyAId, companyBId, adminAId, adminBId, superAdminId, agentId };
    });

    const adminAClient = t.withIdentity({ subject: adminAId });
    const adminBClient = t.withIdentity({ subject: adminBId });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    const widgetId = await adminAClient.mutation(api.widgets.saveWidget, {
      ...widgetInput,
      companyId: companyAId,
      agentId,
      themePrimaryColor: "#111111",
      themeGreeting: "Hello",
      themePlaceholder: "Ask us",
      enableSounds: true,
      showPopupPreview: true,
      requireName: true,
      requireEmail: false,
      conversationStarters: ["Book a viewing"],
      enableGreeting: true,
    });

    await expect(adminBClient.query(api.widgets.getWidgetsByCompany, { companyId: companyAId })).rejects.toThrow(
      "Unauthorized Access"
    );
    expect((await adminAClient.query(api.widgets.getWidgetsByCompany, { companyId: companyAId })).map((widget) => widget._id)).toEqual([
      widgetId,
    ]);
    expect(await t.query(api.widgets.getWidgetById, { widgetId })).toMatchObject({
      _id: widgetId,
      name: "Website Bot",
      companyId: companyAId,
      agentId,
      allowedDomains: ["https://example.com"],
      agentAvatar: "agent.png",
    });

    await expect(
      adminBClient.mutation(api.widgets.saveWidget, {
        ...widgetInput,
        widgetId,
        companyId: companyBId,
      })
    ).rejects.toThrow("Widget not found");
    await expect(
      adminAClient.mutation(api.widgets.saveWidget, {
        ...widgetInput,
        widgetId,
        companyId: companyAId,
        name: "Updated Bot",
        isActive: false,
      })
    ).resolves.toBe(widgetId);

    expect(await t.query(api.widgets.getWidgetById, { widgetId })).toBeNull();

    const globalWidgetId = await superAdminClient.mutation(api.widgets.saveWidget, {
      ...widgetInput,
      name: "Global Widget",
      isGlobal: true,
    });
    expect((await superAdminClient.query(api.widgets.getGlobalWidgets, {})).map((widget) => widget._id)).toEqual([globalWidgetId]);

    await expect(adminAClient.mutation(api.widgets.deleteWidget, { widgetId: globalWidgetId, companyId: companyAId })).rejects.toThrow(
      "Unauthorized"
    );
    await expect(adminAClient.mutation(api.widgets.deleteWidget, { widgetId, companyId: companyAId })).resolves.toBe(true);

    const { deletedWidget, auditLogs } = await t.run(async (ctx) => ({
      deletedWidget: await ctx.db.get(widgetId),
      auditLogs: await ctx.db.query("auditLogs").collect(),
    }));

    expect(deletedWidget).toBeNull();
    expect(auditLogs.map((log) => log.actionType)).toEqual(["CREATE_WIDGET", "UPDATE_WIDGET", "CREATE_WIDGET", "DELETE_WIDGET"]);
  });

  test("anonymous widget thread and upload flow enforces origin, thread mapping, quota, and file policy", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyId, creatorId, widgetId, inactiveWidgetId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Widget Corp", createdAt: Date.now() });
      const creatorId = await ctx.db.insert("users", {
        email: "creator@test.com",
        role: "ADMIN",
        companyId,
        createdAt: Date.now(),
      });
      const widgetId = await ctx.db.insert("widgets", {
        companyId,
        name: "Website Bot",
        allowedDomains: ["example.com"],
        isActive: true,
        createdBy: creatorId,
        createdAt: Date.now(),
      });
      const inactiveWidgetId = await ctx.db.insert("widgets", {
        companyId,
        name: "Inactive Bot",
        allowedDomains: ["*"],
        isActive: false,
        createdBy: creatorId,
        createdAt: Date.now(),
      });

      return { companyId, creatorId, widgetId, inactiveWidgetId };
    });

    await expect(
      t.mutation(api.widgets.createWidgetThread, {
        widgetId,
        sourceUrl: "javascript:alert(1)",
      })
    ).rejects.toThrow("Unauthorized: Invalid source URL format");
    await expect(
      t.mutation(api.widgets.createWidgetThread, {
        widgetId,
        sourceUrl: "https://evil.example.net",
      })
    ).rejects.toThrow("Unauthorized: Source origin is not authorized for this widget.");

    const threadId = await t.mutation(api.widgets.createWidgetThread, {
      widgetId,
      sourceUrl: "https://support.example.com/help",
    });
    const otherThreadId = await t.run(async (ctx) =>
      ctx.db.insert("threads", {
        widgetId: inactiveWidgetId,
        title: "Other",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    const storageId = await t.run(async (ctx) => {
      const storageId = await ctx.storage.store(new Blob(["image"], { type: "image/png" }));
      await ctx.db.insert("mockStorageMetadata", {
        storageId,
        size: 5,
        contentType: "image/png",
      });
      return storageId;
    });

    await expect(t.mutation(api.widgets.generateWidgetUploadUrl, { widgetId: inactiveWidgetId, threadId })).rejects.toThrow(
      "Invalid or inactive Widget"
    );
    await expect(t.mutation(api.widgets.generateWidgetUploadUrl, { widgetId, threadId: otherThreadId })).rejects.toThrow(
      "Invalid thread mapping for target widget"
    );
    await expect(t.mutation(api.widgets.generateWidgetUploadUrl, { widgetId, threadId })).resolves.toContain("http");
    await expect(t.mutation(api.widgets.finalizeWidgetUpload, { widgetId, threadId, storageId })).resolves.toEqual({
      success: true,
      storageId,
    });

    await t.run(async (ctx) => {
      for (let i = 0; i < 10; i++) {
        await ctx.db.insert("messages", {
          threadId,
          role: "user",
          content: `attachment ${i}`,
          attachments: [storageId],
          createdAt: Date.now() + i,
        });
      }
    });

    await expect(t.mutation(api.widgets.generateWidgetUploadUrl, { widgetId, threadId })).rejects.toThrow(
      "Upload quota exceeded for this conversation thread"
    );

    const { thread, auditLogs } = await t.run(async (ctx) => ({
      thread: await ctx.db.get(threadId),
      auditLogs: await ctx.db.query("auditLogs").collect(),
    }));

    expect(thread).toMatchObject({
      companyId,
      widgetId,
      sourceUrl: "https://support.example.com/help",
      title: "Widget Interaction",
    });
    expect(auditLogs).toEqual([]);
    expect(creatorId).toBeDefined();
  });
});
