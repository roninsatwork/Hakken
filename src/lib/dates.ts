type DateInput = Date | number | string | null | undefined;

type DateFormatterOptions = {
  fallback?: string;
  locale?: Intl.LocalesArgument;
  options?: Intl.DateTimeFormatOptions;
};

function coerceDate(input: DateInput) {
  if (input === null || input === undefined) return null;
  const date = input instanceof Date ? input : new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(input: DateInput, config: DateFormatterOptions = {}) {
  const date = coerceDate(input);
  if (!date) return config.fallback ?? "N/A";
  return date.toLocaleDateString(config.locale, config.options);
}

export function formatDateTime(input: DateInput, config: DateFormatterOptions = {}) {
  const date = coerceDate(input);
  if (!date) return config.fallback ?? "N/A";
  return date.toLocaleString(config.locale, config.options);
}

export function formatTime(input: DateInput, config: DateFormatterOptions = {}) {
  const date = coerceDate(input);
  if (!date) return config.fallback ?? "N/A";
  return date.toLocaleTimeString(config.locale, config.options);
}

/**
 * A timestamp as a `datetime-local` input wants it: `YYYY-MM-DDTHH:mm`, in the
 * reader's own timezone.
 *
 * `toISOString` would be wrong here — it renders UTC, so anyone east or west of
 * it would open the form and find a time an hour or more from the one they set.
 * The offset is subtracted first so the ISO string, sliced, reads as local.
 */
export function toDateTimeLocalValue(input: DateInput): string {
  const date = coerceDate(input);
  if (!date) return "";
  const localMs = date.getTime() - date.getTimezoneOffset() * 60_000;
  return new Date(localMs).toISOString().slice(0, 16);
}

/**
 * The value a `datetime-local` input gives back, as a timestamp.
 *
 * A date-time with no offset is parsed as local time, which is exactly what the
 * control means by it. Returns null for an empty or unparseable value rather
 * than guessing, so a caller can tell "no time set" from a time.
 */
export function fromDateTimeLocalValue(value: string): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}
