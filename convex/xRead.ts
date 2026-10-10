import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction, type ActionCtx } from "./_generated/server";
import { X_PROVIDER, getConnectorOAuthClientCredentials, getConnectorOAuthProvider } from "./connectorOAuthProviders";
import { decryptConnectorToken, encryptConnectorToken } from "./connectorTokenCrypto";
import { refreshAccessToken, revokeOAuthToken } from "./oauthTokenCalls";
import { appError } from "./utils/appError";
import { ENTRY_TEXT_LIMIT, type FeedEntry } from "./utils/newsFeeds";

/**
 * Reading X for the News Collector (docs/plans/active/knowledge-news-and-
 * digest-plan.md, phase 6): a watched account's newest posts, with the app
 * token from the X developer app (`X_BEARER_TOKEN`), and the new bookmarks of
 * the account Anthony connected (`xConnect.ts`), with that sign-in's access —
 * renewed as it runs out. X charges per post read; its price is
 * `X_READ_COST_USD`, so each run's X cost shows on the run.
 */

const X_API = "https://api.x.com/2";

/** Posts read per account per run (X allows 5 to 100). */
export const POSTS_PER_ACCOUNT = 20;

/** Bookmarks read per run; the rest the next (the plan's limit). */
export const BOOKMARKS_PER_RUN = 100;

/** Renew the access when it has less life than this left. */
const RENEW_MARGIN_MS = 2 * 60 * 1000;

type XPost = { id: string; text?: string; created_at?: string; author_id?: string; note_tweet?: { text?: string } };
type XUser = { id: string; username?: string; name?: string };

/** What X charges per post read, as entered for this deployment; nothing until it is. */
export function xReadCostPerPost(): number {
  const price = Number(process.env.X_READ_COST_USD);
  return Number.isFinite(price) && price > 0 ? price : 0;
}

async function xGet<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${X_API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401 || response.status === 403) {
    throw appError("UPSTREAM_FAILURE", `X refused the access (${response.status}). Check the X app's token and plan.`);
  }
  if (response.status === 429) throw appError("UPSTREAM_FAILURE", "X's limit on reads was reached; the rest is read next run.");
  if (!response.ok) throw appError("UPSTREAM_FAILURE", `X answered ${response.status}.`);
  return (await response.json()) as T;
}

function entryOf(post: XPost, handle: string): FeedEntry {
  const url = `https://x.com/${handle}/status/${post.id}`;
  const published = post.created_at ? Date.parse(post.created_at) : NaN;
  return {
    title: "",
    url,
    key: url,
    publishedAt: Number.isFinite(published) ? published : null,
    text: (post.note_tweet?.text ?? post.text ?? "").slice(0, ENTRY_TEXT_LIMIT),
  };
}

/**
 * A watched account's newest posts since the last read — its own, not
 * replies or reposts — newest first, its X id found from its handle once.
 */
export async function readAccountPosts(args: { bearer: string; handle: string; xUserId?: string; sinceId?: string }): Promise<{
  xUserId: string;
  entries: FeedEntry[];
  newestId: string | null;
  postsRead: number;
}> {
  const handle = args.handle.replace(/^@/, "").trim();
  let xUserId = args.xUserId;
  if (!xUserId) {
    const found = await xGet<{ data?: XUser }>(`/users/by/username/${encodeURIComponent(handle)}`, args.bearer);
    if (!found.data?.id) throw appError("NOT_FOUND", `There is no X account @${handle}.`);
    xUserId = found.data.id;
  }
  const query = new URLSearchParams({
    max_results: String(POSTS_PER_ACCOUNT),
    exclude: "retweets,replies",
    "tweet.fields": "created_at,note_tweet",
    ...(args.sinceId ? { since_id: args.sinceId } : {}),
  });
  const page = await xGet<{ data?: XPost[]; meta?: { newest_id?: string } }>(`/users/${xUserId}/tweets?${query}`, args.bearer);
  const posts = page.data ?? [];
  return { xUserId, entries: posts.map((post) => entryOf(post, handle)), newestId: page.meta?.newest_id ?? posts[0]?.id ?? null, postsRead: posts.length };
}

/**
 * The connected account's bookmarks it has not imported, newest bookmarked
 * first: X lists them in the order they were bookmarked, so reading stops at
 * the newest one already read. Each is credited to whoever wrote it.
 */
export async function readNewBookmarks(args: { accessToken: string; xUserId: string; lastBookmarkId: string | null }): Promise<{
  entries: Array<FeedEntry & { author: string }>;
  newestId: string | null;
  postsRead: number;
}> {
  const query = new URLSearchParams({
    max_results: String(BOOKMARKS_PER_RUN),
    "tweet.fields": "created_at,note_tweet,author_id",
    expansions: "author_id",
    "user.fields": "username,name",
  });
  const page = await xGet<{ data?: XPost[]; includes?: { users?: XUser[] } }>(`/users/${args.xUserId}/bookmarks?${query}`, args.accessToken);
  const posts = page.data ?? [];
  const authors = new Map((page.includes?.users ?? []).map((user) => [user.id, user]));
  const fresh: Array<FeedEntry & { author: string }> = [];
  for (const post of posts) {
    if (post.id === args.lastBookmarkId) break;
    const author = authors.get(post.author_id ?? "");
    const handle = author?.username ?? "i";
    fresh.push({ ...entryOf(post, handle), author: author?.username ? `@${author.username}` : "X" });
  }
  return { entries: fresh, newestId: posts[0]?.id ?? args.lastBookmarkId, postsRead: posts.length };
}

/**
 * The connected account's access for this run, renewed first when it is
 * nearly out — X hands back a new renewal each time, kept in place of the
 * old. Null, with the connection marked broken, when X will not renew it:
 * Anthony connects again.
 */
export async function connectedXAccess(ctx: ActionCtx, connection: {
  accessTokenCiphertext: string;
  refreshTokenCiphertext: string;
  expiresAt: number | null;
}): Promise<string | null> {
  if (connection.expiresAt === null || connection.expiresAt - Date.now() > RENEW_MARGIN_MS) {
    return await decryptConnectorToken(connection.accessTokenCiphertext);
  }
  const provider = getConnectorOAuthProvider(X_PROVIDER);
  const credentials = getConnectorOAuthClientCredentials(X_PROVIDER);
  if (!provider || !credentials) return null;
  const renewed = await refreshAccessToken({ provider, credentials, refreshToken: await decryptConnectorToken(connection.refreshTokenCiphertext) });
  if (!renewed.ok) {
    if (renewed.refused) {
      await ctx.runMutation(internal.xConnect.keepRenewedAccess, { broken: "X would no longer renew the access. Connect X again on Who to follow." });
    }
    return null;
  }
  const access = renewed.tokens.access_token;
  if (!access) return null;
  await ctx.runMutation(internal.xConnect.keepRenewedAccess, {
    accessTokenCiphertext: await encryptConnectorToken(access),
    ...(renewed.tokens.refresh_token ? { refreshTokenCiphertext: await encryptConnectorToken(renewed.tokens.refresh_token) } : {}),
    ...(renewed.tokens.expires_in ? { expiresAt: Date.now() + renewed.tokens.expires_in * 1000 } : {}),
  });
  return access;
}

/** Hand a disconnected account's grant back to X; forgotten here either way. */
export const revokeXGrant = internalAction({
  args: { refreshTokenCiphertext: v.string() },
  returns: v.null(),
  handler: async (_ctx, args) => {
    const provider = getConnectorOAuthProvider(X_PROVIDER);
    const credentials = getConnectorOAuthClientCredentials(X_PROVIDER);
    if (!provider || !credentials) return null;
    await revokeOAuthToken(provider, await decryptConnectorToken(args.refreshTokenCiphertext), credentials);
    return null;
  },
});
