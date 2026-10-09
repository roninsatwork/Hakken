import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { tenantQuery } from "./tenantFunctions";
import { groupOwner, requireMySite } from "./siteAccess";
import { readFanOutLimits } from "./fanOutLimits";
import { holdBrandNames } from "./holdProfiles";
import { radarRivals } from "./brandRadar";
import { questionsOf, readings } from "./siteBrandRadar";
import { rowsOf, type MentionRow } from "./webMentions";
import { siteKindOf } from "./utils/siteKinds";
import { unpackColumn } from "./utils/packedColumns";
import type { Site } from "./websiteSiteRows";

/**
 * Discovery → Web mentions (docs/plans/active/discovery-local-reputation-ai-
 * plan.md, step 6, D18; drawn as "Web mentions · All mentions", "· Against
 * rivals" and "· Where to get listed"): the pages naming the website, how
 * they speak of it and whether they link to it; the same for the rivals
 * watched beside it; and the places rivals are and it is not — every figure
 * worked out here from each website's one record (rule 4). A page the AI
 * check found to be about another of the name is left out (D20).
 */

type Reader = { db: QueryCtx["db"] };
const DAY_MS = 86_400_000;
const dayBefore = (days: number, now = Date.now()) => new Date(now - days * DAY_MS).toISOString().slice(0, 10);
/** Left out only when the AI check found it about another of the name — never a page on a website that links here, which is about this one. */
export const shownMention = (row: MentionRow) => row.about !== 0 || row.linked === 1;

/** A website's pages shown, or null before Web mentions has read any for it. */
export async function shownMentionsOf(ctx: Reader, websiteId: Id<"websites">): Promise<MentionRow[] | null> {
  const part = await ctx.db.query("webMentionParts").withIndex("by_website", (q) => q.eq("websiteId", websiteId)).unique();
  return part ? rowsOf(part).filter(shownMention) : null;
}

async function mentionsOf(ctx: Reader, website: Doc<"websites">): Promise<MentionRow[]> {
  return (await shownMentionsOf(ctx, website._id)) ?? [];
}

/** The company's own website and the rivals watched beside it. */
async function watched(ctx: Reader, site: Site): Promise<Array<{ website: Doc<"websites">; you: boolean }>> {
  const hold = groupOwner(site);
  if (!hold) return [];
  const limits = await readFanOutLimits(ctx, hold.companyId, hold._id);
  const own = await ctx.db.get(hold.websiteId);
  return [...(own ? [{ website: own, you: true }] : []), ...(await radarRivals(ctx, hold, limits.radarRivals)).map((website) => ({ website, you: false }))];
}

const mentionRowValidator = v.object({
  url: v.string(), host: v.string(), title: v.union(v.string(), v.null()), day: v.string(),
  kind: v.number(), tone: v.number(), strength: v.number(), linked: v.number(),
});

export const webMentions = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.object({
    names: v.array(v.string()),
    rows: v.array(mentionRowValidator),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const hold = groupOwner(site);
    const own = hold ? await ctx.db.get(hold.websiteId) : null;
    if (!hold || !own) return { names: [], rows: [] };
    const names = await holdBrandNames(ctx, hold._id);
    const primary = (names.find((name) => name.isPrimary) ?? names[0])?.name;
    return {
      names: [...(primary ? [primary] : []), own.host],
      rows: (await mentionsOf(ctx, own)).map(({ about: _about, ...row }) => row),
    };
  },
});

export const mentionsAgainstRivals = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.object({
    months: v.array(v.string()),
    businesses: v.array(v.object({
      host: v.string(),
      you: v.boolean(),
      mentions: v.number(),
      before: v.number(),
      well: v.number(),
      badly: v.number(),
      noLink: v.number(),
      series: v.array(v.number()),
    })),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const now = Date.now();
    const months = Array.from({ length: 12 }, (_, at) => {
      const date = new Date(now);
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() - (11 - at));
      return date.toISOString().slice(0, 7);
    });
    const businesses = [];
    for (const { website, you } of await watched(ctx, site)) {
      const rows = await mentionsOf(ctx, website);
      const last = rows.filter((row) => row.day >= dayBefore(30, now));
      businesses.push({
        host: website.displayHost,
        you,
        mentions: last.length,
        before: rows.filter((row) => row.day >= dayBefore(60, now) && row.day < dayBefore(30, now)).length,
        well: last.filter((row) => row.tone === 1).length,
        badly: last.filter((row) => row.tone === 2).length,
        noLink: last.filter((row) => row.linked === 0).length,
        series: months.map((month) => rows.filter((row) => row.day.startsWith(month)).length),
      });
    }
    return { months, businesses };
  },
});

const placeKindValidator = v.union(v.literal("DIRECTORY"), v.literal("REVIEWS"), v.literal("NEWS"), v.literal("FORUM"), v.literal("VIDEO"), v.literal("REFERENCE"), v.literal("WEBSITE"));

export const whereToGetListed = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.object({
    rows: v.array(v.object({
      host: v.string(),
      kind: placeKindValidator,
      /** Times Google's AI answers quote it beside you or your rivals (Brand radar). */
      quoted: v.number(),
      /** The rivals it links to, from the rivals' shared links. */
      linksTo: v.array(v.string()),
      /** The rivals it is quoted beside, or links to. */
      rivals: v.array(v.string()),
      strength: v.union(v.number(), v.null()),
      /** Already there: quoted beside you, or naming you on a page found. */
      there: v.boolean(),
    })),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const hold = groupOwner(site);
    const own = hold ? await ctx.db.get(hold.websiteId) : null;
    if (!hold || !own) return { rows: [] };
    const radar = (await readings(ctx, site)).readings;
    const rivalHosts = radar.filter((reading) => !reading.you).map((reading) => reading.website.host);
    const isOwnOrRival = (host: string) => [own.host, ...rivalHosts].some((entry) => host === entry || host.endsWith(`.${entry}`));
    const places = new Map<string, { quoted: number; linksTo: Set<string>; rivals: Set<string>; strength: number | null; there: boolean }>();
    const place = (host: string) => {
      const row = places.get(host) ?? { quoted: 0, linksTo: new Set<string>(), rivals: new Set<string>(), strength: null, there: false };
      places.set(host, row);
      return row;
    };
    // Quoted by Google's AI answers beside the website or its rivals (Brand radar).
    for (const reading of radar) {
      if (!reading.part) continue;
      for (const entry of questionsOf(reading.part)) {
        for (const url of new Set(entry.pages)) {
          let host = "";
          try {
            host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
          } catch {
            continue;
          }
          if (!host || isOwnOrRival(host)) continue;
          const row = place(host);
          row.quoted += 1;
          if (reading.you) row.there = true;
          else row.rivals.add(reading.website.displayHost);
        }
      }
    }
    // Linking to two of the rivals and not to the website (their shared links, monthly).
    const pairs = await ctx.db.query("linkGapPairs").withIndex("by_website", (q) => q.eq("websiteId", own._id)).take(50);
    for (const pair of pairs.filter((entry) => entry.rivals.every((rival) => rivalHosts.includes(rival)))) {
      const strength = unpackColumn(pair.strength);
      pair.domains.forEach((domain, at) => {
        if (isOwnOrRival(domain)) return;
        const row = place(domain);
        for (const rival of pair.rivals) {
          row.linksTo.add(rival);
          row.rivals.add(rival);
        }
        row.strength = Math.max(row.strength ?? 0, strength[at] ?? 0);
      });
    }
    // Naming the website on a page found: already there.
    for (const row of await mentionsOf(ctx, own)) if (places.has(row.host)) places.get(row.host)!.there = true;
    return {
      rows: [...places.entries()]
        .filter(([host, row]) => row.linksTo.size >= 2 || ["DIRECTORY", "REVIEWS", "NEWS"].includes(siteKindOf(host)) || row.there)
        .map(([host, row]) => ({
          host,
          kind: siteKindOf(host),
          quoted: row.quoted,
          linksTo: [...row.linksTo],
          rivals: [...row.rivals],
          strength: row.strength,
          there: row.there,
        })),
    };
  },
});
