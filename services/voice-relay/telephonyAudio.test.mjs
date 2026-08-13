import { describe, expect, test } from "vitest";
import {
  linearToMuLaw,
  modelPcmToPhoneFrame,
  muLawToLinear,
  phoneFrameToModelPcm,
} from "./telephonyAudio.mjs";

/**
 * Audio conversion fails silently. A wrong shift does not throw — it sounds
 * like static, and static on a live call cannot tell you which of six steps
 * produced it. So this is checked against the G.711 standard's own values
 * rather than by listening.
 */
describe("the phone line's own encoding", () => {
  test("silence is the byte the standard says it is, and comes back as silence", () => {
    expect(linearToMuLaw(0)).toBe(0xff);
    expect(muLawToLinear(0xff)).toBe(0);
  });

  test("a small negative sample matches the reference implementation exactly", () => {
    // Worked through by hand from the Sun reference: -8 encodes to 0x7E and
    // decodes back to exactly -8. If a sign bit is ever inverted, this is
    // the test that says so.
    expect(linearToMuLaw(-8)).toBe(0x7e);
    expect(muLawToLinear(0x7e)).toBe(-8);
  });

  test("positive and negative of the same size differ only in their sign bit", () => {
    for (const magnitude of [16, 100, 1000, 8000, 20000]) {
      expect(linearToMuLaw(magnitude) ^ linearToMuLaw(-magnitude)).toBe(0x80);
    }
  });

  test("anything louder than a phone line can carry is held, not wrapped", () => {
    // Wrapping turns a peak into the opposite peak, which is heard as a
    // crack rather than as clipping — much worse than simply being loud.
    const loudest = linearToMuLaw(32767);
    expect(linearToMuLaw(32000)).toBe(loudest);
    expect(muLawToLinear(loudest)).toBeGreaterThan(30000);

    const quietest = linearToMuLaw(-32768);
    expect(muLawToLinear(quietest)).toBeLessThan(-30000);
  });

  test("every one of the 256 bytes decodes to a real 16-bit sample", () => {
    for (let byte = 0; byte < 256; byte += 1) {
      const sample = muLawToLinear(byte);
      expect(Number.isInteger(sample)).toBe(true);
      expect(sample).toBeGreaterThanOrEqual(-32768);
      expect(sample).toBeLessThanOrEqual(32767);
    }
  });

  test("a round trip keeps the sample within the loss the standard allows", () => {
    // μ-law is lossy by design — it spends its 256 values unevenly, finely
    // on quiet sounds and coarsely on loud ones, because that is how hearing
    // works. What must not happen is a sample coming back a different size
    // or the wrong side of zero.
    for (const sample of [0, 8, -8, 100, -100, 1000, -1000, 10000, -10000]) {
      const roundTripped = muLawToLinear(linearToMuLaw(sample));
      expect(Math.sign(roundTripped)).toBe(Math.sign(sample));
      const tolerance = Math.max(8, Math.abs(sample) * 0.1);
      expect(Math.abs(roundTripped - sample)).toBeLessThanOrEqual(tolerance);
    }
  });
});

describe("a caller's voice on its way to the model", () => {
  test("one phone frame becomes twice as many samples, because the model wants twice the rate", () => {
    const frame = Uint8Array.from([0xff, 0xff, 0xff, 0xff]);
    expect(phoneFrameToModelPcm(frame).length).toBe(8);
  });

  test("silence stays silent rather than picking up a click", () => {
    const silence = Uint8Array.from(new Array(8).fill(0xff));
    expect(Array.from(phoneFrameToModelPcm(silence))).toEqual(new Array(16).fill(0));
  });

  test("the extra samples sit between their neighbours rather than repeating them", () => {
    // Repeating each sample makes a staircase, which the model hears as
    // roughness in the caller's voice. Each inserted sample must be the
    // midpoint, and every original sample must still be present in order.
    const frame = Uint8Array.from([linearToMuLaw(0), linearToMuLaw(1000)]);
    const output = phoneFrameToModelPcm(frame);
    const first = muLawToLinear(frame[0]);
    const second = muLawToLinear(frame[1]);

    expect(output[1]).toBe(first);
    expect(output[3]).toBe(second);
    expect(output[2]).toBe((first + second) >> 1);
    expect(output[2]).toBeGreaterThan(first);
    expect(output[2]).toBeLessThan(second);
  });

  test("an empty frame produces nothing instead of throwing", () => {
    expect(phoneFrameToModelPcm(new Uint8Array(0)).length).toBe(0);
  });
});

describe("the model's reply on its way to the phone", () => {
  test("three samples become one, because the phone runs at a third of the rate", () => {
    const samples = Int16Array.from(new Array(30).fill(0));
    expect(modelPcmToPhoneFrame(samples).length).toBe(10);
  });

  test("silence arrives as silence", () => {
    const output = modelPcmToPhoneFrame(Int16Array.from(new Array(9).fill(0)));
    expect(Array.from(output)).toEqual([0xff, 0xff, 0xff]);
  });

  test("the three samples are averaged, not sampled — otherwise it rings", () => {
    // Taking every third sample folds high frequencies back down as a
    // metallic ring. Averaging is what stops it.
    const samples = Int16Array.from([0, 600, 1200]);
    const averaged = modelPcmToPhoneFrame(samples);
    expect(averaged.length).toBe(1);
    expect(muLawToLinear(averaged[0])).toBeCloseTo(muLawToLinear(linearToMuLaw(600)), -1);
  });

  test("a trailing part-group is dropped rather than averaged against nothing", () => {
    // Reading past the end would average real audio with undefined and emit
    // a sample that is neither — an audible tick at every frame boundary.
    expect(modelPcmToPhoneFrame(Int16Array.from([100, 200, 300, 400, 500])).length).toBe(1);
    expect(modelPcmToPhoneFrame(Int16Array.from([100, 200])).length).toBe(0);
  });

  test("a loud reply does not wrap into the opposite peak on the way out", () => {
    const loud = Int16Array.from([32000, 32500, 32767]);
    const output = modelPcmToPhoneFrame(loud);
    expect(muLawToLinear(output[0])).toBeGreaterThan(0);
  });
});

describe("both directions together", () => {
  test("a tone survives the round trip recognisably", () => {
    // The full journey a caller's voice makes: phone → model → phone. It is
    // lossy twice over, so this asserts the shape survives, not the samples.
    const original = new Uint8Array(240);
    for (let i = 0; i < original.length; i += 1) {
      original[i] = linearToMuLaw(Math.round(8000 * Math.sin((i / 240) * Math.PI * 8)));
    }

    const toModel = phoneFrameToModelPcm(original);
    expect(toModel.length).toBe(480);

    // Back down: the model answers at 24kHz, so simulate that rate before
    // returning to the line.
    const atModelOutputRate = new Int16Array(toModel.length * 3);
    for (let i = 0; i < toModel.length; i += 1) {
      atModelOutputRate[i * 3] = toModel[i];
      atModelOutputRate[i * 3 + 1] = toModel[i];
      atModelOutputRate[i * 3 + 2] = toModel[i];
    }
    const backToPhone = modelPcmToPhoneFrame(atModelOutputRate);

    expect(backToPhone.length).toBe(480);
    // Signal still present, and still crossing zero the way a tone does
    // rather than having collapsed to silence or saturated.
    const decoded = Array.from(backToPhone, muLawToLinear);
    expect(Math.max(...decoded)).toBeGreaterThan(4000);
    expect(Math.min(...decoded)).toBeLessThan(-4000);
  });
});
