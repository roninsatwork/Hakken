/**
 * The rules for answering a phone call, with no database and no network.
 *
 * Everything a telephony webhook has to get right before it does anything —
 * is this really the provider, which company owns this number, what do we say
 * back — decided by pure functions so each can be checked against known
 * values. A phone webhook is a public endpoint that spends a company's model
 * budget, so being wrong here is expensive rather than merely broken.
 */

/** Kept out of every list view: a caller's number is personal data. */
export function maskPhoneNumber(number: string) {
  const trimmed = number.trim();
  if (trimmed.length <= 3) return "***";
  return `***${trimmed.slice(-3)}`;
}

/**
 * Numbers arrive from a provider in E.164 and from a human in whatever they
 * typed, so both sides of a comparison are reduced to digits and a leading
 * plus before matching. Without this, one stray space in configuration means
 * every call is refused and nothing says why.
 */
export function normalisePhoneNumber(number: string) {
  const digits = String(number ?? "").replace(/[^\d+]/g, "");
  return digits.startsWith("+") ? `+${digits.slice(1).replace(/\+/g, "")}` : digits;
}

/**
 * Which workspace owns which number.
 *
 * Configuration rather than code, so a second number is a setting rather than
 * a deployment. Anything unparseable yields no mapping at all — a call is
 * then refused politely, which is the safe direction: the alternative is
 * answering a stranger's call as somebody else's company.
 */
export function parseNumberOwnership(value: string | undefined): Record<string, string> {
  if (!value?.trim()) return {};
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const mapping: Record<string, string> = {};
    for (const [number, companyId] of Object.entries(parsed)) {
      if (typeof companyId !== "string" || !companyId.trim()) continue;
      const key = normalisePhoneNumber(number);
      if (key) mapping[key] = companyId;
    }
    return mapping;
  } catch {
    return {};
  }
}

export function findNumberOwner(mapping: Record<string, string>, calledNumber: string) {
  return mapping[normalisePhoneNumber(calledNumber)];
}

/**
 * The provider signs each request; this recomputes that signature.
 *
 * Twilio's scheme, which cannot be varied: the full request URL, then every
 * form field appended as name followed by value, in sorted order, with no
 * separators at all — then HMAC-SHA1, base64. The lack of separators is the
 * part that looks like a mistake and is not.
 */
export async function computeTwilioSignature(
  url: string,
  params: Record<string, string>,
  authToken: string
) {
  let payload = url;
  for (const name of Object.keys(params).sort()) {
    payload += name + params[name];
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/** Compared without leaking where two signatures first differ. */
export function signaturesMatch(expected: string, provided: string) {
  if (expected.length !== provided.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i += 1) {
    difference |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return difference === 0;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * What the provider is told to do with the call.
 *
 * The disclosure is spoken by the phone system before the model is connected,
 * rather than being left to the model as its first sentence. A live model
 * usually follows that instruction and "usually" is not a standard to hold a
 * legal notice to — and a caller hearing a different voice say "this is an
 * AI" before a conversation begins is the familiar shape of every recorded
 * call, not a jarring one.
 */
export function buildConnectTwiml(args: {
  disclosure: string;
  streamUrl: string;
  ticket: string;
}) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Response>",
    `<Say>${escapeXml(args.disclosure)}</Say>`,
    "<Connect>",
    `<Stream url="${escapeXml(args.streamUrl)}">`,
    `<Parameter name="ticket" value="${escapeXml(args.ticket)}"/>`,
    "</Stream>",
    "</Connect>",
    "</Response>",
  ].join("");
}

/** A number nobody owns, or a platform that cannot answer right now. */
export function buildRefusalTwiml(message: string) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Response>",
    `<Say>${escapeXml(message)}</Say>`,
    "<Hangup/>",
    "</Response>",
  ].join("");
}

export function buildDisclosure(companyName: string | undefined) {
  return companyName?.trim()
    ? `Hello. You are speaking to an A.I. assistant for ${companyName.trim()}.`
    : "Hello. You are speaking to an A.I. assistant.";
}

/**
 * A number spaced for reading off a wall.
 *
 * E.164 is what machines exchange; a room reads groups. UK numbers group the
 * way people say them — London (+44 20) as 20 XXXX XXXX, mobiles and other
 * ten-digit nationals as XXXX XXXXXX — and anything unrecognised falls back
 * to fours from the right, which is how strangers' numbers are read aloud
 * everywhere. Display only: matching and storage stay on the compact form.
 */
export function formatPhoneNumberForDisplay(number: string) {
  const compact = normalisePhoneNumber(number);
  if (!compact.startsWith("+")) return number.trim();

  if (compact.startsWith("+44") && compact.length === 13) {
    const national = compact.slice(3);
    if (national.startsWith("2")) {
      return `+44 ${national.slice(0, 2)} ${national.slice(2, 6)} ${national.slice(6)}`;
    }
    return `+44 ${national.slice(0, 4)} ${national.slice(4)}`;
  }

  const digits = compact.slice(1);
  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= 4) {
    groups.unshift(digits.slice(Math.max(0, end - 4), end));
  }
  return `+${groups.join(" ")}`;
}
