import { readBoundedBody } from "./utils/boundedRequestBody";
import { httpAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

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
const REDEMPTION_CLEANUP_BATCH = 20;

type VoiceTicketPayload = {
  threadId?: string;
  companyId?: string | null;
  expiresAt?: number;
  jti?: string;
  redemptionUrl?: string;
};

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

async function readAuthenticTicket(ticket: string, secret: string): Promise<VoiceTicketPayload | null> {
  const [payloadPart, signaturePart] = ticket.split(".");
  if (!payloadPart || !signaturePart) return null;

  try {
    if (!(await ticketIsAuthentic(payloadPart, signaturePart, secret))) return null;
    return JSON.parse(base64UrlToText(payloadPart)) as VoiceTicketPayload;
  } catch {
    return null;
  }
}

export const redeemVoiceTicketInternal = internalMutation({
  args: {
    ticketId: v.string(),
    expiresAt: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const now = Date.now();
    if (args.ticketId.length < 16 || args.ticketId.length > 128 || args.expiresAt < now) {
      return false;
    }

    const existing = await ctx.db
      .query("voiceTicketRedemptions")
      .withIndex("by_ticket_id", (q) => q.eq("ticketId", args.ticketId))
      .first();
    if (existing) return false;

    const expired = await ctx.db
      .query("voiceTicketRedemptions")
      .withIndex("by_expires_at", (q) => q.lt("expiresAt", now))
      .take(REDEMPTION_CLEANUP_BATCH);
    for (const redemption of expired) await ctx.db.delete(redemption._id);

    await ctx.db.insert("voiceTicketRedemptions", {
      ticketId: args.ticketId,
      expiresAt: args.expiresAt,
      redeemedAt: now,
    });
    return true;
  },
});

/** The relay calls this once before it spends a provider connection. */
export const handleVoiceTicketRedemption = httpAction(async (ctx, request) => {
  const secret = process.env.VOICE_RELAY_SECRET?.trim();
  if (!secret) return jsonResponse({ error: "The voice relay is not configured." }, 503);

  const bounded = await readBoundedBody(request, MAX_BODY_BYTES);
  if (!bounded.ok) {
    return jsonResponse(
      { error: bounded.reason === "too_large" ? "Body too large." : "Body must be JSON." },
      bounded.reason === "too_large" ? 413 : 400,
    );
  }

  let ticket = "";
  try {
    const body = JSON.parse(bounded.text) as { ticket?: unknown };
    ticket = typeof body.ticket === "string" ? body.ticket : "";
  } catch {
    return jsonResponse({ error: "Body must be JSON." }, 400);
  }

  const payload = await readAuthenticTicket(ticket, secret);
  if (
    !payload ||
    typeof payload.jti !== "string" ||
    typeof payload.expiresAt !== "number" ||
    payload.expiresAt < Date.now()
  ) {
    return jsonResponse({ error: "Refused." }, 401);
  }

  const redeemed = await ctx.runMutation(internal.voiceRelay.redeemVoiceTicketInternal, {
    ticketId: payload.jti,
    expiresAt: payload.expiresAt,
  });
  return redeemed
    ? jsonResponse({ ok: true })
    : jsonResponse({ error: "Ticket already used." }, 409);
});

export const handleVoiceKnowledgeLookup = httpAction(async (ctx, request) => {
  const secret = process.env.VOICE_RELAY_SECRET?.trim();
  if (!secret) return jsonResponse({ error: "The voice relay is not configured." }, 503);

  const bounded = await readBoundedBody(request, MAX_BODY_BYTES);
  if (!bounded.ok) {
    return jsonResponse(
      { error: bounded.reason === "too_large" ? "Body too large." : "Body must be JSON." },
      bounded.reason === "too_large" ? 413 : 400,
    );
  }
  const raw = bounded.text;

  let body: { ticket?: unknown; query?: unknown };
  try {
    body = JSON.parse(raw) as { ticket?: unknown; query?: unknown };
  } catch {
    return jsonResponse({ error: "Body must be JSON." }, 400);
  }

  const ticket = typeof body.ticket === "string" ? body.ticket : "";
  const query = typeof body.query === "string" ? body.query : "";
  const payload = await readAuthenticTicket(ticket, secret);
  if (!payload) return jsonResponse({ error: "Refused." }, 401);

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
  const result = await ctx.runAction(internal.aiVoiceSession.searchKnowledgeForVoiceInternal, {
    query,
    ...(payload.threadId ? { threadId: payload.threadId as Id<"threads"> } : {}),
    ...(payload.companyId ? { fallbackCompanyId: payload.companyId as Id<"companies"> } : {}),
  });

  return jsonResponse({ context: result.context });
});
