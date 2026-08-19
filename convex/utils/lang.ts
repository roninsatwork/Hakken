/**
 * Small language-level helpers that had quietly forked across the backend
 * (maintenance plan, phase 5): `isRecord` existed as eight identical copies,
 * `stableStringify` as three, `parseStoredStringArray` as three, and
 * `getErrorMessage` as ten near-copies differing only in their fallback
 * message. One home each; import them, do not re-declare them.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * The human-readable message inside an unknown thrown value.
 *
 * The fallback carries each call site's domain default ("Unknown Engine
 * Exception", "Provider request failed.") — that variation was the only real
 * difference between the ten copies, so it became the parameter.
 */
export function getErrorMessage(error: unknown, fallback?: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback ?? String(error);
}

/**
 * JSON with object keys sorted and `undefined` entries dropped, so equal
 * values always serialize to equal strings — the fingerprint the skill and
 * agent versioning tables key on.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(",")}}`;
}

/**
 * A stored JSON string array, deduplicated and trimmed; anything malformed
 * reads as empty rather than throwing on a settings row someone hand-edited.
 */
export function parseStoredStringArray(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? Array.from(new Set(parsed.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean)))
      : [];
  } catch {
    return [];
  }
}
