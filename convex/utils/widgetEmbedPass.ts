/**
 * The widget embed pass: proof that a widget session began with our own
 * server serving the widget page, not with a direct call to the public API.
 *
 * `createWidgetThread` is callable by anyone on the internet — that is what
 * an anonymous widget needs. What it must not accept is a caller who never
 * loaded the widget page at all: scripts hitting the mutation directly used
 * to need nothing beyond a widget id and an allowlisted-looking `sourceUrl`
 * string of their own invention (see the 2026-08 security audit).
 *
 * The pass closes that path. When Next serves `/w/<widgetId>` — after the
 * middleware has applied the embed policy — the page mints a signed token
 * over the widget id, the referer host the server actually observed, and the
 * time. The mutation refuses to open a thread without a pass whose signature,
 * widget, age, and host all check out. The signing secret
 * (`WIDGET_EMBED_SIGNING_SECRET`) is shared between the Next server and the
 * Convex deployment and never reaches a browser.
 *
 * Honest limits: a caller who fetches the page with a forged `Referer` header
 * can still obtain a pass — the referer is client-supplied. The pass does not
 * make origin unforgeable; it forces every session through the served page
 * (visible, loggable, rate-limitable) and makes the mutation refusable on a
 * server-observed host instead of a caller-invented one. A pass is reusable
 * within its age on purpose: making it single-use would not stop a script
 * that reloads the page per thread, and would cost a table of spent passes.
 * Spend is bounded separately: the company plan quota prices every message,
 * `WIDGET_THREADS_PER_HOUR` caps how fast threads can be minted, and
 * `WIDGET_MESSAGES_PER_HOUR` (chatService) caps the messages across all of a
 * widget's threads whatever the plan (2026-09 audit).
 */

import { constantTimeEqual } from "./security";

const HOUR_MS = 60 * 60 * 1000;

/** A pass outlives any plausible visit: threads are created lazily, sometimes
 * hours after the page loads, and an expired pass strands a real visitor. */
export const WIDGET_EMBED_PASS_MAX_AGE_MS = 12 * HOUR_MS;

type WidgetEmbedPassPayload = {
  /** Widget id the pass was minted for. */
  w: string;
  /** Referer host the server observed, or null for a direct open. */
  h: string | null;
  /** Minted-at epoch milliseconds. */
  iat: number;
};

export type WidgetEmbedPassVerdict =
  | { ok: true; embedHost: string | null }
  | { ok: false; reason: "malformed" | "bad_signature" | "wrong_widget" | "expired" };

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function signPayload(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return toBase64Url(new Uint8Array(signature));
}


export async function mintWidgetEmbedPass(args: {
  widgetId: string;
  embedHost: string | null;
  secret: string;
  now?: number;
}): Promise<string> {
  const payload: WidgetEmbedPassPayload = {
    w: args.widgetId,
    h: args.embedHost,
    iat: args.now ?? Date.now(),
  };
  const encoded = toBase64Url(encoder.encode(JSON.stringify(payload)));
  return `${encoded}.${await signPayload(args.secret, encoded)}`;
}

export async function verifyWidgetEmbedPass(args: {
  pass: string;
  widgetId: string;
  secret: string;
  now?: number;
  maxAgeMs?: number;
}): Promise<WidgetEmbedPassVerdict> {
  const separator = args.pass.lastIndexOf(".");
  if (separator <= 0) return { ok: false, reason: "malformed" };

  const encoded = args.pass.slice(0, separator);
  const signature = args.pass.slice(separator + 1);
  if (!constantTimeEqual(signature, await signPayload(args.secret, encoded))) {
    return { ok: false, reason: "bad_signature" };
  }

  const payloadBytes = fromBase64Url(encoded);
  if (!payloadBytes) return { ok: false, reason: "malformed" };
  let payload: WidgetEmbedPassPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as WidgetEmbedPassPayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (
    typeof payload.w !== "string" ||
    (payload.h !== null && typeof payload.h !== "string") ||
    typeof payload.iat !== "number"
  ) {
    return { ok: false, reason: "malformed" };
  }

  if (payload.w !== args.widgetId) return { ok: false, reason: "wrong_widget" };

  const now = args.now ?? Date.now();
  const maxAgeMs = args.maxAgeMs ?? WIDGET_EMBED_PASS_MAX_AGE_MS;
  // A minted-in-the-future pass is as refusable as an expired one.
  if (payload.iat > now + 60_000 || now - payload.iat > maxAgeMs) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, embedHost: payload.h };
}
