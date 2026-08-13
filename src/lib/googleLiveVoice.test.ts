import { describe, expect, test } from "vitest";
import {
  downsampleTo16k,
  floatToPcm16,
  readLiveServerMessage,
} from "./googleLiveVoice";

describe("microphone conversion", () => {
  test("averages down to 16kHz rather than dropping samples", () => {
    // 48kHz → 16kHz is three input samples per output sample.
    const input = Float32Array.from([1, 1, 1, -1, -1, -1]);
    const output = downsampleTo16k(input, 48000);
    expect(output.length).toBe(2);
    expect(output[0]).toBe(32767);
    expect(output[1]).toBe(-32767);
  });

  test("passes through when the device already runs at or below 16kHz", () => {
    const input = Float32Array.from([0, 0.5, -1]);
    expect(Array.from(downsampleTo16k(input, 16000))).toEqual(Array.from(floatToPcm16(input)));
  });

  test("clamps anything outside the usable range instead of wrapping", () => {
    expect(Array.from(floatToPcm16(Float32Array.from([2, -2])))).toEqual([32767, -32767]);
  });
});

describe("reading what the relay forwards", () => {
  test("picks out audio, both transcripts, and the interruption", () => {
    expect(
      readLiveServerMessage(
        JSON.stringify({
          serverContent: {
            modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm", data: "QUJD" } }] },
            outputTranscription: { text: "Hello there" },
          },
        })
      )
    ).toEqual({ audioBase64: "QUJD", assistantTranscript: "Hello there" });

    expect(
      readLiveServerMessage(JSON.stringify({ serverContent: { interrupted: true } }))
    ).toEqual({ interrupted: true });

    expect(
      readLiveServerMessage(
        JSON.stringify({ serverContent: { inputTranscription: { text: "what are your hours" } } })
      )
    ).toEqual({ userTranscript: "what are your hours" });
  });

  test("the relay's own ready signal is recognised", () => {
    expect(readLiveServerMessage(JSON.stringify({ type: "relay.ready" }))).toEqual({ ready: true });
  });

  test("noise and malformed frames are ignored rather than thrown", () => {
    expect(readLiveServerMessage("not json")).toBeNull();
    expect(readLiveServerMessage(JSON.stringify({ setupComplete: {} }))).toBeNull();
    expect(readLiveServerMessage(JSON.stringify({ serverContent: {} }))).toBeNull();
  });
});
