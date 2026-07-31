import { convexAuth } from "@convex-dev/auth/server";
import type { AuthProviderConfig } from "@convex-dev/auth/server";

import Google from "@auth/core/providers/google";
import Resend from "@auth/core/providers/resend";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { internal } from "./_generated/api";
import { createOrUpdateSonaeAuthUser } from "./authUserProvisioning";
import { buildEmailFromAddress, resolveEnvFromAddress } from "./emailBrandingService";
import { renderEmail } from "./emailLayoutService";
import { sendResendEmail } from "./resendEmailService";
import { DEFAULT_SETTINGS } from "./settingsService";

const providers: AuthProviderConfig[] = [
  Google({
    clientId: process.env.AUTH_GOOGLE_ID,
    clientSecret: process.env.AUTH_GOOGLE_SECRET,
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
      const minutes = Math.max(1, Math.round((expires.getTime() - Date.now()) / 60000));

      const email = renderEmail(
        {
          kind: "Sign in",
          verdict: `Sign in to ${platformName}.`,
          paragraphs: [
            "Use the button below and you will be signed in — there is no password to enter.",
          ],
          actions: [{ label: `Sign in to ${platformName}`, url }],
          quiet: [`This link works once, and expires in about ${minutes} minutes.`],
          footer: {
            lines: [
              "If you did not ask to sign in, ignore this email. Nothing happens until the link is used.",
            ],
          },
        },
        { platformName }
      );

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
          subject: `Sign in to ${platformName}`,
          html: email.html,
          text: email.text,
        },
      });
    },
  }),
];

if (
  process.env.LOCAL_TEST_AUTH_ENABLED === "1" &&
  process.env.LOCAL_TEST_AUTH_ENVIRONMENT !== "production"
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

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers,

  callbacks: {
    createOrUpdateUser: createOrUpdateSonaeAuthUser,
  },
});
