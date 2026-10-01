import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { appError } from "./appError";

/**
 * What every Admin → Content screen's writes share (docs/plans/active/
 * knowledge-news-and-digest-plan.md): an audit row naming who changed what,
 * and the same checks on the words and addresses typed in.
 */

/** Records a change made in Admin → Content, by the super admin who made it. */
export async function auditContentChange(
  ctx: MutationCtx & { userId: Id<"users"> },
  actionType: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await ctx.db.insert("auditLogs", {
    actorId: ctx.userId,
    actionType,
    entityId,
    entityType,
    timestamp: Date.now(),
    metadata: JSON.stringify(metadata),
  });
}

/** A line of text, trimmed, required unless `optional`, and no longer than `max` characters. */
export function checkedText(value: string, what: string, max: number, options: { optional?: boolean } = {}): string {
  const text = value.trim();
  if (!text && !options.optional) throw appError("INVALID_INPUT", `${what} is needed.`);
  if (text.length > max) throw appError("INVALID_INPUT", `${what} is at most ${max.toLocaleString("en-GB")} characters.`);
  return text;
}

/** A web address that starts with http:// or https://, trimmed. */
export function checkedUrl(value: string, what: string): string {
  const url = value.trim();
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return url;
  } catch {
    // Falls through to the plain-words refusal below.
  }
  throw appError("INVALID_INPUT", `${what} must be a web address starting with https://.`);
}

/** A calendar day, "YYYY-MM-DD", that is a real date. */
export function checkedDay(value: string, what: string): string {
  const day = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) {
    throw appError("INVALID_INPUT", `${what} must be a date.`);
  }
  return day;
}

/** The moment a calendar day starts, in UTC, for ordering against other times. */
export function dayStart(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}
