"use node";

/**
 * Spoken words in and out: `transcribeAudio` (speech-to-text for the mic
 * button) and `synthesizeSpeech` (text-to-speech for read-aloud), with their
 * payload guards. Split out of the old `convex/ai.ts` on 2026-08-21
 * (foundation-quality plan, phase 3).
 */

import { tenantAction } from "./tenantFunctions";
import * as tailShapes from "./utils/tailShapes";
import { appError } from "./utils/appError";
import { v } from "convex/values";
import { Modality } from "@google/genai";
import { internal } from "./_generated/api";
import {
  createVertexGenAIClient,
  generateVertexContentWithRetry,
} from "./vertexProviderService";
import { normalizeAiRuntimeError } from "./aiToolExecutionService";
import { getGoogleVertexProviderModelId } from "./aiModelService";

const TRANSCRIPTION_AUDIO_MAX_BYTES = 10 * 1024 * 1024;
const TRANSCRIPTION_RATE_LIMIT_PER_MINUTE = 6;
// The voice session speaks sentence by sentence, so one spoken reply is
// several small calls rather than one big one — the ceiling is per sentence,
// not per answer.
const SPEECH_TEXT_MAX_LENGTH = 2000;
const SPEECH_RATE_LIMIT_PER_MINUTE = 30;
const AI_ACTION_RATE_LIMIT_WINDOW_MS = 60 * 1000;

const allowedTranscriptionMimeTypes = new Set([
  "audio/aac",
  "audio/flac",
  "audio/m4a",
  "audio/mp3",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
  "audio/x-wav",
]);

function normalizeMimeType(value: string) {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function getBase64DecodedByteLength(value: string) {
  const normalized = value.replace(/\s/g, "");
  if (!normalized) return 0;
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.floor((normalized.length * 3) / 4) - padding;
}

export function assertValidTranscriptionPayload(args: { audioBase64: string; mimeType: string }) {
  const mimeType = normalizeMimeType(args.mimeType);
  const audioBase64 = args.audioBase64.replace(/\s/g, "");
  if (!allowedTranscriptionMimeTypes.has(mimeType)) {
    throw appError("INVALID_INPUT", "Unsupported audio MIME type.");
  }

  if (!audioBase64) {
    throw appError("INVALID_INPUT", "Audio payload is required.");
  }

  if (!/^[A-Za-z0-9+/=]+$/.test(audioBase64)) {
    throw appError("INVALID_INPUT", "Invalid audio payload encoding.");
  }

  if (getBase64DecodedByteLength(audioBase64) > TRANSCRIPTION_AUDIO_MAX_BYTES) {
    throw appError("INVALID_INPUT", "Audio payload cannot exceed 10MB.");
  }

  return { audioBase64, mimeType };
}

// Prebuilt Google voice names the session may ask for. A closed set so the
// client can never smuggle arbitrary strings into the provider call; the
// default leads the list.
import { SPEECH_VOICE_KEYS, type SpeechVoiceKey } from "./voiceSettings";

export function assertValidSpeechPayload(args: { text: string; voiceKey?: string }) {
  const text = args.text.trim();
  if (!text) {
    throw appError("INVALID_INPUT", "Speech text is required.");
  }
  if (text.length > SPEECH_TEXT_MAX_LENGTH) {
    throw appError("INVALID_INPUT", `Speech text cannot exceed ${SPEECH_TEXT_MAX_LENGTH} characters.`);
  }
  const voiceKey = args.voiceKey ?? SPEECH_VOICE_KEYS[0];
  if (!SPEECH_VOICE_KEYS.includes(voiceKey as SpeechVoiceKey)) {
    throw appError("INVALID_INPUT", "Unknown speech voice.");
  }
  return { text, voiceKey: voiceKey as SpeechVoiceKey };
}

/**
 * The `speech` job only runs on a model built for it. Resolution falls back to
 * the platform's chat default when no `speech` default is set, and a chat
 * model cannot make sound — so refuse with the fix in the sentence rather
 * than letting the provider throw something unreadable.
 */
export function assertSpeechCapableModelId(providerModelId: string) {
  if (!providerModelId.toLowerCase().includes("tts")) {
    throw appError(
      "NOT_CONFIGURED",
      "No speech model is configured. In Model Defaults, set the Speech job to a Google text-to-speech model."
    );
  }
  return providerModelId;
}

export const transcribeAudio = tenantAction({
  args: {
    audioBase64: v.string(),
    mimeType: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const { userId, user } = ctx;
    const { audioBase64, mimeType } = assertValidTranscriptionPayload(args);
    await ctx.runMutation(internal.aiActionRequests.reserve, {
      actorId: userId,
      ...(user.companyId ? { companyId: user.companyId } : {}),
      actionName: "transcribeAudio",
      windowMs: AI_ACTION_RATE_LIMIT_WINDOW_MS,
      maxRequests: TRANSCRIPTION_RATE_LIMIT_PER_MINUTE,
    });

    // The platform's configured region, same as every other generation call.
    // This call once pinned us-central1 in the name of "stable multimodal
    // models"; the configured project did not serve the transcription model
    // there, so every dictation failed with a 404 while ordinary chat on the
    // same provider worked fine one region over.
    const ai = createVertexGenAIClient();

    try {
        const modelConfig = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
            useCase: "transcription",
        });
        const providerModelId = getGoogleVertexProviderModelId(modelConfig, "audio transcription");
        
        const response = await generateVertexContentWithRetry(ai, {
            model: providerModelId,
            contents: [
                { text: "Transcribe the following audio exactly. Output ONLY the raw transcription text without any prefix, markdown, or commentary." },
                { inlineData: { mimeType, data: audioBase64 } }
            ]
        }, {
            operation: "transcribeAudio",
        });

        return response.text ? response.text.trim() : "";
    } catch (error) {
        console.error("AI Transcription Error:", normalizeAiRuntimeError(error, "Audio transcription failed."));
        throw appError("UPSTREAM_FAILURE", "Failed to transcribe audio stream properly.");
    }
  }
});

export const synthesizeSpeech = tenantAction({
  args: {
    text: v.string(),
    voiceKey: v.optional(v.string()),
  },
  returns: tailShapes.spokenAudioShape,
  handler: async (ctx, args) => {
    const { userId, user } = ctx;
    const { text, voiceKey } = assertValidSpeechPayload(args);
    await ctx.runMutation(internal.aiActionRequests.reserve, {
      actorId: userId,
      ...(user.companyId ? { companyId: user.companyId } : {}),
      actionName: "synthesizeSpeech",
      windowMs: AI_ACTION_RATE_LIMIT_WINDOW_MS,
      maxRequests: SPEECH_RATE_LIMIT_PER_MINUTE,
    });

    const modelConfig = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
      useCase: "speech",
    });
    const providerModelId = assertSpeechCapableModelId(
      getGoogleVertexProviderModelId(modelConfig, "speech synthesis")
    );

    const ai = createVertexGenAIClient();

    try {
      const response = await generateVertexContentWithRetry(ai, {
        model: providerModelId,
        contents: [{ text }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceKey } },
          },
        },
      }, {
        operation: "synthesizeSpeech",
      });

      const audioPart = response.candidates?.[0]?.content?.parts?.find(
        (part) => part.inlineData?.data
      )?.inlineData;
      if (!audioPart?.data) {
        throw appError("UPSTREAM_FAILURE", "The speech model returned no audio.");
      }
      return {
        audioBase64: audioPart.data,
        mimeType: audioPart.mimeType ?? "audio/L16;codec=pcm;rate=24000",
      };
    } catch (error) {
      console.error("AI Speech Error:", normalizeAiRuntimeError(error, "Speech synthesis failed."));
      throw appError("UPSTREAM_FAILURE", "Failed to generate speech.");
    }
  },
});

