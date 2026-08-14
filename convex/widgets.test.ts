import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { mintWidgetEmbedPass } from "./utils/widgetEmbedPass";
import { WIDGET_THREADS_PER_HOUR } from "./widgets";

/** Shared with the mutations under test through the environment, the same way
 * a real deployment shares the secret between the Next server and Convex. */
const TEST_EMBED_SECRET = "widget-embed-test-secret";
process.env.WIDGET_EMBED_SIGNING_SECRET = TEST_EMBED_SECRET;

const embedPassFor = (widgetId: string, embedHost: string | null = "support.example.com") =>
  mintWidgetEmbedPass({ widgetId, embedHost, secret: TEST_EMBED_SECRET });

/** Narrows the union: the caller expected a session, not a refusal. */
function expectSession<T extends object>(created: T): Exclude<T, { refused: string }> {
  if ("refused" in created) throw new Error(`widget session refused: ${String(created.refused)}`);
  return created as Exclude<T, { refused: string }>;
}

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
    ).rejects.toThrow("Unauthorized");

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

    // The embed pass is the session boundary: minted only by our own server
    // when it serves the widget page, over the referer host the server itself
    // observed. A direct caller inventing a sourceUrl — the 2026-08 audit's
    // exploit — holds no valid pass and is refused, and the refusal comes back
    // as a value so the audit row survives the transaction.
    const sourceUrl = "https://support.example.com/help";
    const refusalPasses = [
      // No pass, and outright garbage.
      "",
      "garbage",
      // Signed with the wrong secret.
      await mintWidgetEmbedPass({ widgetId, embedHost: "support.example.com", secret: "wrong-secret" }),
      // A genuine pass for a different widget.
      await embedPassFor(inactiveWidgetId),
      // Genuine passes for hosts the widget does not allow, including the
      // suffix lookalike rather than a real subdomain.
      await embedPassFor(widgetId, "evil.example.net"),
      await embedPassFor(widgetId, "support.example.com.evil.example.net"),
      // A direct open (no referer) carries no host, which an allowlisted
      // widget must refuse.
      await embedPassFor(widgetId, null),
      // A genuine pass minted too long ago.
      await mintWidgetEmbedPass({
        widgetId,
        embedHost: "support.example.com",
        secret: TEST_EMBED_SECRET,
        now: Date.now() - 13 * 60 * 60 * 1000,
      }),
    ];
    for (const embedPass of refusalPasses) {
      await expect(
        t.mutation(api.widgets.createWidgetThread, { widgetId, sourceUrl, embedPass })
      ).resolves.toEqual({ refused: "unauthorized" });
    }

    const { threadId, accessToken } = expectSession(
      await t.mutation(api.widgets.createWidgetThread, {
        widgetId,
        sourceUrl,
        embedPass: await embedPassFor(widgetId),
      })
    );
    expect(accessToken).toEqual(expect.any(String));
    await expect(t.query(api.chat.getMessages, { threadId })).resolves.toBeNull();
    await expect(t.query(api.chat.getMessages, { threadId, widgetAccessToken: "wrong-token" })).resolves.toBeNull();
    await expect(t.mutation(api.chat.sendMessage, {
      threadId,
      content: "Injected visitor message",
      widgetAccessToken: "wrong-token",
    })).rejects.toThrow("Unauthorized");
    await expect(t.mutation(api.chat.sendMessage, {
      threadId,
      content: "Switch me",
      dynamicAgentId: otherAgentId,
      widgetAccessToken: accessToken,
    })).rejects.toThrow("Unauthorized");
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
    await expect(t.mutation(api.widgets.generateWidgetUploadUrl, { widgetId, threadId, widgetAccessToken: "wrong-token" })).rejects.toThrow("Unauthorized");
    await expect(t.mutation(api.widgets.generateWidgetUploadUrl, { widgetId, threadId, widgetAccessToken: accessToken })).resolves.toContain("http");
    await expect(t.mutation(api.widgets.finalizeWidgetUpload, { widgetId, threadId, storageId, widgetAccessToken: "wrong-token" })).rejects.toThrow("Unauthorized");
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
    // Every refusal above left a persisted trace — the point of refusing by
    // return value instead of throw. Anonymous entries carry no actor.
    const blockedEntries = auditLogs.filter((entry) => entry.actionType === "BLOCKED_WIDGET_ACCESS");
    expect(blockedEntries).toHaveLength(refusalPasses.length);
    for (const entry of blockedEntries) {
      expect(entry.actorId).toBeUndefined();
      expect(entry.companyId).toBe(companyId);
    }
    expect(auditLogs).toHaveLength(blockedEntries.length);
    expect(creatorId).toBeDefined();
  });
});

describe("a photo from the widget", () => {
  /**
   * The end-to-end the widget UI performs: upload → finalize → send with the
   * photo riding on the message → the visitor sees their photo back in the
   * thread through nothing but their session token. Endpoint-level refusals
   * are covered above; this pins the happy path those refusals guard.
   */
  test("an anonymous visitor's photo is stored on the message and viewable with their token", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { widgetId } = await t.run(async (ctx) => {
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
      const widgetId = await ctx.db.insert("widgets", {
        companyId,
        agentId,
        name: "Website Bot",
        allowedDomains: ["example.com"],
        isActive: true,
        createdBy: creatorId,
        createdAt: Date.now(),
      });
      return { widgetId };
    });

    const { threadId, accessToken } = expectSession(
      await t.mutation(api.widgets.createWidgetThread, {
        widgetId,
        sourceUrl: "https://support.example.com/help",
        embedPass: await embedPassFor(widgetId),
      })
    );

    // The bytes a real widget posts to the upload URL. convex-test's
    // storage.store records no contentType, so it is written twice over: onto
    // the _storage row that getMessages reads, and into the mockStorageMetadata
    // seam the upload validator falls back to in tests.
    const storageId = await t.run(async (ctx) => {
      const storageId = await ctx.storage.store(
        new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" })
      );
      await ctx.db.patch(storageId as never, { contentType: "image/png" } as never);
      await ctx.db.insert("mockStorageMetadata", {
        storageId,
        size: 4,
        contentType: "image/png",
      });
      return storageId;
    });

    await expect(
      t.mutation(api.widgets.finalizeWidgetUpload, { widgetId, threadId, storageId, widgetAccessToken: accessToken })
    ).resolves.toEqual({ success: true, storageId });

    await expect(
      t.mutation(api.chat.sendMessage, {
        threadId,
        content: "What is this?",
        fileIds: [storageId],
        widgetAccessToken: accessToken,
      })
    ).resolves.toBe(true);

    const messages = await t.query(api.chat.getMessages, { threadId, widgetAccessToken: accessToken });
    const userMessage = messages?.find((message) => message.role === "user");
    expect(userMessage).toMatchObject({ content: "What is this?", attachments: [storageId] });
    // The viewable URL rides on the row, so the widget can render the thumbnail.
    expect(userMessage && "imageAttachments" in userMessage ? userMessage.imageAttachments : undefined)
      .toEqual([{ url: expect.stringContaining("http") }]);
  });
});

describe("widget thread minting is bounded", () => {
  async function seedWidget(t: ReturnType<typeof convexTest>, extra?: Record<string, unknown>) {
    return await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Widget Corp", createdAt: Date.now() });
      const widgetId = await ctx.db.insert("widgets", {
        companyId,
        name: "Website Bot",
        allowedDomains: ["example.com"],
        isActive: true,
        createdAt: Date.now(),
        ...extra,
      });
      return { companyId, widgetId };
    });
  }

  test("the hourly ceiling refuses the excess, logs the crossing once, and reopens with the window", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { widgetId } = await seedWidget(t, {
      threadWindowStart: Date.now(),
      threadCountInWindow: WIDGET_THREADS_PER_HOUR - 1,
    });
    const sourceUrl = "https://example.com/";
    const embedPass = await embedPassFor(widgetId, "example.com");

    // The last seat in the window is granted…
    expectSession(await t.mutation(api.widgets.createWidgetThread, { widgetId, sourceUrl, embedPass }));

    // …and everything after it is refused, with exactly one audit row for the
    // whole window rather than one per attempt.
    await expect(
      t.mutation(api.widgets.createWidgetThread, { widgetId, sourceUrl, embedPass })
    ).resolves.toEqual({ refused: "busy" });
    await expect(
      t.mutation(api.widgets.createWidgetThread, { widgetId, sourceUrl, embedPass })
    ).resolves.toEqual({ refused: "busy" });

    const limitedEntries = await t.run(async (ctx) =>
      (await ctx.db.query("auditLogs").collect()).filter(
        (entry) => entry.actionType === "RATE_LIMITED_WIDGET_THREADS"
      )
    );
    expect(limitedEntries).toHaveLength(1);

    // An expired window admits visitors again.
    await t.run(async (ctx) => {
      await ctx.db.patch(widgetId, { threadWindowStart: Date.now() - 2 * 60 * 60 * 1000 });
    });
    expectSession(await t.mutation(api.widgets.createWidgetThread, { widgetId, sourceUrl, embedPass }));
  });

  test("widget sessions fail closed when the signing secret is not configured", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { widgetId } = await seedWidget(t);

    const previous = process.env.WIDGET_EMBED_SIGNING_SECRET;
    delete process.env.WIDGET_EMBED_SIGNING_SECRET;
    try {
      await expect(
        t.mutation(api.widgets.createWidgetThread, {
          widgetId,
          sourceUrl: "https://example.com/",
          embedPass: await embedPassFor(widgetId, "example.com"),
        })
      ).rejects.toThrow("Widget sessions are not available right now.");
    } finally {
      process.env.WIDGET_EMBED_SIGNING_SECRET = previous;
    }
  });
});
