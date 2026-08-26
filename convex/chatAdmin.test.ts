import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

describe("OWASP: Broken Access Control - Chat Logs", () => {
  test("Standard USER cannot fetch cross-tenant global chat logs", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const hackerUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "hacker@test.com",
        role: "USER"
      });
    });

    const maliciousClient = t.withIdentity({ subject: hackerUserId });

    // The pagination validator allows an empty paginated obj argument
    await expect(
      maliciousClient.query(api.chatAdmin.getOffsetPaginatedThreads, { page: 1, pageSize: 15 })
    ).rejects.toThrow("Unauthorized");

    const dummyThreadId = await t.run(async (ctx) => {
      return await ctx.db.insert("threads", {
        userId: hackerUserId,
        title: "Dummy Thread",
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    });

    await expect(
      maliciousClient.query(api.chatAdmin.getAdminThreadMessages, { threadId: dummyThreadId })
    ).rejects.toThrow("Unauthorized");
  });

  test("Company admins can only fetch chat logs for their own company", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyAId, companyBId, adminAId, adminBId, threadAId, threadBId } = await t.run(async (ctx) => {
      const companyAId = await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
      const companyBId = await ctx.db.insert("companies", { name: "Company B", createdAt: Date.now() });
      const adminAId = await ctx.db.insert("users", {
        email: "admin-a@test.com",
        role: "ADMIN",
        companyId: companyAId,
      });
      const adminBId = await ctx.db.insert("users", {
        email: "admin-b@test.com",
        role: "ADMIN",
        companyId: companyBId,
      });
      const threadAId = await ctx.db.insert("threads", {
        companyId: companyAId,
        title: "Company A Thread",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const threadBId = await ctx.db.insert("threads", {
        companyId: companyBId,
        title: "Company B Thread",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("messages", {
        threadId: threadAId,
        role: "user",
        content: "Company A message",
        createdAt: Date.now(),
      });

      return { companyAId, companyBId, adminAId, adminBId, threadAId, threadBId };
    });

    const adminAClient = t.withIdentity({ subject: adminAId });
    const adminBClient = t.withIdentity({ subject: adminBId });

    const companyThreads = await adminAClient.query(api.chatAdmin.getOffsetPaginatedCompanyThreads, {
      companyId: companyAId,
      page: 1,
      pageSize: 15,
    });
    expect(companyThreads.data.map((thread) => thread._id)).toEqual([threadAId]);

    const paginatedCompanyThreads = await adminAClient.query(api.chatAdmin.getPaginatedCompanyThreads, {
      companyId: companyAId,
      paginationOpts: { numItems: 15, cursor: null },
    });
    expect(paginatedCompanyThreads.page.map((thread) => thread._id)).toEqual([threadAId]);

    await expect(
      adminAClient.query(api.chatAdmin.getOffsetPaginatedCompanyThreads, {
        companyId: companyBId,
        page: 1,
        pageSize: 15,
      })
    ).rejects.toThrow("Unauthorized");

    await expect(adminBClient.query(api.chatAdmin.getAdminThreadMessages, { threadId: threadAId })).rejects.toThrow(
      "Unauthorized: Cross-boundary access denied."
    );

    const ownMessages = await adminAClient.query(api.chatAdmin.getAdminThreadMessages, { threadId: threadAId });
    expect(ownMessages).toHaveLength(1);
    expect(ownMessages[0].content).toBe("Company A message");

    await expect(adminAClient.query(api.chatAdmin.getAdminThreadMessages, { threadId: threadBId })).rejects.toThrow(
      "Unauthorized: Cross-boundary access denied."
    );
  });

  test("super admins can page global chat logs without loading all historical threads", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { superAdminId, newerThreadId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "user@test.com",
        role: "USER",
        createdAt: Date.now(),
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      });
      await ctx.db.insert("threads", {
        userId,
        title: "Older Thread",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const newerThreadId = await ctx.db.insert("threads", {
        userId,
        title: "Newer Thread",
        createdAt: Date.now() + 1,
        updatedAt: Date.now() + 1,
      });

      return { superAdminId, newerThreadId };
    });

    const superAdminClient = t.withIdentity({ subject: superAdminId });
    const firstPage = await superAdminClient.query(api.chatAdmin.getPaginatedThreads, {
      paginationOpts: { numItems: 1, cursor: null },
    });

    expect(firstPage.page).toHaveLength(1);
    expect(firstPage.page[0]._id).toBe(newerThreadId);
    expect(firstPage.isDone).toBe(false);
  });
});

describe("the widget's authentication hash never reaches the chat logs", () => {
  /**
   * A widget conversation authenticates with `widgetAccessTokenHash`, and the
   * chat logs are exactly where widget-originated threads appear — so all five
   * of these doors were handing it to an administrator's browser. `chat.ts`
   * narrowed it out of a person's own history and called that drift exposure,
   * because a personal history holds no widget threads. Here it was live.
   *
   * No fixture in this file created a thread that had one, so removing the
   * narrowing left the suite green. This is the fixture that has one.
   */
  const seed = async (t: ReturnType<typeof convexTest>) => t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Widget Co", createdAt: Date.now() });
    const superAdminId = await ctx.db.insert("users", {
      email: "logs@test.com",
      role: "SUPER_ADMIN",
      createdAt: Date.now(),
    });
    const threadId = await ctx.db.insert("threads", {
      companyId,
      title: "Visitor conversation",
      widgetAccessTokenHash: "hash-of-the-widget-token",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { companyId, superAdminId, threadId };
  });

  test("no chat-log door hands it back, and each one read a real thread", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { companyId, superAdminId, threadId } = await seed(t);
    const client = t.withIdentity({ subject: superAdminId });
    const paginationOpts = { numItems: 10, cursor: null };

    const readings: Array<{ surface: string; rows: unknown[] }> = [
      { surface: "getOffsetPaginatedThreads", rows: (await client.query(api.chatAdmin.getOffsetPaginatedThreads, { page: 1, pageSize: 10 })).data },
      { surface: "getOffsetPaginatedCompanyThreads", rows: (await client.query(api.chatAdmin.getOffsetPaginatedCompanyThreads, { companyId, page: 1, pageSize: 10 })).data },
      { surface: "getPaginatedThreads", rows: (await client.query(api.chatAdmin.getPaginatedThreads, { paginationOpts })).page },
      { surface: "getPaginatedCompanyThreads", rows: (await client.query(api.chatAdmin.getPaginatedCompanyThreads, { companyId, paginationOpts })).page },
      { surface: "getCompanyThreadById", rows: [await client.query(api.chatAdmin.getCompanyThreadById, { companyId, threadId })] },
    ];

    // Proof each door read something: an empty answer has nothing to leak.
    expect(readings.filter((reading) => reading.rows.length === 0)).toEqual([]);
    expect(readings.flatMap((reading) => reading.rows
      .filter((row) => row !== null && typeof row === "object" && "widgetAccessTokenHash" in row)
      .map(() => reading.surface))).toEqual([]);

    // And proof the fixture really carries one, so the check above can fail.
    expect(await t.run(async (ctx) => (await ctx.db.get(threadId))?.widgetAccessTokenHash))
      .toBe("hash-of-the-widget-token");
  });
});
