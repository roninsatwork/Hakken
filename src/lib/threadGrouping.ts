/**
 * Grouping the conversation list by day.
 *
 * A flat list of titles is unreadable once the titles repeat — three
 * conversations called "New Conversation" are indistinguishable without a
 * date beside them. Bucketing by day and showing a time is what makes the
 * rail scannable.
 *
 * Pure so the boundaries can be tested without a clock or a browser: "today"
 * means the same calendar day as `now` in the viewer's own timezone, not the
 * last 24 hours, because a conversation at 23:50 last night is yesterday's
 * even when it is only twenty minutes old.
 */

export type ThreadDayBucket = "today" | "yesterday" | "earlier";

export const THREAD_DAY_BUCKETS: readonly ThreadDayBucket[] = ["today", "yesterday", "earlier"];

function startOfDay(ms: number) {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function getThreadDayBucket(updatedAt: number, now: number): ThreadDayBucket {
  const today = startOfDay(now);
  if (updatedAt >= today) return "today";

  // Built by stepping a real Date back one day rather than subtracting
  // 86,400,000ms, so the clock-change days do not shift the boundary.
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (updatedAt >= yesterday.getTime()) return "yesterday";

  return "earlier";
}

export type GroupedThreads<T> = Array<{ bucket: ThreadDayBucket; threads: T[] }>;

/**
 * Split an already-ordered list into day groups, keeping the given order.
 *
 * Empty buckets are dropped rather than rendered as a heading with nothing
 * under it, and the incoming order is preserved so a paginated list does not
 * reshuffle when its next page arrives.
 */
export function groupThreadsByDay<T extends { updatedAt?: number; _creationTime: number }>(
  threads: T[],
  now: number,
): GroupedThreads<T> {
  const groups = new Map<ThreadDayBucket, T[]>();

  for (const thread of threads) {
    const bucket = getThreadDayBucket(thread.updatedAt ?? thread._creationTime, now);
    const existing = groups.get(bucket);
    if (existing) existing.push(thread);
    else groups.set(bucket, [thread]);
  }

  return THREAD_DAY_BUCKETS
    .filter((bucket) => groups.has(bucket))
    .map((bucket) => ({ bucket, threads: groups.get(bucket) as T[] }));
}

/**
 * The stamp shown at the end of a row.
 *
 * Today and yesterday show a time, because that is what distinguishes two
 * conversations on the same day. Anything older shows a date, because the
 * time stopped being the useful part.
 */
export function formatThreadStamp(args: {
  updatedAt: number;
  bucket: ThreadDayBucket;
  locale?: string | string[];
}) {
  const date = new Date(args.updatedAt);
  const locale = args.locale ?? [];

  if (args.bucket === "earlier") {
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(date);
  }

  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}
