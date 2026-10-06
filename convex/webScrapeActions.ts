import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { metadataText, type PageMetadata } from "./utils/pageMetadata";

/**
 * Fetching a web page for an agent.
 *
 * Firecrawl was already in this codebase, but only inside the knowledge system,
 * where it ingests documents on an admin's instruction. Nothing let an agent
 * reach a page while it was working, so an agent asked to research something had
 * no way to look.
 *
 * This is the same provider and the same credential, exposed as one narrow
 * capability: fetch one page, return its readable text. The fetch itself is
 * `fetchPage`, shared with Admin → Content → Library's "Read the page"
 * (docs/plans/active/content-library-plan.md), which also wants the page's
 * details and keeps a longer article.
 */

/** Long enough for a slow site, short enough that a run does not hang on one page. */
export const SCRAPE_TIMEOUT_MS = 45_000;

/**
 * A page's text is fed back into the model, so it is charged for. Cut here
 * rather than letting one enormous page consume a run's whole budget.
 */
const MAX_RETURNED_CHARACTERS = 30_000;

/** One page read through Firecrawl, or why it could not be. */
export type FetchedPage =
  | { status: "success"; url: string; markdown: string; links: string[]; metadata: PageMetadata }
  | {
      status: "error";
      /** Why, for a caller that words it its own way. */
      reason: "not_configured" | "bad_address" | "refused" | "no_text" | "timeout" | "failed";
      /** The page's own answer, when it gave one (403, 404). */
      httpStatus?: number;
      /** Firecrawl's words, or the exception's, cut short. */
      detail: string;
    };

/** One page through Firecrawl: its Markdown, its links if asked for, and what its meta tags say. */
export async function fetchPage(args: { url: string; mainContentOnly?: boolean; withLinks?: boolean }): Promise<FetchedPage> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return { status: "error", reason: "not_configured", detail: "" };

  let target: URL;
  try {
    target = new URL(args.url);
  } catch {
    return { status: "error", reason: "bad_address", detail: "" };
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") return { status: "error", reason: "bad_address", detail: "protocol" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url: target.toString(),
        formats: args.withLinks ? ["markdown", "links"] : ["markdown"],
        onlyMainContent: args.mainContentOnly ?? true,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return { status: "error", reason: "refused", httpStatus: response.status, detail: detail.slice(0, 300) };
    }

    const payload = await response.json() as {
      data?: { markdown?: string; links?: unknown[]; metadata?: PageMetadata };
    };
    const markdown = payload.data?.markdown ?? "";
    if (!markdown.trim()) return { status: "error", reason: "no_text", detail: "" };
    return {
      status: "success",
      url: target.toString(),
      markdown,
      links: (payload.data?.links ?? []).filter((link): link is string => typeof link === "string"),
      metadata: payload.data?.metadata ?? {},
    };
  } catch (error: unknown) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return { status: "error", reason: aborted ? "timeout" : "failed", detail: error instanceof Error ? error.message : "unknown reason" };
  } finally {
    clearTimeout(timeout);
  }
}

export const scrapeUrl = internalAction({
  args: {
    url: v.string(),
    /** Fetch only the main article, dropping navigation and footers. */
    mainContentOnly: v.optional(v.boolean()),
    /**
     * Return the page's links too: the News Collector finds a website's
     * articles from its blog page this way when the site has no feed.
     */
    withLinks: v.optional(v.boolean()),
  },
  handler: async (_ctx, args) => {
    const page = await fetchPage(args);
    if (page.status === "error") {
      switch (page.reason) {
        case "not_configured":
          // Said plainly: this is a deployment that has not been given a key, not a
          // fault in the agent's reasoning. The agent is told so it stops retrying.
          return {
            status: "error" as const,
            error:
              "Web scraping is not set up on this deployment. No Firecrawl key is configured, "
              + "so pages cannot be fetched. Do not retry.",
          };
        case "bad_address":
          return {
            status: "error" as const,
            error: page.detail === "protocol"
              ? "Only http and https addresses can be fetched."
              : `That is not a usable web address: ${args.url}`,
          };
        case "refused":
          return { status: "error" as const, error: `The page could not be fetched (${page.httpStatus}). ${page.detail}`.trim() };
        case "no_text":
          return { status: "error" as const, error: "The page was reached but had no readable text." };
        case "timeout":
          return { status: "error" as const, error: `The page did not respond within ${SCRAPE_TIMEOUT_MS / 1000} seconds.` };
        default:
          return { status: "error" as const, error: `The page could not be fetched: ${page.detail}` };
      }
    }

    const truncated = page.markdown.length > MAX_RETURNED_CHARACTERS;
    return {
      status: "success" as const,
      url: page.url,
      title: metadataText(page.metadata, "title") ?? new URL(page.url).hostname,
      description: metadataText(page.metadata, "description"),
      // Flagged rather than silently cut, so the model knows it is reasoning
      // about part of a page and can say so.
      truncated,
      content: truncated ? page.markdown.slice(0, MAX_RETURNED_CHARACTERS) : page.markdown,
      ...(args.withLinks ? { links: page.links } : {}),
    };
  },
});
