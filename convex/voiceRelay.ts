import { readBoundedBody } from "./utils/boundedRequestBody";
import { httpAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { incrementChatQuota, isChatQuotaExceeded, resolveChatQuota } from "./chatService";
import { KIOSK_SESSIONS_PER_HOUR } from "./kiosk";

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
 * It presents the same encrypted ticket the platform minted when the session
 * opened: the platform can therefore trust which thread is asking without
 * the relay being able to invent a browser-selected scope. A relay-only HMAC
 * also proves that this is the admitted server, not a browser replaying its pass.
 */

/**
 * The body carries the session's encrypted ticket, and a ticket carries the
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
  controlUrl?: string;
  kioskWidgetId?: string;
  meteredVoiceTurns?: boolean;
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

/**
 * Verified with Web Crypto rather than a hand-rolled comparison: `verify`
 * is constant-time by contract, which a string equality check is not.
 */
export async function ticketIsAuthentic(payloadPart: string, signaturePart: string, secret: string) {
  try {
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
  } catch { return false; }
}

export async function readAuthenticTicket(ticket: string, secret: string): Promise<VoiceTicketPayload | null> {
  try {
    const parts = ticket.split(".");
    if (parts.length !== 3 || parts[0] !== "v2") return null;
    const iv = base64UrlToBytes(parts[1]);
    if (iv.byteLength !== 12) return null;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`sonae-voice-ticket-v2:${secret}`));
    const key = await crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"]);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, base64UrlToBytes(parts[2]));
    return JSON.parse(new TextDecoder().decode(plaintext)) as VoiceTicketPayload;
  } catch {
    return null;
  }
}

export const redeemVoiceTicketInternal = internalMutation({
  args: {
    ticketId: v.string(),
    expiresAt: v.number(),
    kioskWidgetId: v.optional(v.id("widgets")),
    threadId: v.optional(v.id("threads")),
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
    for (const redemption of expired) {
      if (redemption.pendingTurnIndex && redemption.quotaCompanyId) {
        const company = await ctx.db.get(redemption.quotaCompanyId);
        if (
          company &&
          (company.messagesUsedThisPeriod ?? 0) >= (redemption.quotaCountAfterReservation ?? Infinity)
        ) {
          await ctx.db.patch(company._id, {
            messagesUsedThisPeriod: Math.max(0, (company.messagesUsedThisPeriod ?? 0) - 1),
          });
        }
      }
      if (redemption.kioskWidgetId) {
        const widget = await ctx.db.get(redemption.kioskWidgetId);
        if (widget?.kioskVoiceActiveTicketId === redemption.ticketId) {
          await ctx.db.patch(widget._id, {
            kioskVoiceActiveTicketId: undefined,
            kioskVoiceActiveUntil: undefined,
          });
        }
      }
      await ctx.db.delete(redemption._id);
    }

    let kioskFields: {
      kioskWidgetId?: Id<"widgets">;
      kioskThreadId?: Id<"threads">;
    } = {};
    if (args.kioskWidgetId || args.threadId) {
      if (!args.kioskWidgetId || !args.threadId) return false;
      const [widget, thread] = await Promise.all([
        ctx.db.get(args.kioskWidgetId),
        ctx.db.get(args.threadId),
      ]);
      if (
        !widget || !widget.isActive || !widget.kioskEnabled ||
        !thread || thread.widgetId !== widget._id ||
        widget.kioskVoicePendingThreadId !== thread._id ||
        (widget.kioskVoicePendingUntil ?? 0) <= now ||
        (widget.kioskVoiceActiveUntil ?? 0) > now
      ) return false;

      const windowStart = widget.kioskSessionWindowStart ?? 0;
      const inWindow = now - windowStart < 60 * 60 * 1000
        ? widget.kioskSessionCountInWindow ?? 0
        : 0;
      if (inWindow >= KIOSK_SESSIONS_PER_HOUR) {
        await ctx.db.patch(widget._id, {
          kioskVoicePendingThreadId: undefined,
          kioskVoicePendingUntil: undefined,
        });
        return false;
      }
      await ctx.db.patch(widget._id, {
        kioskVoicePendingThreadId: undefined,
        kioskVoicePendingUntil: undefined,
        kioskVoiceActiveTicketId: args.ticketId,
        kioskVoiceActiveUntil: args.expiresAt + MAX_SESSION_MS,
        kioskSessionWindowStart: inWindow === 0 ? now : windowStart,
        kioskSessionCountInWindow: inWindow + 1,
        kioskLastSeenAt: now,
        kioskSessionCount: (widget.kioskSessionCount ?? 0) + 1,
      });
      kioskFields = { kioskWidgetId: widget._id, kioskThreadId: thread._id };
    }

    await ctx.db.insert("voiceTicketRedemptions", {
      ticketId: args.ticketId,
      expiresAt: args.expiresAt + MAX_SESSION_MS,
      redeemedAt: now,
      lookups: 0,
      completedTurns: 0,
      ...kioskFields,
    });
    return true;
  },
});

const voiceControlResult = v.object({
  ok: v.boolean(),
  reason: v.optional(v.union(v.literal("quota"), v.literal("session"))),
});

/** Reserve, complete, or abandon one kiosk voice turn atomically. */
export const controlKioskVoiceTurn = internalMutation({
  args: {
    ticketId: v.string(),
    action: v.union(v.literal("begin-turn"), v.literal("complete-turn"), v.literal("close")),
    turnIndex: v.optional(v.number()),
  },
  returns: voiceControlResult,
  handler: async (ctx, args): Promise<{ ok: boolean; reason?: "quota" | "session" }> => {
    const row = await ctx.db.query("voiceTicketRedemptions")
      .withIndex("by_ticket_id", (q) => q.eq("ticketId", args.ticketId)).unique();
    const now = Date.now();
    if (!row || row.closedAt || row.expiresAt <= now) return { ok: false, reason: "session" };

    if (args.action === "close") {
      if (row.pendingTurnIndex && row.quotaCompanyId) {
        const company = await ctx.db.get(row.quotaCompanyId);
        if (
          company &&
          (company.messagesUsedThisPeriod ?? 0) >= (row.quotaCountAfterReservation ?? Infinity)
        ) {
          await ctx.db.patch(company._id, {
            messagesUsedThisPeriod: Math.max(0, (company.messagesUsedThisPeriod ?? 0) - 1),
          });
        }
      }
      if (row.kioskWidgetId) {
        const widget = await ctx.db.get(row.kioskWidgetId);
        if (widget?.kioskVoiceActiveTicketId === row.ticketId) {
          await ctx.db.patch(widget._id, {
            kioskVoiceActiveTicketId: undefined,
            kioskVoiceActiveUntil: undefined,
          });
        }
      }
      await ctx.db.patch(row._id, {
        closedAt: now,
        pendingTurnIndex: undefined,
        quotaCompanyId: undefined,
        quotaCountAfterReservation: undefined,
      });
      return { ok: true };
    }

    if (!row.kioskThreadId || !row.kioskWidgetId || !Number.isInteger(args.turnIndex) || !args.turnIndex) {
      return { ok: false, reason: "session" };
    }
    const nextTurn = (row.completedTurns ?? 0) + 1;
    if (args.action === "begin-turn") {
      if (row.pendingTurnIndex === args.turnIndex) return { ok: true };
      if (row.pendingTurnIndex || args.turnIndex !== nextTurn) return { ok: false, reason: "session" };
      const thread = await ctx.db.get(row.kioskThreadId);
      if (!thread || thread.widgetId !== row.kioskWidgetId) return { ok: false, reason: "session" };
      const quota = await resolveChatQuota(ctx, null, thread);
      if (isChatQuotaExceeded(quota)) return { ok: false, reason: "quota" };
      await incrementChatQuota(ctx, quota);
      await ctx.db.patch(row._id, {
        pendingTurnIndex: args.turnIndex,
        ...(quota.usageTarget?.type === "company"
          ? {
              quotaCompanyId: quota.usageTarget.id,
              quotaCountAfterReservation: quota.messagesUsed + 1,
            }
          : {}),
      });
      return { ok: true };
    }

    if (row.pendingTurnIndex !== args.turnIndex) return { ok: false, reason: "session" };
    await ctx.db.patch(row._id, {
      completedTurns: args.turnIndex,
      pendingTurnIndex: undefined,
      quotaCompanyId: undefined,
      quotaCountAfterReservation: undefined,
    });
    return { ok: true };
  },
});

/** Quota and admission are one transaction across every relay instance. */
export const admitKnowledgeLookup = internalMutation({
  args: { ticketId: v.string(), close: v.optional(v.boolean()) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db.query("voiceTicketRedemptions")
      .withIndex("by_ticket_id", q => q.eq("ticketId", args.ticketId)).unique();
    const now = Date.now();
    if (!row || row.closedAt || row.expiresAt <= now) return false;
    if (args.close) {
      await ctx.db.patch(row._id, { closedAt: now });
      return true;
    }
    const inWindow = (row.windowAt ?? 0) > now - 60_000;
    const count = inWindow ? (row.windowLookups ?? 0) : 0;
    if ((row.lookups ?? 0) >= 60 || count >= 10) return false;
    await ctx.db.patch(row._id, {
      lookups: (row.lookups ?? 0) + 1,
      windowAt: inWindow ? row.windowAt : now,
      windowLookups: count + 1,
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
    !payload || !(await ticketIsAuthentic(ticket, request.headers.get("x-voice-relay-auth") ?? "", secret)) ||
    typeof payload.jti !== "string" ||
    typeof payload.expiresAt !== "number" ||
    payload.expiresAt < Date.now()
  ) {
    return jsonResponse({ error: "Refused." }, 401);
  }

  const redeemed = await ctx.runMutation(internal.voiceRelay.redeemVoiceTicketInternal, {
    ticketId: payload.jti,
    expiresAt: payload.expiresAt,
    ...(payload.kioskWidgetId ? { kioskWidgetId: payload.kioskWidgetId as Id<"widgets"> } : {}),
    ...(payload.kioskWidgetId && payload.threadId
      ? { threadId: payload.threadId as Id<"threads"> }
      : {}),
  });
  return redeemed
    ? jsonResponse({ ok: true })
    : jsonResponse({ error: "Ticket already used." }, 409);
});

/** The relay-only turn meter and close signal for kiosk sessions. */
export const handleVoiceControl = httpAction(async (ctx, request) => {
  const secret = process.env.VOICE_RELAY_SECRET?.trim();
  if (!secret) return jsonResponse({ error: "The voice relay is not configured." }, 503);
  const bounded = await readBoundedBody(request, MAX_BODY_BYTES);
  if (!bounded.ok) return jsonResponse({ error: "Body must be valid JSON." }, bounded.reason === "too_large" ? 413 : 400);

  let body: { ticket?: unknown; action?: unknown; turnIndex?: unknown };
  try { body = JSON.parse(bounded.text) as typeof body; }
  catch { return jsonResponse({ error: "Body must be JSON." }, 400); }
  const ticket = typeof body.ticket === "string" ? body.ticket : "";
  const payload = await readAuthenticTicket(ticket, secret);
  if (
    !payload?.jti ||
    !(await ticketIsAuthentic(ticket, request.headers.get("x-voice-relay-auth") ?? "", secret)) ||
    typeof payload.expiresAt !== "number" || payload.expiresAt + MAX_SESSION_MS < Date.now()
  ) return jsonResponse({ error: "Refused." }, 401);
  if (body.action !== "begin-turn" && body.action !== "complete-turn" && body.action !== "close") {
    return jsonResponse({ error: "Invalid action." }, 400);
  }
  if (body.action !== "close" && (!payload.meteredVoiceTurns || !payload.kioskWidgetId)) {
    return jsonResponse({ error: "Refused." }, 401);
  }
  const result = await ctx.runMutation(internal.voiceRelay.controlKioskVoiceTurn, {
    ticketId: payload.jti,
    action: body.action,
    ...(typeof body.turnIndex === "number" ? { turnIndex: body.turnIndex } : {}),
  });
  if (!result.ok) return jsonResponse({ error: result.reason }, result.reason === "quota" ? 429 : 409);
  return jsonResponse({ ok: true });
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

  let body: { ticket?: unknown; query?: unknown; close?: unknown };
  try {
    body = JSON.parse(raw) as { ticket?: unknown; query?: unknown };
  } catch {
    return jsonResponse({ error: "Body must be JSON." }, 400);
  }

  const ticket = typeof body.ticket === "string" ? body.ticket : "";
  const query = typeof body.query === "string" ? body.query : "";
  const payload = await readAuthenticTicket(ticket, secret);
  if (!payload || !payload.jti || !(await ticketIsAuthentic(ticket, request.headers.get("x-voice-relay-auth") ?? "", secret))) {
    return jsonResponse({ error: "Refused." }, 401);
  }

  if (typeof payload.expiresAt !== "number" || payload.expiresAt + MAX_SESSION_MS < Date.now()) {
    return jsonResponse({ error: "Session expired." }, 401);
  }
  // A session names a thread or a company. A phone call has no thread — there
  // is no conversation on a screen to attach anything to — so a ticket
  // carrying only a company is legitimate, and one carrying neither is not.
  if (!payload.threadId && !payload.companyId) return jsonResponse({ error: "Refused." }, 401);
  if (body.close !== true && (!query.trim() || query.length > 2_000)) return jsonResponse({ error: "Invalid query." }, 400);
  const admitted = await ctx.runMutation(internal.voiceRelay.admitKnowledgeLookup, {
    ticketId: payload.jti, ...(body.close === true ? { close: true } : {}),
  });
  if (!admitted) return jsonResponse({ error: "Session unavailable or search limit reached." }, 429);
  if (body.close === true) return jsonResponse({ ok: true });

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
