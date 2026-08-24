/**
 * Speaking the tool-server protocol, without the network.
 *
 * Everything here is a pure function over strings and objects: build a request,
 * read a response, decide whether what came back is usable. The action that
 * actually makes the call lives in `mcpDiscovery.ts` and does nothing this file
 * could have done, which is what makes the awkward half — a truncated stream, a
 * server answering with the wrong protocol version, a tool list containing
 * something hostile — testable without standing up a server to misbehave.
 *
 * **Everything a server sends is untrusted.** Tool names and descriptions are
 * written by whoever runs the server, and a description eventually reaches a
 * model as instructions-adjacent text. That makes a tool list a prompt-injection
 * surface. This file's job is to bound it: refuse names that are not name-shaped,
 * cap lengths, strip control characters, and drop anything malformed rather than
 * passing it along. Neutralising the *content* for a prompt happens where it is
 * rendered into one; refusing to accept nonsense happens here.
 */

import { isRecord } from "./utils/lang";

/**
 * The protocol version this client speaks.
 *
 * Sent on `initialize`, and — per the transport spec — echoed as a header on
 * every request afterwards. A server that supports it must reply with the same
 * string; one that does not replies with its own, and the client decides whether
 * it can live with that.
 */
export const MCP_PROTOCOL_VERSION = "2025-06-18";

/** Versions this client can still work with if a server insists on an older one. */
const ACCEPTED_PROTOCOL_VERSIONS = new Set([
  MCP_PROTOCOL_VERSION,
  "2025-03-26",
  "2024-11-05",
]);

/** One discovery attempt, end to end. */
export const MCP_DISCOVERY_TIMEOUT_MS = 15_000;

/** Cap on a single response body, so a server cannot exhaust memory. */
export const MCP_MAX_RESPONSE_BYTES = 512 * 1024;

/**
 * Cap on tools taken from one server.
 *
 * Not arbitrary: every tool offered to a model costs context on every turn, so a
 * server publishing thousands would quietly ruin every agent that touched it.
 */
export const MCP_MAX_TOOLS = 200;

/** Pages of tool list followed before giving up on a server that never ends. */
export const MCP_MAX_PAGES = 10;

export const MCP_MAX_TOOL_NAME_CHARS = 64;
export const MCP_MAX_DESCRIPTION_CHARS = 4_000;

/**
 * What a model provider will accept as a function name.
 *
 * The intersection of what the providers allow, not what the protocol allows —
 * a tool whose name a provider rejects would fail at the moment an agent tried
 * to use it, which is far too late to find out.
 */
const TOOL_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export type JsonRpcOutcome =
  | { ok: true; result: Record<string, unknown> }
  | { ok: false; reason: string };

export type DiscoveredTool = {
  name: string;
  title?: string;
  description: string;
  inputSchemaJson: string;
  outputSchemaJson?: string;
};

/**
 * The `initialize` request that must open every session.
 *
 * `clientName` is passed in rather than written here. Every server this platform
 * connects to is told who is calling, and a product cloned from this repo and
 * renamed must introduce itself by its own name — not by the name of the
 * framework it was built from. The caller resolves it from settings.
 */
export function buildInitialiseRequest(id: number, clientName: string) {
  return {
    jsonrpc: "2.0" as const,
    id,
    method: "initialize",
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      // Deliberately empty. `sampling` would let a server ask this platform to
      // run a model on its behalf, and `roots` would expose file locations —
      // neither is anything a connected tool server needs, and declaring a
      // capability is what invites its use.
      capabilities: {},
      clientInfo: { name: clientName, version: "1.0.0" },
    },
  };
}

/** The notification a server is owed once initialisation succeeds. */
export function buildInitialisedNotification() {
  return { jsonrpc: "2.0" as const, method: "notifications/initialized" };
}

/** Ask for a page of the tool list. */
export function buildToolsListRequest(id: number, cursor?: string) {
  return {
    jsonrpc: "2.0" as const,
    id,
    method: "tools/list",
    ...(cursor ? { params: { cursor } } : { params: {} }),
  };
}

/**
 * Pull the JSON-RPC response out of whatever the server replied with.
 *
 * The transport permits two answers to the same question: one JSON object, or an
 * event stream that eventually contains one. A client must support both, and a
 * server may switch between them per request, so this decides by content type
 * rather than by what the server did last time.
 */
export function readJsonRpcResponse(args: {
  contentType: string | null;
  body: string;
  expectedId: number;
}): JsonRpcOutcome {
  const type = (args.contentType ?? "").toLowerCase();
  const payloads = type.includes("text/event-stream")
    ? extractSseData(args.body)
    : [args.body];

  if (payloads.length === 0) {
    return { ok: false, reason: "The server's reply contained no message." };
  }

  for (const payload of payloads) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      continue;
    }
    if (!isRecord(parsed)) continue;
    // A stream may carry the server's own requests and notifications before the
    // answer. Only the message bearing our id is the answer.
    if (parsed.id !== args.expectedId) continue;

    if (isRecord(parsed.error)) {
      const message = typeof parsed.error.message === "string" ? parsed.error.message : "unknown error";
      return { ok: false, reason: `The server refused the request: ${message}` };
    }
    if (isRecord(parsed.result)) {
      return { ok: true, result: parsed.result };
    }
  }

  return { ok: false, reason: "The server's reply did not answer the request." };
}

/**
 * Split an event stream into its data payloads.
 *
 * Only `data:` matters here — event names, ids and retry hints are for
 * resumption, which a single discovery call does not use. Multi-line data is
 * joined with newlines as the SSE standard requires, because a JSON object split
 * across lines is otherwise unparseable.
 */
function extractSseData(body: string): string[] {
  const payloads: string[] = [];
  let current: string[] = [];

  for (const rawLine of body.split(/\r\n|\r|\n/)) {
    if (rawLine === "") {
      if (current.length > 0) {
        payloads.push(current.join("\n"));
        current = [];
      }
      continue;
    }
    if (rawLine.startsWith("data:")) {
      current.push(rawLine.slice(5).replace(/^ /, ""));
    }
  }
  if (current.length > 0) payloads.push(current.join("\n"));

  return payloads;
}

export type InitialiseOutcome =
  | { ok: true; protocolVersion: string; serverName?: string; supportsTools: boolean }
  | { ok: false; reason: string };

/**
 * Decide whether a server's greeting means the conversation can continue.
 *
 * A server that does not declare the `tools` capability is refused here rather
 * than being asked for a tool list it never claimed to have. It is a clearer
 * message, and it is the difference between "this server offers no tools" and
 * "this server is broken", which are different problems for whoever connected it.
 */
export function interpretInitialiseResult(result: Record<string, unknown>): InitialiseOutcome {
  const protocolVersion = typeof result.protocolVersion === "string" ? result.protocolVersion : "";

  if (!protocolVersion) {
    return { ok: false, reason: "The server did not say which protocol version it speaks." };
  }
  if (!ACCEPTED_PROTOCOL_VERSIONS.has(protocolVersion)) {
    return {
      ok: false,
      reason: `The server speaks protocol version ${protocolVersion}, which this platform does not support.`,
    };
  }

  const capabilities = isRecord(result.capabilities) ? result.capabilities : {};
  const supportsTools = isRecord(capabilities.tools);
  if (!supportsTools) {
    return { ok: false, reason: "This server does not offer any tools." };
  }

  const serverInfo = isRecord(result.serverInfo) ? result.serverInfo : undefined;
  const serverName = serverInfo && typeof serverInfo.name === "string" ? serverInfo.name : undefined;

  return { ok: true, protocolVersion, serverName, supportsTools };
}

export type ToolsPage = {
  tools: DiscoveredTool[];
  nextCursor?: string;
  /** Entries dropped for being malformed, so the count can be reported honestly. */
  rejected: number;
};

/**
 * Turn one page of a tool list into records worth storing.
 *
 * Malformed entries are dropped rather than failing the page. A server with one
 * bad tool among forty is common — a rename mid-deploy, an optional field a
 * framework omitted — and refusing all forty over one helps nobody. The count of
 * what was dropped is returned so the screen can say so instead of quietly
 * showing thirty-nine.
 */
export function normaliseToolsPage(result: Record<string, unknown>): ToolsPage {
  const raw = Array.isArray(result.tools) ? result.tools : [];
  const tools: DiscoveredTool[] = [];
  let rejected = 0;

  for (const entry of raw) {
    const tool = normaliseTool(entry);
    if (tool) tools.push(tool);
    else rejected += 1;
  }

  const nextCursor = typeof result.nextCursor === "string" && result.nextCursor.length > 0
    ? result.nextCursor
    : undefined;

  return { tools, nextCursor, rejected };
}

function normaliseTool(entry: unknown): DiscoveredTool | null {
  if (!isRecord(entry)) return null;

  const name = typeof entry.name === "string" ? entry.name.trim() : "";
  if (!TOOL_NAME_PATTERN.test(name)) return null;

  // An input schema is not optional in practice: without one there is nothing to
  // validate a model's arguments against, and unvalidated arguments are how a
  // tool call becomes whatever the model felt like sending.
  if (!isRecord(entry.inputSchema)) return null;

  return {
    name,
    title: cleanText(entry.title, MCP_MAX_TOOL_NAME_CHARS) || undefined,
    description: cleanText(entry.description, MCP_MAX_DESCRIPTION_CHARS),
    inputSchemaJson: JSON.stringify(entry.inputSchema),
    outputSchemaJson: isRecord(entry.outputSchema) ? JSON.stringify(entry.outputSchema) : undefined,
  };
}

/**
 * Make a server-supplied string safe to store and show.
 *
 * Control characters are stripped because they are never meaningful in a
 * description and are exactly what a payload hiding from a reviewer's eye looks
 * like — a description that reads harmlessly in a table while carrying something
 * else into a prompt.
 */
/** Ask a server to run one of its tools. */
export function buildToolCallRequest(id: number, name: string, args: Record<string, unknown>) {
  return {
    jsonrpc: "2.0" as const,
    id,
    method: "tools/call",
    params: { name, arguments: args },
  };
}

/** Cap on how much of a tool's answer is read back into a model's context. */
export const MCP_MAX_RESULT_CHARS = 32 * 1024;

export type ToolCallOutcome = {
  /** What the server said, flattened to text a model can read. */
  text: string;
  /** Structured output, where the server provided it. */
  structured?: Record<string, unknown>;
  /**
   * Whether the server reported the tool itself failed.
   *
   * Distinct from a protocol error, which never gets this far. A tool that ran
   * and refused — "no such invoice", "rate limit reached" — is an answer, and
   * the model needs to see it in order to do something sensible next.
   */
  failed: boolean;
  truncated: boolean;
};

/**
 * Read what a server said its tool did.
 *
 * The protocol allows several content types back — text, images, audio, links
 * to resources, whole embedded documents. Only text is passed to the model
 * here: an image arriving as base64 in a tool result would consume an enormous
 * share of the context window for something the model was not asked to look at,
 * and the other types name resources this platform has no way to fetch.
 * Anything not text is described rather than included, so the model is told
 * something came back rather than silently given nothing.
 */
export function normaliseToolCallResult(result: Record<string, unknown>): ToolCallOutcome {
  const failed = result.isError === true;
  const structured = isRecord(result.structuredContent) ? result.structuredContent : undefined;
  const parts: string[] = [];

  if (Array.isArray(result.content)) {
    for (const entry of result.content) {
      if (!isRecord(entry)) continue;
      if (entry.type === "text" && typeof entry.text === "string") {
        parts.push(entry.text);
      } else if (typeof entry.type === "string") {
        parts.push(`[the server also returned ${entry.type} content, which is not passed on]`);
      }
    }
  }

  const joined = parts.join("\n").trim();
  const text = joined.length > MCP_MAX_RESULT_CHARS
    ? `${joined.slice(0, MCP_MAX_RESULT_CHARS)}\n\n[... the rest of the answer was too long to include]`
    : joined;

  return {
    text: text || (structured ? "" : "The tool returned nothing."),
    structured,
    failed,
    truncated: joined.length > MCP_MAX_RESULT_CHARS,
  };
}

function cleanText(value: unknown, maxChars: number): string {
  if (typeof value !== "string") return "";

  const stripped = value.replace(/[\u0000-\u001F\u007F]/g, " ").trim();

  return stripped.length > maxChars ? `${stripped.slice(0, maxChars)}…` : stripped;
}
