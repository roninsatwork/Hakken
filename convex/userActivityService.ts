/**
 * The rolling 30-day login count behind the admin user directory.
 *
 * Governed by docs/plans/active/user-directory-plan.md.
 *
 * The logic lives here as pure functions rather than inside the mutation for
 * one reason: the interesting case is not counting, it is *decay*. A user who
 * logged in 31 days ago and not since must be written back to zero, and a job
 * that only visits users it finds in the window will never touch them — leaving
 * a stale non-zero count on screen for ever. That is easy to get wrong and easy
 * to test here.
 */

export const LOGIN_WINDOW_DAYS = 30;

/**
 * Ceilings, so a runaway table degrades loudly rather than silently.
 *
 * Hitting either is refused by the caller. A truncated tally that nobody
 * mentions reads as "this user stopped logging in", which is a wrong answer
 * dressed as a real one.
 */
export const LOGIN_SCAN_LIMIT = 20000;
export const USER_SCAN_LIMIT = 20000;

/**
 * Did either scan overrun its cap — meaning every count derived from it is short?
 *
 * A separate function because the answer has to be acted on *before* the first
 * patch. The job used to write every user's count and then log a warning about
 * the counts it had just written, which is the failure the ceilings exist to
 * prevent, performed in the correct order to be useless.
 *
 * Takes the count from a read of `LIMIT + 1` and compares strictly, so a scan
 * that came back exactly full is not mistaken for one that was cut short. The
 * first version compared `>=` against a read of `LIMIT`, which cannot tell
 * those apart — and because this refusal stops the job rather than degrading
 * it, a platform landing on exactly twenty thousand logins would have stopped
 * counting for good.
 */
export function loginScanTruncated(scanned: { logins: number; users: number }) {
  return scanned.logins > LOGIN_SCAN_LIMIT || scanned.users > USER_SCAN_LIMIT;
}

export function loginWindowStart(now: number) {
  return now - LOGIN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

type LoginRow = {
  userId: string;
  status: "SUCCESS" | "FAILED";
  timestamp: number;
};

/**
 * Count successful logins per user inside the window.
 *
 * Failed attempts are excluded deliberately: the directory column answers "how
 * much is this person using the platform", and a run of failures is the
 * opposite of use. They remain visible on the profile's Logins tab.
 */
export function tallyLoginsByUser(rows: LoginRow[], windowStart: number) {
  const tally = new Map<string, number>();

  for (const row of rows) {
    if (row.status !== "SUCCESS") continue;
    if (row.timestamp < windowStart) continue;
    tally.set(row.userId, (tally.get(row.userId) ?? 0) + 1);
  }

  return tally;
}

type CountableUser = { _id: string; loginCount30d?: number };

/**
 * Work out which users actually need writing.
 *
 * Returns every user whose stored count disagrees with the tally — including
 * the ones that must fall to zero, which is the whole point. Users already
 * holding the right number are omitted so a quiet night writes nothing.
 */
export function planLoginCountUpdates(users: CountableUser[], tally: Map<string, number>) {
  const updates: Array<{ id: string; loginCount30d: number }> = [];

  for (const user of users) {
    const next = tally.get(user._id) ?? 0;
    const current = user.loginCount30d ?? 0;
    if (next !== current) {
      updates.push({ id: user._id, loginCount30d: next });
    }
  }

  return updates;
}

export type DirectoryActivity = "any" | "active7" | "active30" | "dormant" | "never";

/**
 * Turn an activity filter into a `lastLoginAt` bound.
 *
 * Returned as a bound rather than applied here so the caller can push it into
 * the index range — the whole point of the denormalised field is that this
 * never becomes a scan.
 *
 * `never` is deliberately its own value rather than "very old". A user who has
 * never signed in is a different fact from one who signed in long ago, and
 * sorting nulls as ancient dates would quietly state the more reassuring of the
 * two.
 */
export function activityBound(activity: DirectoryActivity, now: number):
  | { kind: "any" }
  | { kind: "never" }
  | { kind: "since"; from: number }
  | { kind: "before"; before: number } {
  const day = 24 * 60 * 60 * 1000;

  switch (activity) {
    case "active7": return { kind: "since", from: now - 7 * day };
    case "active30": return { kind: "since", from: now - LOGIN_WINDOW_DAYS * day };
    case "dormant": return { kind: "before", before: now - LOGIN_WINDOW_DAYS * day };
    case "never": return { kind: "never" };
    default: return { kind: "any" };
  }
}
