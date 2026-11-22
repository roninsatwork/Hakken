import { convexAuth } from "@convex-dev/auth/server";
import type { AuthProviderConfig } from "@convex-dev/auth/server";
import { internalMutation, type MutationCtx } from "./_generated/server";

import Google from "@auth/core/providers/google";
import Resend from "@auth/core/providers/resend";
import { Email } from "@convex-dev/auth/providers/Email";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { publicAction, tenantQuery } from "./tenantFunctions";
import { createOrUpdateHakkenAuthUser, googleControlsEmail, type AuthProfile } from "./authUserProvisioning";
import { buildEmailFromAddress, resolveEnvFromAddress } from "./emailBrandingService";
import { buildSignInCodeEmail, buildSignInEmail } from "./platformEmails";
import { buildConsentUrl } from "./magicLinkUrlService";
import {
  CODE_TTL_MS,
  expiryFrom,
  generateCode,
  minutesUntil,
  normaliseEmail,
} from "./oneTimeCodeService";
import { sendResendEmail } from "./resendEmailService";
import { DEFAULT_SETTINGS } from "./settingsService";

const providers: AuthProviderConfig[] = [
  Google({
    clientId: process.env.AUTH_GOOGLE_ID,
    clientSecret: process.env.AUTH_GOOGLE_SECRET,
    profile(profile) {
      return {
        id: profile.sub,
        name: profile.name,
        email: profile.email,
        image: profile.picture,
        emailVerified: profile.email_verified === true,
        hostedDomain: profile.hd,
      };
    },
  }),
  Resend({
    apiKey: process.env.RESEND_API_KEY,
    from: buildEmailFromAddress({
      envFromAddress: resolveEnvFromAddress(process.env),
      fallbackName: DEFAULT_SETTINGS.platformName,
    }),
    /**
     * The sign-in email, rendered through the shared shell.
     *
     * Without this override the stock Auth.js template ships — a blue button on
     * a bare white card, subject "Sign in to localhost:3000". It was the fifth
     * email surface and the audit behind
     * docs/plans/active/email-design-system-plan.md missed it, because that
     * audit found callers of `sendResendEmail` and this provider talks to Resend
     * itself.
     *
     * There is no Convex ctx here, so the platform name comes from the defaults
     * rather than from settings. That is the one place this differs from the
     * other five surfaces.
     */
    sendVerificationRequest: async ({ identifier, provider, url, expires }) => {
      const platformName = DEFAULT_SETTINGS.platformName;
      const hours = Math.max(1, Math.round((expires.getTime() - Date.now()) / 3600000));

      /*
       * Never the framework's own URL. That one carries `code`, which the React
       * client redeems the instant any page holding it mounts — so a mail
       * gateway that follows links signs itself in and spends the single-use
       * code before the recipient has the email. Ours were being redeemed 24 to
       * 29 seconds after send. See `magicLinkUrlService`.
       */
      const consentUrl = buildConsentUrl(url, process.env.SITE_URL);

      const email = buildSignInEmail({ platformName, url: consentUrl, hours });

      if (!process.env.RESEND_API_KEY) {
        console.warn("RESEND_API_KEY not found. Simulating sign-in email.", { to: identifier });
        return;
      }

      await sendResendEmail({
        apiKey: process.env.RESEND_API_KEY,
        operation: "authMagicLink",
        payload: {
          from: provider.from as string,
          to: identifier,
          // Never the bare host — "Sign in to localhost:3000" is what the stock
          // template produced, and it reads like a phishing attempt.
          subject: email.subject,
          html: email.html,
          text: email.text,
        },
      });
    },
  }),
  /**
   * Signing in with a typed code, beside the magic link rather than instead of
   * it.
   *
   * A link has to be opened in the browser that asked for it, and the common
   * failure is a request made on a desktop and an email opened on a phone. A
   * code is typed wherever the person already is, and survives the corporate
   * mail scanners that follow links and burn them before anyone clicks.
   *
   * The framework holds the code and its expiry; what is added here is the
   * shared email shell, the throttle, and a record on the auth trail. Nothing
   * about the existing options changes.
   */
  Email({
    id: "one-time-code",
    maxAge: CODE_TTL_MS / 1000,
    from: buildEmailFromAddress({
      envFromAddress: resolveEnvFromAddress(process.env),
      fallbackName: DEFAULT_SETTINGS.platformName,
    }),
    // Cryptographic randomness, not `Math.random`: this is a credential.
    generateVerificationToken: async () =>
      generateCode((count) => crypto.getRandomValues(new Uint8Array(count))),
    /**
     * No `ctx` exists inside this provider hook. The exported `signIn` action
     * below therefore reserves the send before invoking Auth.js, while the
     * screen's `oneTimeCodes.requestCode` remains an earlier, friendly refusal.
     */
    sendVerificationRequest: async ({ identifier, provider, token }) => {
      const platformName = DEFAULT_SETTINGS.platformName;
      const now = Date.now();
      const email = normaliseEmail(identifier);
      const minutes = minutesUntil(expiryFrom(now), now);

      const rendered = buildSignInCodeEmail({ platformName, code: token, minutes });

      if (!process.env.RESEND_API_KEY) {
        console.warn("RESEND_API_KEY not found. Simulating sign-in code email.", { to: email });
        return;
      }

      await sendResendEmail({
        apiKey: process.env.RESEND_API_KEY,
        operation: "authOneTimeCode",
        payload: {
          from: provider.from as string,
          to: email,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        },
      });
    },
  }),
];

if (
  process.env.LOCAL_TEST_AUTH_ENABLED === "1" &&
  process.env.LOCAL_TEST_AUTH_ENVIRONMENT === "local"
) {
  providers.push(
    ConvexCredentials({
      id: "local-test",
      authorize: async (credentials, ctx) => {
        const role = credentials.role;
        const secret = credentials.secret;

        if (
          (role !== "super-admin" && role !== "company-admin" && role !== "user") ||
          typeof secret !== "string"
        ) {
          return null;
        }

        return await ctx.runQuery(internal.localTestAuth.authorize, { role, secret });
      },
    })
  );
}

const authRuntime = convexAuth({
  providers,

  callbacks: {
    createOrUpdateUser: createOrUpdateHakkenAuthUser,
  },
});

export const { auth, signOut, isAuthenticated } = authRuntime;
const frameworkSignIn = authRuntime.signIn;
const frameworkStore = authRuntime.store;

const GOOGLE_LINK_PROOF_MS = 10 * 60 * 1000;

/** The OAuth verifier ties this callback to the account that began Google linking. */
async function hasRecentEmailProof(ctx: MutationCtx, signature: string, email: string) {
  const verifier = await ctx.db.query("authVerifiers")
    .withIndex("signature", (q) => q.eq("signature", signature)).unique();
  const session = verifier?.sessionId ? await ctx.db.get(verifier.sessionId) : null;
  if (!session || session.expirationTime <= Date.now()) return false;
  const user = await ctx.db.get(session.userId);
  if (!user || normaliseEmail(user.email ?? "") !== email) return false;

  const since = Date.now() - GOOGLE_LINK_PROOF_MS;
  for (const eventType of ["MAGIC_LINK_VERIFIED", "ONE_TIME_CODE_VERIFIED"] as const) {
    const recent = await ctx.db.query("authEvents")
      .withIndex("by_email_type_timestamp", (q) => q.eq("email", email).eq("eventType", eventType).gt("timestamp", since))
      .order("desc").take(10);
    if (recent.some((event) => event.userId === session.userId)) return true;
  }
  return false;
}

/** Convex Auth calls this internal mutation for every provider. */
export const store = internalMutation({
  args: { args: v.any() },
  handler: async (ctx, args) => {
    const request = args.args as Record<string, unknown>;
    if (request?.type === "userOAuth" && request.provider === "google") {
      const profile = (request.profile ?? {}) as AuthProfile;
      const email = normaliseEmail(profile.email ?? "");
      const accountId = request.providerAccountId;
      const existing = typeof accountId === "string" ? await ctx.db.query("authAccounts")
        .withIndex("providerAndAccountId", (q) => q.eq("provider", "google").eq("providerAccountId", accountId)).unique() : null;
      const proved = !existing && !googleControlsEmail(profile) && typeof request.signature === "string"
        ? await hasRecentEmailProof(ctx, request.signature, email)
        : false;
      request.profile = { ...profile, emailProofConfirmed: proved };
    }
    return await (frameworkStore as unknown as {
      _handler: (handlerCtx: typeof ctx, handlerArgs: { args: typeof request }) => Promise<unknown>;
    })._handler(ctx, { args: request });
  },
});

export const myGoogleLink = tenantQuery({
  args: {},
  returns: v.object({ linked: v.boolean() }),
  handler: async (ctx) => {
    const account = await ctx.db.query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", ctx.userId).eq("provider", "google"))
      .first();
    return { linked: account !== null };
  },
});

/**
 * Keep the public function name expected by the Convex Auth clients, but put
 * the mail throttle around the provider invocation itself. Returning the same
 * generic "started" result on refusal avoids revealing whether an address is
 * registered and avoids handing direct callers a throttle oracle.
 */
export const signIn = publicAction({
  reason:
    "Convex Auth sign-in is necessarily pre-authentication; this wrapper preserves that public contract while enforcing the provider email-send throttle.",
  args: {
    provider: v.optional(v.string()),
    params: v.optional(v.any()),
    verifier: v.optional(v.string()),
    refreshToken: v.optional(v.string()),
    calledBy: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const params = args.params as Record<string, unknown> | undefined;
    const provider = args.provider;
    const isInitialEmailSend =
      (provider === "resend" || provider === "one-time-code") &&
      typeof params?.email === "string" &&
      params.code === undefined;

    if (isInitialEmailSend) {
      const allowed = await ctx.runMutation(internal.authEvents.reserveAuthEmailSend, {
        email: params.email as string,
        provider,
      });
      if (!allowed) return { started: true };

      const eligible = await ctx.runQuery(internal.authEvents.canStartEmailSignIn, {
        email: params.email as string,
      });
      if (!eligible) return { started: true };
    }

    return await (frameworkSignIn as unknown as {
      _handler: (handlerCtx: typeof ctx, handlerArgs: typeof args) => Promise<unknown>;
    })._handler(ctx, args);
  },
});
