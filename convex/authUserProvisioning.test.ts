import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { createOrUpdateSonaeAuthUser } from "./authUserProvisioning";
import schema from "./schema";

const NOW = Date.UTC(2026, 5, 2, 9, 30, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

function setup() {
  return convexTest(schema, import.meta.glob("./**/*.*s"));
}

async function getAuthEventTypes(t: ReturnType<typeof setup>, email: string) {
  const events = await t.run(async (ctx) =>
    ctx.db
      .query("authEvents")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect()
  );

  return events.map((event) => event.eventType);
}

describe("Sonae auth user provisioning", () => {
  test("provisions a pending invite without accepting it before email verification", async () => {
    const t = setup();

    const { companyId, userId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Invite Corp", createdAt: NOW });
      await ctx.db.insert("invitations", {
        email: "invited@example.com",
        role: "USER",
        companyId,
        status: "PENDING",
        token: "invite-token",
        invitedAt: NOW,
      });

      const userId = await createOrUpdateSonaeAuthUser(
        ctx,
        { provider: { id: "resend", type: "email" }, email: "INVITED@example.com" },
        NOW
      );
      return { companyId, userId };
    });

    const snapshot = await t.run(async (ctx) => {
      const user = await ctx.db.get(userId);
      const invite = await ctx.db
        .query("invitations")
        .withIndex("by_email", (q) => q.eq("email", "invited@example.com"))
        .first();

      return { user, invite };
    });

    expect(snapshot.user).toMatchObject({
      email: "invited@example.com",
      role: "USER",
      companyId,
      createdAt: NOW,
    });
    expect(snapshot.invite).toMatchObject({
      status: "PENDING",
    });
    expect(snapshot.invite?.acceptedAt).toBeUndefined();
    expect(await getAuthEventTypes(t, "invited@example.com")).toEqual(
      expect.arrayContaining(["INVITE_FOUND", "MAGIC_LINK_STARTED"])
    );
  });

  test("accepts a pending invite only after the provider verifies the email", async () => {
    const t = setup();

    const ids = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Verified Corp", createdAt: NOW });
      const userId = await ctx.db.insert("users", {
        email: "verified@example.com",
        role: "USER",
        companyId,
        createdAt: NOW,
      });
      await ctx.db.insert("invitations", {
        email: "verified@example.com",
        role: "USER",
        companyId,
        status: "PENDING",
        token: "invite-token",
        invitedAt: NOW,
      });

      const returnedUserId = await createOrUpdateSonaeAuthUser(
        ctx,
        { provider: { id: "resend", type: "email" }, profile: { email: "verified@example.com", emailVerified: true } },
        NOW + 1000
      );

      return { userId, returnedUserId };
    });

    const invite = await t.run(async (ctx) =>
      ctx.db
        .query("invitations")
        .withIndex("by_email", (q) => q.eq("email", "verified@example.com"))
        .first()
    );

    expect(ids.returnedUserId).toBe(ids.userId);
    expect(invite).toMatchObject({
      status: "ACCEPTED",
      acceptedAt: NOW + 1000,
    });
    expect(await getAuthEventTypes(t, "verified@example.com")).toEqual(
      expect.arrayContaining(["USER_FOUND", "MAGIC_LINK_VERIFIED"])
    );
  });

  test("recovers an accepted invite that is missing its user row", async () => {
    const t = setup();

    const { companyId, userId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Recovered Corp", createdAt: NOW });
      await ctx.db.insert("invitations", {
        email: "stale@example.com",
        role: "USER",
        companyId,
        status: "ACCEPTED",
        token: "invite-token",
        invitedAt: NOW,
        acceptedAt: NOW + 500,
      });

      const userId = await createOrUpdateSonaeAuthUser(
        ctx,
        { provider: { id: "resend", type: "email" }, email: "stale@example.com" },
        NOW + 1000
      );
      return { companyId, userId };
    });

    const user = await t.run(async (ctx) => ctx.db.get(userId));

    expect(user).toMatchObject({
      email: "stale@example.com",
      role: "USER",
      companyId,
      createdAt: NOW + 1000,
    });
    expect(await getAuthEventTypes(t, "stale@example.com")).toEqual(
      expect.arrayContaining([
        "INVITE_FOUND",
        "INVITE_STALE_ACCEPTED_RECOVERED",
        "MAGIC_LINK_STARTED",
      ])
    );
  });

  test("rejects revoked and expired invites", async () => {
    const t = setup();

    await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Rejected Corp", createdAt: NOW });
      await ctx.db.insert("invitations", {
        email: "revoked@example.com",
        role: "USER",
        companyId,
        status: "REVOKED",
        token: "revoked-token",
        invitedAt: NOW,
      });
      await ctx.db.insert("invitations", {
        email: "expired@example.com",
        role: "USER",
        companyId,
        status: "PENDING",
        token: "expired-token",
        invitedAt: NOW - 8 * DAY_MS,
      });
    });

    await expect(
      t.run((ctx) =>
        createOrUpdateSonaeAuthUser(
          ctx,
          { provider: { id: "resend", type: "email" }, email: "revoked@example.com" },
          NOW
        )
      )
    ).rejects.toThrow("invite-only platform");
    await expect(
      t.run((ctx) =>
        createOrUpdateSonaeAuthUser(
          ctx,
          { provider: { id: "resend", type: "email" }, email: "expired@example.com" },
          NOW
        )
      )
    ).rejects.toThrow("invitation has expired");
  });

  test("records public magic-link request diagnostics without returning classification", async () => {
    const t = setup();

    await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Diagnostics Corp", createdAt: NOW });
      await ctx.db.insert("users", {
        email: "existing@example.com",
        role: "USER",
        companyId,
        createdAt: NOW,
      });
      await ctx.db.insert("invitations", {
        email: "pending@example.com",
        role: "USER",
        companyId,
        status: "PENDING",
        token: "pending-token",
        invitedAt: NOW,
      });
      await ctx.db.insert("invitations", {
        email: "revoked@example.com",
        role: "USER",
        companyId,
        status: "REVOKED",
        token: "revoked-token",
        invitedAt: NOW,
      });
      await ctx.db.insert("invitations", {
        email: "expired@example.com",
        role: "USER",
        companyId,
        status: "PENDING",
        token: "expired-token",
        invitedAt: NOW - 8 * DAY_MS,
      });
      await ctx.db.insert("invitations", {
        email: "stale@example.com",
        role: "USER",
        companyId,
        status: "ACCEPTED",
        token: "stale-token",
        invitedAt: NOW,
        acceptedAt: NOW + 1000,
      });
    });

    for (const email of [
      "existing@example.com",
      "pending@example.com",
      "revoked@example.com",
      "expired@example.com",
      "stale@example.com",
      "missing@example.com",
    ]) {
      await expect(t.mutation(api.authEvents.recordMagicLinkRequestAttempt, { email, provider: "resend" })).resolves.toEqual({
        logged: true,
      });
    }

    expect(await getAuthEventTypes(t, "existing@example.com")).toEqual(
      expect.arrayContaining(["MAGIC_LINK_REQUESTED", "USER_FOUND"])
    );
    expect(await getAuthEventTypes(t, "pending@example.com")).toEqual(
      expect.arrayContaining(["MAGIC_LINK_REQUESTED", "INVITE_FOUND"])
    );
    expect(await getAuthEventTypes(t, "revoked@example.com")).toEqual(
      expect.arrayContaining(["MAGIC_LINK_REQUESTED", "INVITE_FOUND", "INVITE_REVOKED"])
    );
    expect(await getAuthEventTypes(t, "expired@example.com")).toEqual(
      expect.arrayContaining(["MAGIC_LINK_REQUESTED", "INVITE_FOUND", "INVITE_EXPIRED"])
    );
    expect(await getAuthEventTypes(t, "stale@example.com")).toEqual(
      expect.arrayContaining(["MAGIC_LINK_REQUESTED", "INVITE_FOUND", "INVITE_STALE_ACCEPTED_RECOVERED"])
    );
    expect(await getAuthEventTypes(t, "missing@example.com")).toEqual(
      expect.arrayContaining(["MAGIC_LINK_REQUESTED", "INVITE_MISSING"])
    );
  });

  test("allows the configured initial super admin without an invite", async () => {
    const t = setup();
    vi.stubEnv("INITIAL_SUPER_ADMIN_EMAIL", "founder@example.com");

    const user = await t.run(async (ctx) => {
      const userId = await createOrUpdateSonaeAuthUser(ctx, { email: "Founder@Example.com" }, NOW);
      return await ctx.db.get(userId);
    });

    expect(user).toMatchObject({
      email: "founder@example.com",
      role: "SUPER_ADMIN",
      createdAt: NOW,
    });

    vi.unstubAllEnvs();
  });
});
