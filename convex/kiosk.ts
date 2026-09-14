import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { moduleQuery, publicMutation, publicQuery } from "./tenantFunctions";
import { effectiveModulesFor } from "./tenantFunctions";
import { CORE_MODULES } from "./utils/coreModules";
import { canAccessThread, digestWidgetAccessToken } from "./chatService";
import { appError } from "./utils/appError";

/**
 * The receptionist screen's doors: everything the kiosk page may ask of the
 * server, all gated the widget way — an opt-in flag on the widget, and the
 * conversation's own hashed access token. The kiosk is a widget presented
 * differently (kiosk plan, decision 1): one anonymous door, two frames.
 */

/** How many voice sessions one kiosk may open per hour. A visitor's session
 * is one wake tap, so sixty an hour is a busy reception desk, not a leak. */
export const KIOSK_SESSIONS_PER_HOUR = 60;

/** Thread minting gets its own, looser ceiling (2026-08 audit): a wake tap
 * mints one thread, so a human desk never reaches this before the session
 * ceiling above — only a script writing threads without opening sessions. */
export const KIOSK_THREADS_PER_HOUR = 120;

/** How many stored rows one kiosk conversation may hold. A conversation is
 * one wake tap and idles out in minutes; this bounds what a stolen session
 * token can write, not what a visitor can say. */
export const KIOSK_THREAD_MESSAGE_CAP = 400;

/** The idle screen pings every minute; accepting a write at most every half
 * minute keeps "last seen" honest while bounding what a script can spend. */
export const KIOSK_HEARTBEAT_MIN_INTERVAL_MS = 30_000;
export const KIOSK_PENDING_SESSION_MS = 75_000;

const VOICE_TURN_MAX_LENGTH = 4000;

export const getKioskConfig = publicQuery({
  reason:
    "The kiosk page is an anonymous surface, like the widget it reuses; it renders nothing unless the widget has opted in to kiosk duty.",
  args: { widgetId: v.id("widgets") },
  returns: v.union(v.null(), v.object({ widgetId: v.id("widgets"), name: v.string(), themePrimaryColor: v.string(), themeLogoUrl: v.union(v.string(), v.null()), companyName: v.string() })),
  handler: async (ctx, args) => {
    const widget = await ctx.db.get(args.widgetId);
    if (!widget || !widget.isActive || !widget.kioskEnabled) return null;
    const company = widget.companyId ? await ctx.db.get(widget.companyId) : null;
    // A withheld Reception renders nothing, exactly like a widget not on
    // kiosk duty. Sessions already open idle out on their own cap.
    if (!(await effectiveModulesFor(ctx, company)).includes(CORE_MODULES.reception)) return null;
    return {
      widgetId: widget._id,
      name: widget.name,
      themePrimaryColor: widget.themePrimaryColor ?? "#000000",
      themeLogoUrl: widget.themeLogoUrl ?? null,
      // The permanent disclosure names the company, not the widget row.
      companyName: company?.name ?? widget.name,
    };
  },
});

/**
 * The spoken turn, written into the anonymous conversation — the kiosk twin
 * of `chat.recordVoiceTurn`, gated on the widget session token instead of a
 * signed-in person.
 */
export const recordKioskVoiceTurn = publicMutation({
  reason:
    "Anonymous kiosk visitors write their own spoken turns into their own thread; gated on the hashed widget session token, same as sendMessage.",
  args: {
    threadId: v.id("threads"),
    widgetAccessToken: v.string(),
    userText: v.string(),
    assistantText: v.string(),
    modelUsed: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) throw appError("NOT_FOUND", "Thread not found");
    if (!(await canAccessThread(ctx, thread, null, args.widgetAccessToken))) {
      throw appError("UNAUTHORIZED", "Unauthorized: Invalid widget session");
    }

    const userText = args.userText.trim().slice(0, VOICE_TURN_MAX_LENGTH);
    const assistantText = args.assistantText.trim().slice(0, VOICE_TURN_MAX_LENGTH);
    if (!userText && !assistantText) return null;

    // A full conversation stops storing rather than storing without bound
    // (2026-08 audit): the live call is untouched — only the transcript stops
    // growing, at a length no real reception visit approaches.
    const storedSoFar = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .take(KIOSK_THREAD_MESSAGE_CAP);
    if (storedSoFar.length >= KIOSK_THREAD_MESSAGE_CAP) return null;

    const now = Date.now();
    const dimensions = {
      ...(thread.companyId ? { companyId: thread.companyId } : {}),
      ...(thread.widgetId ? { widgetId: thread.widgetId } : {}),
    };

    if (userText) {
      await ctx.db.insert("messages", {
        threadId: args.threadId,
        role: "user",
        content: userText,
        createdAt: now,
        ...dimensions,
      });
    }
    if (assistantText) {
      await ctx.db.insert("messages", {
        threadId: args.threadId,
        role: "assistant",
        content: assistantText,
        createdAt: now + 1,
        ...(args.modelUsed ? { modelUsed: args.modelUsed } : {}),
        providerKey: "google",
        ...dimensions,
      });
    }

    await ctx.db.patch(args.threadId, { updatedAt: now });
    return null;
  },
});

/**
 * The kiosk's own thread door. The widget's `createWidgetThread` checks the
 * reported embedding origin against the widget's allowlist — the right rule
 * for an iframe on someone's website, and the wrong one for a full-screen
 * page on the platform's own origin. The kiosk's gate is different and
 * stricter in its own way: the widget must have opted in to kiosk duty.
 * Everything else — token minting, hashing, quota by company — is identical.
 */
export const createKioskThread = publicMutation({
  reason:
    "Anonymous kiosk visitors start conversations on an opted-in kiosk widget; the kiosk flag is the gate, and the minted token is the session credential.",
  args: { widgetId: v.id("widgets") },
  returns: v.union(v.null(), v.object({ threadId: v.id("threads"), accessToken: v.string() })),
  handler: async (
    ctx,
    args
  ): Promise<{ threadId: Id<"threads">; accessToken: string } | null> => {
    const widget = await ctx.db.get(args.widgetId);
    if (!widget || !widget.isActive || !widget.kioskEnabled) return null;

    // The same quiet no as the config door: a withheld Reception mints nothing.
    const kioskCompany = widget.companyId ? await ctx.db.get(widget.companyId) : null;
    if (!(await effectiveModulesFor(ctx, kioskCompany)).includes(CORE_MODULES.reception)) return null;

    const now = Date.now();

    // Hourly minting ceiling (2026-08 audit), in the session window's shape.
    // Returning null — not throwing — lets the audit row below persist; the
    // screen shows its calm not-in-service line, which only a script exceeding
    // double the session ceiling will ever see.
    const windowStart = widget.kioskThreadWindowStart ?? 0;
    const inWindow = now - windowStart < 60 * 60 * 1000 ? widget.kioskThreadCountInWindow ?? 0 : 0;
    if (inWindow >= KIOSK_THREADS_PER_HOUR) {
      if (inWindow === KIOSK_THREADS_PER_HOUR) {
        await ctx.db.insert("auditLogs", {
          actionType: "RATE_LIMITED_KIOSK_THREADS",
          entityId: args.widgetId.toString(),
          entityType: "widgets",
          companyId: widget.companyId,
          timestamp: now,
          metadata: JSON.stringify({ perHour: KIOSK_THREADS_PER_HOUR }),
        });
        await ctx.db.patch(widget._id, { kioskThreadCountInWindow: inWindow + 1 });
      }
      return null;
    }
    await ctx.db.patch(widget._id, {
      kioskThreadWindowStart: inWindow === 0 ? now : windowStart,
      kioskThreadCountInWindow: inWindow + 1,
    });

    const accessToken = `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
    const threadId = await ctx.db.insert("threads", {
      companyId: widget.companyId,
      agentId: widget.agentId,
      widgetId: widget._id,
      widgetAccessTokenHash: await digestWidgetAccessToken(accessToken),
      sourceUrl: "kiosk",
      title: "Kiosk Conversation",
      createdAt: now,
      updatedAt: now,
    });
    return { threadId, accessToken };
  },
});

export const validateKioskThreadAccess = internalQuery({
  args: {
    threadId: v.id("threads"),
    widgetAccessToken: v.string(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ ok: boolean; companyId?: Id<"companies">; widgetId?: Id<"widgets"> }> => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) return { ok: false };
    if (!(await canAccessThread(ctx, thread, null, args.widgetAccessToken))) return { ok: false };
    return {
      ok: true,
      ...(thread.companyId ? { companyId: thread.companyId } : {}),
      ...(thread.widgetId ? { widgetId: thread.widgetId } : {}),
    };
  },
});

/**
 * Hold one short-lived ticket slot while the action finishes. This does not
 * consume the hourly allowance: only a relay redemption does, so repeatedly
 * calling the public action cannot exhaust a reception desk without opening
 * the provider connection it asked for.
 */
export const reserveKioskSession = internalMutation({
  args: {
    widgetId: v.id("widgets"),
    threadId: v.id("threads"),
  },
  returns: v.object({ ok: v.boolean(), reason: v.optional(v.string()) }),
  handler: async (ctx, args): Promise<{ ok: boolean; reason?: string }> => {
    const widget = await ctx.db.get(args.widgetId);
    if (!widget || !widget.isActive || !widget.kioskEnabled) {
      return { ok: false, reason: "This screen is not in service." };
    }
    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.widgetId !== widget._id) {
      return { ok: false, reason: "This screen is not in service." };
    }
    const now = Date.now();
    const windowStart = widget.kioskSessionWindowStart ?? 0;
    const inWindow = now - windowStart < 60 * 60 * 1000 ? widget.kioskSessionCountInWindow ?? 0 : 0;
    if (inWindow >= KIOSK_SESSIONS_PER_HOUR) {
      return { ok: false, reason: "The assistant is busy just now. Back shortly." };
    }
    if ((widget.kioskVoicePendingUntil ?? 0) > now || (widget.kioskVoiceActiveUntil ?? 0) > now) {
      return { ok: false, reason: "The assistant is busy just now. Back shortly." };
    }
    await ctx.db.patch(widget._id, {
      kioskVoicePendingThreadId: args.threadId,
      kioskVoicePendingUntil: now + KIOSK_PENDING_SESSION_MS,
    });
    return { ok: true };
  },
});

/**
 * The Reception screen page in the app: every kiosk this workspace has
 * switched on, with its health — so finding and opening the demo is one
 * click from the main menu, not an admin scavenger hunt.
 */
export const listMyReceptionScreens = moduleQuery({
  module: CORE_MODULES.reception,
  args: {},
  /**
   * Four fields, which is what the Reception page draws: the screen's name,
   * the link to open it, and the two numbers that say whether the tablet is
   * alive. The widget row carries its rate windows, its hashed-token
   * bookkeeping and its allowed domains; none of that belongs in a list of
   * links. `themePrimaryColor` used to ride along here and was rendered
   * nowhere — the kiosk page reads its own theme from `getKioskConfig`.
   */
  returns: v.array(
    v.object({
      widgetId: v.id("widgets"),
      name: v.string(),
      lastSeenAt: v.union(v.number(), v.null()),
      sessionCount: v.number(),
    })
  ),
  handler: async (ctx) => {
    const { companyId } = ctx;
    if (!companyId) return [];
    // Bounded: a workspace configures widgets by hand, in single figures.
    const widgets = await ctx.db
      .query("widgets")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .take(100);
    return widgets
      .filter((widget) => widget.isActive && widget.kioskEnabled)
      .map((widget) => ({
        widgetId: widget._id,
        name: widget.name,
        lastSeenAt: widget.kioskLastSeenAt ?? null,
        sessionCount: widget.kioskSessionCount ?? 0,
      }));
  },
});

/** The idle screen's pulse, so "last seen" stays honest between sessions. */
export const recordKioskHeartbeat = publicMutation({
  reason:
    "The kiosk idle screen pings so staff can see the tablet is alive; it writes one timestamp on an opted-in widget and nothing else.",
  args: { widgetId: v.id("widgets") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const widget = await ctx.db.get(args.widgetId);
    if (!widget || !widget.isActive || !widget.kioskEnabled) return null;
    // The pulse is anonymous by necessity — the idle screen holds no session —
    // so bound it instead (2026-08 audit): one accepted write per interval,
    // which is all a liveness timestamp can usefully carry anyway.
    const now = Date.now();
    if (now - (widget.kioskLastSeenAt ?? 0) < KIOSK_HEARTBEAT_MIN_INTERVAL_MS) return null;
    await ctx.db.patch(widget._id, { kioskLastSeenAt: now });
    return null;
  },
});
