import type { SettingsTab } from "./types";

export function isSettingsTab(value: string | null): value is SettingsTab {
  return value === "identity" ||
    value === "appearance" ||
    value === "security" ||
    value === "options" ||
    value === "purges";
}
