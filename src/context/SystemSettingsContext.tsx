"use client";

import React, { createContext, useContext, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useTheme } from "next-themes";
import { resolveFontFamily } from "@/src/lib/themeFonts";

/**
 * "R, G, B" for a hex colour, for the glow shadows that need
 * `rgba(var(--brand-rgb), a)`. Returns undefined for anything that is not a
 * plain 3- or 6-digit hex, so a bad value clears the variable rather than
 * producing a broken rgba().
 */
function hexToRgbTriplet(hex: string | undefined): string | undefined {
  if (!hex) return undefined;
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return undefined;
  let value = match[1];
  if (value.length === 3) value = value.split("").map((c) => c + c).join("");
  const num = parseInt(value, 16);
  return `${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}`;
}

type SettingsType = {
  platformName: string;
  brandColorHex: string;
  fontFamily?: string;
  headingFontFamily?: string;
  bodyFontFamily?: string;
  fontSizeBase?: string;
  headingSizeGlobal?: string;
  subTextSizeGlobal?: string;
  borderRadius?: string;
  logoUrlLight?: string;
  logoUrlDark?: string;

  lightBg?: string;
  lightFg?: string;
  lightCardBg?: string;
  lightCardFg?: string;
  lightBorder?: string;
  lightMuted?: string;
  lightMutedFg?: string;
  lightSuccess?: string;
  lightDestructive?: string;
  lightWarning?: string;
  lightInfo?: string;
  lightRing?: string;
  lightSidebarBg?: string;

  darkBg?: string;
  darkFg?: string;
  darkCardBg?: string;
  darkCardFg?: string;
  darkBorder?: string;
  darkMuted?: string;
  darkMutedFg?: string;
  darkSuccess?: string;
  darkDestructive?: string;
  darkWarning?: string;
  darkInfo?: string;
  darkRing?: string;
  darkSidebarBg?: string;
  diagnosticRoutingEnabled?: boolean;
};

const SystemSettingsContext = createContext<SettingsType | undefined>(undefined);

export function SystemSettingsProvider({ children }: { children: React.ReactNode }) {
  const settings = useQuery(api.settings.get);
  const { theme, systemTheme } = useTheme();

  // Inject CSS Variables dynamically based on the active theme
  useEffect(() => {
    if (!settings) return;

    const root = document.documentElement;
    // Set when there is a value, REMOVE when there is not. The old injector
    // only ever set, so a field cleared in the DB (or absent for the current
    // theme) kept its stale inline value until a full reload.
    const apply = (name: string, value: string | undefined) => {
      if (value) root.style.setProperty(name, value);
      else root.style.removeProperty(name);
    };

    // 1. Global Non-Themed Overrides.
    //
    // Source variables carry their own names (--brand, --success-src, …) and
    // globals.css maps them into the @theme tokens with a real fallback.
    // Writing --color-brand directly here used to make the @theme fallback
    // `var(--color-brand, #FF5A1F)` self-referential — a cycle, so the hex
    // never fired and brand colour only existed after JS hydration.
    apply('--brand', settings.brandColorHex);
    apply('--brand-rgb', hexToRgbTriplet(settings.brandColorHex));
    apply('--font-heading', resolveFontFamily(settings.headingFontFamily));
    // Never write a value into the variable it references: fonts are stored
    // as named keys and resolved to concrete stacks (src/lib/themeFonts.ts).
    apply('--font-sans', resolveFontFamily(settings.bodyFontFamily));
    apply('--h1-size-override', settings.headingSizeGlobal);

    // 2. Themed Overrides
    const active = theme === 'system' ? systemTheme : theme;
    const dark = active === 'dark';
    const pick = (darkValue: string | undefined, lightValue: string | undefined) =>
      dark ? darkValue : lightValue;

    apply('--bg-main', pick(settings.darkBg, settings.lightBg));
    apply('--radial-outer', pick(settings.darkBg, settings.lightBg));
    apply('--text-primary', pick(settings.darkFg, settings.lightFg));
    apply('--bg-card', pick(settings.darkCardBg, settings.lightCardBg));
    // The sidebar has its own colour, falling back to the card colour so
    // deployments themed before the field existed keep their look.
    apply('--bg-sidebar', pick(settings.darkSidebarBg, settings.lightSidebarBg)
      ?? pick(settings.darkCardBg, settings.lightCardBg));
    apply('--radial-inner', pick(settings.darkCardBg, settings.lightCardBg));
    apply('--text-secondary', pick(settings.darkCardFg, settings.lightCardFg));
    apply('--border-subtle', pick(settings.darkBorder, settings.lightBorder));
    apply('--bg-hover', pick(settings.darkMuted, settings.lightMuted));
    apply('--text-muted', pick(settings.darkMutedFg, settings.lightMutedFg));
    apply('--success-src', pick(settings.darkSuccess, settings.lightSuccess));
    apply('--destructive-src', pick(settings.darkDestructive, settings.lightDestructive));
    apply('--warning-src', pick(settings.darkWarning, settings.lightWarning));
    apply('--info-src', pick(settings.darkInfo, settings.lightInfo));
    apply('--ring', pick(settings.darkRing, settings.lightRing));
  }, [settings, theme, systemTheme]);

  if (settings === undefined) {
     return null; // Await resolution to prevent flashing defaults
  }

  return (
    <SystemSettingsContext.Provider value={settings}>
       {/* The wrapper used to carry inline fontFamily/fontSize from the
           retired `fontFamily`/`fontSizeBase` fields, which let legacy data
           silently override the body font chosen on the Aesthetics screen. */}
       <div className="w-full h-full relative">
          {children}
       </div>
    </SystemSettingsContext.Provider>
  );
}

export function useSystemSettings() {
  const context = useContext(SystemSettingsContext);
  if (context === undefined) {
    throw new Error("useSystemSettings must be used within a SystemSettingsProvider");
  }
  return context;
}
