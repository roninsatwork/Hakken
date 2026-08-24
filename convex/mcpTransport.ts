/**
 * Talking to a tool server: the socket, and nothing else.
 *
 * Split out of `mcpDiscovery.ts` when calling a tool arrived (phase 5) and
 * needed the same handshake, timeout, size cap and redirect refusal that
 * discovery already had. Two copies of a security-shaped routine is how one of
 * them quietly stops matching the other.
 *
 * The protocol thinking lives in `mcpProtocol.ts`, which has no network in it.
 * What is here is only the part that genuinely needs a socket.
 */

import { getErrorMessage } from "./utils/lang";
import { resolveConnectorSecret } from "./connectorSecretResolver";
import {
  buildInitialiseRequest,
  buildInitialisedNotification,
  interpretInitialiseResult,
  MCP_DISCOVERY_TIMEOUT_MS,
  MCP_MAX_RESPONSE_BYTES,
  readJsonRpcResponse,
} from "./mcpProtocol";

/** One exchange with a server, and what it left us holding. */
export type Exchange = {
  sessionId?: string;
  protocolVersion: string;
};

/**
 * A server misbehaving, which is an outcome to record rather than a crash.
 *
 * A distinct class so a caller can tell "the server said no" from a genuine
 * fault in this code, and report the first plainly while still surfacing the
 * second.
 */
export class McpFailure extends Error {}

/** Fail in a way the caller records rather than throws. */
export function fail(reason: string): never {
  throw new McpFailure(reason);
}

/**
 * POST one JSON-RPC message and read the answer.
 *
 * Three protections, each for a specific way this goes wrong:
 *
 * - **Redirects are refused, never followed.** Following one would let the
 *   server forward the request — and the credential it carries — somewhere the
 *   administrator never named. The HTTP connector takes the same position.
 * - **A timeout, always.** A server that accepts a connection and then says
 *   nothing would otherwise hold this action until the platform killed it.
 * - **A size cap.** A tool list is small; anything vast is either a mistake or
 *   an attempt to exhaust the process reading it.
 */
export async function postJsonRpc(args: {
  url: string;
  body: unknown;
  authorization?: string;
  sessionId?: string;
  protocolVersion?: string;
  expectedId?: number;
}): Promise<{ result?: Record<string, unknown>; sessionId?: string }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    // The transport requires a client to accept both, and a server may answer
    // either way for the same request.
    Accept: "application/json, text/event-stream",
  };
  if (args.authorization) headers.Authorization = args.authorization;
  if (args.sessionId) headers["Mcp-Session-Id"] = args.sessionId;
  if (args.protocolVersion) headers["MCP-Protocol-Version"] = args.protocolVersion;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MCP_DISCOVERY_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(args.url, {
      method: "POST",
      headers,
      body: JSON.stringify(args.body),
      redirect: "manual",
      signal: controller.signal,
    });
  } catch (error) {
    const message = getErrorMessage(error, "unknown error");
    fail(controller.signal.aborted
      ? `The server did not answer within ${Math.round(MCP_DISCOVERY_TIMEOUT_MS / 1000)} seconds.`
      : `The server could not be reached: ${message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (response.status >= 300 && response.status < 400) {
    fail("The server redirected the request, which is not followed.");
  }

  const sessionId = response.headers.get("Mcp-Session-Id") ?? undefined;

  // A notification is answered with 202 and no body. There is nothing to read
  // and nothing to check beyond the status.
  if (args.expectedId === undefined) {
    if (!response.ok && response.status !== 202) {
      fail(`The server rejected the handshake with status ${response.status}.`);
    }
    return { sessionId };
  }

  if (!response.ok) {
    fail(`The server answered with status ${response.status}.`);
  }

  const declaredLength = Number(response.headers.get("Content-Length") ?? "0");
  if (declaredLength > MCP_MAX_RESPONSE_BYTES) {
    fail("The server's reply is too large to read.");
  }

  const body = await response.text();
  if (body.length > MCP_MAX_RESPONSE_BYTES) {
    fail("The server's reply is too large to read.");
  }

  const outcome = readJsonRpcResponse({
    contentType: response.headers.get("Content-Type"),
    body,
    expectedId: args.expectedId,
  });
  if (!outcome.ok) fail(outcome.reason);

  return { result: outcome.result, sessionId };
}

/** Open a session: greet the server, and tell it we are ready. */
export async function openSession(
  url: string,
  clientName: string,
  authorization?: string,
): Promise<Exchange & { label?: string }> {
  const greeting = await postJsonRpc({
    url,
    body: buildInitialiseRequest(1, clientName),
    authorization,
    expectedId: 1,
  });

  const interpreted = interpretInitialiseResult(greeting.result ?? {});
  if (!interpreted.ok) fail(interpreted.reason);

  // Owed to the server before any real request. A server within its rights to
  // refuse everything until it arrives.
  await postJsonRpc({
    url,
    body: buildInitialisedNotification(),
    authorization,
    sessionId: greeting.sessionId,
    protocolVersion: interpreted.protocolVersion,
  });

  return {
    sessionId: greeting.sessionId,
    protocolVersion: interpreted.protocolVersion,
    label: interpreted.serverName,
  };
}

/**
 * The Authorization header a server is owed, if any.
 *
 * Returns the *name* of the variable to set when a reference resolves to
 * nothing, never the value and never a near miss. An operator needs to know
 * which variable is missing; nobody needs its contents.
 */
export function resolveServerAuthorization(server: {
  authMode: "NONE" | "SECRET_REF";
  secretRef?: string;
}): { ok: true; authorization?: string } | { ok: false; reason: string } {
  if (server.authMode !== "SECRET_REF") return { ok: true };
  if (!server.secretRef) {
    return { ok: false, reason: "This server has no credential configured." };
  }

  const lookup = resolveConnectorSecret(server.secretRef, process.env);
  if (!lookup.found) {
    return {
      ok: false,
      reason: `The credential is not configured on this deployment. Set ${lookup.envName}.`,
    };
  }

  return { ok: true, authorization: `Bearer ${lookup.value}` };
}
