"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";

/**
 * A screen's words with the platform's own name filled in: every value gets
 * `platformName` from System Settings, so a sentence naming the platform
 * says {platformName} and a clone that renames it renames every screen
 * (no-client-specific-fallbacks.test.ts). Otherwise exactly `useTranslations`:
 * a value's own `platformName` wins, and `has`, `rich` and `raw` work as before.
 */
export function usePlatformTranslations(namespace: string) {
  const t = useTranslations(namespace);
  const { platformName } = useSystemSettings();
  return useMemo(() => {
    const words = ((key: string, values?: Record<string, unknown>) => t(key, { platformName, ...values } as never)) as unknown as typeof t;
    return Object.assign(words, {
      has: t.has,
      raw: t.raw,
      markup: t.markup,
      rich: ((key: string, values?: Record<string, unknown>) => t.rich(key, { platformName, ...values } as never)) as typeof t.rich,
    });
  }, [t, platformName]);
}
