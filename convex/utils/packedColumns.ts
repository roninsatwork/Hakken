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
