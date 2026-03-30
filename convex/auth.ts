import { convexAuth } from "@convex-dev/auth/server";
import authConfig from "./auth.config";

import Google from "@auth/core/providers/google";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],

  callbacks: {
    async createOrUpdateUser(ctx: any, args: any) {
      const email = args.profile?.email || args.email || args.user?.email || "";
      const name = args.profile?.name || args.user?.name || email.split("@")[0] || "User";
      const image = args.profile?.image || args.profile?.picture || args.user?.image || "";

      if (!email) {
        throw new Error("Invalid login: No email provided.");
      }

      // Find if user already exists
      const existingUser = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", email))
        .first();

      const isAdmin = email === "anthony@ronins.co.uk";

      if (!existingUser) {
        // If not the hardcoded admin and doesn't exist (no invite), REJECT
        if (!isAdmin) {
          throw new Error("Access Denied: This is an invite-only platform. Please contact your administrator.");
        }

        // Auto-provision the admin
        return await ctx.db.insert("users", {
          email,
          name,
          image,
          role: "ADMIN",
          createdAt: Date.now(),
        });
      }

      // If user exists (was invited or registered before)
      // We update their profile details silently (from OAuth) but KEEP their role mapping
      if (isAdmin && existingUser.role !== "ADMIN") {
        await ctx.db.patch(existingUser._id, { role: "ADMIN" });
      }

      return existingUser._id;
    },
  },
});
