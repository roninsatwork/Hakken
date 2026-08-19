/**
 * Proving a webhook came from here.
 *
 * Anything receiving data from Sonae had no way to tell it apart from anyone
 * else posting the same shape at the same URL. A receiver acting on an
 * unverified payload is acting on whatever the internet sends it.
 *
 * The scheme is the ordinary one — a timestamp, the body, an HMAC over both —
 * chosen because it is what receivers already know how to check, and a bespoke
 * scheme would mean every integrator writing new code against our documentation
 * instead of reusing what they have.
 *
 * The timestamp is inside the signed content on purpose. Signing the body alone
 * lets someone who captures one delivery replay it forever; with the timestamp
 * signed, a receiver can refuse anything old and the signature cannot be moved
 * to a fresh one.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */

/**
 * Wire protocol, deliberately NOT renamed with the configurable platform name:
 * existing webhook consumers verify deliveries by reading these exact header
 * names, so changing them (or making them follow a settings value) would
 * silently break every receiver already in production. Treat them as protocol
 * identifiers, like the User-Agent in webhookDeliveryActions.ts.
 */
export const SIGNATURE_HEADER = "X-Sonae-Signature";
export const TIMESTAMP_HEADER = "X-Sonae-Timestamp";

/** Named so a future scheme can be added without receivers guessing which they got. */
export const SIGNATURE_VERSION = "v1";

/** How much clock drift a receiver should allow. Guidance, enforced by them. */
export const REPLAY_WINDOW_SECONDS = 300;

/** What gets signed: version, timestamp and body, joined so no part can be moved. */
export function buildSignaturePayload(timestampSeconds: number, body: string): string {
  return `${SIGNATURE_VERSION}.${timestampSeconds}.${body}`;
}

export function formatSignature(hex: string): string {
  return `${SIGNATURE_VERSION}=${hex}`;
}

/**
 * Whether a delivery should be signed at all.
 *
 * Absent secret means unsigned, quietly. A destination configured before
 * signing existed keeps working exactly as it did — turning every existing
 * integration off in the name of security would be its own outage.
 */
export function shouldSign(secret: string | undefined): secret is string {
  return typeof secret === "string" && secret.trim().length > 0;
}

export function toBytes(value: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(value);
  // Copied into a plain ArrayBuffer: `TextEncoder` hands back a view whose
  // buffer type the Web Crypto signatures will not accept directly.
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;
}

export function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * The headers a signed delivery carries.
 *
 * Returns nothing when there is no secret, so the caller spreads an empty
 * object rather than deciding for itself whether to sign.
 */
export async function buildSignatureHeaders(args: {
  secret: string | undefined;
  body: string;
  nowMs: number;
  sign?: (secret: string, payload: string) => Promise<string>;
}): Promise<Record<string, string>> {
  if (!shouldSign(args.secret)) return {};

  const timestamp = Math.floor(args.nowMs / 1000);
  const payload = buildSignaturePayload(timestamp, args.body);
  const signature = args.sign
    ? await args.sign(args.secret, payload)
    : await hmacSha256Hex(args.secret, payload);

  return {
    [TIMESTAMP_HEADER]: String(timestamp),
    [SIGNATURE_HEADER]: formatSignature(signature),
  };
}

export async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    toBytes(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  return toHex(await crypto.subtle.sign("HMAC", key, toBytes(payload)));
}
