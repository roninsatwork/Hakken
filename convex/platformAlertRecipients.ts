import { internalQuery } from "./_generated/server";

/** Enough to reach the people who can act, without turning an alert into a broadcast. */
const PLATFORM_ALERT_FALLBACK_RECIPIENT_LIMIT = 10;

/**
 * Who hears about it when the platform is unhealthy.
 *
 * The daily alert job resolved recipients from four environment variables and
 * gave up when none were set — which, on a deployment where none were, meant it
 * decided there was a problem every day and wrote it to a log nobody reads. A
 * warning nobody receives is not a warning.
 *
 * Every super admin is the sensible default: they are the people who can act on
 * it, and they are already here. An explicit list still wins where one is set.
 *
 * It sits in a module of its own, importing nothing but the server helpers,
 * because a query and its caller resolve their types through the generated api
 * and back again. Put next to the alert job — or in `users.ts`, which that job's
 * module already reaches — the cycle widens every `ctx.db.get` in the codebase
 * to a union of every table.
 */
export const getPlatformAlertFallbackRecipients = internalQuery({
  args: {},
  handler: async (ctx) => {
    const superAdmins = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "SUPER_ADMIN"))
      .take(PLATFORM_ALERT_FALLBACK_RECIPIENT_LIMIT);
    return superAdmins
      .map((user) => user.email)
      .filter((email): email is string => Boolean(email));
  },
});
