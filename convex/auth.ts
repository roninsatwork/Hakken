import { convexAuth } from "@convex-dev/auth/server";
import type { AuthProviderConfig } from "@convex-dev/auth/server";

import Google from "@auth/core/providers/google";
import Resend from "@auth/core/providers/resend";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { internal } from "./_generated/api";
import { createOrUpdateSonaeAuthUser } from "./authUserProvisioning";
import { buildEmailFromAddress } from "./emailBrandingService";

const providers: AuthProviderConfig[] = [
  Google({
    clientId: process.env.AUTH_GOOGLE_ID,
    clientSecret: process.env.AUTH_GOOGLE_SECRET,
  }),
  Resend({
    apiKey: process.env.RESEND_API_KEY,
    from: buildEmailFromAddress({
      envFromAddress: process.env.RESEND_FROM_EMAIL,
      fallbackName: "Sonae Auth",
    }),
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
