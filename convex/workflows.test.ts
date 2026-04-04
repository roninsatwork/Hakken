import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

describe("OWASP: Broken Access Control - Workflows", () => {
  test("Standard USER cannot execute any Workflow CRUD operations", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const hackerUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "hacker@test.com",
        role: "USER"
      });
    });

    const maliciousClient = t.withIdentity({ subject: hackerUserId });

    await expect(
      maliciousClient.query(api.workflows.list)
    ).rejects.toThrow("Unauthorized");

    await expect(
      maliciousClient.mutation(api.workflows.createWorkflow, { name: "Rogue Workflow" })
    ).rejects.toThrow("Unauthorized");
  });
});
