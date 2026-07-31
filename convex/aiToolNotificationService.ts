/**
 * Who an agent is allowed to email.
 *
 * This is the security question the notification connector turns on, and it is
 * worth stating plainly: an agent that can email arbitrary addresses is a
 * phishing tool. The agent's instructions come partly from retrieved documents
 * and user messages, both of which are untrusted, so "send an email to X" is an
 * instruction an attacker can plant. The platform already hardens the prompt
 * against injection; the recipient policy is what stops a successful injection
 * from reaching the outside world.
 *
 * The rule is therefore the tightest one that still leaves the connector useful:
 * an agent may notify people who already have accounts in the same tenant. It
 * cannot introduce a new recipient, and it cannot reach another tenant. No
 * configuration is required for that to hold, which matters because a policy
 * that has to be switched on is a policy that will be left off.
 */

import { renderEmail, type RenderedEmail } from "./emailLayoutService";

const MAX_RECIPIENTS = 10;
const MAX_SUBJECT_LENGTH = 200;
const MAX_BODY_LENGTH = 10000;

export function normalizeEmailAddress(value: string) {
  return value.trim().toLowerCase();
}

/**
 * Split a caller-supplied recipient string into addresses.
 *
 * Accepts comma or semicolon separation because a model will produce either.
 */
export function parseRecipients(value: string) {
  return Array.from(new Set(
    value
      .split(/[,;]/)
      .map(normalizeEmailAddress)
      .filter((address) => address.length > 0),
  ));
}

/** A deliberately conservative address check; delivery is the real validator. */
export function isPlausibleEmailAddress(value: string) {
  return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(value);
}

export type RecipientDecision =
  | { allowed: true; recipients: string[] }
  | { allowed: false; reason: string };

/**
 * Decide whether a requested send may proceed.
 *
 * Fails closed on the whole request rather than quietly dropping the
 * disallowed addresses and sending to the rest. A partial send would tell the
 * agent the notification went out while some intended recipient never got it,
 * and it would hide the attempted policy breach behind an apparent success.
 */
export function resolveNotificationRecipients(args: {
  requested: string[];
  tenantAddresses: string[];
}): RecipientDecision {
  if (args.requested.length === 0) {
    return { allowed: false, reason: "No recipient address was provided." };
  }

  if (args.requested.length > MAX_RECIPIENTS) {
    return {
      allowed: false,
      reason: `A notification cannot be addressed to more than ${MAX_RECIPIENTS} recipients.`,
    };
  }

  const malformed = args.requested.filter((address) => !isPlausibleEmailAddress(address));
  if (malformed.length > 0) {
    return { allowed: false, reason: `Not a valid email address: ${malformed.join(", ")}` };
  }

  const permitted = new Set(args.tenantAddresses.map(normalizeEmailAddress));
  const outside = args.requested.filter((address) => !permitted.has(address));
  if (outside.length > 0) {
    return {
      allowed: false,
      reason:
        `Notifications can only be sent to people with an account in this workspace. `
        + `These addresses are not: ${outside.join(", ")}`,
    };
  }

  return { allowed: true, recipients: args.requested };
}

export type NotificationContentDecision =
  | { ok: true; subject: string; body: string }
  | { ok: false; reason: string };

export function resolveNotificationContent(args: {
  subject: string;
  body: string;
}): NotificationContentDecision {
  const subject = args.subject.trim();
  const body = args.body.trim();

  if (subject.length === 0) return { ok: false, reason: "A notification needs a subject." };
  if (body.length === 0) return { ok: false, reason: "A notification needs a body." };
  if (subject.length > MAX_SUBJECT_LENGTH) {
    return { ok: false, reason: `Subject cannot exceed ${MAX_SUBJECT_LENGTH} characters.` };
  }
  if (body.length > MAX_BODY_LENGTH) {
    return { ok: false, reason: `Body cannot exceed ${MAX_BODY_LENGTH} characters.` };
  }

  return { ok: true, subject, body };
}

/**
 * An agent's notification, rendered through the shared shell.
 *
 * The body is model-generated text, so it is escaped rather than trusted as
 * markup. An agent that could emit raw HTML into an email could be induced to
 * emit a link that does not say where it goes.
 *
 * The body is a model-authored string, so it is content and never markup —
 * `renderEmail` escapes it. This replaced a local `renderNotificationHtml` that
 * escaped correctly but emitted bare `<p>` tags with no styling at all, which
 * is why an agent's mail looked nothing like the rest of the platform's.
 *
 * The footer states the recipient policy plainly. An agent that can email is a
 * phishing surface, and someone receiving one of these should be able to see
 * from the message itself that it could not have reached outside the tenant.
 */
export function buildAgentNotificationEmail(
  content: { subject: string; body: string },
  options: { platformName?: string } = {}
): RenderedEmail {
  return renderEmail(
    {
      kind: "From your agent",
      verdict: content.subject,
      paragraphs: content.body.split(/\n{2,}/).filter((part) => part.trim().length > 0),
      footer: {
        lines: ["An agent sent this. It can only email people who are already in your workspace."],
      },
    },
    { platformName: options.platformName }
  );
}
