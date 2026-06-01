import type { SettingsTab } from "./types";

export function isSettingsTab(value: string | null): value is SettingsTab {
  return value === "identity" ||
    value === "appearance" ||
    value === "security" ||
    value === "audit" ||
    value === "options" ||
    value === "purges";
}
