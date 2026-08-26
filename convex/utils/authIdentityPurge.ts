import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * How many rows one read of an identity table takes at a time.
 *
 * Comfortably above what any real user has — the point is not to be tight, it
 * is to have a ceiling at all, so no single read can grow without limit.
 */
const IDENTITY_BATCH = 200;

/**
 * Delete every row a lookup matches, a batch at a time.
 *
 * The obvious way to write this is `.collect()` and a loop, and that is what
 * these purges used to do: read every matching row into memory at once, with
 * no ceiling on how many that is.
 *
 * The obvious repair — `.take(200)` and delete those — is worse than it looks
 * *here specifically*. This runs on the deletion path, and the bug it exists
 * to prevent is an auth row left behind making a deleted address unusable. A
 * bare cap reintroduces exactly that for anyone over the limit: rarer than
 * before, and much harder to find.
 *
 * So it drains instead. Each pass deletes what it read, so the next pass sees
 * what the last one could not reach, and the loop ends when nothing matches.
 * Bounded per read, complete in total.
 *
 * `deleteRow` must delete the row it is handed, or this will not terminate.
 */
export async function drainRows<T>(
  readBatch: (limit: number) => Promise<T[]>,
  deleteRow: (row: T) => Promise<void>
): Promise<number> {
  let removed = 0;

  for (;;) {
    const batch = await readBatch(IDENTITY_BATCH);
    if (batch.length === 0) return removed;
    for (const row of batch) await deleteRow(row);
    removed += batch.length;
  }
}

/**
 * Remove everything that would let a deleted account come back to life.
 *
 * Anthony, 2026-07-31: *"deleting users and re adding them is a genuine user
 * case, when they are deleted and we want to add them they need to be treated
 * as a brand new user."*
 *
 * That only holds if deletion clears the identity rows as well as the user
 * document. Two survived it before, and between them they made a deleted
 * address unusable:
 *
 * - The Convex Auth `authAccounts` row kept pointing at a user document that no
 *   longer existed, so the next sign-in resolved to a dangling id.
 * - The invitation stayed `ACCEPTED`, and `createInviteRecord` treats an
 *   accepted invitation as nothing left to do — so the address could never be
 *   re-invited, however many times the email went out.
 *
 * Deliberately deletes the invitation rather than resetting it to `PENDING`: a
 * re-add should mint a fresh invite with a fresh token, not inherit the old
 * workspace and role.
 */
export async function purgeAuthIdentity(ctx: MutationCtx, userId: Id<"users">, email?: string) {
  await drainRows(
    (limit) =>
      ctx.db
        .query("authSessions")
        .withIndex("userId", (q) => q.eq("userId", userId))
        .take(limit),
    async (session) => {
      await drainRows(
        (limit) =>
          ctx.db
            .query("authRefreshTokens")
            .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
            .take(limit),
        (refreshToken) => ctx.db.delete(refreshToken._id)
      );
      await ctx.db.delete(session._id);
    }
  );

  await drainRows(
    (limit) =>
      ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
        .take(limit),
    async (account) => {
      // Unredeemed magic links for this account. Left behind, one of them could
      // still be clicked and sign someone in against the deleted identity.
      await drainRows(
        (limit) =>
          ctx.db
            .query("authVerificationCodes")
            .withIndex("accountId", (q) => q.eq("accountId", account._id))
            .take(limit),
        (code) => ctx.db.delete(code._id)
      );
      await ctx.db.delete(account._id);
    }
  );

  if (!email) return;

  await drainRows(
    (limit) =>
      ctx.db
        .query("invitations")
        .withIndex("by_email", (q) => q.eq("email", email.toLowerCase()))
        .take(limit),
    (invitation) => ctx.db.delete(invitation._id)
  );
}
