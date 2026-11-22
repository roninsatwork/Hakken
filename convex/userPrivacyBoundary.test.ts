import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const paginationOpts = { numItems: 10, cursor: null };

describe("user privacy boundary", () => {
  test("a member sees their own sign-ins but not a colleague's", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { memberId, adminId, loginId, memberLoginId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Dummy company", createdAt: Date.now() });
      const memberId = await ctx.db.insert("users", { email: "member@test.invalid", role: "USER", companyId });
      const adminId = await ctx.db.insert("users", { email: "admin@test.invalid", role: "ADMIN", companyId });
      const loginId = await ctx.db.insert("logins", {
        userId: adminId, ip: "203.0.113.1", device: "Dummy browser", location: "Dummy place",
        status: "SUCCESS", timestamp: Date.now(),
      });
      const memberLoginId = await ctx.db.insert("logins", {
        userId: memberId, ip: "203.0.113.3", device: "Member browser", location: "Dummy place",
        status: "SUCCESS", timestamp: Date.now(),
      });
      return { memberId, adminId, loginId, memberLoginId };
    });
    const member = t.withIdentity({ subject: memberId });
    const admin = t.withIdentity({ subject: adminId });
    expect((await member.query(api.users.getUserLogins, { userId: memberId, paginationOpts })).page[0]._id)
      .toBe(memberLoginId);
    await expect(member.query(api.users.getUserLogins, { userId: adminId, paginationOpts }))
      .rejects.toThrow("Unauthorized");
    expect((await admin.query(api.users.getUserLogins, { userId: adminId, paginationOpts })).page[0]._id)
      .toBe(loginId);
    expect((await admin.query(api.users.getUserLogins, { userId: memberId, paginationOpts })).page[0]._id)
      .toBe(memberLoginId);
  });

  test("an unassigned member cannot read another unassigned account", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { memberId, superAdminId } = await t.run(async (ctx) => {
      const memberId = await ctx.db.insert("users", { email: "unassigned@test.invalid", role: "USER" });
      const superAdminId = await ctx.db.insert("users", { email: "operator@test.invalid", role: "SUPER_ADMIN" });
      await ctx.db.insert("logins", {
        userId: superAdminId, ip: "203.0.113.2", device: "Operator browser", location: "Dummy place",
        status: "SUCCESS", timestamp: Date.now(),
      });
      return { memberId, superAdminId };
    });
    const member = t.withIdentity({ subject: memberId });
    expect((await member.query(api.users.getUserById, { id: memberId }))?._id).toBe(memberId);
    await expect(member.query(api.users.getUserById, { id: superAdminId }))
      .rejects.toThrow("Unauthorized");
    await expect(member.query(api.users.getUserLogins, { userId: superAdminId, paginationOpts }))
      .rejects.toThrow("Unauthorized");
  });
});
