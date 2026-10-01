import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { superAdminMutation, superAdminQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { auditContentChange, checkedText, checkedUrl } from "./utils/contentAdmin";
import { newsSourceKindValidator, type NewsSourceKind } from "./newsSchema";

/**
 * Admin → Content → News sources (docs/plans/active/knowledge-news-and-digest-
 * plan.md, A10): the websites, YouTube channels and X accounts the News
 * Collector reads while each is on (phase 5). Turning one off keeps what it
 * already brought; deleting it does too — its items keep the name they were
 * collected under.
 */

/** Sources read at once. A watch list, not a crawl. */
export const MAX_NEWS_SOURCES = 200;
const MAX_NAME = 120;

const sourceValidator = v.object({
  _id: v.id("newsSources"),
  kind: newsSourceKindValidator,
  name: v.string(),
  address: v.string(),
  isOn: v.boolean(),
  lastCheckedAt: v.union(v.number(), v.null()),
  lastItemAt: v.union(v.number(), v.null()),
  updatedAt: v.number(),
});

const sourceInput = { kind: newsSourceKindValidator, name: v.string(), address: v.string(), isOn: v.boolean() };

/**
 * The address as it is kept: a web address for a website or channel; for an
 * X account, the handle alone — "@name", a profile link or the bare name all
 * keep "name".
 */
export function checkedAddress(kind: NewsSourceKind, address: string): string {
  if (kind !== "X_ACCOUNT") return checkedUrl(address, kind === "YOUTUBE" ? "The channel's address" : "The website's address");
  const handle = address.trim().replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "");
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) throw appError("INVALID_INPUT", "An X account is its handle, like @google.");
  return handle;
}

const toRow = (row: Doc<"newsSources">) => ({
  _id: row._id,
  kind: row.kind,
  name: row.name,
  address: row.address,
  isOn: row.isOn,
  lastCheckedAt: row.lastCheckedAt ?? null,
  lastItemAt: row.lastItemAt ?? null,
  updatedAt: row.updatedAt,
});

/** Every source, by name. */
export const listNewsSources = superAdminQuery({
  args: {},
  returns: v.array(sourceValidator),
  handler: async (ctx) => {
    const rows = await ctx.db.query("newsSources").take(MAX_NEWS_SOURCES);
    return rows.sort((left, right) => left.name.localeCompare(right.name)).map(toRow);
  },
});

/** One source for its editing page; null when it has gone. */
export const getNewsSource = superAdminQuery({
  args: { sourceId: v.id("newsSources") },
  returns: v.union(v.null(), sourceValidator),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.sourceId);
    return row ? toRow(row) : null;
  },
});

export const createNewsSource = superAdminMutation({
  args: sourceInput,
  returns: v.id("newsSources"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const sourceId = await ctx.db.insert("newsSources", {
      kind: args.kind,
      name: checkedText(args.name, "A name", MAX_NAME),
      address: checkedAddress(args.kind, args.address),
      isOn: args.isOn,
      createdAt: now,
      updatedAt: now,
    });
    await auditContentChange(ctx, "CREATE_NEWS_SOURCE", "newsSources", sourceId, { kind: args.kind, name: args.name });
    return sourceId;
  },
});

export const updateNewsSource = superAdminMutation({
  args: { sourceId: v.id("newsSources"), ...sourceInput },
  returns: v.null(),
  handler: async (ctx, { sourceId, ...input }) => {
    const existing = await ctx.db.get(sourceId);
    if (!existing) throw appError("NOT_FOUND", "That source is no longer here.");
    await ctx.db.patch(sourceId, {
      kind: input.kind,
      name: checkedText(input.name, "A name", MAX_NAME),
      address: checkedAddress(input.kind, input.address),
      isOn: input.isOn,
      updatedAt: Date.now(),
    });
    await auditContentChange(ctx, "UPDATE_NEWS_SOURCE", "newsSources", sourceId, { kind: input.kind, name: input.name, isOn: input.isOn });
    return null;
  },
});

export const deleteNewsSource = superAdminMutation({
  args: { sourceId: v.id("newsSources") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.sourceId);
    if (!existing) return null;
    await ctx.db.delete(args.sourceId);
    await auditContentChange(ctx, "DELETE_NEWS_SOURCE", "newsSources", args.sourceId, { kind: existing.kind, name: existing.name });
    return null;
  },
});
