import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const toolInput = {
  name: "CRM Lookup",
  description: "Look up CRM data for an agent.",
  handlerMapping: "crm.lookup",
  requiredRole: "ADMIN" as const,
};

describe("AI Tools Authorization", () => {
  test("standard users cannot manage tools but super admins can", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { userId, superAdminId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "user@example.com",
        role: "USER",
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });

      return { userId, superAdminId };
    });

    const userClient = t.withIdentity({ subject: userId });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    await expect(userClient.mutation(api.aiTools.createTool, toolInput)).rejects.toThrow(
      "Unauthorized: Only Super Admins can register system execution hooks."
    );

    const toolId = await superAdminClient.mutation(api.aiTools.createTool, toolInput);
    const tool = await t.run(async (ctx) => await ctx.db.get(toolId));

    expect(tool?.name).toBe(toolInput.name);
    expect(tool?.createdBy).toBe(superAdminId);
  });
});
