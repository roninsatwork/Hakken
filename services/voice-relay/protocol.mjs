/**
 * The relay's rules, with no socket and no server attached.
 *
 * Everything here is a pure function of its arguments so it can be tested
 * without opening a port or reaching Google — which matters, because the one
 * bug that cost this feature a day lived in exactly this logic and the only
 * way to see it was to run the whole stack by hand.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The ticket says who is allowed to talk and what the session is. It is
 * signed by the platform, so the relay can trust its contents without
 * calling anything, and it expires in a minute — long enough to open a
 * connection, too short to be worth stealing.
 */
export function readTicket(raw, secret, now = Date.now()) {
  const [payloadPart, signaturePart] = String(raw ?? "").split(".");
  if (!payloadPart || !signaturePart) throw new Error("Malformed ticket.");

  const expected = createHmac("sha256", secret).update(payloadPart).digest();
  const provided = Buffer.from(signaturePart, "base64url");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    throw new Error("Bad ticket signature.");
  }

  const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
  if (typeof payload.expiresAt !== "number" || payload.expiresAt < now) {
    throw new Error("Ticket expired.");
  }
  if (!payload.model) throw new Error("Ticket names no model.");
  return payload;
}

/** The setup Vertex expects before any audio flows. */
export function buildSetup(ticket, project, location) {
  return {
    setup: {
      model: `projects/${project}/locations/${location}/publishers/google/models/${ticket.model}`,
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: ticket.voice
          ? { voiceConfig: { prebuiltVoiceConfig: { voiceName: ticket.voice } } }
          : undefined,
      },
      // The company's rules arrive from the platform, never from the page:
      // a browser can rewrite anything it is given, so it is given nothing.
      systemInstruction: ticket.instructions
        ? { parts: [{ text: ticket.instructions }] }
        : undefined,
      // What the model may reach for mid-sentence — searching the company's
      // knowledge, today. The platform decides this and signs it into the
      // ticket for the same reason it owns the instructions.
      tools:
        Array.isArray(ticket.tools) && ticket.tools.length > 0
          ? [{ functionDeclarations: ticket.tools }]
          : undefined,
      // Both sides transcribed so the conversation can be written back into
      // the thread as ordinary messages.
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    },
  };
}

/** One microphone frame, in the shape Vertex reads it. */
export function buildAudioFrame(bytes) {
  return JSON.stringify({
    realtimeInput: {
      mediaChunks: [{ mimeType: "audio/pcm;rate=16000", data: bytes.toString("base64") }],
    },
  });
}

/**
 * Only setup may not come from the page — that is the relay's to send, and a
 * browser that sends its own would rewrite the company's instructions. Audio
 * and tool answers pass straight through.
 *
 * Parsed rather than searched for the word "setup": a caller answering a
 * knowledge lookup about, say, setup instructions would otherwise have their
 * answer silently dropped and the model would wait for it forever.
 */
export function isCallerFrameAllowed(text) {
  try {
    return !Object.hasOwn(JSON.parse(text), "setup");
  } catch {
    // Unparseable is not audio and not an answer. Drop it rather than
    // forward something Vertex will reject the whole session over.
    return false;
  }
}

/**
 * What to do with each frame the page sends, decided without awaiting
 * anything.
 *
 * This exists because of the bug that cost this feature a day. The page
 * starts streaming the microphone the instant its socket opens, but the relay
 * needs a few hundred milliseconds to fetch its Google token first. If the
 * "ticket already handled" flag is only set after that await, the first audio
 * frame arrives while it is still false, gets read as a second ticket, fails
 * to parse, and the call is closed before a word reaches Google — silently,
 * because a refused ticket looks exactly like a caller who never arrived.
 *
 * So the flag flips here, synchronously, and audio that arrives before Vertex
 * is ready is held rather than dropped or misread.
 */
export function createCallerRouter({ secret, now = () => Date.now(), maxHeldFrames = 200 }) {
  let ticketAccepted = false;
  let vertexOpen = false;
  const held = [];

  return {
    /**
     * @returns one of:
     *   {kind:"ticket", ticket}   the session may now be opened
     *   {kind:"refused", reason}  hang up, and say why in the log
     *   {kind:"send", frame}      forward to Vertex now
     *   {kind:"held"}             Vertex is not ready; kept for release
     *   {kind:"dropped"}          not the page's to send, or overflowed
     */
    receive(data, isBinary) {
      if (!ticketAccepted) {
        let ticket;
        try {
          ticket = readTicket(JSON.parse(data.toString()).ticket, secret, now());
        } catch (error) {
          return { kind: "refused", reason: error?.message ?? "Refused." };
        }
        ticketAccepted = true;
        return { kind: "ticket", ticket };
      }

      let frame;
      if (isBinary) {
        frame = buildAudioFrame(Buffer.from(data));
      } else {
        const text = data.toString();
        if (!isCallerFrameAllowed(text)) return { kind: "dropped" };
        frame = text;
      }

      if (vertexOpen) return { kind: "send", frame };
      if (held.length >= maxHeldFrames) return { kind: "dropped" };
      held.push(frame);
      return { kind: "held" };
    },

    /** Vertex is up: hand back everything said while it was still opening. */
    release() {
      vertexOpen = true;
      return held.splice(0);
    },

    get heldCount() {
      return held.length;
    },
  };
}
