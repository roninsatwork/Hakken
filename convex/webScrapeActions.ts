import { v } from "convex/values";
import { internalAction } from "./_generated/server";

/**
 * Fetching a web page for an agent.
 *
 * Firecrawl was already in this codebase, but only inside the knowledge system,
 * where it ingests documents on an admin's instruction. Nothing let an agent
 * reach a page while it was working, so an agent asked to research something had
 * no way to look.
 *
 * This is the same provider and the same credential, exposed as one narrow
 * capability: fetch one page, return its readable text.
 */

/** Long enough for a slow site, short enough that a run does not hang on one page. */
const SCRAPE_TIMEOUT_MS = 45_000;

/**
 * A page's text is fed back into the model, so it is charged for. Cut here
 * rather than letting one enormous page consume a run's whole budget.
 */
const MAX_RETURNED_CHARACTERS = 30_000;

export const scrapeUrl = internalAction({
  args: {
    url: v.string(),
    /** Fetch only the main article, dropping navigation and footers. */
    mainContentOnly: v.optional(v.boolean()),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      // Said plainly: this is a deployment that has not been given a key, not a
      // fault in the agent's reasoning. The agent is told so it stops retrying.
      return {
        status: "error" as const,
        error:
          "Web scraping is not set up on this deployment. No Firecrawl key is configured, "
          + "so pages cannot be fetched. Do not retry.",
      };
    }

    let target: URL;
    try {
      target = new URL(args.url);
    } catch {
      return { status: "error" as const, error: `That is not a usable web address: ${args.url}` };
    }
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      return { status: "error" as const, error: "Only http and https addresses can be fetched." };
    }

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
          formats: ["markdown"],
          onlyMainContent: args.mainContentOnly ?? true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        return {
          status: "error" as const,
          error: `The page could not be fetched (${response.status}). ${detail.slice(0, 300)}`.trim(),
        };
      }

      const payload = await response.json() as {
        data?: { markdown?: string; metadata?: { title?: string; description?: string } };
      };

      const markdown = payload.data?.markdown ?? "";
      if (!markdown.trim()) {
        return {
          status: "error" as const,
          error: "The page was reached but had no readable text.",
        };
      }

      const truncated = markdown.length > MAX_RETURNED_CHARACTERS;
      return {
        status: "success" as const,
        url: target.toString(),
        title: payload.data?.metadata?.title ?? target.hostname,
        description: payload.data?.metadata?.description,
        // Flagged rather than silently cut, so the model knows it is reasoning
        // about part of a page and can say so.
        truncated,
        content: truncated ? markdown.slice(0, MAX_RETURNED_CHARACTERS) : markdown,
      };
    } catch (error: unknown) {
      const aborted = error instanceof Error && error.name === "AbortError";
      return {
        status: "error" as const,
        error: aborted
          ? `The page did not respond within ${SCRAPE_TIMEOUT_MS / 1000} seconds.`
          : `The page could not be fetched: ${error instanceof Error ? error.message : "unknown reason"}`,
      };
    } finally {
      clearTimeout(timeout);
    }
  },
});
