"use node";

import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import { appError, appErrorMessage } from "./utils/appError";
import { parseTranslation } from "./utils/contentTranslator";
import { fetchWorkflowAction } from "./utils/safeWorkflowHttp";
import { isXAppTokenConfigured } from "./xConnect";
import { BOOKMARKS_PER_RUN, connectedXAccess, readAccountPosts, readNewBookmarks, xReadCostPerPost } from "./xRead";
import { xHandleOf } from "./utils/followChannels";
import {
  articleLinks,
  feedGuesses,
  feedLinksIn,
  looksLikeFeed,
  parseFeed,
  youtubeFeedFromAddress,
  youtubeFeedFromPage,
  ENTRY_TEXT_LIMIT,
  type FeedEntry,
} from "./utils/newsFeeds";

/**
 * The News Collector's job (docs/plans/active/knowledge-news-and-digest-
 * plan.md, phase 5): read every channel of the people in "Who to follow"
 * whose Collect tick is on (content-people-knowledge-plan.md, C2), keep what
 * is new, and
 * write each new item a plain English summary and "what this means for you"
 * with the agent's own instructions and model — live in News at once, every
 * other language written by the Translator. Called by `runNewsRoleNow` once
 * the run has its turn.
 *
 * - **Websites** are read through their feed: the address itself, the feed
 *   its page announces, or one at a usual place (`feed`, `rss.xml`…). A
 *   site with none is read through Firecrawl: the articles linked from its
 *   page, each fetched for its words.
 * - **YouTube channels** through the channel's own feed, found from its page.
 * - **X accounts** through X's API with the X app's token, and Anthony's own
 *   **X bookmarks** through the account he connected (`xRead.ts`, phase 6);
 *   X's reads cost, and the cost is on the run.
 *
 * Every model call's cost lands on the run (`roleRuns.recordRunModelCall`),
 * so the agent's spend limit stops it; it also stops taking new items well
 * inside an action's ten minutes. What it did not reach is read next run.
 */

/** Items summarised per source per run; the rest wait for the next. */
export const ITEMS_PER_SOURCE = 50;

/** A source read for the first time gives only its newest few, so News is not flooded with its back catalogue. */
export const FIRST_READ_ITEMS = 5;

/** No new item is started after this, well inside an action's ten minutes. */
const RUN_WORK_MS = 7 * 60 * 1000;

/** A feed can be long; a page only has to announce one. */
const FEED_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;
const REDIRECTS = 3;

const HEADERS = {
  "user-agent": "Mozilla/5.0 (compatible; NewsCollector/1.0; +https://www.rss-board.org/)",
  accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5",
};

/** Articles fetched through Firecrawl per source per run, for a site with no feed: each is a paid page. */
export const PAGES_PER_SOURCE = 10;

/** A channel to read, with its person's name: what its items are filed under. */
type Channel = {
  _id: Id<"followChannels">;
  followId: Id<"newsFollows">;
  kind: "WEBSITE" | "YOUTUBE" | "X" | "LINKEDIN";
  name: string;
  address: string;
  firstRead: boolean;
  externalId?: string;
  sinceId?: string;
};

async function fetchText(url: string): Promise<string> {
  const response = await fetchWorkflowAction(url, { method: "GET", headers: HEADERS }, {
    timeoutMs: FETCH_TIMEOUT_MS,
    maxResponseBytes: FEED_BYTES,
    maxRedirects: REDIRECTS,
  });
  if (response.status < 200 || response.status >= 300) throw appError("UPSTREAM_FAILURE", `${url} answered ${response.status}.`);
  return response.body;
}

/**
 * A website's or YouTube channel's items, newest first, or why there were
 * none. An item read from a page rather than a feed has no words yet: they are
 * fetched when it is summarised.
 */
async function readSource(ctx: ActionCtx, source: Channel): Promise<{ entries: FeedEntry[]; fromPage: boolean }> {
  if (source.kind === "YOUTUBE") {
    const feedUrl = youtubeFeedFromAddress(source.address) ?? youtubeFeedFromPage(await fetchText(source.address));
    if (!feedUrl) throw appError("UPSTREAM_FAILURE", "No channel could be found at this address. Use the channel's own page.");
    return { entries: newestFirst(parseFeed(await fetchText(feedUrl), feedUrl)), fromPage: false };
  }
  const page = await fetchText(source.address).catch(() => "");
  if (looksLikeFeed(page)) return { entries: newestFirst(parseFeed(page, source.address)), fromPage: false };
  const candidates = [
    ...feedLinksIn(page, source.address),
    ...feedGuesses(source.address),
  ];
  for (const feedUrl of candidates) {
    const body = await fetchText(feedUrl).catch(() => "");
    if (looksLikeFeed(body)) return { entries: newestFirst(parseFeed(body, feedUrl)), fromPage: false };
  }
  // No feed: the articles its page links to, in the page's own order, which a blog keeps newest first.
  const scraped = await ctx.runAction(internal.webScrapeActions.scrapeUrl, { url: source.address, withLinks: true });
  if (scraped.status !== "success") {
    throw appError("UPSTREAM_FAILURE", `This website has no feed, and its page could not be read either: ${scraped.error}`);
  }
  const links = articleLinks(scraped.links ?? [], source.address);
  if (links.length === 0) throw appError("UPSTREAM_FAILURE", "This website has no feed, and its page links to no articles. Use its blog or news page.");
  return { entries: links.map((url) => ({ title: "", url, key: url, publishedAt: null, text: "" })), fromPage: true };
}

function newestFirst(entries: FeedEntry[]): FeedEntry[] {
  return [...entries].sort((one, other) => (other.publishedAt ?? 0) - (one.publishedAt ?? 0));
}

/** An article found on a page, with its words fetched through Firecrawl; null when it could not be read. */
async function withWords(ctx: ActionCtx, entry: FeedEntry): Promise<FeedEntry | null> {
  if (entry.text) return entry;
  const scraped = await ctx.runAction(internal.webScrapeActions.scrapeUrl, { url: entry.url, mainContentOnly: true });
  if (scraped.status !== "success") return null;
  return { ...entry, title: scraped.title, text: scraped.content.slice(0, ENTRY_TEXT_LIMIT) };
}

const SUMMARY_FORMAT =
  "Reply with only a JSON object with three string keys: \"title\", the item's title in plain English; \"summary\", "
  + "your summary; and \"meaning\", what it means for a business owner, or \"\" when there is nothing for them to do or watch.";

const OUT_OF_TIME = "its time ran out; the rest are read next run";

type Run = {
  ctx: ActionCtx;
  runId: Id<"agentRuns">;
  started: number;
  instructions: string;
  model: Awaited<ReturnType<typeof resolveModel>>;
};

async function resolveModel(ctx: ActionCtx, requestedModelId: string | undefined) {
  return await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
    ...(requestedModelId ? { requestedModelId } : {}),
    useCase: "agent",
  });
}

/**
 * Each entry summarised with the agent's own instructions and model, and
 * saved live in News — the step every kind of source shares. Stops at the
 * spend limit or when the run's time is up, saying which.
 */
async function summariseAndSave(
  run: Run,
  entries: FeedEntry[],
  origin: { kind: "WEBSITE" | "YOUTUBE" | "X"; channel?: Channel; sourceName: (entry: FeedEntry) => string },
  onDone?: (entry: FeedEntry) => void,
): Promise<{ added: number; stoppedBecause: string | null }> {
  const { ctx, runId, model } = run;
  let added = 0;
  for (const found of entries) {
    if (Date.now() - run.started > RUN_WORK_MS) return { added, stoppedBecause: OUT_OF_TIME };
    const entry = await withWords(ctx, found);
    if (!entry) continue;
    const sourceName = origin.sourceName(entry);
    const prompt = JSON.stringify({ source: sourceName, title: entry.title, address: entry.url, text: entry.text });
    const response = await generateTextWithResolvedModel({
      model,
      systemInstruction: `${run.instructions}\n\n${SUMMARY_FORMAT}`,
      contents: [{ type: "text", text: prompt }],
    });
    const written = parseTranslation(response.text ?? "", ["title", "summary", "meaning"]);
    const cost = await ctx.runMutation(internal.roleRuns.recordRunModelCall, {
      runId,
      actionContext: `Summarising "${(entry.title || entry.text).slice(0, 80)}" from ${sourceName}`,
      modelId: model.modelId,
      providerKey: model.providerKey,
      providerModelId: model.providerModelId,
      inputTokens: response.inputTokens ?? 0,
      outputTokens: response.outputTokens ?? 0,
      promptContent: prompt,
      responseContent: response.text ?? "",
      failed: !written,
    });
    if (written && written.summary.trim()) {
      const saved = await ctx.runMutation(internal.newsCollector.saveCollectedItem, {
        ...(origin.channel ? { followId: origin.channel.followId, channelId: origin.channel._id } : {}),
        kind: origin.kind,
        sourceName,
        titleEn: (written.title.trim() || entry.title || entry.text.slice(0, 80)).slice(0, 300),
        summaryEn: written.summary.trim(),
        meaningEn: written.meaning.trim(),
        url: entry.url,
        publishedAt: entry.publishedAt ?? Date.now(),
        externalKey: entry.key,
        ...(entry.link ? { linkUrl: entry.link } : {}),
      });
      if (saved) added += 1;
    }
    onDone?.(entry);
    if (cost.limitReached) return { added, stoppedBecause: `it reached its spend limit, at $${cost.runCostUsd.toFixed(2)}` };
  }
  return { added, stoppedBecause: null };
}

/** What has not been collected before (or taken down), newest first, up to `limit`. */
async function freshOf(ctx: ActionCtx, entries: FeedEntry[], limit: number): Promise<FeedEntry[]> {
  const known = new Set(await ctx.runQuery(internal.newsCollector.knownKeys, { keys: entries.map((entry) => entry.key) }));
  return entries.filter((entry) => !known.has(entry.key)).slice(0, limit);
}

/** X's reads on the run, at the price entered for this deployment. */
async function chargeXReads(run: Run, posts: number, what: string) {
  return await run.ctx.runMutation(internal.roleRuns.recordRunServiceCall, {
    runId: run.runId,
    providerKey: "x",
    actionContext: `Read ${posts} ${posts === 1 ? "post" : "posts"} ${what}`,
    costUsd: posts * xReadCostPerPost(),
  });
}

/** A person's X account: its posts since the last read, through the app token. */
async function readXAccount(run: Run, channel: Channel) {
  const bearer = process.env.X_BEARER_TOKEN?.trim() ?? "";
  const handle = xHandleOf(channel.address);
  if (!handle) throw appError("INVALID_INPUT", `${channel.address} is not an X account's address.`);
  const read = await readAccountPosts({ bearer, handle, xUserId: channel.externalId, sinceId: channel.sinceId });
  await run.ctx.runMutation(internal.xConnect.keepXAccountPlace, {
    channelId: channel._id,
    externalId: read.xUserId,
    ...(read.newestId ? { sinceId: read.newestId } : {}),
  });
  const charged = await chargeXReads(run, read.postsRead, `from @${handle}`);
  return { entries: read.entries, limitReached: charged.limitReached };
}

/**
 * The connected account's new bookmarks (D11), oldest first so a run that
 * stops leaves the rest for the next. A first read takes only the newest few.
 */
async function readBookmarks(run: Run): Promise<{ added: number; stoppedBecause: string | null } | null> {
  const { ctx, runId } = run;
  const connection = await ctx.runQuery(internal.xConnect.connectionForRun, {});
  if (!connection) return null;
  const access = await connectedXAccess(ctx, connection);
  if (!access) {
    await ctx.runMutation(internal.roleRuns.logRunLine, {
      runId, heading: `Could not read ${connection.account}'s bookmarks`, detail: "X would not renew the access. Connect X again on Who to follow.", failed: true,
    });
    return null;
  }
  let read: Awaited<ReturnType<typeof readNewBookmarks>>;
  try {
    read = await readNewBookmarks({ accessToken: access, xUserId: connection.xUserId, lastBookmarkId: connection.lastBookmarkId });
  } catch (error: unknown) {
    await ctx.runMutation(internal.roleRuns.logRunLine, {
      runId, heading: `Could not read ${connection.account}'s bookmarks`, detail: appErrorMessage(error, "No reason given."), failed: true,
    });
    return null;
  }
  const charged = await chargeXReads(run, read.postsRead, `from ${connection.account}'s bookmarks`);
  const firstRead = connection.lastBookmarkId === null;
  const fresh = (await freshOf(ctx, read.entries, firstRead ? FIRST_READ_ITEMS : BOOKMARKS_PER_RUN)).reverse();
  const authors = new Map(read.entries.map((entry) => [entry.key, entry.author]));
  let readTo: string | null = null;
  const outcome = charged.limitReached
    ? { added: 0, stoppedBecause: `it reached its spend limit, at $${charged.runCostUsd.toFixed(2)}` }
    : await summariseAndSave(run, fresh, { kind: "X", sourceName: (entry) => authors.get(entry.key) ?? "X" }, (entry) => {
      readTo = entry.key.split("/").pop() ?? readTo;
    });
  // A first read, or one that reached every new bookmark, is read up to the newest; one cut short, to where it got.
  const lastBookmarkId = firstRead || !outcome.stoppedBecause ? read.newestId : readTo;
  await ctx.runMutation(internal.xConnect.markBookmarksRead, { ...(lastBookmarkId ? { lastBookmarkId } : {}) });
  await ctx.runMutation(internal.roleRuns.logRunLine, {
    runId,
    heading: `Read ${connection.account}'s bookmarks`,
    detail: `${read.entries.length} new since the last read, ${outcome.added} added.`,
    failed: false,
  });
  return outcome;
}

export async function collectNews(ctx: ActionCtx, runId: Id<"agentRuns">): Promise<string> {
  const started = Date.now();
  const agent = await ctx.runQuery(internal.newsCollector.readCollectorAgent, { runId });
  if (!agent) return "This run's agent no longer exists, so nothing was read.";
  const channels: Channel[] = await ctx.runQuery(internal.newsCollector.listChannelsToRead, {});
  const bookmarks = await ctx.runQuery(internal.xConnect.connectionForRun, {});
  if (channels.length === 0 && !bookmarks) return "No one in Who to follow has a channel being collected, so nothing was read.";
  await ctx.runMutation(internal.roleRuns.recordObservation, {
    runId,
    text: `${channels.length} ${channels.length === 1 ? "channel is" : "channels are"} being collected${channels.length ? `: ${channels.map((channel) => `${channel.name} (${channel.kind === "X" ? "X" : channel.kind === "YOUTUBE" ? "YouTube" : "website"})`).join(", ")}` : ""}.`
      + (bookmarks ? ` ${bookmarks.account}'s X bookmarks are connected.` : ""),
  });

  const run: Run = { ctx, runId, started, instructions: agent.instructions, model: await resolveModel(ctx, agent.requestedModelId) };
  let added = 0;
  let stoppedBecause: string | null = null;

  for (const channel of channels) {
    if (Date.now() - started > RUN_WORK_MS) stoppedBecause = OUT_OF_TIME;
    if (stoppedBecause) break;
    const label = `${channel.name}'s ${channel.kind === "X" ? "X account" : channel.kind === "YOUTUBE" ? "YouTube channel" : "website"}`;
    if (channel.kind === "X" && !isXAppTokenConfigured()) {
      await ctx.runMutation(internal.roleRuns.logRunLine, {
        runId, heading: `Skipped ${label}`, detail: "X accounts are read once X_BEARER_TOKEN, the X app's token, is set.", failed: false,
      });
      continue;
    }

    let entries: FeedEntry[];
    let limit: number;
    let what: string;
    try {
      if (channel.kind === "X") {
        const read = await readXAccount(run, channel);
        if (read.limitReached) stoppedBecause = "it reached its spend limit reading X";
        entries = read.entries;
        limit = channel.sinceId ? ITEMS_PER_SOURCE : FIRST_READ_ITEMS;
        what = "new posts";
      } else {
        const read = await readSource(ctx, channel);
        entries = read.entries;
        limit = channel.firstRead ? FIRST_READ_ITEMS : read.fromPage ? PAGES_PER_SOURCE : ITEMS_PER_SOURCE;
        what = read.fromPage ? "articles on its page" : "in its feed";
      }
    } catch (error: unknown) {
      const problem = appErrorMessage(error, "No reason given.");
      await ctx.runMutation(internal.roleRuns.logRunLine, { runId, heading: `Could not read ${label}`, detail: problem, failed: true });
      await ctx.runMutation(internal.newsCollector.markChannelRead, { channelId: channel._id, foundNew: false, problem });
      continue;
    }
    if (stoppedBecause) break;

    const fresh = await freshOf(ctx, entries, limit);
    const kind = channel.kind === "YOUTUBE" ? "YOUTUBE" : channel.kind === "X" ? "X" : "WEBSITE";
    const outcome = await summariseAndSave(run, fresh, { kind, channel, sourceName: () => channel.name });
    added += outcome.added;
    stoppedBecause = outcome.stoppedBecause;
    await ctx.runMutation(internal.newsCollector.markChannelRead, { channelId: channel._id, foundNew: outcome.added > 0 });
    await ctx.runMutation(internal.roleRuns.logRunLine, {
      runId,
      heading: `Read ${label}`,
      detail: `${entries.length} ${what}, ${fresh.length} new to News, ${outcome.added} added.`,
      failed: false,
    });
  }

  if (!stoppedBecause && bookmarks) {
    const outcome = await readBookmarks(run);
    if (outcome) {
      added += outcome.added;
      stoppedBecause = outcome.stoppedBecause;
    }
  }

  const spent = await ctx.runQuery(internal.roleRuns.readRunCost, { runId });
  return `Added ${added} ${added === 1 ? "item" : "items"} to News and spent $${spent.toFixed(2)}.`
    + (stoppedBecause ? ` Stopped because ${stoppedBecause}.` : "");
}
