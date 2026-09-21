"use node";

import { createCipheriv, createHash, randomBytes } from "node:crypto";

/** Confidential, authenticated tickets. The browser cannot read session instructions. */
export function encryptVoiceTicket(payload: Record<string, unknown>, secret: string): string {
  const key = createHash("sha256").update(`sonae-voice-ticket-v2:${secret}`).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final(), cipher.getAuthTag()]);
  return `v2.${iv.toString("base64url")}.${ciphertext.toString("base64url")}`;
}
