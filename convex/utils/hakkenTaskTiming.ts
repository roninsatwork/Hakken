/**
 * When a Hakken task next runs: its owner's chosen time ("09:00"), in their
 * own time zone, on the next day it has not yet passed
 * (docs/plans/active/hakken-tasks-plan.md, "Their time"). Plain code, free of
 * any Convex function, so the screens and the server agree.
 */

export const DEFAULT_TASK_TIME = "09:00";
export const DEFAULT_TASK_TIME_ZONE = "Europe/London";

/** A zone the runtime knows, else the default: a browser can send anything. */
export function taskTimeZone(zone: string | undefined): string {
  if (!zone) return DEFAULT_TASK_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return zone;
  } catch {
    return DEFAULT_TASK_TIME_ZONE;
  }
}

/** "09:00" from what a person or the model said: hours 0–23, minutes 0–59, else the default. */
export function taskTimeOfDay(time: string | undefined): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec((time ?? "").trim());
  if (!match) return DEFAULT_TASK_TIME;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return DEFAULT_TASK_TIME;
  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number };

/** The wall clock in `timeZone` at `at`. */
function wallClock(at: number, timeZone: string): Parts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(at));
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: read("year"), month: read("month"), day: read("day"), hour: read("hour"), minute: read("minute") };
}

/** The instant a wall-clock time in `timeZone` happens, found by correcting for the zone's offset twice (once more across a clock change). */
function instantOf(wall: Parts, timeZone: string): number {
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  let guess = asUtc;
  for (let pass = 0; pass < 2; pass += 1) {
    const seen = wallClock(guess, timeZone);
    const seenAsUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute);
    guess += asUtc - seenAsUtc;
  }
  return guess;
}

/** The next time after `now` that it is `timeOfDay` in `timeZone`. */
export function nextTaskRun(timeOfDay: string, timeZone: string, now: number): number {
  const zone = taskTimeZone(timeZone);
  const [hour, minute] = taskTimeOfDay(timeOfDay).split(":").map(Number);
  const today = wallClock(now, zone);
  const todayAt = instantOf({ ...today, hour, minute }, zone);
  if (todayAt > now) return todayAt;
  // Tomorrow's date by the calendar, not by adding 24 hours across a clock change.
  const tomorrow = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
  return instantOf({ year: tomorrow.getUTCFullYear(), month: tomorrow.getUTCMonth() + 1, day: tomorrow.getUTCDate(), hour, minute }, zone);
}

/** "09:00" as English speakers say it: 9am, 8:30am, 1pm. Other languages show the 24-hour time as it is. */
export function clockOf(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const suffix = hours < 12 ? "am" : "pm";
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return minutes ? `${hour}:${String(minutes).padStart(2, "0")}${suffix}` : `${hour}${suffix}`;
}
