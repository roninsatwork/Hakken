/**
 * The browser half of the Google live voice connection.
 *
 * Google's live models speak a raw socket rather than WebRTC, so unlike the
 * OpenAI path the browser has to do the audio work itself: capture the
 * microphone, downsample it to the 16kHz signed 16-bit stream Vertex expects,
 * and schedule the 24kHz audio that comes back so it plays as one continuous
 * voice rather than a stutter of packets.
 *
 * It never talks to Google directly — Vertex has no browser-safe credential,
 * so everything goes through the platform's own relay with a signed ticket.
 * The pure pieces live here so they can be tested without a browser.
 */

export const LIVE_INPUT_SAMPLE_RATE = 16000;
export const LIVE_OUTPUT_SAMPLE_RATE = 24000;

/**
 * Microphone audio arrives at whatever rate the device runs at — usually
 * 48kHz — and Vertex wants 16kHz. Averaging the samples that fall inside each
 * output step is cheap and, unlike picking every third sample, does not turn
 * high frequencies into a metallic whine.
 */
export function downsampleTo16k(
  input: Float32Array,
  inputSampleRate: number
): Int16Array<ArrayBuffer> {
  if (inputSampleRate <= LIVE_INPUT_SAMPLE_RATE) {
    return floatToPcm16(input);
  }
  const ratio = inputSampleRate / LIVE_INPUT_SAMPLE_RATE;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Int16Array(new ArrayBuffer(outputLength * 2));
  for (let i = 0; i < outputLength; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += input[j];
    const average = end > start ? sum / (end - start) : 0;
    output[i] = clampToPcm16(average);
  }
  return output;
}

export function floatToPcm16(input: Float32Array): Int16Array<ArrayBuffer> {
  const output = new Int16Array(new ArrayBuffer(input.length * 2));
  for (let i = 0; i < input.length; i += 1) output[i] = clampToPcm16(input[i]);
  return output;
}

function clampToPcm16(sample: number) {
  const clamped = Math.max(-1, Math.min(1, sample));
  return Math.round(clamped * 32767);
}

/**
 * What the relay forwards from Vertex, reduced to the three things the
 * session actually acts on: audio to play, words to caption, and the moment
 * the model stops because the caller started talking over it.
 */
export type LiveServerEvent = {
  audioBase64?: string;
  userTranscript?: string;
  assistantTranscript?: string;
  interrupted?: boolean;
  turnComplete?: boolean;
  ready?: boolean;
};

export function readLiveServerMessage(raw: string): LiveServerEvent | null {
  let message: Record<string, unknown>;
  try {
    message = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }

  if ((message as { type?: string }).type === "relay.ready") return { ready: true };

  const serverContent = message.serverContent as
    | {
        modelTurn?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
        inputTranscription?: { text?: string };
        outputTranscription?: { text?: string };
        interrupted?: boolean;
        turnComplete?: boolean;
      }
    | undefined;
  if (!serverContent) return null;

  const audioPart = serverContent.modelTurn?.parts?.find((part) =>
    part.inlineData?.mimeType?.startsWith("audio/")
  );

  const event: LiveServerEvent = {};
  if (audioPart?.inlineData?.data) event.audioBase64 = audioPart.inlineData.data;
  if (serverContent.inputTranscription?.text) {
    event.userTranscript = serverContent.inputTranscription.text;
  }
  if (serverContent.outputTranscription?.text) {
    event.assistantTranscript = serverContent.outputTranscription.text;
  }
  if (serverContent.interrupted) event.interrupted = true;
  if (serverContent.turnComplete) event.turnComplete = true;
  return Object.keys(event).length > 0 ? event : null;
}
