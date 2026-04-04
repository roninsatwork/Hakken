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
      maliciousClient.query(api.chatAdmin.getAllThreadsAdmin, { paginationOpts: { numItems: 10, cursor: null } })
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
});
