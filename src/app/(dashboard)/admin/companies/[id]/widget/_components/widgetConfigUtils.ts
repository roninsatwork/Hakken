import type { WidgetConfigTab } from "./types";

export const WIDGET_CONFIG_TABS: WidgetConfigTab[] = [
  "Appearance",
  "Welcome Screen",
  "Conversation Starters",
  "Greeting",
  "Integration",
];

export function parseAllowedDomains(value: string) {
  return value
    .split(",")
    .map((domain) => domain.trim())
    .filter(Boolean);
}

export function buildWidgetEmbedSnippet(hostOrigin: string, widgetId?: string) {
  if (!widgetId) return "";

  return `<script src="${hostOrigin}/embed.js" data-widget-id="${widgetId}"></script>`;
}

export function getWidgetLogoPreviewUrl(themeLogoUrl: string) {
  if (themeLogoUrl.startsWith("blob:") || themeLogoUrl.startsWith("http")) {
    return themeLogoUrl;
  }

  return null;
}

export function canAddConversationStarter(input: string, starters: string[]) {
  return input.trim() !== "" && starters.length < 4;
}
