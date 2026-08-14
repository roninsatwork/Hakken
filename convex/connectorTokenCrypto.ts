/**
 * Encryption for connector OAuth tokens at rest.
 *
 * The connector tables store references, never secrets — that discipline
 * (`connectorSecretPolicy`) holds because env-based secrets are read-only.
 * OAuth is the exception the secret resolver names: it must *write* the
 * tokens it receives. This module is how that write stays safe: tokens go
 * into `connectorOAuthTokens` as AES-256-GCM ciphertext under a key that
 * lives only in the deployment environment, so a leaked database row leaks
 * nothing without the deployment's own key.
 *
 * The key is `CONNECTOR_TOKEN_ENCRYPTION_KEY`: 32 bytes, base64. Generate
 * one with `openssl rand -base64 32`. Rotating it invalidates stored tokens
 * — connections then read as disconnected and are reconnected by consent,
 * which is the honest failure the design wants (commitment 4: a dead key
 * surfaces as "reconnect", never as silent failure).
 */

const ENCRYPTION_KEY_ENV = "CONNECTOR_TOKEN_ENCRYPTION_KEY";
const IV_BYTES = 12;

export function isConnectorTokenEncryptionConfigured() {
  return Boolean(readKeyBytes());
}

export const CONNECTOR_TOKEN_ENCRYPTION_UNCONFIGURED_MESSAGE =
  `Connector token encryption is not configured. Set ${ENCRYPTION_KEY_ENV} ` +
  "(32 bytes, base64 — `openssl rand -base64 32`) on this deployment.";

function readKeyBytes(): Uint8Array | null {
  const raw = process.env[ENCRYPTION_KEY_ENV]?.trim();
  if (!raw) return null;
  let decoded: Uint8Array;
  try {
    decoded = base64ToBytes(raw);
  } catch {
    return null;
  }
  return decoded.length === 32 ? decoded : null;
}

async function importKey() {
  const keyBytes = readKeyBytes();
  if (!keyBytes) {
    throw new Error(CONNECTOR_TOKEN_ENCRYPTION_UNCONFIGURED_MESSAGE);
  }
  return await crypto.subtle.importKey(
    "raw",
    keyBytes.buffer as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** Encrypt a token. Output is base64(iv || ciphertext), one opaque string. */
export async function encryptConnectorToken(plaintext: string): Promise<string> {
  const key = await importKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  const combined = new Uint8Array(IV_BYTES + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), IV_BYTES);
  return bytesToBase64(combined);
}

/**
 * Decrypt a stored token. Throws on a wrong key or tampered ciphertext —
 * AES-GCM authenticates, so corruption is an error, never garbage output.
 */
export async function decryptConnectorToken(stored: string): Promise<string> {
  const key = await importKey();
  const combined = base64ToBytes(stored);
  if (combined.length <= IV_BYTES) {
    throw new Error("Stored connector token is malformed.");
  }
  const iv = combined.slice(0, IV_BYTES);
  const ciphertext = combined.slice(IV_BYTES);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext.buffer as ArrayBuffer
  );
  return new TextDecoder().decode(plaintext);
}
