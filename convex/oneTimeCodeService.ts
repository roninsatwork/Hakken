/**
 * Signing in with a code instead of a link.
 *
 * A magic link has to be opened in the browser that asked for it, and the
 * common failure is that the request comes from a desktop and the email opens
 * on a phone. A six-digit code is typed wherever the person already is. It also
 * survives corporate mail scanners, which follow links and burn them before the
 * recipient ever clicks.
 *
 * Beside the magic link, never instead of it. Nothing here changes how the
 * existing options behave.
 *
 * Kept free of database access so the code shape, the expiry and the throttle
 * can be tested directly — sign-in is the one screen where a half-built feature
 * locks people out.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */

/** Long enough not to be guessed in the attempts allowed, short enough to type. */
export const CODE_LENGTH = 6;

/**
 * Short. A code sitting in an inbox is a credential, and the person asked for
 * it seconds ago — ten minutes is generous for typing six digits.
 */
export const CODE_TTL_MS = 10 * 60 * 1000;

/** After this many wrong guesses the code is dead and a new one must be asked for. */
export const MAX_ATTEMPTS = 5;

/** How many codes one address may ask for in the window. */
export const MAX_REQUESTS_PER_WINDOW = 5;
export const REQUEST_WINDOW_MS = 15 * 60 * 1000;

/**
 * A code made from cryptographic randomness rather than `Math.random`.
 *
 * Rejection sampling rather than a modulo: taking a byte mod 10 makes 0–5 more
 * likely than 6–9, which quietly costs entropy in something used as a
 * credential.
 */
export function generateCode(randomBytes: (count: number) => Uint8Array): string {
  let code = "";

  while (code.length < CODE_LENGTH) {
    for (const byte of randomBytes(CODE_LENGTH)) {
      if (byte >= 250) continue;
      code += String(byte % 10);
      if (code.length === CODE_LENGTH) break;
    }
  }

  return code;
}

/** People type spaces, dashes and the odd stray character. */
export function normaliseCode(entered: string): string {
  return entered.replace(/\D/g, "");
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type CodeRecord = {
  code: string;
  expiresAt: number;
  attempts: number;
};

export type CodeVerdict =
  | { ok: true }
  | { ok: false; reason: "expired" | "too-many-attempts" | "wrong" };

/**
 * Whether a typed code lets someone in.
 *
 * Expiry is checked before the code itself, so an expired code is never
 * reported as wrong — a person retyping a code they can plainly see needs to be
 * told it has run out, not that they cannot type.
 */
export function checkCode(record: CodeRecord | null, entered: string, now: number): CodeVerdict {
  if (!record) return { ok: false, reason: "wrong" };
  if (now > record.expiresAt) return { ok: false, reason: "expired" };
  if (record.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "too-many-attempts" };
  if (normaliseCode(entered) !== record.code) return { ok: false, reason: "wrong" };

  return { ok: true };
}

/** What the person is told, in each case. Never which address exists. */
export function describeVerdict(verdict: CodeVerdict): string {
  if (verdict.ok) return "";

  switch (verdict.reason) {
    case "expired":
      return "That code has expired. Ask for a new one.";
    case "too-many-attempts":
      return "That code has been tried too many times. Ask for a new one.";
    case "wrong":
      return "That code is not right. Check it and try again.";
  }
}

/**
 * Whether another code may be sent to this address.
 *
 * Rate limited per address rather than per person, because nobody is signed in
 * yet. Without it the sign-in form is a way to post mail at someone repeatedly.
 */
export function isWithinRequestLimit(recentRequestTimes: number[], now: number): boolean {
  const cutoff = now - REQUEST_WINDOW_MS;
  return recentRequestTimes.filter((at) => at > cutoff).length < MAX_REQUESTS_PER_WINDOW;
}

export function expiryFrom(now: number): number {
  return now + CODE_TTL_MS;
}

/** Minutes, for the email. Rounded up: "0 minutes" is not reassuring. */
export function minutesUntil(expiresAt: number, now: number): number {
  return Math.max(1, Math.ceil((expiresAt - now) / 60_000));
}
