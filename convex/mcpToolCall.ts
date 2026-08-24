/**
 * Running a tool that lives on somebody else's server.
 *
 * Phase 5 of `docs/plans/active/tool-server-plan.md`, and the first point at
 * which any of this does something. Everything before it stored, discovered and
 * catalogued; this reaches out and acts.
 *
 * **Five things are checked before a single byte leaves**, in this order,
 * because each one is cheaper than the one after it and any of them failing
 * means the call should never happen:
 *
 * 1. The tool exists and came from a server.
 * 2. **The company running matches the company that owns the tool.** The same
 *    boundary phase 3 drew, applied again at the moment of use. A binding is not
 *    permission; the run is.
 * 3. The server is connected, not disabled and not in error.
 * 4. The arguments the model produced match the schema the server published.
 * 5. The credential resolves.
 *
 * **The tenant is never taken from the model.** It comes from the run, and the
 * tool is looked up by the id the runtime invoked — not by a name the model
 * supplied — so there is no argument an injected instruction could set to reach
 * another company's server.
 */

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import { getErrorMessage } from "./utils/lang";
import {
  buildToolCallRequest,
  normaliseToolCallResult,
  type ToolCallOutcome,
} from "./mcpProtocol";
import { normaliseServerUrl } from "./mcpServerPolicy";
import { McpFailure, openSession, postJsonRpc, resolveServerAuthorization } from "./mcpTransport";
import { validateToolCallArgsAgainstSchema } from "./aiToolExecutionService";
import { buildUntrustedToolResult } from "./aiPromptAssembly";

export type ServerToolCallResult =
  | { ok: true; text: string; structured?: Record<string, unknown>; truncated: boolean }
  | { ok: false; error: string };

/** The tool and the server behind it, in one read. */
export const getCallTarget = internalQuery({
  args: { toolId: v.id("aiTools") },
  handler: async (ctx, args) => {
    const tool = await ctx.db.get(args.toolId);
    if (!tool?.mcpServerId) return null;

    const server = await ctx.db.get(tool.mcpServerId);
    if (!server) return null;

    return {
      companyId: tool.companyId,
      mcpToolName: tool.mcpToolName,
      inputSchema: tool.inputSchema,
      server: {
        _id: server._id,
        companyId: server.companyId,
        name: server.name,
        url: server.url,
        status: server.status,
        authMode: server.authMode,
        secretRef: server.secretRef,
        protocolVersion: server.protocolVersion,
      },
    };
  },
});

/**
 * Call one tool on one server.
 *
 * Every failure returns rather than throws. A server refusing, timing out or
 * answering with nonsense is an ordinary event that the model should be told
 * about so it can do something sensible next — not an exception that kills a run
 * the user was waiting on.
 */
export const callServerTool = internalAction({
  args: {
    toolId: v.id("aiTools"),
    companyId: v.optional(v.id("companies")),
    args: v.any(),
  },
  handler: async (ctx, args): Promise<ServerToolCallResult> => {
    const target = await ctx.runQuery(internal.mcpToolCall.getCallTarget, { toolId: args.toolId });

    if (!target || !target.mcpToolName) {
      return { ok: false, error: "That tool is no longer connected to a server." };
    }

    // The boundary, applied at the moment of use. A binding created while a
    // tool was global, or by an administrator of another company, is not
    // permission — the run is. Deliberately the same message either way, so a
    // caller cannot learn whether another company's tool exists.
    const owner = target.companyId ?? target.server.companyId;
    if (!args.companyId || owner !== args.companyId) {
      return { ok: false, error: "That tool is not available to this workspace." };
    }

    if (target.server.status !== "CONNECTED") {
      return {
        ok: false,
        error: `The "${target.server.name}" server is not switched on.`,
      };
    }

    // Checked against the schema the server published, before anything leaves.
    // Unvalidated arguments are how a tool call becomes whatever the model felt
    // like sending — to somebody else's system, with the workspace's credential.
    const validation = validateToolCallArgsAgainstSchema({
      schema: target.inputSchema,
      callArgs: (args.args ?? {}) as Record<string, unknown>,
    });
    if (!validation.ok) {
      return { ok: false, error: validation.errors.join(" ") };
    }

    const credential = resolveServerAuthorization(target.server);
    if (!credential.ok) return { ok: false, error: credential.reason };

    try {
      // Re-checked rather than trusted because it passed when it was stored.
      // The address is the one field worth an attacker's effort.
      const url = normaliseServerUrl(target.server.url);
      // Resolved, never hardcoded: a product cloned from this repo and renamed
      // introduces itself by its own name to every server it calls.
      const branding = await ctx.runQuery(internal.settings.getEmailBranding, {});
      const session = await openSession(url, branding.platformName, credential.authorization);

      const response = await postJsonRpc({
        url,
        body: buildToolCallRequest(2, target.mcpToolName, (args.args ?? {}) as Record<string, unknown>),
        authorization: credential.authorization,
        sessionId: session.sessionId,
        protocolVersion: session.protocolVersion,
        expectedId: 2,
      });

      const outcome: ToolCallOutcome = normaliseToolCallResult(response.result ?? {});

      // A tool that ran and refused is an answer, not a fault. The model needs
      // to see "no such invoice" in order to do something sensible next.
      if (outcome.failed) {
        return { ok: false, error: outcome.text || "The tool reported a failure." };
      }

      return {
        ok: true,
        // Marked as somebody else's words before it reaches the model. This is
        // the most credible place in a conversation to hide an instruction —
        // the model asked a question and this is the answer — so it carries the
        // same warning retrieved documents do.
        text: buildUntrustedToolResult({ serverLabel: target.server.name, text: outcome.text }),
        ...(outcome.structured ? { structured: outcome.structured } : {}),
        truncated: outcome.truncated,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof McpFailure
          ? error.message
          : getErrorMessage(error, "The server could not be reached."),
      };
    }
  },
});
