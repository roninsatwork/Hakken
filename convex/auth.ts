import { convexAuth } from "@convex-dev/auth/server";
import authConfig from "./auth.config";

import Google from "@auth/core/providers/google";
import Resend from "@auth/core/providers/resend";

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
    async createOrUpdateUser(ctx: any, args: any) {
      const rawEmail = args.profile?.email || args.email || args.user?.email || "";
      const email = rawEmail.toLowerCase();
      const name = args.profile?.name || args.user?.name || email.split("@")[0] || "User";
      const image = args.profile?.image || args.profile?.picture || args.user?.image || "";

      if (!email) {
        throw new Error("Invalid login: No email provided.");
      }

      // Find if user already exists
      const existingUser = await ctx.db
        .query("users")
        .withIndex("email", (q: any) => q.eq("email", email))
        .first();

      const isInitialSuperAdmin = !!process.env.INITIAL_SUPER_ADMIN_EMAIL && email === process.env.INITIAL_SUPER_ADMIN_EMAIL.toLowerCase();

      if (!existingUser) {
        // If not the initial super admin, check for pending invites!
        if (!isInitialSuperAdmin) {
          const pendingInvite = await ctx.db
            .query("invitations")
            .withIndex("by_email", (q: any) => q.eq("email", email))
            .filter((q: any) => q.eq(q.field("status"), "PENDING"))
            .first();

          if (!pendingInvite) {
            throw new Error("Access Denied: This is an invite-only platform. Please contact your administrator.");
          }

          // Enforce 7-day expiration (7 * 24 * 60 * 60 * 1000 = 604800000 ms)
          if (Date.now() - pendingInvite.invitedAt > 604800000) {
            throw new Error("Access Denied: Your invitation has expired. Please request a new one.");
          }

          // If they have a pending invite, provision them securely
          const newUserId = await ctx.db.insert("users", {
            email,
            name,
            image,
            role: pendingInvite.role,
            companyId: pendingInvite.companyId,
            createdAt: Date.now(),
          });

          // Lock the invite as ACCEPTED
          await ctx.db.patch(pendingInvite._id, {
            status: "ACCEPTED",
            acceptedAt: Date.now(),
          });

          return newUserId;
        }

        // Auto-provision the primary admin ONLY ONCE on creation
        return await ctx.db.insert("users", {
          email,
          name,
          image,
          role: "SUPER_ADMIN",
          createdAt: Date.now(),
        });
      }

      // If user exists (was invited or registered before)
      // We update their profile details silently (from OAuth) but KEEP their role mapping
      return existingUser._id;
    },
  },
});
