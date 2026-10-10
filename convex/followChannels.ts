import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { superAdminMutation, superAdminQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { auditContentChange, checkedUrl } from "./utils/contentAdmin";
import { followKindValidator } from "./newsSchema";
import { refreshInsightsCounts } from "./insightsCounts";
import { isXAppTokenConfigured } from "./xConnect";
import { canCollect, channelKindOf, MAX_CHANNELS, xHandleOf, type FollowKind } from "./utils/followChannels";

/**
 * A "Who to follow" person's channels (docs/plans/active/content-people-
 * knowledge-plan.md, C2, C3, board 2): added by hand as addresses, each
 * read by the News Collector while its Collect tick is on. The person's own
 * row keeps every channel's kind and its first channel's link in step
 * (`syncFollowChannels`), for Admin's list and the Insights page.
 */

/** A channel's address as it is kept, with the kind it is: X as its profile address, the rest as typed, https:// added when left off. */
export function checkedChannel(address: string): { kind: FollowKind; address: string } {
  const typed = address.trim();
  if (!typed) throw appError("INVALID_INPUT", "A channel's address is needed.");
  const kind = channelKindOf(typed);
  if (kind === "X") {
    const handle = xHandleOf(typed);
    if (!handle) throw appError("INVALID_INPUT", "An X account is its address, like https://x.com/google or @google.");
    return { kind, address: `https://x.com/${handle}` };
  }
  const withScheme = /^[a-z]+:\/\//i.test(typed) ? typed : `https://${typed}`;
  return { kind, address: checkedUrl(withScheme, "A channel's address") };
}

/** Each channel of a person, oldest first — the order they were added. */
async function channelsOf(ctx: QueryCtx, followId: Id<"newsFollows">): Promise<Doc<"followChannels">[]> {
  const rows = await ctx.db.query("followChannels").withIndex("by_follow", (q) => q.eq("followId", followId)).take(MAX_CHANNELS + 1);
  return rows.sort((left, right) => left.createdAt - right.createdAt);
}

/**
 * The person's row in step with their channels: every kind, in the order
 * added, for Admin's Channel filter and column; and their first channel as
 * the link Insights shows. Insights' counts follow.
 */
export async function syncFollowChannels(ctx: MutationCtx, followId: Id<"newsFollows">): Promise<void> {
  const follow = await ctx.db.get(followId);
  if (!follow) return;
  const channels = await channelsOf(ctx, followId);
  const first = channels[0];
  await ctx.db.patch(followId, {
    channelKinds: channels.map((channel) => channel.kind),
    ...(first ? { kind: first.kind, url: first.address } : {}),
    updatedAt: Date.now(),
  });
  await refreshInsightsCounts(ctx);
}

/**
 * Adds channels to a person, refusing one they have already and any past
 * `MAX_CHANNELS`. A LinkedIn channel starts with Collect off: it cannot be
 * read. Returns how many were added; the person's row is left for the caller
 * to bring into step.
 */
export async function insertChannels(ctx: MutationCtx, followId: Id<"newsFollows">, addresses: readonly string[]): Promise<number> {
  const existing = await channelsOf(ctx, followId);
  const held = new Set(existing.map((channel) => channel.address.toLowerCase()));
  const checked = addresses.filter((address) => address.trim()).map(checkedChannel);
  if (existing.length + checked.length > MAX_CHANNELS) {
    throw appError("INVALID_INPUT", `A person has at most ${MAX_CHANNELS} channels.`);
  }
  let added = 0;
  const now = Date.now();
  for (const channel of checked) {
    const key = channel.address.toLowerCase();
    if (held.has(key)) throw appError("INVALID_INPUT", `${channel.address} is one of their channels already.`);
    held.add(key);
    // Each a millisecond after the last, so "the order added" holds within one save.
    await ctx.db.insert("followChannels", { followId, ...channel, collect: canCollect(channel.kind), found: 0, createdAt: now + added, updatedAt: now + added });
    added += 1;
  }
  return added;
}

/** What a channel's Status column says (board 2). */
const statusValidator = v.union(v.literal("COLLECTING"), v.literal("OFF"), v.literal("LINKEDIN"), v.literal("X_NOT_SET_UP"), v.literal("PROBLEM"));

const channelValidator = v.object({
  _id: v.id("followChannels"),
  kind: followKindValidator,
  address: v.string(),
  collect: v.boolean(),
  status: statusValidator,
  /** Why its last read failed, when it did. */
  problem: v.union(v.string(), v.null()),
  lastCheckedAt: v.union(v.number(), v.null()),
  lastItemAt: v.union(v.number(), v.null()),
  found: v.number(),
});

function statusOf(channel: Doc<"followChannels">, xReady: boolean) {
  if (!canCollect(channel.kind)) return "LINKEDIN" as const;
  if (!channel.collect) return "OFF" as const;
  if (channel.kind === "X" && !xReady) return "X_NOT_SET_UP" as const;
  if (channel.problem) return "PROBLEM" as const;
  return "COLLECTING" as const;
}

/** A person's channels for their page, in the order added, each with what its status says. */
export const listChannelsForAdmin = superAdminQuery({
  args: { followId: v.id("newsFollows") },
  returns: v.array(channelValidator),
  handler: async (ctx, args) => {
    const xReady = isXAppTokenConfigured();
    return (await channelsOf(ctx, args.followId)).map((channel) => ({
      _id: channel._id,
      kind: channel.kind,
      address: channel.address,
      collect: channel.collect,
      status: statusOf(channel, xReady),
      problem: channel.problem ?? null,
      lastCheckedAt: channel.lastCheckedAt ?? null,
      lastItemAt: channel.lastItemAt ?? null,
      found: channel.found,
    }));
  },
});

/** Add a channel on a person's page. */
export const addChannel = superAdminMutation({
  args: { followId: v.id("newsFollows"), address: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const follow = await ctx.db.get(args.followId);
    if (!follow) throw appError("NOT_FOUND", "That person is no longer here.");
    await insertChannels(ctx, args.followId, [args.address]);
    await syncFollowChannels(ctx, args.followId);
    await auditContentChange(ctx, "ADD_FOLLOW_CHANNEL", "newsFollows", args.followId, { name: follow.name, address: args.address });
    return null;
  },
});

/** A channel's Collect tick. LinkedIn cannot be read, so it cannot be ticked. */
export const setChannelCollect = superAdminMutation({
  args: { channelId: v.id("followChannels"), collect: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const channel = await ctx.db.get(args.channelId);
    if (!channel) throw appError("NOT_FOUND", "That channel is no longer here.");
    if (args.collect && !canCollect(channel.kind)) throw appError("INVALID_INPUT", "LinkedIn can't be read, so it is shown in Insights only.");
    if (channel.collect === args.collect) return null;
    await ctx.db.patch(args.channelId, { collect: args.collect, updatedAt: Date.now() });
    await auditContentChange(ctx, args.collect ? "COLLECT_FOLLOW_CHANNEL" : "STOP_FOLLOW_CHANNEL", "followChannels", args.channelId, { address: channel.address });
    return null;
  },
});

/**
 * Removes a channel. What it brought into News stays. A person keeps at least
 * one channel — Insights links to it — so the last is refused, saying to
 * delete the person instead.
 */
export const removeChannel = superAdminMutation({
  args: { channelId: v.id("followChannels") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const channel = await ctx.db.get(args.channelId);
    if (!channel) return null;
    const channels = await channelsOf(ctx, channel.followId);
    if (channels.length <= 1) throw appError("INVALID_INPUT", "This is their only channel. Add another first, or delete the person.");
    await ctx.db.delete(args.channelId);
    await syncFollowChannels(ctx, channel.followId);
    await auditContentChange(ctx, "REMOVE_FOLLOW_CHANNEL", "followChannels", args.channelId, { address: channel.address });
    return null;
  },
});

/** A person's channels go with them. */
export async function deleteChannelsOf(ctx: MutationCtx, followId: Id<"newsFollows">): Promise<void> {
  for (const channel of await channelsOf(ctx, followId)) await ctx.db.delete(channel._id);
}
