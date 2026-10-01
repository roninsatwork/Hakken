import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { bytesToBase64 } from "./utils/base64";

/**
 * Each website's icon, drawn in place of its letter in the Sites lists
 * (`SiteMark`): looked for once, when the website is first added, and kept as
 * image data in `websiteIcons`, one row per website. A website with no icon
 * keeps its letter.
 *
 * Asked of Google's favicon service rather than the site itself: many sites
 * turn automated visitors away, and Google has usually found the icon
 * already. It answers 404 when it has none, which is what tells a website
 * with no icon from a request that failed — the first is final, the second is
 * tried again. Asked from the server, once per website, so no browser tells
 * Google which websites a client is looking at.
 *
 * Not file storage: every stored file must come through the upload gateway
 * (`uploadIngressGuard.test.ts`), which is for what people upload. An icon is
 * fetched by the server from one fixed source, is a few kilobytes, and is
 * kept only as a raster image, so it cannot carry script.
 *
 * Websites added before this were asked about by the
 * `2026-10-01-website-icons` migration (`requestMissingIcons` in
 * `websites.ts`, which alone may read the whole table).
 */

/** Twice the largest tile it is drawn in (32px), for sharp screens. */
const ICON_SIZE = 64;
const REQUEST_TIMEOUT_MS = 10_000;
/** A 64px icon is a few kilobytes, and every list that draws it carries it; a reply far larger is not one. */
const MAX_ICON_BYTES = 20 * 1024;
/** Raster images only: an SVG can carry script, and a `data:` address keeps whatever it is given. */
const ICON_TYPES = new Set(["image/png", "image/x-icon", "image/vnd.microsoft.icon", "image/jpeg", "image/gif", "image/webp"]);
/** Waits before asking again after a request that failed — not one that found no icon. */
const RETRY_DELAYS_MS = [5 * 60_000, 60 * 60_000];

export function iconSourceUrl(host: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${ICON_SIZE}`;
}

export type IconAnswer = { kind: "found"; dataUrl: string } | { kind: "none" } | { kind: "failed" };

/** What the favicon service's reply says: an icon, no icon, or a failure worth asking again about. */
export async function readIconReply(response: Response): Promise<IconAnswer> {
  if (response.status === 404) return { kind: "none" };
  if (!response.ok) return { kind: "failed" };
  const type = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  const bytes = new Uint8Array(await response.arrayBuffer());
  // An answer, but not an icon anyone could safely draw.
  if (!ICON_TYPES.has(type) || bytes.length === 0 || bytes.length > MAX_ICON_BYTES) return { kind: "none" };
  return { kind: "found", dataUrl: `data:${type};base64,${bytesToBase64(bytes)}` };
}

async function iconRow(ctx: Pick<QueryCtx, "db">, websiteId: Id<"websites">) {
  return await ctx.db
    .query("websiteIcons")
    .withIndex("by_website", (q) => q.eq("websiteId", websiteId))
    .unique();
}

/** What a screen draws the website's icon from, or null to draw its letter. */
export async function websiteIconUrl(
  ctx: Pick<QueryCtx, "db">,
  websiteId: Id<"websites"> | null | undefined,
): Promise<string | null> {
  return websiteId ? (await iconRow(ctx, websiteId))?.dataUrl ?? null : null;
}

/** Whether the website has been asked about and an answer came back — an icon, or none. */
export async function iconAnswered(ctx: Pick<QueryCtx, "db">, websiteId: Id<"websites">): Promise<boolean> {
  return (await iconRow(ctx, websiteId)) !== null;
}

/** Look for a website's icon: when it is first added, and from the backfill. */
export async function requestWebsiteIcon(
  ctx: Pick<MutationCtx, "scheduler">,
  websiteId: Id<"websites">,
  delayMs = 0,
): Promise<void> {
  await ctx.scheduler.runAfter(delayMs, internal.websiteIcons.fetchWebsiteIcon, { websiteId });
}

/** The website's icon goes with it. */
export async function forgetWebsiteIcon(ctx: Pick<MutationCtx, "db">, websiteId: Id<"websites">): Promise<void> {
  const row = await iconRow(ctx, websiteId);
  if (row) await ctx.db.delete(row._id);
}

/**
 * The test suite adds websites constantly and runs what that schedules; none
 * of it should reach Google. The icon tests switch it back on.
 */
function fetchingSwitchedOff(): boolean {
  return process.env.VITEST === "true" && process.env.WEBSITE_ICONS_IN_TESTS !== "true";
}

export const iconTarget = internalQuery({
  args: { websiteId: v.id("websites") },
  returns: v.union(v.null(), v.object({ host: v.string(), answered: v.boolean() })),
  handler: async (ctx, args) => {
    const website = await ctx.db.get(args.websiteId);
    return website ? { host: website.host, answered: await iconAnswered(ctx, website._id) } : null;
  },
});

export const fetchWebsiteIcon = internalAction({
  args: { websiteId: v.id("websites"), attempt: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    if (fetchingSwitchedOff()) return null;
    const target = await ctx.runQuery(internal.websiteIcons.iconTarget, { websiteId: args.websiteId });
    // Deleted, or already answered — by an earlier request or the backfill.
    if (!target || target.answered) return null;

    let answer: IconAnswer;
    try {
      const response = await fetch(iconSourceUrl(target.host), { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      answer = await readIconReply(response);
    } catch {
      answer = { kind: "failed" };
    }

    if (answer.kind === "failed") {
      const attempt = args.attempt ?? 0;
      const delay = RETRY_DELAYS_MS[attempt];
      // Out of tries, it is left unanswered: the letter shows, and a forced
      // re-run of the migration asks again.
      if (delay !== undefined) {
        await ctx.scheduler.runAfter(delay, internal.websiteIcons.fetchWebsiteIcon, {
          websiteId: args.websiteId,
          attempt: attempt + 1,
        });
      }
      return null;
    }

    await ctx.runMutation(internal.websiteIcons.fileWebsiteIcon, {
      websiteId: args.websiteId,
      dataUrl: answer.kind === "found" ? answer.dataUrl : undefined,
    });
    return null;
  },
});

/** Writes down what was found — an icon, or that there is none — in place of any answer before it. */
export const fileWebsiteIcon = internalMutation({
  args: { websiteId: v.id("websites"), dataUrl: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Deleted while the answer was on its way: nothing will ever show it.
    if (!(await ctx.db.get(args.websiteId))) return null;
    const row = await iconRow(ctx, args.websiteId);
    const answer = { dataUrl: args.dataUrl, checkedAt: Date.now() };
    if (row) await ctx.db.patch(row._id, answer);
    else await ctx.db.insert("websiteIcons", { websiteId: args.websiteId, ...answer });
    return null;
  },
});
