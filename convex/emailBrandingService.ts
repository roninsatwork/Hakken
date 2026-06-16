import type { Doc } from "./_generated/dataModel";
import { DEFAULT_SETTINGS } from "./settingsService";

const DEFAULT_EMAIL_ADDRESS = "noreply@ronins.co.uk";

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

export function buildEmailFromAddress(args: EmailFromAddressArgs = {}) {
  const envFromAddress = normalizeEnvFromAddress(args.envFromAddress);
  if (envFromAddress) return envFromAddress;

  const senderAddress = normalizeEmailPart(args.settings?.emailSenderAddress);
  if (!isLikelyEmailAddress(senderAddress)) {
    return `${args.fallbackName || DEFAULT_SETTINGS.platformName} <${DEFAULT_EMAIL_ADDRESS}>`;
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
