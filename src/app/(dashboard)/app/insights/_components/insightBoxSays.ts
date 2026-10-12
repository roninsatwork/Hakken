import { formatDay } from "../../sites/_components/siteFormat";

type Box = { says: string[]; role: string; week: string; period: string | null };
type Words = (key: string, values?: Record<string, string>) => string;

/**
 * A screen's "What Hakken sees" sentences (insights-one-voice-plan.md phase
 * 4): its specialist's, with who wrote them and for which week, when it wrote
 * them — for a screen with a period picker, only for the period they were
 * written for — else the screen's own, as before.
 */
export function boxedSays(box: Box | null | undefined, own: string[], words: Words, period?: string | null): string[] {
  if (!box || (box.period !== null && box.period !== (period ?? null))) return own;
  return [...box.says, words("by", { who: words(`who.${box.role}`), day: formatDay(box.week) })];
}
