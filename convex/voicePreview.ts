"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { tenantAction } from "./tenantFunctions";
import { signVoiceTicket } from "./ai";
import {
  GOOGLE_VERTEX_PROVIDER_KEY,
  isSpeechToSpeechModelId,
  REALTIME_MODEL_USE_CASE,
} from "./aiModelService";
import { SPEECH_VOICE_KEYS, type SpeechVoiceKey } from "./voiceSettings";

/**
 * Hearing a voice before choosing it.
 *
 * Choosing a voice from four names and a sentence of description is choosing
 * blind — Anthony's words. The preview is the same live loop production
 * uses: a real ticket for the real relay and the real model, constrained to
 * a one-line introduction. It is deliberately NOT a text-to-speech call to
 * some other API — that would demo a voice the product never uses.
 */

/** Ten short sessions a minute is browsing; more is a stuck retry loop. */
const PREVIEW_RATE_LIMIT_PER_MINUTE = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * What the preview session is allowed to be: one fixed sentence, no tools,
 * no company knowledge — the point is the sound of the voice, not a
 * conversation. The voice introduces itself by the deployment's configured
 * name, because that is the name it will use with real customers.
 */
function buildPreviewInstructions(platformName: string) {
  return (
    "You are demonstrating your voice on a settings screen. When the user says " +
    `anything, reply with exactly: "Hello — I'm ${platformName}. This is how I'll sound ` +
    'when I speak with your customers." Say nothing else, and do not continue ' +
    "the conversation."
  );
}

export const mintVoicePreviewTicket = tenantAction({
  args: { voice: v.string() },
  handler: async (ctx, args): Promise<{ relayUrl: string; ticket: string }> => {
    const { user, userId } = ctx;
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      throw new Error("Only an administrator can preview voices.");
    }
    if (!SPEECH_VOICE_KEYS.includes(args.voice as SpeechVoiceKey)) {
      throw new Error("That voice is not one the platform can speak with.");
    }

    await ctx.runMutation(internal.aiActionRequests.reserve, {
      actorId: userId,
      ...(user.companyId ? { companyId: user.companyId } : {}),
      actionName: "voicePreview",
      windowMs: RATE_LIMIT_WINDOW_MS,
      maxRequests: PREVIEW_RATE_LIMIT_PER_MINUTE,
    });

    const relayUrl = process.env.VOICE_RELAY_URL?.trim();
    const relaySecret = process.env.VOICE_RELAY_SECRET?.trim();
    if (!relayUrl || !relaySecret) {
      throw new Error(
        "The live voice relay is not configured. Set VOICE_RELAY_URL and VOICE_RELAY_SECRET on this deployment."
      );
    }

    const modelConfig = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
      useCase: REALTIME_MODEL_USE_CASE,
    });
    // Same rule as the phone: only a Google live-audio model can speak here,
    // and the failure names the screen that fixes it.
    if (
      modelConfig.providerKey !== GOOGLE_VERTEX_PROVIDER_KEY ||
      !isSpeechToSpeechModelId(modelConfig.providerModelId)
    ) {
      throw new Error(
        "Previewing a voice needs a Google live-audio model. In Model Defaults, set the Real-time voice job to one."
      );
    }

    const platformName = (await ctx.runQuery(internal.settings.getEmailBranding, {})).platformName;
    const ticket = signVoiceTicket(
      {
        model: modelConfig.providerModelId,
        voice: args.voice,
        instructions: buildPreviewInstructions(platformName),
        tools: [],
        companyId: user.companyId ?? null,
        expiresAt: Date.now() + 60_000,
      },
      relaySecret
    );

    return { relayUrl, ticket };
  },
});
