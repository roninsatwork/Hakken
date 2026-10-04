/**
 * Readers for a value whose shape a supplier decides — DataForSEO's JSON —
 * each returning what was asked for or nothing, never a guess. New readers of
 * supplier answers take these rather than writing a sixth copy (the
 * DataForSEO parsers, link parsers, slim copies and crawl detail each hold
 * their own, from before this file).
 */

export type UnknownRecord = Record<string, unknown>;

export function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : null;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
