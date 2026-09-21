import { describe, expect, test } from "vitest";
import { linearToMuLaw, muLawToLinear } from "./telephonyAudio.mjs";
import {
  buildGreetingNudge,
  createTranscriptCollector,
  readModelSpeech,
  buildTwilioClear,
  buildTwilioMedia,
  modelAudioToPhonePayloads,
  PHONE_FRAME_BYTES,
  phonePayloadToModelFrame,
  readTwilioFrame,
} from "./twilioBridge.mjs";

describe("what the provider sends", () => {
  test("the start frame yields the stream, the call, and the platform's pass", () => {
    expect(
      readTwilioFrame(
        JSON.stringify({
          event: "start",
          start: {
            streamSid: "MZ123",
            callSid: "CA456",
            customParameters: { ticket: "abc.def" },
          },
        })
      )
    ).toEqual({ kind: "start", streamSid: "MZ123", callSid: "CA456", ticket: "abc.def" });
  });

  test("a start frame with no pass is a start frame with no pass — visibly", () => {
    // The bridge refuses these; what must not happen is the missing ticket
    // reading as undefined-stringed-somewhere and failing later, elsewhere.
    const frame = readTwilioFrame(JSON.stringify({ event: "start", start: { streamSid: "MZ1" } }));
    expect(frame.kind).toBe("start");
    expect(frame.ticket).toBe("");
  });

  test("media frames carry the caller's audio; stop says the call ended", () => {
    expect(readTwilioFrame(JSON.stringify({ event: "media", media: { payload: "AAAA" } }))).toEqual(
      { kind: "media", payload: "AAAA" }
    );
    expect(readTwilioFrame(JSON.stringify({ event: "stop" }))).toEqual({ kind: "stop" });
  });

  test("handshakes, marks, and rubbish are all just noise", () => {
    expect(readTwilioFrame(JSON.stringify({ event: "connected" })).kind).toBe("other");
    expect(readTwilioFrame(JSON.stringify({ event: "mark" })).kind).toBe("other");
    expect(readTwilioFrame("not json").kind).toBe("other");
  });
});

describe("the caller's voice on its way in", () => {
  test("one phone frame becomes the binary a browser microphone would have sent", () => {
    // 160 μ-law bytes (20ms at 8kHz) → 320 samples at 16kHz → 640 bytes.
    const silence = Buffer.alloc(PHONE_FRAME_BYTES, 0xff).toString("base64");
    const pcm = phonePayloadToModelFrame(silence);
    expect(Buffer.isBuffer(pcm)).toBe(true);
    expect(pcm.length).toBe(PHONE_FRAME_BYTES * 2 * 2);
    // And silence is still silence.
    expect(pcm.every((byte) => byte === 0)).toBe(true);
  });
});

describe("the model's reply on its way out", () => {
  test("a reply is cut into the twenty-millisecond frames the line moves in", () => {
    // 24kHz PCM16: 480 samples → 160 μ-law bytes → exactly one phone frame.
    const oneFrame = Buffer.alloc(480 * 2);
    expect(modelAudioToPhonePayloads(oneFrame.toString("base64"))).toHaveLength(1);

    const twoAndABit = Buffer.alloc(Math.floor(480 * 2.5) * 2);
    expect(modelAudioToPhonePayloads(twoAndABit.toString("base64"))).toHaveLength(2);
  });

  test("each frame is exactly the size the line expects", () => {
    const audio = Buffer.alloc(480 * 3 * 2);
    for (const payload of modelAudioToPhonePayloads(audio.toString("base64"))) {
      expect(Buffer.from(payload, "base64").length).toBe(PHONE_FRAME_BYTES);
    }
  });

  test("sound survives the cut — a loud sample is still loud on the line", () => {
    const samples = new Int16Array(480 * 3).fill(12000);
    const bytes = Buffer.alloc(samples.length * 2);
    for (let i = 0; i < samples.length; i += 1) bytes.writeInt16LE(samples[i], i * 2);

    const payloads = modelAudioToPhonePayloads(bytes.toString("base64"));
    const firstFrame = Buffer.from(payloads[0], "base64");
    const decoded = muLawToLinear(firstFrame[0]);
    expect(decoded).toBeGreaterThan(10000);
    expect(decoded).toBeLessThan(14000);
  });

  test("an empty or sub-frame reply sends nothing rather than a padded tick", () => {
    expect(modelAudioToPhonePayloads("")).toHaveLength(0);
    expect(modelAudioToPhonePayloads(Buffer.alloc(100).toString("base64"))).toHaveLength(0);
  });
});

describe("what goes back down the wire", () => {
  test("audio is tagged with the stream it belongs to", () => {
    expect(JSON.parse(buildTwilioMedia("MZ123", "AAAA"))).toEqual({
      event: "media",
      streamSid: "MZ123",
      media: { payload: "AAAA" },
    });
  });

  test("an interruption clears the provider's buffer", () => {
    // Without this the line keeps playing an abandoned sentence for as long
    // as the provider has buffered — seconds. The single most audible way a
    // phone agent sounds like a machine.
    expect(JSON.parse(buildTwilioClear("MZ123"))).toEqual({ event: "clear", streamSid: "MZ123" });
  });
});

describe("round trip", () => {
  test("what the model says is what the phone plays, within the line's own loss", () => {
    // Model speaks at 24kHz; the line carries 8kHz μ-law. A 600-sample tone
    // should come out the far side the same shape and roughly the same size.
    const samples = new Int16Array(480 * 3);
    for (let i = 0; i < samples.length; i += 1) {
      samples[i] = Math.round(8000 * Math.sin(i / 20));
    }
    const bytes = Buffer.alloc(samples.length * 2);
    for (let i = 0; i < samples.length; i += 1) bytes.writeInt16LE(samples[i], i * 2);

    const payloads = modelAudioToPhonePayloads(bytes.toString("base64"));
    expect(payloads.length).toBe(3);

    const heard = payloads.flatMap((payload) =>
      Array.from(Buffer.from(payload, "base64"), muLawToLinear)
    );
    expect(Math.max(...heard)).toBeGreaterThan(6000);
    expect(Math.min(...heard)).toBeLessThan(-6000);
  });

  test("silence in either direction stays silent", () => {
    const phoneSilence = Buffer.alloc(PHONE_FRAME_BYTES, linearToMuLaw(0)).toString("base64");
    expect(phonePayloadToModelFrame(phoneSilence).every((byte) => byte === 0)).toBe(true);

    const modelSilence = Buffer.alloc(480 * 2).toString("base64");
    const [payload] = modelAudioToPhonePayloads(modelSilence);
    expect(Buffer.from(payload, "base64").every((byte) => byte === linearToMuLaw(0))).toBe(true);
  });
});

describe("speaking first", () => {
  test("the greeting nudge is a complete platform-authored turn", () => {
    // A screen waits for you; a phone must not. And it must be a *finished*
    // turn, or the model sits waiting for the rest of it forever.
    const nudge = JSON.parse(buildGreetingNudge());
    expect(nudge.clientContent.turnComplete).toBe(true);
    expect(nudge.clientContent.turns[0].role).toBe("user");
    expect(nudge.clientContent.turns[0].parts[0].text).toMatch(/[Gg]reet/);
    // It must also pass the relay's own frame filter — a nudge the session
    // door drops is a greeting that never happens.
    expect(Object.keys(nudge)).not.toContain("setup");
  });
});

describe("assembling the transcript", () => {
  test("fragments become a turn when the exchange finishes, both sides in order", () => {
    const collector = createTranscriptCollector();
    expect(collector.hear({ callerText: "what are " })).toEqual([]);
    expect(collector.hear({ callerText: "your hours" })).toEqual([]);
    expect(collector.hear({ hakkenText: "We open at nine." })).toEqual([]);
    expect(collector.hear({ turnComplete: true })).toEqual([
      { role: "CALLER", text: "what are your hours" },
      { role: "HAKKEN", text: "We open at nine." },
    ]);
    // And the next exchange starts clean.
    expect(collector.hear({ turnComplete: true })).toEqual([]);
  });

  test("a hang-up mid-sentence keeps what was said rather than losing it", () => {
    const collector = createTranscriptCollector();
    collector.hear({ callerText: "actually can you also" });
    expect(collector.end()).toEqual([{ role: "CALLER", text: "actually can you also" }]);
    expect(collector.end()).toEqual([]);
  });

  test("turn boundaries are read off the wire format the model actually sends", () => {
    const speech = readModelSpeech(
      JSON.stringify({ serverContent: { turnComplete: true, outputTranscription: { text: "Bye." } } })
    );
    expect(speech).toEqual({ turnComplete: true, hakkenText: "Bye." });
  });
});
