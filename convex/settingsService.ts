import { productIdentity } from "../product.identity";
// The one record of the look (docs/plans/active/design-drift-plan.md, D1):
// a deployment that never saved one starts in it.
import themeRecord from "../hakken.theme.json";
import type { Doc } from "./_generated/dataModel";
import { summariseAuditValue } from "./auditLogService";

/**
 * The product's shipped colour, from `hakken.product.json`: what a chat widget
 * on a client's own website wears when it has no colour of its own
 * (widgets.ts). It is not the dashboard's look — that pale accent would vanish
 * on a client's page (2026-10-03) — and so not in hakken.theme.json.
 */
export const SHIPPED = {
  brandColorHex: productIdentity.brandColorHex,
};

export const DEFAULT_SETTINGS = {
  platformName: productIdentity.name,
  brandColorHex: themeRecord.brandColorHex as string,
  lightBrandColorHex: themeRecord.lightBrandColorHex as string | undefined,
  fontFamily: undefined as string | undefined,
  headingFontFamily: themeRecord.headingFontFamily as string | undefined,
  bodyFontFamily: themeRecord.bodyFontFamily as string | undefined,
  fontSizeBase: undefined as string | undefined,
  headingSizeGlobal: themeRecord.headingSizeGlobal as string | undefined,
  subTextSizeGlobal: undefined as string | undefined,
  borderRadius: undefined as string | undefined,
  logoUrlLight: (productIdentity.logoUrlLight || undefined) as string | undefined,
  logoUrlDark: (productIdentity.logoUrlDark || undefined) as string | undefined,
  emailSenderName: undefined as string | undefined,
  emailSenderAddress: undefined as string | undefined,
  salesContactEmail: undefined as string | undefined,

  lightBg: themeRecord.lightBg as string | undefined,
  lightFg: themeRecord.lightFg as string | undefined,
  lightCardBg: themeRecord.lightCardBg as string | undefined,
  lightCardFg: themeRecord.lightCardFg as string | undefined,
  lightBorder: themeRecord.lightBorder as string | undefined,
  lightMuted: themeRecord.lightMuted as string | undefined,
  lightMutedFg: themeRecord.lightMutedFg as string | undefined,
  lightSuccess: themeRecord.lightSuccess as string | undefined,
  lightDestructive: themeRecord.lightDestructive as string | undefined,
  lightWarning: themeRecord.lightWarning as string | undefined,
  lightInfo: themeRecord.lightInfo as string | undefined,
  lightRing: themeRecord.lightRing as string | undefined,
  lightSidebarBg: themeRecord.lightSidebarBg as string | undefined,

  darkBg: themeRecord.darkBg as string | undefined,
  darkFg: themeRecord.darkFg as string | undefined,
  darkCardBg: themeRecord.darkCardBg as string | undefined,
  darkCardFg: themeRecord.darkCardFg as string | undefined,
  darkBorder: themeRecord.darkBorder as string | undefined,
  darkMuted: themeRecord.darkMuted as string | undefined,
  darkMutedFg: themeRecord.darkMutedFg as string | undefined,
  darkSuccess: themeRecord.darkSuccess as string | undefined,
  darkDestructive: themeRecord.darkDestructive as string | undefined,
  darkWarning: themeRecord.darkWarning as string | undefined,
  darkInfo: themeRecord.darkInfo as string | undefined,
  darkRing: themeRecord.darkRing as string | undefined,
  darkSidebarBg: themeRecord.darkSidebarBg as string | undefined,
  diagnosticRoutingEnabled: false as boolean,
};

/**
 * The platform's display name, resolved from a stored settings value.
 *
 * Every surface that says the platform's name out loud — emails, AI prompts,
 * refusals, spoken previews, the Gmail label — resolves it through here (or
 * through `internal.settings.getEmailBranding`, which applies the same rule),
 * so a deployment renamed in Settings is renamed everywhere at once. The
 * default is the shipped name, kept so an unconfigured deployment behaves
 * exactly as before.
 */
export function resolvePlatformName(name?: string | null) {
  return name?.trim() || DEFAULT_SETTINGS.platformName;
}

export type SettingsPatchInput = Record<string, string | number | boolean | undefined>;

export function isStorageLogoReference(value: string | undefined) {
  return Boolean(value && !value.startsWith("http"));
}

export function buildSettingsPatch<T extends SettingsPatchInput>(args: T) {
  return Object.fromEntries(
    Object.entries(args).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

export function buildSettingsInsertRecord<T extends SettingsPatchInput>(patch: Partial<T>) {
  return {
    ...DEFAULT_SETTINGS,
    ...patch,
  };
}

/**
 * The settings fields the login screen may have, and nothing else.
 *
 * `settings.get` is a `publicQuery` — the branding has to load before anyone
 * signs in — and it declared its return type as the whole `systemSettings`
 * row spread wholesale. So an anonymous visitor received the monthly base and
 * seat prices, the sales contact address, the platform's email sender address,
 * and every column added to the table afterwards, automatically. Declaring the
 * whole row is not a narrowing, it is a licence.
 *
 * Branding and theme genuinely have to be public. `diagnosticRoutingEnabled`
 * stays because the sidebar reads it from the same context on every page and
 * it reveals nothing beyond the existence of a developer menu. Pricing,
 * contact and sender addresses do not — they are on the admin query.
 */
export const PUBLIC_SETTINGS_FIELDS = [
  "platformName",
  "logoUrlLight",
  "logoUrlDark",
  "brandColorHex",
  "lightBrandColorHex",
  "fontFamily",
  "headingFontFamily",
  "bodyFontFamily",
  "fontSizeBase",
  "headingSizeGlobal",
  "subTextSizeGlobal",
  "borderRadius",
  "diagnosticRoutingEnabled",
  "lightBg", "lightFg", "lightCardBg", "lightCardFg", "lightBorder", "lightMuted",
  "lightMutedFg", "lightSuccess", "lightDestructive", "lightWarning", "lightInfo",
  "lightRing", "lightSidebarBg",
  "darkBg", "darkFg", "darkCardBg", "darkCardFg", "darkBorder", "darkMuted",
  "darkMutedFg", "darkSuccess", "darkDestructive", "darkWarning", "darkInfo",
  "darkRing", "darkSidebarBg",
] as const;

/** Trim a merged settings object to the fields safe to serve unauthenticated. */
export function pickPublicSettings<T extends Record<string, unknown>>(settings: T) {
  const picked: Record<string, unknown> = {};

  for (const field of PUBLIC_SETTINGS_FIELDS) {
    if (field in settings) picked[field] = settings[field];
  }

  return picked as Pick<T, (typeof PUBLIC_SETTINGS_FIELDS)[number] & keyof T>;
}

export function mergeSettingsWithDefaults(args: {
  settings?: Doc<"systemSettings"> | null;
  logoUrlLight?: string;
  logoUrlDark?: string;
}) {
  if (!args.settings) return DEFAULT_SETTINGS;

  return {
    ...DEFAULT_SETTINGS,
    ...args.settings,
    logoUrlLight: args.logoUrlLight,
    logoUrlDark: args.logoUrlDark,
  };
}

/**
 * What a settings save changed, and what it changed from.
 *
 * This recorded the names of the fields that were saved and nothing else, so
 * the trail could say the brand colour was changed and no screen could ever say
 * what it was changed to. Agent changes were fixed on 2026-08-06; this was the
 * last place still writing field names alone.
 *
 * `previous` is optional because the very first save has nothing before it, and
 * because entries written before this existed still have to render.
 *
 * See docs/plans/active/audit-trail-plan.md.
 */
export function buildSettingsAuditMetadata(
  patch: Record<string, unknown>,
  previous?: Record<string, unknown> | null,
) {
  const modifiedFields = Object.keys(patch);

  const changes = previous
    ? modifiedFields
        .map((field) => ({
          field,
          from: summariseAuditValue(previous[field]),
          to: summariseAuditValue(patch[field]),
        }))
        // A field saved as the value it already held is not a change, and an
        // entry claiming otherwise wastes a reader's attention. Every save on
        // this screen posts the whole form, so without this nearly every entry
        // would list forty untouched colours.
        .filter((change) => change.from !== change.to)
    : [];

  return JSON.stringify({
    modifiedFields,
    ...(changes.length > 0 ? { changes } : {}),
  });
}
