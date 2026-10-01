import { constantTimeEqual } from "./security";

/**
 * Whether a webhook really came from Resend (docs/plans/active/knowledge-
 * news-and-digest-plan.md, phase 8). Resend signs the way Svix does: an
 * HMAC-SHA256, keyed with the secret after its `whsec_`, of
 * `<svix-id>.<svix-timestamp>.<body>`, sent base64 as one or more
 * `v1,<signature>` in `svix-signature`. A timestamp more than five minutes
 * from now is refused, so an old delivery cannot be replayed.
 */

/** How far a delivery's timestamp may be from now. */
export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

function bytesFromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** The base64 signature a body would carry, for these headers and secret. */
export async function signWebhook(args: { secret: string; id: string; timestamp: string; body: string }): Promise<string> {
  const keyBytes = bytesFromBase64(args.secret.startsWith("whsec_") ? args.secret.slice("whsec_".length) : args.secret);
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${args.id}.${args.timestamp}.${args.body}`));
  return base64FromBytes(new Uint8Array(mac));
}

export async function verifyWebhookSignature(args: {
  secret: string | undefined;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  body: string;
  nowMs: number;
}): Promise<boolean> {
  if (!args.secret || !args.id || !args.timestamp || !args.signature) return false;
  const sentAt = Number(args.timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(args.nowMs / 1000 - sentAt) > SIGNATURE_TOLERANCE_SECONDS) return false;
  let expected: string;
  try {
    expected = await signWebhook({ secret: args.secret, id: args.id, timestamp: args.timestamp, body: args.body });
  } catch {
    return false;
  }
  return args.signature.split(" ").some((part) => {
    const [version, signature] = part.split(",");
    return version === "v1" && Boolean(signature) && constantTimeEqual(signature, expected);
  });
}
