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
});
