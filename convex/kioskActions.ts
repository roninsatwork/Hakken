"use node";

import { createHmac } from "node:crypto";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { publicAction } from "./tenantFunctions";
import {
  buildSpokenSessionInstructions,
  VOICE_KNOWLEDGE_TOOL_NAME,
  VOICE_KNOWLEDGE_TOOL_DESCRIPTION,
} from "./ai";
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
      throw new Error("Unauthorized: Invalid widget session");
    }

    // One wake tap reserves one session, counted per widget per hour; the
    // same call is the kiosk's heartbeat for the admin screen.
    const reservation = await ctx.runMutation(internal.kiosk.reserveKioskSession, {
      widgetId: args.widgetId,
    });
    if (!reservation.ok) {
      return { ok: false, reason: reservation.reason ?? "The assistant is busy just now." };
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

    const instructions = await buildSpokenSessionInstructions(ctx, access.companyId);

    const payload = Buffer.from(
      JSON.stringify({
        model: modelConfig.providerModelId,
        voice: args.voice ?? "Aoede",
        instructions,
        // The knowledge door, signed into the ticket rather than sent by the
        // page — a browser that could choose its own tools could choose
        // others.
        tools: [
          {
            name: VOICE_KNOWLEDGE_TOOL_NAME,
            description: VOICE_KNOWLEDGE_TOOL_DESCRIPTION,
            parameters: {
              type: "OBJECT",
              properties: {
                query: { type: "STRING", description: "What to look up, in a few words." },
              },
              required: ["query"],
            },
          },
        ],
        companyId: access.companyId ?? null,
        threadId: args.threadId,
        expiresAt: Date.now() + 60_000,
      })
    ).toString("base64url");
    const signature = createHmac("sha256", relaySecret).update(payload).digest("base64url");

    return {
      ok: true,
      relayUrl,
      ticket: `${payload}.${signature}`,
      model: modelConfig.providerModelId,
      expiresAt: Date.now() + 60_000,
    };
  },
});
