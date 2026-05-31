"use client";

import React, { createContext, useContext, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useTheme } from "next-themes";

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
  lightRing?: string;

  darkBg?: string;
  darkFg?: string;
  darkCardBg?: string;
  darkCardFg?: string;
  darkBorder?: string;
  darkMuted?: string;
  darkMutedFg?: string;
  darkSuccess?: string;
  darkDestructive?: string;
  darkRing?: string;
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

    // 1. Global Non-Themed Overrides
    if (settings.brandColorHex) {
       root.style.setProperty('--color-brand', settings.brandColorHex);
    }
    if (settings.borderRadius) {
       root.style.setProperty('--radius-lg', settings.borderRadius);
    }
    if (settings.headingFontFamily) {
       root.style.setProperty('--font-heading', settings.headingFontFamily);
    }
    if (settings.bodyFontFamily) {
       root.style.setProperty('--font-sans', settings.bodyFontFamily);
    }
    if (settings.headingSizeGlobal) {
       root.style.setProperty('--h1-size-override', settings.headingSizeGlobal);
    }
    if (settings.subTextSizeGlobal) {
       root.style.setProperty('--subtitle-size-override', settings.subTextSizeGlobal);
    }
    
    // 2. Themed Overrides
    const active = theme === 'system' ? systemTheme : theme;
    
    if (active === 'dark') {
       if (settings.darkBg) {
          root.style.setProperty('--bg-main', settings.darkBg);
          root.style.setProperty('--radial-outer', settings.darkBg);
       }
       if (settings.darkFg) root.style.setProperty('--text-primary', settings.darkFg);
       if (settings.darkCardBg) {
          root.style.setProperty('--bg-card', settings.darkCardBg);
          root.style.setProperty('--bg-sidebar', settings.darkCardBg);
          root.style.setProperty('--radial-inner', settings.darkCardBg);
       }
       if (settings.darkCardFg) root.style.setProperty('--text-secondary', settings.darkCardFg);
       if (settings.darkBorder) root.style.setProperty('--border-subtle', settings.darkBorder);
       if (settings.darkMuted) root.style.setProperty('--bg-hover', settings.darkMuted);
       if (settings.darkMutedFg) root.style.setProperty('--text-muted', settings.darkMutedFg);
       
       if (settings.darkSuccess) root.style.setProperty('--color-success', settings.darkSuccess);
       if (settings.darkDestructive) root.style.setProperty('--color-destructive', settings.darkDestructive);
       if (settings.darkRing) root.style.setProperty('--ring', settings.darkRing);
    } else {
       if (settings.lightBg) {
          root.style.setProperty('--bg-main', settings.lightBg);
          root.style.setProperty('--radial-outer', settings.lightBg);
       }
       if (settings.lightFg) root.style.setProperty('--text-primary', settings.lightFg);
       if (settings.lightCardBg) {
          root.style.setProperty('--bg-card', settings.lightCardBg);
          root.style.setProperty('--bg-sidebar', settings.lightCardBg);
          root.style.setProperty('--radial-inner', settings.lightCardBg);
       }
       if (settings.lightCardFg) root.style.setProperty('--text-secondary', settings.lightCardFg);
       if (settings.lightBorder) root.style.setProperty('--border-subtle', settings.lightBorder);
       if (settings.lightMuted) root.style.setProperty('--bg-hover', settings.lightMuted);
       if (settings.lightMutedFg) root.style.setProperty('--text-muted', settings.lightMutedFg);
       
       if (settings.lightSuccess) root.style.setProperty('--color-success', settings.lightSuccess);
       if (settings.lightDestructive) root.style.setProperty('--color-destructive', settings.lightDestructive);
       if (settings.lightRing) root.style.setProperty('--ring', settings.lightRing);
    }
    
  }, [settings, theme, systemTheme]);

  if (settings === undefined) {
     return null; // Await resolution to prevent flashing defaults
  }

  return (
    <SystemSettingsContext.Provider value={settings}>
       <div 
         className="w-full h-full relative" 
         style={{ 
           fontFamily: settings.fontFamily || 'var(--font-sans)',
           fontSize: settings.fontSizeBase || '100%'
         }}
       >
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
