/**
 * A day as the screens write it, in English, for figures built on the server
 * (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, Option B). The screens'
 * own `formatDay` and `formatShortDay` (`sites/_components/siteFormat.ts`) write
 * in the reader's language, and in British English with no page to ask, which
 * is what these give: "14 Oct 2026" and "14 Oct".
 */
export function englishDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function englishShortDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
