import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/**
 * The door the voice relay knocks on when a spoken session reaches for the
 * company's knowledge.
 *
 * Until now the caller's *browser* answered that reach: it received the tool
 * call, asked the platform to search, and handed the passages back. That
 * works for a screen and not at all for a phone, which has no browser to put
 * the job in — and duplicating the logic per surface is how two spoken
 * channels end up knowing different things.
 *
 * So the relay answers it, through here, for every spoken surface at once.
 * It presents the same signed ticket the platform minted when the session
 * opened: the platform can therefore trust which thread is asking without
 * the relay being able to invent one, and the ticket is the only credential
 * involved — the relay holds no key to anything else.
 */

/**
 * The body carries the session's signed ticket, and a ticket carries the
 * company's full spoken-session instructions — prompt, rules, skills,
 * memories. For a content-rich company that is tens of kilobytes, and the
 * first live phone call bounced off the original 4KB limit with a 413: every
 * knowledge lookup failed, so the voice truthfully told the caller it could
 * not check. The bound exists to stop abuse, not to measure questions — it
 * only needs to be far below anything worth an attacker's while.
 */
const MAX_BODY_BYTES = 128 * 1024;
/**
 * A ticket is minted good for a minute — long enough to open a connection.
 * A knowledge lookup happens mid-conversation, so it is bounded by how long
 * a session may last instead, which the relay enforces at the socket.
 */
const MAX_SESSION_MS = 15 * 60 * 1000;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function base64UrlToBytes(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function base64UrlToText(value: string) {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

/**
 * Verified with Web Crypto rather than a hand-rolled comparison: `verify`
 * is constant-time by contract, which a string equality check is not.
 */
export async function ticketIsAuthentic(payloadPart: string, signaturePart: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  return await crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlToBytes(signaturePart),
    new TextEncoder().encode(payloadPart)
  );
}

export const handleVoiceKnowledgeLookup = httpAction(async (ctx, request) => {
  const secret = process.env.VOICE_RELAY_SECRET?.trim();
  if (!secret) return jsonResponse({ error: "The voice relay is not configured." }, 503);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return jsonResponse({ error: "Body too large." }, 413);

  let body: { ticket?: unknown; query?: unknown };
  try {
    body = JSON.parse(raw) as { ticket?: unknown; query?: unknown };
  } catch {
    return jsonResponse({ error: "Body must be JSON." }, 400);
  }

  const ticket = typeof body.ticket === "string" ? body.ticket : "";
  const query = typeof body.query === "string" ? body.query : "";
  const [payloadPart, signaturePart] = ticket.split(".");
  if (!payloadPart || !signaturePart) return jsonResponse({ error: "Refused." }, 401);

  let authentic = false;
  try {
    authentic = await ticketIsAuthentic(payloadPart, signaturePart, secret);
  } catch {
    authentic = false;
  }
  if (!authentic) return jsonResponse({ error: "Refused." }, 401);

  let payload: { threadId?: string; companyId?: string | null; expiresAt?: number };
  try {
    payload = JSON.parse(base64UrlToText(payloadPart)) as typeof payload;
  } catch {
    return jsonResponse({ error: "Refused." }, 401);
  }

  if (typeof payload.expiresAt !== "number" || payload.expiresAt + MAX_SESSION_MS < Date.now()) {
    return jsonResponse({ error: "Session expired." }, 401);
  }
  // A session names a thread or a company. A phone call has no thread — there
  // is no conversation on a screen to attach anything to — so a ticket
  // carrying only a company is legitimate, and one carrying neither is not.
  if (!payload.threadId && !payload.companyId) return jsonResponse({ error: "Refused." }, 401);

  // The thread decides whose knowledge is searched. The company on the ticket
  // is only a fallback for a thread that belongs to no workspace, so a
  // tampered-with company cannot reach another tenant's documents — and the
  // ticket could not be tampered with anyway, having just been verified.
  const result = await ctx.runAction(internal.ai.searchKnowledgeForVoiceInternal, {
    query,
    ...(payload.threadId ? { threadId: payload.threadId as Id<"threads"> } : {}),
    ...(payload.companyId ? { fallbackCompanyId: payload.companyId as Id<"companies"> } : {}),
  });

  return jsonResponse({ context: result.context });
});
