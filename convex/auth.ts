import { convexAuth } from "@convex-dev/auth/server";

import Google from "@auth/core/providers/google";
import Resend from "@auth/core/providers/resend";
import { createOrUpdateSonaeAuthUser } from "./authUserProvisioning";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.RESEND_FROM_EMAIL || "noreply@ronins.co.uk",
    }),
  ],

  callbacks: {
    createOrUpdateUser: createOrUpdateSonaeAuthUser,
  },
});
