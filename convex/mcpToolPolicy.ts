/**
 * Who may see a tool, and what an imported one is allowed to be.
 *
 * This is the boundary phase 3 of the tool-server plan exists to draw, kept as
 * pure functions so it can be proven directly rather than inferred from the
 * behaviour of a runtime.
 *
 * **The shape of the problem.** Agents are global by design — a shared
 * capability any workspace can use — so separation cannot come from an agent
 * belonging to a company. Until now every tool was global too, which was safe
 * while every tool was curated by a super-admin. A connected tool server breaks
 * that: two companies can connect different systems, and one company's tool is
 * reached with one company's credential. So a tool acquires an owner for the
 * first time, and a shared agent running for a company may use only that
 * company's tools plus the global ones.
 */

import type { Id } from "./_generated/dataModel";

/** Prefix on every tool that arrived from a server, so provenance is legible. */
const SERVER_TOOL_PREFIX_MAX = 20;

/**
 * What a model provider will accept, and therefore the ceiling on a full name.
 *
 * The budget is spent on the *handler mapping*, not the tool's own name — see
 * `MCP_TOOL_HANDLER_PREFIX` for why — so the room left for a server and tool
 * name is 64 less the prefix.
 */
const TOOL_NAME_MAX = 64 - "mcp_".length;

/**
 * Whether a run belonging to `runCompanyId` may use this tool.
 *
 * Three rules, and the third is the one worth stating out loud:
 *
 * 1. A tool with no owner is global — every existing tool, unchanged.
 * 2. A tool with an owner is usable only by that owner.
 * 3. **A run with no company gets no owned tools at all.** An agent can run
 *    without a conversation behind it — a schedule, a workflow node — and in
 *    that case there is no company to check against. Failing open there would
 *    mean the one path that skips the check is the one nobody was looking at.
 */
export function isToolVisibleToCompany(
  tool: { companyId?: Id<"companies"> },
  runCompanyId: Id<"companies"> | undefined,
): boolean {
  if (!tool.companyId) return true;
  if (!runCompanyId) return false;
  return tool.companyId === runCompanyId;
}

/**
 * A name a model can address, that says where the tool came from.
 *
 * Two servers may both offer `get_invoice`, and so may a tool built here. The
 * model addresses a tool by name alone, so a collision is not a cosmetic
 * problem — it is two different systems behind one word, and whichever the
 * runtime happened to match wins.
 *
 * The prefix comes from the server's name rather than its id because a person
 * reads these in an agent's tool list and in a run's transcript. `finance` and
 * `warehouse` tell them something; a document id does not.
 */
export function buildServerToolName(serverName: string, toolName: string): string {
  const prefix = serverName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, SERVER_TOOL_PREFIX_MAX)
    .replace(/_+$/g, "");

  const base = prefix ? `${prefix}_${toolName}` : toolName;

  // Truncating from the front would cut the prefix that carries provenance, so
  // the tool name is what gives. A collision after truncation is still possible
  // and is caught where the rows are written, not guessed at here.
  return base.slice(0, TOOL_NAME_MAX);
}

/**
 * What an imported tool is allowed to claim about itself.
 *
 * The protocol lets a server annotate a tool as read-only, and the specification
 * is explicit that **clients must treat those annotations as untrusted**. A
 * server that wants its write tool run without a human looking would say exactly
 * what a read-only tool says.
 *
 * So nothing imported is believed. Every tool from a server is `EXTERNAL` —
 * which the runtime's approval rules already treat as "always ask" — and
 * inactive until a person turns it on. An administrator who knows a particular
 * tool only reads may lower it afterwards; that is a decision made by someone
 * accountable, not a field copied from a stranger.
 */
export const IMPORTED_TOOL_DEFAULTS = {
  sideEffectLevel: "EXTERNAL",
  confirmationRequired: true,
  isActive: false,
  requiredRole: "ADMIN",
} as const;

/**
 * The one handler every tool-server call routes through.
 *
 * **This was briefly one mapping per tool, and no longer is.** Phase 3 needed
 * each imported tool to reach the model under a distinct name, and at the time
 * the model-facing name *was* the routing key — so a distinct name could only be
 * had by inventing a distinct routing key. That was the tail wagging the dog,
 * and it would have forced the dispatcher to grow prefix matching.
 *
 * Phase 4 separated the two. A tool now carries its model-facing name
 * explicitly, so routing goes back to what it should always have been: one
 * entry, one implementation, resolved to a server and a tool from the calling
 * tool record.
 *
 * **Deny-by-default is untouched.** The single thing on the dispatcher's
 * allowlist is still the only thing that runs.
 */
export const MCP_TOOL_HANDLER = "mcp.call";
