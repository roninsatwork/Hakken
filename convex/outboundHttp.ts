"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { fetchWorkflowAction } from "./utils/safeWorkflowHttp";
import { PAGE_READER_AGENT } from "./utils/moneyPageChecks";

/** A rendered site page may be substantial, but it never gets an unlimited read. */
export const SITE_PAGE_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const SITE_PAGE_REDIRECTS = 3;

/** The only transport for tenant-configurable connector and MCP destinations. */
export const request = internalAction({
  args: {
    url: v.string(),
    method: v.string(),
    headers: v.record(v.string(), v.string()),
    body: v.optional(v.string()),
    maxResponseBytes: v.number(),
    timeoutMs: v.number(),
  },
  returns: v.object({ status: v.number(), body: v.string(), headers: v.record(v.string(), v.string()) }),
  handler: async (_ctx, args) => await fetchWorkflowAction(args.url, {
    method: args.method, headers: args.headers, body: args.body,
  }, {
    maxResponseBytes: Math.max(1, Math.min(args.maxResponseBytes, 512 * 1024)),
    timeoutMs: Math.max(1, Math.min(args.timeoutMs, 30_000)),
  }),
});

/**
 * The one boundary for reading a website page outside the crawl pipeline.
 * DNS is resolved and pinned, every redirect is revalidated, private network
 * addresses are refused, and the response stream is capped.
 */
export const fetchSitePage = internalAction({
  args: { url: v.string(), probe: v.optional(v.boolean()) },
  returns: v.object({ status: v.number(), body: v.string() }),
  handler: async (_ctx, args) => {
    const result = await fetchWorkflowAction(
      args.url,
      {
        method: "GET",
        headers: { "User-Agent": PAGE_READER_AGENT, Accept: "text/html" },
      },
      {
        maxRedirects: SITE_PAGE_REDIRECTS,
        maxResponseBytes: SITE_PAGE_MAX_RESPONSE_BYTES,
        discardBody: args.probe === true,
      },
    );
    return { status: result.status, body: result.body };
  },
});
