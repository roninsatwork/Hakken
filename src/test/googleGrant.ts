import type { Id } from "@/convex/_generated/dataModel";
import type { MutationCtx } from "@/convex/_generated/server";

/**
 * A website's Google sign-in as a test seeds it: the shared Google connection
 * (`googleSchema.ts`) and its tokens, as ciphertext, with the section's
 * connection pointed at it — what a finished sign-in leaves
 * (docs/plans/active/google-analytics-plan.md §4.6). The caller passes
 * `encryptConnectorToken`, with its key stubbed: a helper outside `convex/`
 * may not import a backend module.
 */
export async function seedGoogleSignIn(
  ctx: MutationCtx,
  encrypt: (value: string) => Promise<string>,
  args: {
    companyWebsiteId: Id<"companyWebsites">;
    /** The section's connection to point at it. */
    connectionId?: Id<"searchConsoleConnections"> | Id<"googleAnalyticsConnections">;
    account?: string;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    scopes?: string[];
  },
): Promise<Id<"googleConnections">> {
  const hold = (await ctx.db.get(args.companyWebsiteId))!;
  const now = Date.now();
  const googleConnectionId = await ctx.db.insert("googleConnections", {
    companyId: hold.companyId,
    companyWebsiteId: hold._id,
    websiteId: hold.websiteId,
    account: args.account ?? "owner@acme-shop.test",
    scopes: args.scopes ?? [],
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("googleTokens", {
    googleConnectionId,
    accessTokenCiphertext: await encrypt(args.accessToken ?? "ya29.stored"),
    refreshTokenCiphertext: await encrypt(args.refreshToken ?? "1//refresh"),
    expiresAt: args.expiresAt ?? now + 3_000_000,
    createdAt: now,
    updatedAt: now,
  });
  if (args.connectionId) await ctx.db.patch(args.connectionId, { googleConnectionId });
  return googleConnectionId;
}
