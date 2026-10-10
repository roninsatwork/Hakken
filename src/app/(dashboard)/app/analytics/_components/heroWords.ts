import type { HeroKind } from "@/convex/utils/heroes";
import { formatMoney } from "./analyticsFormat";

/**
 * How Heroes and attention writes its labels and worths
 * (docs/plans/active/google-analytics-plan.md §13), shared by its list and a
 * page's own view.
 */

/** Each label's tone: a hero is good news, a fall the worst, the rest want work. Its icon and words carry the meaning, never colour alone. */
export const HERO_TONES: Record<HeroKind, "success" | "info" | "warning" | "danger"> = {
  hero: "success", push: "info", click: "warning", convert: "warning", leave: "warning", fall: "danger",
};

/** What a fix is worth a month, in whole money, "Under £1" when it is less. */
export function worthWords(worth: number, currency: string | null, t: (key: string, values?: Record<string, string>) => string): string {
  return worth < 100 ? t("under", { money: formatMoney(100, currency) }) : formatMoney(Math.round(worth / 100) * 100, currency);
}
