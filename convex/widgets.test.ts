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
    expect(await adminAClient.query(api.widgets.getPrimaryWidgetByCompany, { companyId: companyAId })).toMatchObject({
      _id: widgetId,
      name: "Website Bot",
      companyId: companyAId,
    });
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
    expect(await superAdminClient.query(api.widgets.getPrimaryGlobalWidget, {})).toMatchObject({
      _id: globalWidgetId,
      name: "Global Widget",
      isGlobal: true,
    });

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

  test("public widget config falls back to system branding when widget theme is unset", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const widgetId = await t.run(async (ctx) => {
      await ctx.db.insert("systemSettings", {
        platformName: "Acme Assist",
        brandColorHex: "#123456",
        logoUrlLight: "https://cdn.example/acme-light.png",
      });
      const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: Date.now() });
      const creatorId = await ctx.db.insert("users", {
        email: "creator@test.com",
        role: "ADMIN",
        companyId,
        createdAt: Date.now(),
      });
      return await ctx.db.insert("widgets", {
        companyId,
        name: "Website Bot",
        allowedDomains: ["*"],
        isActive: true,
        createdBy: creatorId,
        createdAt: Date.now(),
      });
    });

    await expect(t.query(api.widgets.getWidgetById, { widgetId })).resolves.toMatchObject({
      name: "Website Bot",
      themePrimaryColor: "#123456",
      themeLogoUrl: "https://cdn.example/acme-light.png",
      themeGreeting: "Hi! How can Acme Assist help you today?",
      themePlaceholder: "Message Acme Assist...",
    });
  });

  test("anonymous widget thread and upload flow enforces origin, thread mapping, quota, and file policy", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyId, creatorId, widgetId, inactiveWidgetId, agentId, otherAgentId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Widget Corp", createdAt: Date.now() });
      const creatorId = await ctx.db.insert("users", {
        email: "creator@test.com",
        role: "ADMIN",
        companyId,
        createdAt: Date.now(),
      });
      const agentId = await ctx.db.insert("agents", {
        name: "Widget Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const otherAgentId = await ctx.db.insert("agents", {
        name: "Other Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const widgetId = await ctx.db.insert("widgets", {
        companyId,
        agentId,
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

      return { companyId, creatorId, widgetId, inactiveWidgetId, agentId, otherAgentId };
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

    const createdThread = await t.mutation(api.widgets.createWidgetThread, {
      widgetId,
      sourceUrl: "https://support.example.com/help",
    });
    const { threadId, accessToken } = createdThread;
    expect(accessToken).toEqual(expect.any(String));
    await expect(t.query(api.chat.getMessages, { threadId })).resolves.toBeNull();
    await expect(t.query(api.chat.getMessages, { threadId, widgetAccessToken: "wrong-token" })).resolves.toBeNull();
    await expect(t.mutation(api.chat.sendMessage, {
      threadId,
      content: "Injected visitor message",
      widgetAccessToken: "wrong-token",
    })).rejects.toThrow("Unauthorized: Invalid widget session");
    await expect(t.mutation(api.chat.sendMessage, {
      threadId,
      content: "Switch me",
      dynamicAgentId: otherAgentId,
      widgetAccessToken: accessToken,
    })).rejects.toThrow("Unauthorized: Widget conversations cannot switch agents");
    await expect(t.mutation(api.chat.sendMessage, {
      threadId,
      content: "Legitimate visitor message",
      dynamicAgentId: agentId,
      widgetAccessToken: accessToken,
    })).resolves.toBe(true);
    await expect(t.query(api.chat.getMessages, { threadId, widgetAccessToken: accessToken })).resolves.toMatchObject([
      { role: "user", content: "Legitimate visitor message" },
    ]);
    const otherThreadId = await t.run(async (ctx) =>
      ctx.db.insert("threads", {
        widgetId: inactiveWidgetId,
        widgetAccessTokenHash: "inactive-token-hash",
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

    await expect(t.mutation(api.widgets.generateWidgetUploadUrl, { widgetId: inactiveWidgetId, threadId, widgetAccessToken: accessToken })).rejects.toThrow(
      "Invalid or inactive Widget"
    );
    await expect(t.mutation(api.widgets.generateWidgetUploadUrl, { widgetId, threadId: otherThreadId, widgetAccessToken: accessToken })).rejects.toThrow(
      "Invalid thread mapping for target widget"
    );
    await expect(t.mutation(api.widgets.generateWidgetUploadUrl, { widgetId, threadId, widgetAccessToken: "wrong-token" })).rejects.toThrow(
      "Unauthorized: Invalid widget session"
    );
    await expect(t.mutation(api.widgets.generateWidgetUploadUrl, { widgetId, threadId, widgetAccessToken: accessToken })).resolves.toContain("http");
    await expect(t.mutation(api.widgets.finalizeWidgetUpload, { widgetId, threadId, storageId, widgetAccessToken: "wrong-token" })).rejects.toThrow(
      "Unauthorized: Invalid widget session"
    );
    await expect(t.mutation(api.widgets.finalizeWidgetUpload, { widgetId, threadId, storageId, widgetAccessToken: accessToken })).resolves.toEqual({
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

    await expect(t.mutation(api.widgets.generateWidgetUploadUrl, { widgetId, threadId, widgetAccessToken: accessToken })).rejects.toThrow(
      "Upload quota exceeded for this conversation thread"
    );

    const { thread, auditLogs } = await t.run(async (ctx) => ({
      thread: await ctx.db.get(threadId),
      auditLogs: await ctx.db.query("auditLogs").collect(),
    }));

    expect(thread).toMatchObject({
      companyId,
      widgetId,
      widgetAccessTokenHash: expect.any(String),
      sourceUrl: "https://support.example.com/help",
      title: "Widget Interaction",
    });
    expect(auditLogs).toEqual([]);
    expect(creatorId).toBeDefined();
  });
});
