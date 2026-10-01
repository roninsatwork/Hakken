"use node";

import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import { appError, appErrorMessage } from "./utils/appError";
import { parseTranslation } from "./utils/contentTranslator";
import { fetchWorkflowAction } from "./utils/safeWorkflowHttp";
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
 * plan.md, phase 5): read every source that is on, keep what is new, and
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
 * - **X accounts** wait for phase 6 and X access, and say so.
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

type Source = { _id: Id<"newsSources">; kind: "WEBSITE" | "YOUTUBE" | "X_ACCOUNT"; name: string; address: string; firstRead: boolean };

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
 * The source's items, newest first, or why there were none. An item read from
 * a page rather than a feed has no words yet: they are fetched when it is
 * summarised.
 */
async function readSource(ctx: ActionCtx, source: Source): Promise<{ entries: FeedEntry[]; fromPage: boolean }> {
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

export async function collectNews(ctx: ActionCtx, runId: Id<"agentRuns">): Promise<string> {
  const started = Date.now();
  const agent = await ctx.runQuery(internal.newsCollector.readCollectorAgent, { runId });
  if (!agent) return "This run's agent no longer exists, so nothing was read.";
  const sources: Source[] = await ctx.runQuery(internal.newsCollector.listSourcesToRead, {});
  if (sources.length === 0) return "No News source is switched on, so nothing was read.";
  await ctx.runMutation(internal.roleRuns.recordObservation, {
    runId,
    text: `${sources.length} ${sources.length === 1 ? "source is" : "sources are"} on: ${sources.map((source) => source.name).join(", ")}.`,
  });

  const model = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
    ...(agent.requestedModelId ? { requestedModelId: agent.requestedModelId } : {}),
    useCase: "agent",
  });
  let added = 0;
  let stoppedBecause: string | null = null;

  for (const source of sources) {
    if (stoppedBecause) break;
    if (Date.now() - started > RUN_WORK_MS) {
      stoppedBecause = "its time ran out; the rest are read next run";
      break;
    }
    if (source.kind === "X_ACCOUNT") {
      await ctx.runMutation(internal.roleRuns.logRunLine, {
        runId, heading: `Skipped ${source.name}`, detail: "X accounts are read once X access is set up (phase 6).", failed: false,
      });
      continue;
    }

    let entries: FeedEntry[];
    let fromPage: boolean;
    try {
      ({ entries, fromPage } = await readSource(ctx, source));
    } catch (error: unknown) {
      await ctx.runMutation(internal.roleRuns.logRunLine, {
        runId, heading: `Could not read ${source.name}`, detail: appErrorMessage(error, "No reason given."), failed: true,
      });
      await ctx.runMutation(internal.newsCollector.markSourceRead, { sourceId: source._id, foundNew: false });
      continue;
    }

    const known = new Set(await ctx.runQuery(internal.newsCollector.knownKeys, { keys: entries.map((entry) => entry.key) }));
    const limit = source.firstRead ? FIRST_READ_ITEMS : fromPage ? PAGES_PER_SOURCE : ITEMS_PER_SOURCE;
    const fresh = entries.filter((entry) => !known.has(entry.key)).slice(0, limit);

    let fromSource = 0;
    for (const found of fresh) {
      if (Date.now() - started > RUN_WORK_MS) {
        stoppedBecause = "its time ran out; the rest are read next run";
        break;
      }
      const entry = await withWords(ctx, found);
      if (!entry) continue;
      const prompt = JSON.stringify({ source: source.name, title: entry.title, address: entry.url, text: entry.text });
      const response = await generateTextWithResolvedModel({
        model,
        systemInstruction: `${agent.instructions}\n\n${SUMMARY_FORMAT}`,
        contents: [{ type: "text", text: prompt }],
      });
      const written = parseTranslation(response.text ?? "", ["title", "summary", "meaning"]);
      const cost = await ctx.runMutation(internal.roleRuns.recordRunModelCall, {
        runId,
        actionContext: `Summarising "${entry.title.slice(0, 80)}" from ${source.name}`,
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
          sourceId: source._id,
          kind: source.kind === "YOUTUBE" ? "YOUTUBE" : "WEBSITE",
          sourceName: source.name,
          titleEn: (written.title.trim() || entry.title).slice(0, 300),
          summaryEn: written.summary.trim(),
          meaningEn: written.meaning.trim(),
          url: entry.url,
          publishedAt: entry.publishedAt ?? Date.now(),
          externalKey: entry.key,
        });
        if (saved) fromSource += 1;
      }
      if (cost.limitReached) {
        stoppedBecause = `it reached its spend limit, at $${cost.runCostUsd.toFixed(2)}`;
        break;
      }
    }

    added += fromSource;
    await ctx.runMutation(internal.newsCollector.markSourceRead, { sourceId: source._id, foundNew: fromSource > 0 });
    await ctx.runMutation(internal.roleRuns.logRunLine, {
      runId,
      heading: `Read ${source.name}`,
      detail: `${entries.length} ${fromPage ? "articles on its page" : "in its feed"}, ${fresh.length} new to News, ${fromSource} added.`,
      failed: false,
    });
  }

  const spent = await ctx.runQuery(internal.roleRuns.readRunCost, { runId });
  return `Added ${added} ${added === 1 ? "item" : "items"} to News and spent $${spent.toFixed(2)}.`
    + (stoppedBecause ? ` Stopped because ${stoppedBecause}.` : "");
}
