"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { normalizeFontKey } from "@/src/lib/themeFonts";
import type { SystemSettingsFormData } from "./types";

/** The fields each settings screen is allowed to write. */
export const IDENTITY_SETTINGS_FIELDS = [
  "platformName",
  "emailSenderName",
  "emailSenderAddress",
] as const;

export const AESTHETICS_SETTINGS_FIELDS = [
  "headingFontFamily",
  "bodyFontFamily",
  "headingSizeGlobal",
  "brandColorHex",
  "darkBg", "darkCardBg", "darkSidebarBg", "darkFg", "darkCardFg", "darkMuted", "darkMutedFg",
  "darkBorder", "darkSuccess", "darkDestructive", "darkWarning", "darkInfo", "darkRing",
  "lightBg", "lightCardBg", "lightSidebarBg", "lightFg", "lightCardFg", "lightMuted", "lightMutedFg",
  "lightBorder", "lightSuccess", "lightDestructive", "lightWarning", "lightInfo", "lightRing",
] as const;

export const DIAGNOSTICS_SETTINGS_FIELDS = ["diagnosticRoutingEnabled"] as const;

export type SettingsFieldList = readonly (keyof SystemSettingsFormData & string)[];

/**
 * The subset of the form a screen owns, with undefined values dropped so the
 * mutation's patch logic never sees fields the screen did not set.
 */
export function pickSettingsFields(
  formData: SystemSettingsFormData,
  fields: SettingsFieldList,
): SystemSettingsFormData {
  const picked: SystemSettingsFormData = {};
  for (const field of fields) {
    const value = formData[field];
    if (value !== undefined) picked[field] = value;
  }
  return picked;
}

/**
 * The `systemSettings` document as an editable form with its own save.
 *
 * `fields` is the allowlist of what this screen may write, and the save posts
 * ONLY those fields. The hook used to post the entire merged form, which had
 * two real consequences: logo fields arrived from `settings.get` already
 * resolved from storage IDs to URLs, so saving the Aesthetics screen
 * rewrote stored logo IDs as expiring URLs; and every screen sharing the
 * hook silently committed the others' half-edited state.
 *
 * The colour defaults mirror globals.css rather than being left blank, so a
 * colour input never renders black for a value the platform actually renders
 * from a CSS variable.
 */
export function useSystemSettingsForm(fields: SettingsFieldList) {
  const currentSettings = useQuery(api.settings.get);
  const updateSettings = useMutation(api.settings.update);

  const [formData, setFormData] = useState<SystemSettingsFormData>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (!currentSettings) return;
    setFormData({
      ...currentSettings,
      // Fonts are stored as named keys (src/lib/themeFonts.ts); legacy rows
      // may hold the old raw-CSS values, so normalize for the dropdowns.
      headingFontFamily: normalizeFontKey(currentSettings.headingFontFamily),
      bodyFontFamily: normalizeFontKey(currentSettings.bodyFontFamily),
      headingSizeGlobal: currentSettings.headingSizeGlobal || "1.5rem",

      darkBg: currentSettings.darkBg || "#222224",
      darkCardBg: currentSettings.darkCardBg || "#2C2C2E",
      darkSidebarBg: currentSettings.darkSidebarBg || "#18181A",
      darkFg: currentSettings.darkFg || "#FFFFFF",
      darkCardFg: currentSettings.darkCardFg || "#A1A1A6",
      darkMuted: currentSettings.darkMuted || "#3A3A3C",
      darkMutedFg: currentSettings.darkMutedFg || "#737373",
      darkBorder: currentSettings.darkBorder || "#3A3A3C",
      darkSuccess: currentSettings.darkSuccess || "#10B981",
      darkDestructive: currentSettings.darkDestructive || "#EF4444",
      darkWarning: currentSettings.darkWarning || "#F59E0B",
      darkInfo: currentSettings.darkInfo || "#38BDF8",
      darkRing: currentSettings.darkRing || "#FF5A1F",

      lightBg: currentSettings.lightBg || "#FCFCFC",
      lightCardBg: currentSettings.lightCardBg || "#FFFFFF",
      lightSidebarBg: currentSettings.lightSidebarBg || "#FFFFFF",
      lightFg: currentSettings.lightFg || "#111111",
      lightCardFg: currentSettings.lightCardFg || "#666666",
      lightMuted: currentSettings.lightMuted || "#F2F2F2",
      lightMutedFg: currentSettings.lightMutedFg || "#999999",
      lightBorder: currentSettings.lightBorder || "#E5E5E5",
      lightSuccess: currentSettings.lightSuccess || "#10B981",
      lightDestructive: currentSettings.lightDestructive || "#EF4444",
      lightWarning: currentSettings.lightWarning || "#F59E0B",
      lightInfo: currentSettings.lightInfo || "#38BDF8",
      lightRing: currentSettings.lightRing || "#FF5A1F",
    });
  }, [currentSettings]);

  const save = async () => {
    setIsSaving(true);
    try {
      await updateSettings(pickSettingsFields(formData, fields));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  return {
    formData,
    setFormData,
    isLoading: currentSettings === undefined,
    isSaving,
    saveSuccess,
    save,
    updateSettings,
  };
}
