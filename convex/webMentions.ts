import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { PlannedCheck } from "./fanOutFirstCheckSteps";
import { partIsOn } from "./collectionParts";
import { readFanOutLimits } from "./fanOutLimits";
import { holdBrandNames } from "./holdProfiles";
import { localPeriodStart } from "./dataForSeoLocalOperations";
import {
  LINK_GAP_DAYS,
  LINK_GAP_OPERATION,
  MENTIONS_DAYS,
  linkGapParams,
  mentionPhraseAskedFor,
  mentionsParams,
} from "./dataForSeoMentionOperations";

/** Whether a pull is Web mentions' to file, for the result parser beside `fileMentionPull`. */
export { isMentionOperation } from "./dataForSeoMentionOperations";
import { prepareDecisions, runDecisions } from "./decisionActions";
import type { PullForParse } from "./seoCollectionParse";
import { appError } from "./utils/appError";
import { getErrorMessage } from "./utils/lang";
import { packColumn, unpackColumn } from "./utils/packedColumns";
import { isTrackedHold } from "./utils/websitePairing";

/**
 * Web mentions (docs/plans/active/discovery-local-reputation-ai-plan.md, step
 * 6, D13, D20): each week, the pages across the web naming a website — the
 * company's own and the rivals watched beside it — searched by its address and
 * its name in quotes; UK and English pages only; each new page read once by the
 * AI check, "about this business or another of the name", and kept once for
 * everyone with its kind, tone, strength and whether it links to the website
 * (`webMentionParts`). Monthly, the websites linking to two of its rivals and
 * not to it (`linkGapPairs`).
 */

type Reader = { db: QueryCtx["db"] };

/** Pages kept for a website: the newest thousand within a year. */
const PAGES_KEPT = 1_000;
const YEAR_DAYS = 365;
/** Pages judged at once: each its own request (a request asking several at once gave every one the same answer, 2026-10-09). */
const AT_ONCE = 8;
/** Words of a page's snippet the AI check reads: never kept. */
const SNIPPET_READ = 600;
/** A linking website past this spam score is left out of the link gap (§6A). */
const SPAM_MOST = 30;

export const MENTION_KINDS = ["OTHER", "NEWS", "BLOG", "FORUM", "SHOP", "ORGANISATION"] as const;
export const MENTION_TONES = ["NEUTRAL", "WELL", "BADLY"] as const;
export const MENTION_ABOUT_DECISION = "discovery.mention-about";

/** A company's rivals watched beside a website, as holds, first tracked first. */
async function rivalHolds(ctx: Reader, hold: Doc<"companyWebsites">, limit: number): Promise<Doc<"companyWebsites">[]> {
  const holds = await ctx.db
    .query("companyWebsites")
    .withIndex("by_company_against", (q) => q.eq("companyId", hold.companyId).eq("againstWebsiteId", hold.websiteId))
    .take(limit);
  return holds.filter(isTrackedHold);
}

/** What a website is searched by: its address, and its first name where it differs from it. */
async function phrasesOf(ctx: Reader, hold: Doc<"companyWebsites">, website: Doc<"websites">): Promise<string[]> {
  const names = await holdBrandNames(ctx, hold._id);
  const primary = (names.find((name) => name.isPrimary) ?? names[0])?.name.trim().toLowerCase();
  return [website.host, ...(primary && primary !== website.host && primary.length > 2 ? [primary] : [])];
}

/** A website's week of mentions and its rivals', and once a month its rivals' shared links, while the company has Web mentions on (D16). */
export async function mentionSteps(
  ctx: MutationCtx,
  cycle: Pick<Doc<"seoCollectionCycles">, "companyId" | "startedAt">,
  hold: Doc<"companyWebsites">,
  plan: (operationId: string, params: Record<string, unknown>, keyStartedAt: number, sendIndex: number) => Promise<PlannedCheck>,
) {
  if (isTrackedHold(hold) || !(await partIsOn(ctx, cycle.companyId, "webMentions"))) return [];
  const limits = await readFanOutLimits(ctx, hold.companyId, hold._id);
  const own = await ctx.db.get(hold.websiteId);
  if (!own) return [];
  const rivals: Array<{ hold: Doc<"companyWebsites">; website: Doc<"websites"> }> = [];
  for (const rival of await rivalHolds(ctx, hold, limits.radarRivals)) {
    const website = await ctx.db.get(rival.websiteId);
    if (website) rivals.push({ hold: rival, website });
  }
  const week = localPeriodStart(cycle.startedAt, MENTIONS_DAYS);
  const month = localPeriodStart(cycle.startedAt, LINK_GAP_DAYS);
  const asks: Array<{ operationId: string; params: Record<string, unknown>; keyStartedAt: number }> = [];
  for (const { hold: of, website } of [{ hold, website: own }, ...rivals]) {
    for (const phrase of await phrasesOf(ctx, of, website)) asks.push({ operationId: "web_mentions", params: mentionsParams(phrase, limits.mentionsPerCheck), keyStartedAt: week });
  }
  const hosts = rivals.map((rival) => rival.website.host).sort();
  for (let first = 0; first < hosts.length; first += 1) {
    for (let second = first + 1; second < hosts.length; second += 1) {
      asks.push({ operationId: LINK_GAP_OPERATION, params: linkGapParams([hosts[first], hosts[second]], own.host), keyStartedAt: month });
    }
  }
  return asks.map((ask) => async (sendIndex: number, room: number) => {
    if (room < 1) return { planned: 0, reused: 0, capped: true };
    const outcome = await plan(ask.operationId, ask.params, ask.keyStartedAt, sendIndex);
    return outcome.reused ? { planned: 0, reused: 1 } : { planned: 1, reused: 0 };
  });
}

type Item = Record<string, unknown>;
const asItem = (value: unknown): Item | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Item) : null);
const asText = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value.trim() : undefined);
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

export type FoundMention = { url: string; host: string; title: string | null; snippet: string; day: string; kind: number; tone: number; strength: number };

/** A page's kind of site from Content Analysis's page types: a forum, the news, a blog, an organisation, a shop. */
function kindOf(types: unknown): number {
  const list = Array.isArray(types) ? types.map(String) : [];
  if (list.includes("message-boards")) return MENTION_KINDS.indexOf("FORUM");
  if (list.includes("news")) return MENTION_KINDS.indexOf("NEWS");
  if (list.includes("blogs")) return MENTION_KINDS.indexOf("BLOG");
  if (list.includes("organization")) return MENTION_KINDS.indexOf("ORGANISATION");
  if (list.includes("ecommerce")) return MENTION_KINDS.indexOf("SHOP");
  return 0;
}

/** How a page speaks of what it names, from Content Analysis's own reading of it: well, badly, or neither. */
function toneOf(types: unknown): number {
  const record = asItem(types);
  const positive = typeof record?.positive === "number" ? record.positive : 0;
  const negative = typeof record?.negative === "number" ? record.negative : 0;
  if (negative >= 0.3 && negative > positive) return MENTION_TONES.indexOf("BADLY");
  if (positive >= 0.4 && positive > negative) return MENTION_TONES.indexOf("WELL");
  return 0;
}

/** One search's pages known to be in English, from the UK or from nowhere in particular, each once. */
export function parseMentions(result: unknown): FoundMention[] {
  const first = asItem(Array.isArray(result) ? result[0] : result) ?? {};
  const seen = new Set<string>();
  const found: FoundMention[] = [];
  for (const entry of Array.isArray(first.items) ? first.items : []) {
    const item = asItem(entry);
    const url = asText(item?.url);
    if (!item || !url || seen.has(url)) continue;
    const info = asItem(item.content_info) ?? {};
    const language = asText(item.language) ?? asText(info.language);
    const country = asText(item.country);
    // In English, known to be: a page of no stated language was as often Polish as English (2026-10-09).
    if (language !== "en") continue;
    if (country && !["GB", "WW"].includes(country)) continue;
    seen.add(url);
    const day = (asText(info.date_published) ?? asText(item.fetch_time) ?? "").slice(0, 10);
    found.push({
      url,
      host: hostOf(url),
      title: asText(info.title) ?? asText(info.main_title) ?? null,
      snippet: (asText(info.snippet) ?? "").slice(0, SNIPPET_READ),
      day: /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : new Date().toISOString().slice(0, 10),
      kind: kindOf(item.page_types),
      tone: toneOf(info.connotation_types),
      strength: typeof item.domain_rank === "number" ? item.domain_rank : 0,
    });
  }
  return found;
}

/** The pages a website already holds, so only new ones are judged. */
export const heldMentionUrls = internalQuery({
  args: { websiteId: v.id("websites") },
  returns: v.array(v.string()),
  handler: async (ctx, args) => (await ctx.db.query("webMentionParts").withIndex("by_website", (q) => q.eq("websiteId", args.websiteId)).unique())?.urls ?? [],
});

const mentionValidator = v.object({
  url: v.string(), host: v.string(), title: v.union(v.string(), v.null()), day: v.string(),
  kind: v.number(), tone: v.number(), strength: v.number(), about: v.union(v.number(), v.null()),
});

/** New pages added to a website's mentions, newest first, within a year and the thousand kept; each marked whether it links to the website. */
export const writeMentions = internalMutation({
  args: { websiteId: v.id("websites"), found: v.array(mentionValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const held = await ctx.db.query("webMentionParts").withIndex("by_website", (q) => q.eq("websiteId", args.websiteId)).unique();
    const rows = held ? rowsOf(held) : [];
    const known = new Set(rows.map((row) => row.url));
    const fresh = args.found.filter((row) => !known.has(row.url));
    if (fresh.length === 0) return null;
    for (const row of fresh) {
      const linked = await linksTo(ctx, args.websiteId, row.host);
      rows.push({ ...row, linked: linked ? 1 : 0 });
    }
    const since = new Date(Date.now() - YEAR_DAYS * 86_400_000).toISOString().slice(0, 10);
    const kept = rows.filter((row) => row.day >= since).sort((left, right) => right.day.localeCompare(left.day)).slice(0, PAGES_KEPT);
    const record = {
      websiteId: args.websiteId,
      urls: kept.map((row) => row.url),
      titles: kept.map((row) => row.title),
      days: packColumn(kept.map((row) => Math.round(Date.parse(row.day) / 86_400_000))),
      kinds: packColumn(kept.map((row) => row.kind)),
      tones: packColumn(kept.map((row) => row.tone)),
      strength: packColumn(kept.map((row) => row.strength)),
      linked: packColumn(kept.map((row) => row.linked)),
      about: packColumn(kept.map((row) => row.about ?? undefined)),
      updatedAt: Date.now(),
    };
    if (held) await ctx.db.replace(held._id, record);
    else await ctx.db.insert("webMentionParts", record);
    return null;
  },
});

/** Whether a website's held links come from this one, by its newest list of links. */
async function linksTo(ctx: Reader, websiteId: Id<"websites">, host: string): Promise<boolean> {
  for (const pass of ["ALL", "ONE_PER_DOMAIN"] as const) {
    for (const domain of [host, `www.${host}`]) {
      const link = await ctx.db.query("siteBacklinks").withIndex("by_site_pass_domain", (q) => q.eq("websiteId", websiteId).eq("pass", pass).eq("domainFrom", domain)).first();
      if (link) return true;
    }
  }
  return false;
}

export type MentionRow = { url: string; host: string; title: string | null; day: string; kind: number; tone: number; strength: number; linked: number; about: number | null };

/** A website's mentions as rows, newest first. */
export function rowsOf(part: Doc<"webMentionParts">): MentionRow[] {
  const days = unpackColumn(part.days);
  const kinds = unpackColumn(part.kinds);
  const tones = unpackColumn(part.tones);
  const strength = unpackColumn(part.strength);
  const linked = unpackColumn(part.linked);
  const about = unpackColumn(part.about);
  return part.urls.map((url, at) => ({
    url,
    host: hostOf(url),
    title: part.titles[at] ?? null,
    day: new Date((days[at] ?? 0) * 86_400_000).toISOString().slice(0, 10),
    kind: kinds[at] ?? 0,
    tone: tones[at] ?? 0,
    strength: strength[at] ?? 0,
    linked: linked[at] ?? 0,
    about: about[at] ?? null,
  }));
}

/** A rival pair's linking websites kept: replaced each month, written only when it moved. */
export const writeLinkGap = internalMutation({
  args: { websiteId: v.id("websites"), rivals: v.array(v.string()), month: v.string(), domains: v.array(v.object({ domain: v.string(), strength: v.number() })) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const pairs = await ctx.db.query("linkGapPairs").withIndex("by_website", (q) => q.eq("websiteId", args.websiteId)).take(50);
    const held = pairs.find((pair) => pair.rivals.join("|") === args.rivals.join("|"));
    const record = {
      websiteId: args.websiteId, rivals: args.rivals, month: args.month,
      domains: args.domains.map((entry) => entry.domain), strength: packColumn(args.domains.map((entry) => entry.strength)), updatedAt: Date.now(),
    };
    if (!held) await ctx.db.insert("linkGapPairs", record);
    else if (held.month !== record.month || held.domains.join("|") !== record.domains.join("|")) await ctx.db.replace(held._id, record);
    return null;
  },
});

/** File one search: the pages new to each website it was for, read by the AI check, then kept. Failures are recorded on the pull. */
export async function fileMentionPull(ctx: ActionCtx, pullId: Id<"seoDataPulls">, pull: PullForParse): Promise<null> {
  try {
    const sent = JSON.parse(pull.taskArgsJson ?? "{}") as Record<string, unknown>;
    const result: unknown = JSON.parse(pull.resultJson ?? "null");
    if (pull.operationId === LINK_GAP_OPERATION) return await fileLinkGap(ctx, sent, result, pull.runDay.slice(0, 7));
    const phrase = mentionPhraseAskedFor(sent);
    if (!phrase) throw appError("INVALID_INPUT", "This search does not say what it was for.");
    const found = parseMentions(result);
    for (const website of await websitesForPhrase(ctx, phrase)) {
      const held = new Set(await ctx.runQuery(internal.webMentions.heldMentionUrls, { websiteId: website.websiteId }));
      const fresh = found.filter((page) => !held.has(page.url) && page.host !== website.host && !page.host.endsWith(`.${website.host}`));
      if (fresh.length === 0) continue;
      const business = pull.companyId
        ? await ctx.runQuery(internal.holdProfiles.businessOfInternal, { companyId: pull.companyId, websiteId: website.websiteId })
        : null;
      const judged = await judgeMentions(ctx, pull.companyId ?? null, { ...website, sector: business?.sector ?? null, description: business?.description ?? null }, fresh);
      await ctx.runMutation(internal.webMentions.writeMentions, { websiteId: website.websiteId, found: judged });
    }
  } catch (error) {
    await ctx.runMutation(internal.seoCollectionParse.recordParseFailure, { pullId, error: getErrorMessage(error) });
  }
  return null;
}

/** The websites a search was for: by its address, else every website held under that name. */
async function websitesForPhrase(ctx: ActionCtx, phrase: string): Promise<Array<{ websiteId: Id<"websites">; host: string; name: string }>> {
  const [byHost] = await ctx.runQuery(internal.websites.resolveWebsiteIdsByHostInternal, { hosts: [phrase] });
  if (byHost) return [{ websiteId: byHost.websiteId, host: byHost.host, name: byHost.host }];
  const named = await ctx.runQuery(internal.holdProfiles.listNamedWebsitesInternal, { limit: 2_000 });
  return named.flatMap((website) => {
    const name = website.brandNames.find((entry) => entry.name.trim().toLowerCase() === phrase);
    return name ? [{ websiteId: website.websiteId, host: website.host, name: name.name }] : [];
  });
}

/** The rule the AI check stands in for: the page names the website's address, or its name as a whole word. */
export function namesIt(page: Pick<FoundMention, "title" | "snippet">, website: { host: string; name: string }): boolean {
  const text = `${page.title ?? ""} ${page.snippet}`.toLowerCase();
  if (text.includes(website.host)) return true;
  const name = website.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${name}\\b`).test(text);
}

/** Each new page read by the AI check (D20) — about this business or another of the name — or by its rule while the check is off. */
async function judgeMentions(
  ctx: ActionCtx,
  companyId: Id<"companies"> | null,
  website: { host: string; name: string; sector: string | null; description: string | null },
  pages: FoundMention[],
) {
  const prepared = await prepareDecisions(ctx, { keys: [MENTION_ABOUT_DECISION], ...(companyId ? { companyId } : {}) });
  const out = [];
  for (let at = 0; at < pages.length; at += AT_ONCE) {
    out.push(...await Promise.all(pages.slice(at, at + AT_ONCE).map(async (page) => {
      const results = await runDecisions(ctx, {
        ...(companyId ? { companyId } : {}),
        subject: { kind: "webMention", id: page.url.slice(0, 200) },
        state: {
          business: {
            name: website.name,
            website: website.host,
            // What it does, when the company has said: a page about another trade is another of the name.
            ...(website.sector ? { trade: website.sector } : {}),
            ...(website.description ? { description: website.description } : {}),
          },
          page: { address: page.host, title: page.title, words: page.snippet },
        },
        requests: [{ key: MENTION_ABOUT_DECISION, fallback: () => ({ kind: "pick-one" as const, choice: namesIt(page, website) ? "about" : "another" }) }],
        prepared,
      });
      const result = results[MENTION_ABOUT_DECISION];
      const about = result?.answer.kind === "pick-one" ? (result.answer.choice === "about" ? 1 : result.answer.choice === "another" ? 0 : null) : null;
      const { snippet: _snippet, ...kept } = page;
      return { ...kept, about };
    })));
  }
  return out;
}

async function fileLinkGap(ctx: ActionCtx, sent: Record<string, unknown>, result: unknown, month: string): Promise<null> {
  const targets = asItem(sent.targets) ?? {};
  const rivals = Object.values(targets).map(String).sort();
  const own = Array.isArray(sent.exclude_targets) ? String(sent.exclude_targets[0] ?? "") : "";
  const [website] = await ctx.runQuery(internal.websites.resolveWebsiteIdsByHostInternal, { hosts: [own] });
  if (!website || rivals.length !== 2) return null;
  const first = asItem(Array.isArray(result) ? result[0] : result) ?? {};
  const domains: Array<{ domain: string; strength: number }> = [];
  for (const entry of Array.isArray(first.items) ? first.items : []) {
    const sides = Object.values(asItem(asItem(entry)?.domain_intersection) ?? {}).map(asItem).filter((side): side is Item => side !== null);
    const domain = asText(sides[0]?.target);
    if (!domain) continue;
    const spam = Math.max(...sides.map((side) => (typeof side.backlinks_spam_score === "number" ? side.backlinks_spam_score : 0)));
    if (spam > SPAM_MOST) continue;
    domains.push({ domain: domain.replace(/^www\./, "").toLowerCase(), strength: Math.max(...sides.map((side) => (typeof side.rank === "number" ? side.rank : 0))) });
  }
  await ctx.runMutation(internal.webMentions.writeLinkGap, { websiteId: website.websiteId, rivals, month, domains });
  return null;
}
