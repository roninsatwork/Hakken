import { eyeWithParts } from "./googleAnalyticsShared";

/**
 * What Google Analytics' Conversions screens hand their eye, built in one place for the screens and for a chat app's
 * question (`chatAppEyes/googleAnalytics.ts`), so the two can't disagree
 * (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, Option B). The reads and the words come in; the figures the eye
 * reads come out. No database here.
 */

/**
 * Conversions (`conversions/page.tsx`): the page hands `AnalyticsSees` the conversions' own read, and its table of what
 * counts as a conversion hands its own read as `eventsTable` (`useSeesPart`), with nothing counted yet and with
 * something counted alike. The table's read is handed as it is, as the panel hands it.
 */
export function conversionsEyeData(conversions: unknown, events: unknown): unknown {
  return eyeWithParts(conversions, { eventsTable: events });
}

/** The pages behind a square (`conversions/pages/page.tsx`): the square's pages, with the names its findings use. */
export function conversionPagesEyeData<Answer extends object>(answer: Answer | null | undefined, names: Record<string, string>) {
  return answer ? { ...answer, names } : answer;
}

/**
 * An event's own screen (`events/event/page.tsx`): a counted event opens the conversion's screen, which hands its
 * read under `conversion` (`ConversionScreen`); any other event hands its read as it is (`EventBody`).
 */
export function eventEyeData<Answer extends { counted: boolean }>(answer: Answer | null | undefined) {
  if (!answer) return answer;
  return answer.counted ? { conversion: answer } : answer;
}

/** The columns a square of the Conversions map is drawn by, as the pages behind it take them: page kind unless another. */
const SQUARE_COLUMNS = ["kind", "channel", "device", "country"] as const;
export type SquareColumns = (typeof SQUARE_COLUMNS)[number];

/** A square's column, as the pages behind it read their address's `by`: page kind unless it's one of the four. */
export function squareColumnsOf(by: string | null | undefined): SquareColumns {
  return (SQUARE_COLUMNS as readonly string[]).includes(by ?? "") ? (by as SquareColumns) : "kind";
}

/**
 * The square a chat app asks about, from its key: the pages behind a square's own address, `event=…&by=…&key=…` (the
 * conversion, the column and the square's key in that column), as the screen reads it. Null without a conversion.
 */
export function squareOfKey(key: string | undefined): { eventName: string; columns: SquareColumns; key: string } | null {
  if (!key) return null;
  const params = new URLSearchParams(key.startsWith("?") ? key.slice(1) : key);
  const eventName = params.get("event") ?? "";
  if (!eventName) return null;
  return { eventName, columns: squareColumnsOf(params.get("by")), key: params.get("key") ?? "" };
}
