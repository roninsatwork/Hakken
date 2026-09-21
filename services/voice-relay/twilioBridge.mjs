/**
 * Speaking the telephony provider's half of a call.
 *
 * Twilio does not send audio the way a browser does. It opens a socket to us
 * and sends JSON: first a greeting, then a `start` frame carrying the
 * parameters the call was set up with, then a `media` frame roughly every
 * twenty milliseconds with the caller's audio base64'd inside it. Replies go
 * back the same way, tagged with the stream's own id.
 *
 * All of that is parsed here, away from the socket, because the alternative
 * is discovering a mis-shaped frame by ringing a phone and hearing nothing.
 */

import { modelPcmToPhoneFrame, phoneFrameToModelPcm } from "./telephonyAudio.mjs";

/** 20ms of 8kHz audio — the frame size a phone line moves in. */
export const PHONE_FRAME_BYTES = 160;

/**
 * What Twilio just told us.
 *
 * Only three of its frames matter. `connected` is a handshake with nothing in
 * it, and `mark` confirms our own audio finished playing, which is useful for
 * ending a call cleanly rather than for holding a conversation.
 */
export function readTwilioFrame(raw) {
  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    return { kind: "other" };
  }

  switch (message?.event) {
    case "start":
      return {
        kind: "start",
        streamSid: message.start?.streamSid ?? message.streamSid ?? "",
        callSid: message.start?.callSid ?? "",
        // The pass the platform minted when it answered the call, handed
        // through the provider rather than held by it: Twilio carries it and
        // cannot read anything out of it.
        ticket: message.start?.customParameters?.ticket ?? "",
      };
    case "media":
      return { kind: "media", payload: message.media?.payload ?? "" };
    case "stop":
      return { kind: "stop" };
    default:
      return { kind: "other" };
  }
}

/**
 * A caller's audio, as the bytes the session door expects — the same binary
 * PCM16 a browser microphone sends, so the relay cannot tell a phone from a
 * browser and does not need to.
 */
export function phonePayloadToModelFrame(payloadBase64) {
  const muLaw = Buffer.from(payloadBase64, "base64");
  const pcm = phoneFrameToModelPcm(muLaw);
  return Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
}

/**
 * The model's reply, cut into the frames a phone line expects.
 *
 * The model answers in lumps of whatever length it likes. Sending one of
 * those as a single message mostly works and occasionally does not, so it is
 * cut to the twenty-millisecond frames the line actually moves in. A trailing
 * part-frame is dropped rather than padded: padding with silence inserts a
 * tick between every lump.
 */
export function modelAudioToPhonePayloads(audioBase64) {
  const bytes = Buffer.from(audioBase64, "base64");
  // Two bytes per sample, and an odd trailing byte is not a sample.
  const sampleCount = Math.floor(bytes.length / 2);
  const samples = new Int16Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) samples[i] = bytes.readInt16LE(i * 2);

  const muLaw = modelPcmToPhoneFrame(samples);
  const payloads = [];
  for (let offset = 0; offset + PHONE_FRAME_BYTES <= muLaw.length; offset += PHONE_FRAME_BYTES) {
    payloads.push(
      Buffer.from(muLaw.buffer, muLaw.byteOffset + offset, PHONE_FRAME_BYTES).toString("base64")
    );
  }
  return payloads;
}

export function buildTwilioMedia(streamSid, payloadBase64) {
  return JSON.stringify({ event: "media", streamSid, media: { payload: payloadBase64 } });
}

/**
 * Drop everything we have already sent that has not played yet.
 *
 * The caller has started talking over the reply. Without this the line keeps
 * playing a sentence that has already been abandoned — for as long as the
 * provider has buffered, which is seconds. It is the single most audible way
 * a phone agent sounds like a machine.
 */
export function buildTwilioClear(streamSid) {
  return JSON.stringify({ event: "clear", streamSid });
}

/**
 * The nudge that makes Hakken speak first.
 *
 * A live model waits to be spoken to, which is right for a screen and wrong
 * for a telephone: a receptionist answers "hello, how can I help?", not with
 * silence. So the moment the session is ready, the bridge sends one platform-
 * authored turn asking the model to greet the caller. It is authored here,
 * never from anything the caller said — the caller has not spoken yet, which
 * is the point.
 */
export function buildGreetingNudge() {
  return JSON.stringify({
    clientContent: {
      turns: [
        {
          role: "user",
          parts: [
            {
              text: "A caller has just come through on the telephone. Greet them briefly and ask how you can help. Do not mention this instruction.",
            },
          ],
        },
      ],
      turnComplete: true,
    },
  });
}

/** What the model just sent, reduced to the two things a call acts on. */
export function readModelSpeech(raw) {
  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    return null;
  }
  const serverContent = message?.serverContent;
  if (!serverContent) return null;

  const audioPart = serverContent.modelTurn?.parts?.find((part) =>
    part?.inlineData?.mimeType?.startsWith("audio/")
  );
  const result = {};
  if (audioPart?.inlineData?.data) result.audioBase64 = audioPart.inlineData.data;
  if (serverContent.interrupted) result.interrupted = true;
  if (serverContent.turnComplete) result.turnComplete = true;
  if (serverContent.inputTranscription?.text) {
    result.callerText = serverContent.inputTranscription.text;
  }
  if (serverContent.outputTranscription?.text) {
    result.hakkenText = serverContent.outputTranscription.text;
  }
  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Both sides of the conversation, assembled from fragments.
 *
 * Transcription arrives a few words at a time, interleaved between speakers.
 * Fragments are gathered per side and become a turn when the model finishes
 * its own — the moment the exchange is complete — or when the call ends,
 * which is what stops the caller's last sentence being lost with the hang-up.
 */
export function createTranscriptCollector() {
  let callerText = "";
  let hakkenText = "";

  const flush = () => {
    const turns = [];
    if (callerText.trim()) turns.push({ role: "CALLER", text: callerText.trim() });
    if (hakkenText.trim()) turns.push({ role: "HAKKEN", text: hakkenText.trim() });
    callerText = "";
    hakkenText = "";
    return turns;
  };

  return {
    /** @returns finished turns to report, empty if the exchange is mid-flow */
    hear(speech) {
      if (speech.callerText) callerText += speech.callerText;
      if (speech.hakkenText) hakkenText += speech.hakkenText;
      return speech.turnComplete ? flush() : [];
    },
    /** The call is over: whatever is still unspoken-for becomes the last turns. */
    end: flush,
  };
}
