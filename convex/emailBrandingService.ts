import type { Doc } from "./_generated/dataModel";
import { DEFAULT_SETTINGS } from "./settingsService";

/**
 * Placeholder used when no sender has been configured.
 *
 * This deliberately uses the reserved `.invalid` TLD (RFC 2606), which can
 * never resolve, so an unconfigured deployment fails visibly at send time
 * instead of silently sending as somebody else's domain.
 *
 * There must be no real address here. A hardcoded one belonging to whoever
 * built the platform is inherited by every deployment: their mail provider is
 * not authorised to send as that domain, so SPF/DKIM fails and the mail is
 * spam-filtered or rejected — while appearing to come from the wrong company.
 *
 * Configure any of `AUTH_EMAIL`, `RESEND_FROM_EMAIL`, or Settings → email
 * sender address. `isEmailSenderConfigured` reports whether that has been done,
 * and `scripts/validate-setup.mjs` surfaces it before deploy.
 */
export const UNCONFIGURED_EMAIL_ADDRESS = "noreply@unconfigured.invalid";

/**
 * Environment variables that may carry the sender address, most specific first.
 *
 * `AUTH_EMAIL` is included because deployments already set it; requiring a
 * second variable for the same fact would be pointless configuration. Any of
 * these may be a bare address or a `Name <address>` pair.
 */
export const EMAIL_SENDER_ENV_VARS = ["RESEND_FROM_EMAIL", "AUTH_EMAIL"] as const;

/** Pick the first configured sender from the environment, if any. */
export function resolveEnvFromAddress(env: Record<string, string | undefined>) {
  for (const name of EMAIL_SENDER_ENV_VARS) {
    const candidate = env[name]?.replace(/[\r\n]/g, "").trim();
    if (!candidate) continue;

    // Accept `Name <address>` as well as a bare address, but ignore a value
    // that is not an address at all — some deployments use these names for
    // unrelated settings, and sending from a non-address silently fails.
    const bare = /<([^>]+)>\s*$/.exec(candidate)?.[1] ?? candidate;
    if (isLikelyEmailAddress(bare)) return candidate;
  }

  return undefined;
}

type EmailBrandingSettings = Pick<
  Doc<"systemSettings">,
  "platformName" | "emailSenderName" | "emailSenderAddress"
>;

type EmailFromAddressArgs = {
  envFromAddress?: string;
  fallbackName?: string;
  settings?: Partial<EmailBrandingSettings> | null;
};

function normalizeEmailPart(value: string | undefined) {
  return value?.replace(/[<>\r\n]/g, "").trim();
}

function normalizeEnvFromAddress(value: string | undefined) {
  return value?.replace(/[\r\n]/g, "").trim();
}

export function isLikelyEmailAddress(value: string | undefined) {
  return Boolean(value && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value.trim()));
}

/**
 * Whether a real sender address has been configured for this deployment.
 *
 * Kept separate from `buildEmailFromAddress` because that runs at module scope
 * in `convex/auth.ts` — throwing there would break function loading entirely,
 * so it stays total and callers surface the problem instead.
 */
export function isEmailSenderConfigured(args: {
  envFromAddress?: string;
  settings?: Partial<EmailBrandingSettings> | null;
}) {
  const envFromAddress = normalizeEnvFromAddress(args.envFromAddress);
  if (envFromAddress) return true;

  return isLikelyEmailAddress(normalizeEmailPart(args.settings?.emailSenderAddress));
}

export function buildEmailFromAddress(args: EmailFromAddressArgs = {}) {
  const envFromAddress = normalizeEnvFromAddress(args.envFromAddress);
  if (envFromAddress) return envFromAddress;

  const senderAddress = normalizeEmailPart(args.settings?.emailSenderAddress);
  if (!isLikelyEmailAddress(senderAddress)) {
    // Unconfigured. Fail visibly rather than impersonating a domain this
    // deployment does not own.
    return `${args.fallbackName || DEFAULT_SETTINGS.platformName} <${UNCONFIGURED_EMAIL_ADDRESS}>`;
  }

  const senderName =
    normalizeEmailPart(args.settings?.emailSenderName) ||
    normalizeEmailPart(args.settings?.platformName) ||
    args.fallbackName ||
    DEFAULT_SETTINGS.platformName;

  return `${senderName} <${senderAddress}>`;
}

export function buildEmailBranding(settings?: Partial<EmailBrandingSettings> | null) {
  return {
    platformName: normalizeEmailPart(settings?.platformName) || DEFAULT_SETTINGS.platformName,
    fromAddress: buildEmailFromAddress({ settings }),
  };
}
