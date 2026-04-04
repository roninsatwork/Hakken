import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

describe("OWASP: Broken Access Control - Invites", () => {
  test("Standard USER cannot read pending invites", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const hackerUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "hacker@test.com",
        role: "USER"
      });
    });

    const maliciousClient = t.withIdentity({ subject: hackerUserId });

    await expect(
      maliciousClient.query(api.invites.getPendingInvites)
    ).rejects.toThrow("Unauthorized");
  });

  test("Standard USER cannot save invite email templates", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const hackerUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "hacker@test.com",
        role: "USER"
      });
    });

    const maliciousClient = t.withIdentity({ subject: hackerUserId });

    await expect(
      maliciousClient.mutation(api.invites.saveTemplate, {
        subject: "Hacked",
        headline: "Hacked",
        body: "Hacked",
        ctaText: "Hacked"
      })
    ).rejects.toThrow("Unauthorized");
  });

  test("ADMIN cannot revoke invites belonging to another company", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const myCompanyId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "My Corp", createdAt: Date.now() });
    });
    
    const otherCompanyId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Other Corp", createdAt: Date.now() });
    });

    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "admin@mycorp.com",
        role: "ADMIN",
        companyId: myCompanyId
      });
    });

    const externalInviteId = await t.run(async (ctx) => {
      return await ctx.db.insert("invitations", {
        email: "target@othercorp.com",
        role: "USER",
        companyId: otherCompanyId,
        status: "PENDING",
        token: "123",
        invitedAt: Date.now()
      });
    });

    const adminClient = t.withIdentity({ subject: adminId });

    await expect(
      adminClient.mutation(api.invites.revokeInvite, { id: externalInviteId })
    ).rejects.toThrow("Unauthorized");
  });

  test("Standard USER cannot dispatch invite emails (Actions)", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const hackerUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "hacker@test.com",
        role: "USER"
      });
    });

    const maliciousClient = t.withIdentity({ subject: hackerUserId });

    await expect(
      maliciousClient.action(api.invites.dispatchInviteEmail, {
        email: "victim@test.com",
        role: "ADMIN",
        template: {
          subject: "Spam",
          headline: "Spam",
          body: "Spam",
          ctaText: "Spam"
        }
      })
    ).rejects.toThrow("Unauthorized");
  });
});
