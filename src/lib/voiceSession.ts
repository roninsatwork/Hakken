/**
 * The pure logic of the voice session, kept out of the component so it can be
 * tested without a browser: cutting a streaming reply into speakable chunks,
 * and decoding what the speech model returns.
 *
 * The session speaks sentence by sentence while the reply is still being
 * written. A half-written sentence must never be spoken, so the cutter only
 * takes text up to a sentence boundary and remembers how far it has consumed;
 * the final fragment is released only when the stream is known to be done.
 */

// A sentence ends at . ! ? … (optionally inside closing quotes/brackets)
// followed by whitespace or end-of-take. Abbreviations are tolerable
// casualties: mis-cutting "e.g." costs a pause, not a wrong word.
const SENTENCE_BOUNDARY = /[.!?…]+["')\]]*(?=\s|$)/g;

// Several short sentences become one synthesis call; one giant unpunctuated
// paragraph is force-split so a single chunk can never exceed the server's
// per-call ceiling.
export const SPEECH_CHUNK_TARGET_CHARS = 280;
export const SPEECH_CHUNK_MAX_CHARS = 1800;

/**
 * Cut the speakable chunks out of `content` beyond what has already been
 * consumed. Returns the new chunks and the updated consumed length.
 * When `isComplete` is true the trailing fragment is released too.
 */
export function cutSpeakableChunks(args: {
  content: string;
  consumedLength: number;
  isComplete: boolean;
}): { chunks: string[]; consumedLength: number } {
  const pending = args.content.slice(args.consumedLength);
  const sentences: string[] = [];
  let taken = 0;

  SENTENCE_BOUNDARY.lastIndex = 0;
  let match = SENTENCE_BOUNDARY.exec(pending);
  while (match) {
    const end = match.index + match[0].length;
    sentences.push(pending.slice(taken, end));
    taken = end;
    match = SENTENCE_BOUNDARY.exec(pending);
  }

  if (args.isComplete && taken < pending.length) {
    const rest = pending.slice(taken);
    if (rest.trim()) sentences.push(rest);
    taken = pending.length;
  }

  // Merge short sentences up to the target; force-split anything huge.
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > SPEECH_CHUNK_TARGET_CHARS) {
      chunks.push(current);
      current = "";
    }
    current += sentence;
    while (current.length > SPEECH_CHUNK_MAX_CHARS) {
      chunks.push(current.slice(0, SPEECH_CHUNK_MAX_CHARS));
      current = current.slice(SPEECH_CHUNK_MAX_CHARS);
    }
  }
  // Everything in `sentences` is already complete (the incomplete fragment
  // never advanced `taken`), so the remainder is always speakable. Batching
  // only groups sentences that arrived in the same cut — a lone first
  // sentence goes out immediately, because latency to first sound is the
  // whole point of cutting.
  if (current.trim()) chunks.push(current);

  const spoken = chunks.map((chunk) => chunk.trim()).filter(Boolean);
  return { chunks: spoken, consumedLength: args.consumedLength + taken };
}

/**
 * The speech model answers with raw signed 16-bit PCM and a MIME type like
 * `audio/L16;codec=pcm;rate=24000`. The browser cannot play that with an
 * <audio> tag; the session decodes it into an AudioBuffer instead. This
 * helper reads the sample rate off the MIME type.
 */
export function parsePcmSampleRate(mimeType: string, fallback = 24000): number {
  const match = /rate=(\d+)/i.exec(mimeType);
  const rate = match ? Number(match[1]) : NaN;
  return Number.isFinite(rate) && rate > 0 ? rate : fallback;
}

/** Base64 PCM16 → Float32 samples in [-1, 1] for an AudioBuffer. */
export function decodePcm16Base64(audioBase64: string): Float32Array<ArrayBuffer> {
  const binary = atob(audioBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const samples = new Int16Array(bytes.buffer, 0, Math.floor(bytes.byteLength / 2));
  const floats = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) floats[i] = samples[i] / 32768;
  return floats;
}

export type VoiceSessionState = "idle" | "listening" | "thinking" | "speaking";

/**
 * Natural turn taking: the session decides for itself when the speaker has
 * started and finished, so nobody taps anything mid-conversation.
 *
 * A turn starts when the level holds above `onsetLevel` for `onsetMs`
 * (a cough or a door slam is shorter than that), and commits when the level
 * stays below it for `silenceMs` — the conversational pause that means
 * "your go". `maxTurnMs` is the backstop that commits a monologue rather
 * than recording forever.
 */
export type SpeechTurnPhase = "waiting" | "speaking" | "commit";

export type SpeechTurnConfig = {
  onsetLevel: number;
  onsetMs: number;
  silenceMs: number;
  maxTurnMs: number;
};

export const SPEECH_TURN_DEFAULTS: SpeechTurnConfig = {
  onsetLevel: 0.12,
  onsetMs: 120,
  // Human turn-taking gaps in conversation average ~200ms; anything over a
  // second reads as the machine being slow rather than polite. 700ms is long
  // enough to survive a mid-sentence breath and short enough to feel like a
  // reply rather than a wait.
  silenceMs: 700,
  maxTurnMs: 30000,
};

export function createSpeechTurnDetector(config: SpeechTurnConfig = SPEECH_TURN_DEFAULTS) {
  let aboveSince: number | null = null;
  let speechStartedAt: number | null = null;
  let belowSince: number | null = null;

  return {
    hasHeardSpeech: () => speechStartedAt !== null,
    update(level: number, now: number): SpeechTurnPhase {
      if (speechStartedAt === null) {
        if (level >= config.onsetLevel) {
          aboveSince ??= now;
          if (now - aboveSince >= config.onsetMs) {
            speechStartedAt = now;
            belowSince = null;
            return "speaking";
          }
        } else {
          aboveSince = null;
        }
        return "waiting";
      }

      if (now - speechStartedAt >= config.maxTurnMs) return "commit";

      if (level < config.onsetLevel) {
        belowSince ??= now;
        if (now - belowSince >= config.silenceMs) return "commit";
      } else {
        belowSince = null;
      }
      return "speaking";
    },
  };
}
