import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { logAuthEvent } from "./authEvents";
import { incrementGlobalInventoryTotals } from "./utils/inventoryRollupService";

const INVITE_EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000;
const INVITE_ONLY_ACCESS_DENIED = "Access Denied: This is an invite-only platform. Please contact your administrator.";

export type AuthProfile = {
  email?: string;
  emailVerified?: boolean;
  name?: string;
  image?: string;
  picture?: string;
};

export type AuthUser = {
  email?: string;
  name?: string;
  image?: string;
};

type AuthProvider = {
  id?: string;
  type?: string;
};

export type CreateOrUpdateUserArgs = {
  provider?: AuthProvider;
  profile?: AuthProfile;
  email?: string;
  user?: AuthUser;
};

type AuthProvisioningCtx = Pick<MutationCtx, "db">;

function getAuthIdentity(args: CreateOrUpdateUserArgs) {
  const email = (args.profile?.email || args.email || args.user?.email || "").trim().toLowerCase();
  const name = args.profile?.name || args.user?.name || email.split("@")[0] || "User";
  const image = args.profile?.image || args.profile?.picture || args.user?.image || "";

  return { email, name, image };
}

async function acceptPendingInvite(ctx: AuthProvisioningCtx, email: string, now: number) {
  const pendingInvite = await ctx.db
    .query("invitations")
    .withIndex("by_email", (q) => q.eq("email", email))
    .filter((q) => q.eq(q.field("status"), "PENDING"))
    .first();

  if (!pendingInvite) return;

  await ctx.db.patch(pendingInvite._id, {
    status: "ACCEPTED",
    acceptedAt: now,
  });

  return pendingInvite;
}

function assertInviteCanProvisionUser(invite: Doc<"invitations">, now: number) {
  if (invite.status === "PENDING" && now - invite.invitedAt > INVITE_EXPIRATION_MS) {
    throw new Error("Access Denied: Your invitation has expired. Please request a new one.");
  }

  if (invite.status !== "PENDING" && invite.status !== "ACCEPTED") {
    throw new Error(INVITE_ONLY_ACCESS_DENIED);
  }
}

export async function createOrUpdateSonaeAuthUser(
  ctx: AuthProvisioningCtx,
  args: CreateOrUpdateUserArgs,
  now = Date.now()
) {
  const { email, name, image } = getAuthIdentity(args);
  const provider = args.provider?.id;
  const isEmailProvider = args.provider?.type === "email";
  /*
   * Google never sets `profile.emailVerified`, so reading only that flag meant
   * `acceptPendingInvite` never ran for a Google sign-in and the invitation
   * stayed PENDING for good — the directory showed a pending row sitting next
   * to the very account it had just provisioned, and nothing would ever clear
   * it.
   *
   * Two things in the framework combine to cause it. Auth.js's default profile
   * mapper keeps only id/name/email/image, dropping Google's `email_verified`;
   * and `verifyCodeAndSignIn` skips its second `createOrUpdateUser` call for
   * oauth/oidc providers, which is the call that carries `emailVerified: true`
   * on the email path. So this callback sees an OAuth sign-in exactly once,
   * always unverified.
   *
   * Reaching here on an OAuth provider means the provider already
   * authenticated the address against its own account — the same guarantee the
   * flag stands for on the email path.
   */
  const isOAuthProvider = args.provider?.type === "oauth" || args.provider?.type === "oidc";
  const isVerifiedEmail = args.profile?.emailVerified === true || isOAuthProvider;
  const isMagicLinkRequest = isEmailProvider && !isVerifiedEmail;
  // The same acceptance, reached two ways. Recording a Google sign-in as
  // MAGIC_LINK_VERIFIED would put a link that was never sent on the auth trail.
  const verifiedEventType = isOAuthProvider ? "OAUTH_VERIFIED" : "MAGIC_LINK_VERIFIED";

  if (!email) {
    throw new Error("Invalid login: No email provided.");
  }

  const existingUser = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .first();

  if (existingUser) {
    await logAuthEvent(ctx, {
      email,
      eventType: "USER_FOUND",
      timestamp: now,
      companyId: existingUser.companyId,
      userId: existingUser._id,
      provider,
      reasonCode: "existing_user",
    });

    if (isVerifiedEmail) {
      const acceptedInvite = await acceptPendingInvite(ctx, email, now);
      await logAuthEvent(ctx, {
        email,
        eventType: verifiedEventType,
        timestamp: now,
        companyId: existingUser.companyId ?? acceptedInvite?.companyId,
        userId: existingUser._id,
        inviteId: acceptedInvite?._id,
        provider,
        reasonCode: acceptedInvite ? "pending_invite_accepted" : "existing_user_verified",
      });
    }

    if (isMagicLinkRequest) {
      await logAuthEvent(ctx, {
        email,
        eventType: "MAGIC_LINK_STARTED",
        timestamp: now,
        companyId: existingUser.companyId,
        userId: existingUser._id,
        provider,
        reasonCode: "existing_user",
      });
    }

    return existingUser._id;
  }

  const isInitialSuperAdmin = !!process.env.INITIAL_SUPER_ADMIN_EMAIL && email === process.env.INITIAL_SUPER_ADMIN_EMAIL.toLowerCase();

  if (isInitialSuperAdmin) {
    const initialUserId = await ctx.db.insert("users", {
      email,
      name,
      image,
      role: "SUPER_ADMIN",
      createdAt: now,
    });
    await incrementGlobalInventoryTotals(ctx, { usersDelta: 1 });
    return initialUserId;
  }

  const invite = await ctx.db
    .query("invitations")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();

  if (!invite) {
    throw new Error(INVITE_ONLY_ACCESS_DENIED);
  }

  assertInviteCanProvisionUser(invite, now);

  await logAuthEvent(ctx, {
    email,
    eventType: "INVITE_FOUND",
    timestamp: now,
    companyId: invite.companyId,
    inviteId: invite._id,
    provider,
    reasonCode: invite.status.toLowerCase(),
  });

  const newUserId = await ctx.db.insert("users", {
    email,
    name,
    image,
    role: invite.role,
    companyId: invite.companyId,
    createdAt: now,
  });
  await incrementGlobalInventoryTotals(ctx, { usersDelta: 1 });

  if (invite.status === "ACCEPTED") {
    await logAuthEvent(ctx, {
      email,
      eventType: "INVITE_STALE_ACCEPTED_RECOVERED",
      timestamp: now,
      companyId: invite.companyId,
      userId: newUserId,
      inviteId: invite._id,
      provider,
      reasonCode: "accepted_invite_missing_user",
    });
  }

  if (isVerifiedEmail) {
    const acceptedInvite = await acceptPendingInvite(ctx, email, now);
    await logAuthEvent(ctx, {
      email,
      eventType: verifiedEventType,
      timestamp: now,
      companyId: invite.companyId,
      userId: newUserId,
      inviteId: acceptedInvite?._id,
      provider,
      reasonCode: acceptedInvite ? "pending_invite_accepted" : "verified_user_provisioned",
    });
  }

  if (isMagicLinkRequest) {
    await logAuthEvent(ctx, {
      email,
      eventType: "MAGIC_LINK_STARTED",
      timestamp: now,
      companyId: invite.companyId,
      userId: newUserId,
      inviteId: invite._id,
      provider,
      reasonCode: invite.status === "ACCEPTED" ? "stale_invite_recovered" : "pending_invite",
    });
  }

  return newUserId;
}
