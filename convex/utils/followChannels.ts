/**
 * A "Who to follow" person's channels (docs/plans/active/content-people-
 * knowledge-plan.md, C3): the places they publish, added by hand as
 * addresses. What kind each is — website, YouTube, X or LinkedIn — is read
 * from the address, so Add a person asks for addresses alone. Nothing here
 * needs Convex: the screens name a typed address's kind with the same rule
 * the server keeps it by.
 */

/** Where a person publishes. */
export const FOLLOW_KINDS = ["X", "YOUTUBE", "WEBSITE", "LINKEDIN"] as const;
export type FollowKind = (typeof FOLLOW_KINDS)[number];

/** The most channels one person has: website, YouTube, X, LinkedIn and room for two more. */
export const MAX_CHANNELS = 6;

/** Whether the News Collector can read a channel of this kind: LinkedIn shows in Insights only. */
export function canCollect(kind: FollowKind): boolean {
  return kind !== "LINKEDIN";
}

function hostOf(address: string): string | null {
  try {
    return new URL(/^[a-z]+:\/\//i.test(address) ? address : `https://${address}`).hostname.toLowerCase().replace(/^(www\.|m\.|mobile\.)/, "");
  } catch {
    return null;
  }
}

/** The kind of channel an address is, from its host; a bare "@handle" is an X account. */
export function channelKindOf(address: string): FollowKind {
  const trimmed = address.trim();
  if (/^@[A-Za-z0-9_]{1,15}$/.test(trimmed)) return "X";
  const host = hostOf(trimmed);
  if (host === "x.com" || host === "twitter.com") return "X";
  if (host === "youtube.com" || host === "youtu.be") return "YOUTUBE";
  if (host === "linkedin.com" || host?.endsWith(".linkedin.com")) return "LINKEDIN";
  return "WEBSITE";
}

/** An X account's handle from its profile address or "@handle"; null when the address names none. */
export function xHandleOf(address: string): string | null {
  const handle = address.trim()
    .replace(/^https?:\/\/(www\.|mobile\.)?(x|twitter)\.com\//i, "")
    .replace(/^(x|twitter)\.com\//i, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "");
  return /^[A-Za-z0-9_]{1,15}$/.test(handle) ? handle : null;
}
