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
