"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { publicAction } from "./tenantFunctions";
import { appError } from "./utils/appError";
import {
  buildSpokenSessionInstructions,
  signVoiceTicket,
  VOICE_KNOWLEDGE_TOOL_DECLARATION,
} from "./aiVoiceSession";
import {
  GOOGLE_VERTEX_PROVIDER_KEY,
  isSpeechToSpeechModelId,
  REALTIME_MODEL_USE_CASE,
} from "./aiModelService";

/**
 * The kiosk's spoken session: the same signed one-minute relay ticket the
 * signed-in browser voice gets, minted for an anonymous visitor whose only
 * credential is their conversation's own widget token. The company's
 * instructions ride inside the signed ticket, so the kiosk page can no more
 * rewrite them than the dashboard can (voice-session design, unchanged).
 *
 * Google-relay only, deliberately: the platform's realtime voice runs
 * through the Vertex relay, and a kiosk on a deployment configured
 * otherwise refuses in a plain sentence rather than opening a channel this
 * surface has no transport for.
 */
export const createKioskVoiceSession = publicAction({
  reason:
    "Anonymous kiosk visitors open a spoken session for their own conversation; gated on the widget's kiosk opt-in and the hashed session token, and rate-limited per widget.",
  args: {
    widgetId: v.id("widgets"),
    threadId: v.id("threads"),
    widgetAccessToken: v.string(),
    voice: v.optional(v.string()),
  },
  returns: v.union(v.object({ ok: v.literal(false), reason: v.string() }), v.object({ ok: v.literal(true), relayUrl: v.string(), ticket: v.string(), model: v.string(), expiresAt: v.number() })),
  handler: async (
    ctx,
    args
  ): Promise<
    | { ok: true; relayUrl: string; ticket: string; model: string; expiresAt: number }
    | { ok: false; reason: string }
  > => {
    const access = await ctx.runQuery(internal.kiosk.validateKioskThreadAccess, {
      threadId: args.threadId,
      widgetAccessToken: args.widgetAccessToken,
    });
    if (!access.ok || access.widgetId !== args.widgetId) {
      throw appError("UNAUTHORIZED", "Unauthorized: Invalid widget session");
    }

    const relayUrl = process.env.VOICE_RELAY_URL?.trim();
    const relaySecret = process.env.VOICE_RELAY_SECRET?.trim();
    if (!relayUrl || !relaySecret) {
      return { ok: false, reason: "The assistant is not available on this screen yet." };
    }

    const modelConfig = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
      useCase: REALTIME_MODEL_USE_CASE,
    });
    // Only a genuine speech-to-speech model on the Vertex relay can hold a
    // spoken conversation here; anything else is a calm "not available",
    // never a thrown stack on a visitor-facing screen (commitment 3).
    if (
      modelConfig.providerKey !== GOOGLE_VERTEX_PROVIDER_KEY ||
      !isSpeechToSpeechModelId(modelConfig.providerModelId)
    ) {
      return { ok: false, reason: "The assistant is not available on this screen yet." };
    }

    // A minted ticket must not lock the one shared kiosk voice slot. Bound
    // issuance by this conversation before assembling its company prompt;
    // the relay takes the active lease only when it redeems a real session.
    const admission = await ctx.runMutation(internal.kiosk.authorizeKioskVoiceTicket, {
      widgetId: args.widgetId,
      threadId: args.threadId,
    });
    if (!admission.ok) {
      return { ok: false, reason: admission.reason ?? "The assistant is busy just now." };
    }

    const instructions = await buildSpokenSessionInstructions(ctx, access.companyId);

    // The workspace's chosen voice (Voice screen in the AI admin), unless
    // the kiosk was opened with one picked for it.
    const companyVoice: string = await ctx.runQuery(
      internal.voiceSettings.getSpokenVoiceForCompany,
      { companyId: access.companyId }
    );

    const expiresAt = Date.now() + 60_000;
    const ticket = signVoiceTicket(
      {
        model: modelConfig.providerModelId,
        voice: args.voice ?? companyVoice,
        instructions,
        // The knowledge door, signed into the ticket rather than sent by the
        // page — a browser that could choose its own tools could choose
        // others.
        tools: [VOICE_KNOWLEDGE_TOOL_DECLARATION],
        companyId: access.companyId ?? null,
        threadId: args.threadId,
        kioskWidgetId: args.widgetId,
        meteredVoiceTurns: true,
        expiresAt,
      },
      relaySecret
    );

    return {
      ok: true,
      relayUrl,
      ticket,
      model: modelConfig.providerModelId,
      expiresAt,
    };
  },
});
