import { DEFAULT_SETTINGS } from "./settingsService";
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api, internal } from "./_generated/api";
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

  test("active invite templates fall back, save, update, and audit", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const superAdminId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      })
    );
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    expect(await t.query(api.invites.getActiveTemplate, {})).toBeNull();
    expect(await superAdminClient.query(api.invites.getActiveTemplate, {})).toMatchObject({
      subject: `You have been invited to ${DEFAULT_SETTINGS.platformName} Workspace`,
      ctaText: "Accept Invitation",
    });

    await superAdminClient.mutation(api.invites.saveTemplate, {
      subject: "Join Hakken",
      headline: "Welcome",
      body: "Join us",
      ctaText: "Accept",
    });
    await superAdminClient.mutation(api.invites.saveTemplate, {
      subject: "Join Hakken Updated",
      headline: "Welcome Back",
      body: "Join us again",
      ctaText: "Accept Now",
    });

    const { templates, auditLogs } = await t.run(async (ctx) => ({
      templates: await ctx.db.query("emailTemplates").collect(),
      auditLogs: await ctx.db.query("auditLogs").collect(),
    }));

    expect(templates).toHaveLength(1);
    expect(templates[0]).toMatchObject({
      templateType: "INVITE",
      subject: "Join Hakken Updated",
      headline: "Welcome Back",
      body: "Join us again",
      ctaText: "Accept Now",
      updatedBy: superAdminId,
    });
    expect(auditLogs.map((log) => log.actionType)).toEqual(["UPDATE_EMAIL_TEMPLATE", "UPDATE_EMAIL_TEMPLATE"]);
    expect(auditLogs[1]).toMatchObject({
      actorId: superAdminId,
      entityType: "systemConfig",
      entityId: "INVITE_TEMPLATE",
      metadata: JSON.stringify({ subject: "Join Hakken Updated", headline: "Welcome Back" }),
    });
  });

  test("pending invite queries and revocation are tenant scoped and audited", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyAId, companyBId, adminAId, superAdminId, inviteAId, inviteBId, acceptedInviteId } = await t.run(
      async (ctx) => {
        const companyAId = await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
        const companyBId = await ctx.db.insert("companies", { name: "Company B", createdAt: Date.now() });
        const adminAId = await ctx.db.insert("users", {
          email: "admin-a@test.com",
          role: "ADMIN",
          companyId: companyAId,
          createdAt: Date.now(),
        });
        const superAdminId = await ctx.db.insert("users", {
          email: "super@test.com",
          role: "SUPER_ADMIN",
          createdAt: Date.now(),
        });
        const inviteAId = await ctx.db.insert("invitations", {
          email: "a@test.com",
          role: "USER",
          companyId: companyAId,
          status: "PENDING",
          token: "a",
          invitedAt: Date.now(),
        });
        const inviteBId = await ctx.db.insert("invitations", {
          email: "b@test.com",
          role: "ADMIN",
          companyId: companyBId,
          status: "PENDING",
          token: "b",
          invitedAt: Date.now() + 1,
        });
        const acceptedInviteId = await ctx.db.insert("invitations", {
          email: "accepted@test.com",
          role: "USER",
          companyId: companyAId,
          status: "ACCEPTED",
          token: "accepted",
          invitedAt: Date.now() + 2,
        });

        return { companyAId, companyBId, adminAId, superAdminId, inviteAId, inviteBId, acceptedInviteId };
      }
    );

    const adminAClient = t.withIdentity({ subject: adminAId });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    expect((await adminAClient.query(api.invites.getPendingInvites, {})).map((invite) => invite._id)).toEqual([inviteAId]);
    expect((await superAdminClient.query(api.invites.getPendingInvites, {})).map((invite) => invite._id)).toEqual([
      inviteBId,
      inviteAId,
    ]);
    expect((await adminAClient.query(api.invites.getInvitesByCompany, { companyId: companyAId })).map((invite) => invite._id)).toEqual([
      inviteAId,
    ]);
    await expect(adminAClient.query(api.invites.getInvitesByCompany, { companyId: companyBId })).rejects.toThrow(
      "Unauthorized"
    );

    await expect(adminAClient.mutation(api.invites.revokeInvite, { id: acceptedInviteId })).resolves.toBeNull();

    const { revokedInvite, auditLogs } = await t.run(async (ctx) => ({
      revokedInvite: await ctx.db.get(acceptedInviteId),
      auditLogs: await ctx.db.query("auditLogs").collect(),
    }));

    expect(revokedInvite).toBeNull();
    expect(auditLogs[0]).toMatchObject({
      actionType: "REVOKE_INVITE",
      actorId: adminAId,
      entityType: "invitations",
      entityId: acceptedInviteId,
      metadata: JSON.stringify({ email: "accepted@test.com", role: "USER" }),
    });
  });

  test("internal invite creation normalizes emails and re-arms invites for deleted accounts", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyId, callerId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
      const callerId = await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "ADMIN",
        companyId,
        createdAt: Date.now(),
      });

      return { companyId, callerId };
    });

    await t.mutation(internal.invites.createInviteRecord, {
      email: "NEW@Test.COM",
      companyId,
      role: "USER",
      token: "token-a",
      callerId,
    });
    await t.mutation(internal.invites.createInviteRecord, {
      email: "new@test.com",
      companyId,
      role: "USER",
      token: "token-b",
      callerId,
    });

    const inviteId = await t.run(async (ctx) => {
      const invite = await ctx.db
        .query("invitations")
        .withIndex("by_email", (q) => q.eq("email", "new@test.com"))
        .first();
      if (!invite) throw new Error("Expected invite");
      await ctx.db.patch(invite._id, { status: "ACCEPTED", token: "accepted-token" });
      return invite._id;
    });

    await t.mutation(internal.invites.createInviteRecord, {
      email: "new@test.com",
      companyId,
      role: "ADMIN",
      token: "token-c",
      callerId,
    });

    const { invite, auditLogs } = await t.run(async (ctx) => ({
      invite: await ctx.db.get(inviteId),
      auditLogs: await ctx.db.query("auditLogs").collect(),
    }));

    /*
     * An accepted invitation with no surviving user is a leftover from a
     * deleted account, and a fresh dispatch re-arms it. It used to be left
     * untouched, which made the address impossible to re-invite: the email went
     * out, nothing was written, and the directory showed nothing pending.
     */
    expect(invite).toMatchObject({
      email: "new@test.com",
      companyId,
      role: "ADMIN",
      status: "PENDING",
      token: "token-c",
    });
    expect(invite?.acceptedAt).toBeUndefined();
    expect(auditLogs).toHaveLength(3);
    expect(auditLogs[2]).toMatchObject({
      actionType: "CREATE_INVITE",
      actorId: callerId,
      entityId: inviteId,
    });
    expect(JSON.parse(auditLogs[2].metadata as string)).toMatchObject({
      reissued: true,
      previousStatus: "ACCEPTED",
    });
  });

  test("dispatch invite email simulates without Resend and enforces admin scope", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyAId, companyBId, adminAId, superAdminId } = await t.run(async (ctx) => {
      const companyAId = await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
      const companyBId = await ctx.db.insert("companies", { name: "Company B", createdAt: Date.now() });
      const adminAId = await ctx.db.insert("users", {
        email: "admin-a@test.com",
        role: "ADMIN",
        companyId: companyAId,
        createdAt: Date.now(),
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      });

      return { companyAId, companyBId, adminAId, superAdminId };
    });

    const template = {
      subject: "Invite",
      headline: "Welcome",
      body: "Join us",
      ctaText: "Accept",
    };
    const adminAClient = t.withIdentity({ subject: adminAId });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    await expect(
      adminAClient.action(api.invites.dispatchInviteEmail, {
        email: "blocked@test.com",
        companyId: companyBId,
        role: "USER",
        template,
      })
    ).rejects.toThrow("Unauthorized");
    await expect(
      adminAClient.action(api.invites.dispatchInviteEmail, {
        email: "blocked-super@test.com",
        companyId: companyAId,
        role: "SUPER_ADMIN",
        template,
      })
    ).rejects.toThrow("Unauthorized");

    // An invitation ends in exactly the same account as adding the person
    // directly, and read-only reaches every other client on the platform. Only
    // SUPER_ADMIN was named here, so this was the way round the other two.
    for (const role of ["READ_ONLY", "AUDITOR"] as const) {
      await expect(
        adminAClient.action(api.invites.dispatchInviteEmail, {
          email: `blocked-${role.toLowerCase()}@test.com`,
          companyId: companyAId,
          role,
          template,
        })
      ).rejects.toThrow("Unauthorized");
    }

    await expect(
      adminAClient.action(api.invites.dispatchInviteEmail, {
        email: "member@test.com",
        companyId: companyAId,
        role: "USER",
        template,
      })
    ).resolves.toEqual({ success: true, simulated: true, outcome: "created" });
    await expect(
      superAdminClient.action(api.invites.dispatchInviteEmail, {
        email: "global-admin@test.com",
        role: "SUPER_ADMIN",
        template,
      })
    ).resolves.toEqual({ success: true, simulated: true, outcome: "created" });

    const invites = await t.run(async (ctx) => await ctx.db.query("invitations").collect());

    expect(invites.map((invite) => invite.email).sort()).toEqual(["global-admin@test.com", "member@test.com"]);
  });

  test("re-inviting someone who already has an account reports it instead of reissuing", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyId, callerId, inviteId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: Date.now() });
      const callerId = await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "ADMIN",
        companyId,
        createdAt: Date.now(),
      });
      await ctx.db.insert("users", {
        email: "member@test.com",
        role: "USER",
        companyId,
        createdAt: Date.now(),
      });
      const inviteId = await ctx.db.insert("invitations", {
        email: "member@test.com",
        companyId,
        role: "USER",
        status: "ACCEPTED",
        token: "original-token",
        invitedAt: Date.now(),
        acceptedAt: Date.now(),
      });
      return { companyId, callerId, inviteId };
    });

    // The account exists, so there is nothing to re-arm. The point of the
    // assertion is that the caller is told which case it hit, rather than
    // getting an indistinguishable success.
    await expect(
      t.mutation(internal.invites.createInviteRecord, {
        email: "member@test.com",
        companyId,
        role: "ADMIN",
        token: "new-token",
        callerId,
      })
    ).resolves.toEqual({ outcome: "alreadyActive", previousStatus: "ACCEPTED" });

    const { invite, auditLogs } = await t.run(async (ctx) => ({
      invite: await ctx.db.get(inviteId),
      auditLogs: await ctx.db.query("auditLogs").collect(),
    }));

    expect(invite).toMatchObject({ status: "ACCEPTED", token: "original-token", role: "USER" });
    expect(auditLogs).toHaveLength(0);
  });
});
