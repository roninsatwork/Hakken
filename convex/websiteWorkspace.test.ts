import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

/**
 * A super admin who opens a website by its address from another workspace is moved into the workspace that holds it, rather than
 * shown "Website not found" (Anthony, 2026-11-07: "we should not see an error"). `WebsiteNotFound.tsx` asks this, and only a
 * super admin is ever answered: an admin, a user, or a website that doesn't exist sees the message as before.
 */
async function seeded() {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));
  const ids = await t.run(async (ctx) => {
    const ronins = await ctx.db.insert("companies", { name: "Small Agency", createdAt: 1 });
    const period = await ctx.db.insert("companies", { name: "Shop Group", createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "small-agency.test", displayHost: "small-agency.test", firstSeenAt: 1 });
    const siteId = await ctx.db.insert("companyWebsites", { companyId: ronins, websiteId, relationship: "OWNED", createdAt: 1 });
    const superAdmin = await ctx.db.insert("users", { email: "super@test.com", role: "SUPER_ADMIN", impersonatingCompanyId: period, createdAt: 1 });
    const admin = await ctx.db.insert("users", { email: "admin@test.com", role: "ADMIN", companyId: period, createdAt: 1 });
    return { ronins, period, siteId, superAdmin, admin };
  });
  return { t, ...ids };
}

describe("the workspace holding a website a super admin opened", () => {
  test("a super admin in another workspace is told the one that holds it", async () => {
    const { t, ronins, siteId, superAdmin } = await seeded();
    expect(await t.withIdentity({ subject: superAdmin }).query(api.websiteWorkspace.workspaceHoldingWebsite, { siteId })).toBe(ronins);
  });

  test("once in that workspace, nothing more: the page opens", async () => {
    const { t, ronins, siteId, superAdmin } = await seeded();
    const user = t.withIdentity({ subject: superAdmin });
    await user.mutation(api.users.impersonateCompany, { companyId: ronins });
    expect(await user.query(api.websiteWorkspace.workspaceHoldingWebsite, { siteId })).toBeNull();
  });

  test("an admin of another company is never told, and sees the message", async () => {
    const { t, siteId, admin } = await seeded();
    expect(await t.withIdentity({ subject: admin }).query(api.websiteWorkspace.workspaceHoldingWebsite, { siteId })).toBeNull();
  });

  test("no session, or an address that names no website, answers nothing", async () => {
    const { t, siteId, superAdmin } = await seeded();
    expect(await t.query(api.websiteWorkspace.workspaceHoldingWebsite, { siteId })).toBeNull();
    expect(await t.withIdentity({ subject: superAdmin }).query(api.websiteWorkspace.workspaceHoldingWebsite, { siteId: "not-a-website" })).toBeNull();
  });
});
