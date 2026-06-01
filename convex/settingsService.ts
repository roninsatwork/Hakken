import type { Doc } from "./_generated/dataModel";

export const DEFAULT_SETTINGS = {
  platformName: "Sonae",
  brandColorHex: "#E26D28",
  fontFamily: undefined as string | undefined,
  headingFontFamily: undefined as string | undefined,
  bodyFontFamily: undefined as string | undefined,
  fontSizeBase: undefined as string | undefined,
  headingSizeGlobal: undefined as string | undefined,
  subTextSizeGlobal: undefined as string | undefined,
  borderRadius: undefined as string | undefined,
  logoUrlLight: undefined as string | undefined,
  logoUrlDark: undefined as string | undefined,

  lightBg: undefined as string | undefined,
  lightFg: undefined as string | undefined,
  lightCardBg: undefined as string | undefined,
  lightCardFg: undefined as string | undefined,
  lightBorder: undefined as string | undefined,
  lightMuted: undefined as string | undefined,
  lightMutedFg: undefined as string | undefined,
  lightSuccess: undefined as string | undefined,
  lightDestructive: undefined as string | undefined,
  lightRing: undefined as string | undefined,

  darkBg: undefined as string | undefined,
  darkFg: undefined as string | undefined,
  darkCardBg: undefined as string | undefined,
  darkCardFg: undefined as string | undefined,
  darkBorder: undefined as string | undefined,
  darkMuted: undefined as string | undefined,
  darkMutedFg: undefined as string | undefined,
  darkSuccess: undefined as string | undefined,
  darkDestructive: undefined as string | undefined,
  darkRing: undefined as string | undefined,
  diagnosticRoutingEnabled: false as boolean,
};

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

export function buildSettingsAuditMetadata(patch: Record<string, unknown>) {
  return JSON.stringify({ modifiedFields: Object.keys(patch) });
}
