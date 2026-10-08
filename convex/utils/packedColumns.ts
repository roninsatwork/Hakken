import { packNumbers, unpackNumbers } from "./searchConsolePacks";

/**
 * A column of a packed list (core-data-normalisation-plan.md §6.3): whole
 * numbers of 0 or more, some missing, packed as text a few characters each
 * (`packNumbers`), a missing one as −1. A column holding anything else — a
 * fraction, a number below 0 — is kept as its list, so nothing is ever
 * rounded or lost.
 */
export type PackedColumn = string | Array<number | null>;

const MISSING = -1;

export function packColumn(values: ReadonlyArray<number | undefined>): PackedColumn {
  const whole = values.every((value) => value === undefined || (Number.isInteger(value) && value >= 0));
  return whole
    ? packNumbers(values.map((value) => value ?? MISSING))
    : values.map((value) => value ?? null);
}

export function unpackColumn(stored: PackedColumn): Array<number | undefined> {
  if (typeof stored !== "string") return stored.map((value) => value ?? undefined);
  return unpackNumbers(stored).map((value) => (value === MISSING ? undefined : value));
}

const DAY_MS = 86_400_000;

/** A column of days: days since 1970, packed — or the days as written, when one is not a day that converts back exactly. */
export type PackedDays = string | Array<string | null>;

function dayNumber(day: string): number | null {
  const time = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(time)) return null;
  return new Date(time).toISOString().slice(0, 10) === day ? time / DAY_MS : null;
}

export function packDays(days: ReadonlyArray<string | undefined>): PackedDays {
  const numbers = days.map((day) => (day === undefined ? undefined : dayNumber(day)));
  return numbers.every((number) => number !== null)
    ? (packColumn(numbers as Array<number | undefined>) as string)
    : days.map((day) => day ?? null);
}

export function unpackDays(stored: PackedDays): Array<string | undefined> {
  if (typeof stored !== "string") return stored.map((day) => day ?? undefined);
  return unpackColumn(stored).map((days) => (days === undefined ? undefined : new Date(days * DAY_MS).toISOString().slice(0, 10)));
}

/** Words from a fixed set (a status) as their places in it, packed. */
export function packCodes<Word extends string>(words: readonly Word[], set: readonly Word[]): PackedColumn {
  return packColumn(words.map((word) => set.indexOf(word)));
}

export function unpackCodes<Word extends string>(stored: PackedColumn, set: readonly Word[]): Word[] {
  return unpackColumn(stored).map((place) => set[place ?? 0]);
}

/**
 * Each named figure of these rows as its own packed column — a check's list
 * packed a record (`siteReferringDomainParts.ts`, `siteLinkGroupParts.ts`).
 */
export function packFigures<Key extends string>(rows: ReadonlyArray<{ [K in Key]?: number }>, keys: readonly Key[]): Record<Key, PackedColumn> {
  const packed = {} as Record<Key, PackedColumn>;
  for (const key of keys) packed[key] = packColumn(rows.map((row) => row[key]));
  return packed;
}

/** Each named day of these rows as its own packed column of days. */
export function packDayFigures<Key extends string>(rows: ReadonlyArray<{ [K in Key]?: string }>, keys: readonly Key[]): Record<Key, PackedDays> {
  const packed = {} as Record<Key, PackedDays>;
  for (const key of keys) packed[key] = packDays(rows.map((row) => row[key]));
  return packed;
}

/**
 * A packed record's rows again: each row its name, its figures and days, a
 * missing one left off the row rather than set to nothing — so a row reads
 * exactly as it was written — and `required` figures 0 when missing.
 */
export function unpackFigureRows<NumberKey extends string, DayKey extends string>(
  count: number,
  part: Record<NumberKey, PackedColumn> & Record<DayKey, PackedDays>,
  keys: { numbers: readonly NumberKey[]; days: readonly DayKey[]; required: readonly NumberKey[] },
): Array<{ [K in NumberKey]?: number } & { [K in DayKey]?: string }> {
  const numbers = keys.numbers.map((key) => [key, unpackColumn(part[key])] as const);
  const days = keys.days.map((key) => [key, unpackDays(part[key])] as const);
  const required = new Set<string>(keys.required);
  return Array.from({ length: count }, (_, at) => {
    const row: Record<string, number | string> = {};
    for (const [key, column] of numbers) {
      const value = column[at];
      if (value !== undefined) row[key] = value;
      else if (required.has(key)) row[key] = 0;
    }
    for (const [key, column] of days) if (column[at] !== undefined) row[key] = column[at]!;
    return row as { [K in NumberKey]?: number } & { [K in DayKey]?: string };
  });
}
