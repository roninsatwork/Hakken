import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

describe("platform invitation boundary", () => {
  test("an admin without a company cannot list or revoke platform invitations", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { unassignedAdminId, companyAdminId, superAdminId, platformInviteId, companyInviteId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Dummy company", createdAt: Date.now() });
      const unassignedAdminId = await ctx.db.insert("users", { email: "unassigned@test.invalid", role: "ADMIN" });
      const companyAdminId = await ctx.db.insert("users", { email: "company@test.invalid", role: "ADMIN", companyId });
      const superAdminId = await ctx.db.insert("users", { email: "operator@test.invalid", role: "SUPER_ADMIN" });
      const platformInviteId = await ctx.db.insert("invitations", {
        email: "platform-invite@test.invalid", role: "SUPER_ADMIN", status: "PENDING",
        token: "dummy-platform-token", invitedAt: Date.now(),
      });
      const companyInviteId = await ctx.db.insert("invitations", {
        email: "company-invite@test.invalid", companyId, role: "USER", status: "PENDING",
        token: "dummy-company-token", invitedAt: Date.now(),
      });
      return { unassignedAdminId, companyAdminId, superAdminId, platformInviteId, companyInviteId };
    });
    const unassigned = t.withIdentity({ subject: unassignedAdminId });
    const company = t.withIdentity({ subject: companyAdminId });
    const operator = t.withIdentity({ subject: superAdminId });
    await expect(unassigned.query(api.invites.getPendingInvites, {})).rejects.toThrow("Unauthorized");
    await expect(unassigned.mutation(api.invites.revokeInvite, { id: platformInviteId })).rejects.toThrow("Unauthorized");
    expect((await company.query(api.invites.getPendingInvites, {})).map((invite) => invite._id))
      .toEqual([companyInviteId]);
    await expect(company.mutation(api.invites.revokeInvite, { id: platformInviteId })).rejects.toThrow("Unauthorized");
    expect((await operator.query(api.invites.getPendingInvites, {})).map((invite) => invite._id))
      .toContain(platformInviteId);
  });
});
