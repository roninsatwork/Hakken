import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { removeTranslations } from "./contentTranslation";
import { checkedChannel, syncFollowChannels } from "./followChannels";
import { MAX_FOLLOWS, nameKeyOf } from "./newsFollows";
import { canCollect } from "./utils/followChannels";
import { rebuildKnowledgeList } from "./knowledgeList";

/**
 * The one-off migrations of docs/plans/active/content-people-knowledge-plan.md,
 * registered by name in `dataMigrations.ts` through `CONTENT_PEOPLE_MIGRATIONS`.
 * One batch each: the lists are read whole at their limits.
 */

type OneBatch = { cursor: null; isDone: true; processed: number; updated: number };

/** A row's one link as a channel's address: as a channel keeps it, or as it was when it cannot be read as one. */
function channelOf(row: Doc<"newsFollows">) {
  try {
    return checkedChannel(row.url);
  } catch {
    return { kind: row.kind, address: row.url };
  }
}

/**
 * Each "Who to follow" row's one link becomes its first channel, collected
 * unless it is LinkedIn; then rows that are the same person — the same name —
 * become one: the oldest keeps every channel and stays picked if any was, and
 * the others go. Run again, it changes nothing.
 */
export async function channelsFromFollows(ctx: MutationCtx): Promise<OneBatch> {
  const follows = await ctx.db.query("newsFollows").take(MAX_FOLLOWS);
  let updated = 0;
  for (const row of follows) {
    const held = await ctx.db.query("followChannels").withIndex("by_follow", (q) => q.eq("followId", row._id)).first();
    if (held || !row.url) continue;
    const channel = channelOf(row);
    await ctx.db.insert("followChannels", {
      followId: row._id, ...channel, collect: canCollect(channel.kind), found: 0, createdAt: row.createdAt, updatedAt: Date.now(),
    });
    updated += 1;
  }

  const byName = new Map<string, Doc<"newsFollows">[]>();
  for (const row of follows) {
    const key = row.nameKey ?? nameKeyOf(row.name);
    byName.set(key, [...(byName.get(key) ?? []), row]);
  }
  for (const rows of byName.values()) {
    const [keep, ...others] = [...rows].sort((left, right) => left.createdAt - right.createdAt);
    for (const other of others) {
      const channels = await ctx.db.query("followChannels").withIndex("by_follow", (q) => q.eq("followId", other._id)).take(10);
      for (const channel of channels) await ctx.db.patch(channel._id, { followId: keep._id });
      if (other.pickedAt !== undefined && keep.pickedAt === undefined) await ctx.db.patch(keep._id, { pickedAt: other.pickedAt });
      if (!keep.topic && other.topic) await ctx.db.patch(keep._id, { topic: other.topic });
      await ctx.db.delete(other._id);
      await removeTranslations(ctx, "newsFollows", other._id);
      updated += 1;
    }
    await syncFollowChannels(ctx, keep._id);
  }
  return { cursor: null, isDone: true, processed: follows.length, updated };
}

/** Never rename or reuse a key: the name is the migration ledger's identity. */
export const CONTENT_PEOPLE_MIGRATIONS: Record<string, (ctx: MutationCtx) => Promise<OneBatch>> = {
  /** Phase 1: each row's link becomes its first channel, and rows for the same person become one. */
  "2026-10-10-follow-channels": (ctx) => channelsFromFollows(ctx),
  /** Phase 3 (`knowledgeList.ts`): a row for every article of ours and the web's, so Admin → Knowledge pages and sorts across both. */
  "2026-10-10-knowledge-list": async (ctx) => {
    const { ours, web } = await rebuildKnowledgeList(ctx);
    return { cursor: null, isDone: true, processed: ours + web, updated: ours + web };
  },
};
