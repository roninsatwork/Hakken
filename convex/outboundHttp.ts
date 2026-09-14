"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { fetchWorkflowAction } from "./utils/safeWorkflowHttp";

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
