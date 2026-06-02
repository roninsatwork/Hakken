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
