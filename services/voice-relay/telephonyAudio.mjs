/**
 * Translating between a phone line and a live model.
 *
 * These are two different worlds. A phone call carries 8kHz audio compressed
 * to one byte per sample by a 1972 standard (G.711 μ-law), because that is
 * what fits down a telephone circuit. The live model wants 16kHz uncompressed
 * audio in, and answers at 24kHz. Nothing in between speaks both.
 *
 * So this module is the translator, and it is deliberately pure: no sockets,
 * no provider, no session. The relay's own ordering bug cost a day precisely
 * because it could only be exercised by making a real call, and audio
 * conversion is far worse for that — a wrong sign bit or a shift in the wrong
 * direction does not throw, it just sounds like static, and static on a live
 * call tells you nothing about which of six steps produced it. Everything
 * here is checked against known byte values instead.
 *
 * μ-law follows the Sun/G.711 reference implementation. It is not obvious
 * code and it should not be rewritten to look nicer; it is a standard, and
 * the phone network on the other end is not going to change its mind.
 */

export const PHONE_SAMPLE_RATE = 8000;
export const MODEL_INPUT_SAMPLE_RATE = 16000;
export const MODEL_OUTPUT_SAMPLE_RATE = 24000;

// From the G.711 reference: the bias added before encoding, and the largest
// magnitude representable once the sample has been reduced to 14 bits.
const BIAS = 0x84;
const CLIP = 8159;
// The upper bound of each of the eight exponent segments, in 14-bit units.
const SEGMENT_ENDS = [0x3f, 0x7f, 0xff, 0x1ff, 0x3ff, 0x7ff, 0xfff, 0x1fff];

function findSegment(value) {
  for (let segment = 0; segment < SEGMENT_ENDS.length; segment += 1) {
    if (value <= SEGMENT_ENDS[segment]) return segment;
  }
  return SEGMENT_ENDS.length;
}

/** One 16-bit sample down to the single byte a phone line carries. */
export function linearToMuLaw(sample) {
  // Reduced to 14 bits first, which is the range μ-law's segments describe.
  let value = sample >> 2;
  let mask;
  if (value < 0) {
    value = -value;
    mask = 0x7f;
  } else {
    mask = 0xff;
  }
  // Louder than a phone line can represent is held at its loudest rather
  // than wrapped, which would turn a peak into the opposite peak — heard as
  // a crack rather than as clipping.
  if (value > CLIP) value = CLIP;
  value += BIAS >> 2;

  const segment = findSegment(value);
  if (segment >= SEGMENT_ENDS.length) return 0x7f ^ mask;
  const encoded = (segment << 4) | ((value >> (segment + 1)) & 0x0f);
  return encoded ^ mask;
}

/** One byte from a phone line back to a 16-bit sample. */
export function muLawToLinear(byte) {
  const value = ~byte & 0xff;
  let magnitude = ((value & 0x0f) << 3) + BIAS;
  magnitude <<= (value & 0x70) >> 4;
  return (value & 0x80) !== 0 ? BIAS - magnitude : magnitude - BIAS;
}

/**
 * A phone frame as it arrives, ready for the model.
 *
 * Two steps in one pass: decode each byte, and double the rate. The
 * doubling interpolates rather than repeating each sample, because repeating
 * introduces a hard step between samples that the model hears as roughness
 * in the caller's voice.
 */
export function phoneFrameToModelPcm(muLawBytes) {
  const sampleCount = muLawBytes.length;
  if (sampleCount === 0) return new Int16Array(new ArrayBuffer(0));

  const output = new Int16Array(new ArrayBuffer(sampleCount * 2 * 2));
  let previous = muLawToLinear(muLawBytes[0]);
  for (let i = 0; i < sampleCount; i += 1) {
    const current = muLawToLinear(muLawBytes[i]);
    // The midpoint sits between this sample and the one before it, so the
    // pair reads as [midpoint, sample] and the stream stays in order.
    output[i * 2] = (previous + current) >> 1;
    output[i * 2 + 1] = current;
    previous = current;
  }
  return output;
}

/**
 * The model's reply, ready for the phone line.
 *
 * 24kHz down to 8kHz is exactly three samples to one, and they are averaged
 * rather than sampled. Taking every third sample is cheaper and folds the
 * high frequencies back down as a metallic ring — the same reason the
 * browser's microphone path averages on the way up.
 */
export function modelPcmToPhoneFrame(samples) {
  const outputLength = Math.floor(samples.length / 3);
  const output = new Uint8Array(outputLength);
  for (let i = 0; i < outputLength; i += 1) {
    const start = i * 3;
    const average = Math.round((samples[start] + samples[start + 1] + samples[start + 2]) / 3);
    output[i] = linearToMuLaw(clampToPcm16(average));
  }
  return output;
}

function clampToPcm16(sample) {
  return Math.max(-32768, Math.min(32767, sample));
}
