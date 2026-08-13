import { describe, expect, test } from "vitest";
import {
  createSpeechTurnDetector,
  cutSpeakableChunks,
  decodePcm16Base64,
  parsePcmSampleRate,
  SPEECH_CHUNK_MAX_CHARS,
} from "./voiceSession";

describe("cutSpeakableChunks", () => {
  test("never speaks a half-written sentence", () => {
    const first = cutSpeakableChunks({
      content: "Hello there. This is unfin",
      consumedLength: 0,
      isComplete: false,
    });
    expect(first.chunks).toEqual(["Hello there."]);

    // The stream grows; only the newly completed sentence is cut.
    const second = cutSpeakableChunks({
      content: "Hello there. This is unfinished no longer! And still going",
      consumedLength: first.consumedLength,
      isComplete: false,
    });
    expect(second.chunks).toEqual(["This is unfinished no longer!"]);
  });

  test("releases the final fragment only when the stream is complete", () => {
    const streaming = cutSpeakableChunks({
      content: "One. Two without punctuation",
      consumedLength: 0,
      isComplete: false,
    });
    expect(streaming.chunks).toEqual(["One."]);

    const done = cutSpeakableChunks({
      content: "One. Two without punctuation",
      consumedLength: streaming.consumedLength,
      isComplete: true,
    });
    expect(done.chunks).toEqual(["Two without punctuation"]);
    expect(done.consumedLength).toBe("One. Two without punctuation".length);
  });

  test("merges short sentences and force-splits a giant unpunctuated block", () => {
    const merged = cutSpeakableChunks({
      content: "Yes. No. Maybe. Fine.",
      consumedLength: 0,
      isComplete: true,
    });
    expect(merged.chunks).toEqual(["Yes. No. Maybe. Fine."]);

    const giant = cutSpeakableChunks({
      content: "a".repeat(SPEECH_CHUNK_MAX_CHARS * 2 + 10),
      consumedLength: 0,
      isComplete: true,
    });
    expect(giant.chunks.length).toBeGreaterThan(1);
    expect(Math.max(...giant.chunks.map((c) => c.length))).toBeLessThanOrEqual(
      SPEECH_CHUNK_MAX_CHARS
    );
  });

  test("an empty or whitespace tail produces no chunk", () => {
    const result = cutSpeakableChunks({
      content: "Done.   ",
      consumedLength: 0,
      isComplete: true,
    });
    expect(result.chunks).toEqual(["Done."]);
  });
});

describe("createSpeechTurnDetector", () => {
  const config = { onsetLevel: 0.1, onsetMs: 100, silenceMs: 1000, maxTurnMs: 10000 };

  test("a short spike never starts a turn; sustained speech does", () => {
    const detector = createSpeechTurnDetector(config);
    expect(detector.update(0.5, 0)).toBe("waiting"); // spike begins
    expect(detector.update(0.02, 50)).toBe("waiting"); // gone before onsetMs
    expect(detector.update(0.5, 1000)).toBe("waiting");
    expect(detector.update(0.5, 1120)).toBe("speaking"); // held past onsetMs
    expect(detector.hasHeardSpeech()).toBe(true);
  });

  test("commits after the conversational pause, not on a mid-sentence breath", () => {
    const detector = createSpeechTurnDetector(config);
    detector.update(0.5, 0);
    detector.update(0.5, 150); // speaking
    expect(detector.update(0.02, 200)).toBe("speaking"); // breath begins
    expect(detector.update(0.02, 800)).toBe("speaking"); // still under silenceMs
    expect(detector.update(0.5, 900)).toBe("speaking"); // resumed — pause reset
    expect(detector.update(0.02, 1000)).toBe("speaking");
    expect(detector.update(0.02, 2100)).toBe("commit"); // full pause elapsed
  });

  test("a monologue commits at the backstop", () => {
    const detector = createSpeechTurnDetector(config);
    detector.update(0.5, 0);
    detector.update(0.5, 150);
    expect(detector.update(0.5, 10200)).toBe("commit");
  });
});

describe("PCM decoding", () => {
  test("reads the sample rate off the MIME type with a safe fallback", () => {
    expect(parsePcmSampleRate("audio/L16;codec=pcm;rate=24000")).toBe(24000);
    expect(parsePcmSampleRate("audio/L16;rate=16000")).toBe(16000);
    expect(parsePcmSampleRate("audio/mpeg")).toBe(24000);
  });

  test("decodes little-endian PCM16 into [-1, 1] floats", () => {
    // Samples: 0, 16384 (0.5), -32768 (-1)
    const bytes = new Uint8Array([0x00, 0x00, 0x00, 0x40, 0x00, 0x80]);
    const base64 = Buffer.from(bytes).toString("base64");
    const floats = decodePcm16Base64(base64);
    expect(Array.from(floats)).toEqual([0, 0.5, -1]);
  });
});
