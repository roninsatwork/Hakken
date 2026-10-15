"use client";

import { useTranslations } from "next-intl";

import {
  formatUtcPreview,
  getPrimaryScheduleTime,
  hydrateScheduleDraft,
  normalizeTimes,
} from "./scheduleConfig";

const DAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

/**
 * An `intervalStr` in words — "Every Monday at 02:00".
 *
 * Lived privately inside the Schedules list until a second screen needed the
 * same sentence. Shared rather than copied, and it keeps the Schedules
 * namespace's own wording so nothing had to be retranslated: a schedule reads
 * the same whichever screen is showing it, which is the point.
 */
export function useScheduleSummary() {
  const t = useTranslations("admin.workflows.schedules");

  return (intervalStr: string) => {
    const draft = hydrateScheduleDraft(intervalStr);

    if (draft.mode === "targetedTimes") {
      const times = normalizeTimes(draft.timesLocal);
      return times.length > 0
        ? t("scheduleSummary.targeted", { times: times.join(", ") })
        : t("scheduleSummary.targetedEmpty");
    }

    const utcTime = formatUtcPreview(getPrimaryScheduleTime(draft));

    if (draft.cadence === "hourly") {
      return t("scheduleSummary.hourly", {
        hours: String(draft.everyHours),
        time: draft.startTimeLocal,
        utcTime,
      });
    }
    if (draft.cadence === "weekly") {
      return t("scheduleSummary.weekly", {
        day: t(`editor.fields.interval.days.${DAY_KEYS[draft.dayOfWeek] ?? "monday"}`),
        time: draft.timeLocal,
        utcTime,
      });
    }
    /*
      Fortnightly had no branch here and fell through to the daily string, so
      every screen reading this helper announced an every-other-week schedule as
      a daily one. The SEO cadence picker has offered it since it shipped.
    */
    if (draft.cadence === "fortnightly") {
      return t("scheduleSummary.fortnightly", {
        day: t(`editor.fields.interval.days.${DAY_KEYS[draft.dayOfWeek] ?? "monday"}`),
        time: draft.timeLocal,
        utcTime,
      });
    }
    if (draft.cadence === "monthly") {
      return t("scheduleSummary.monthly", {
        day: String(draft.dayOfMonth),
        time: draft.timeLocal,
        utcTime,
      });
    }

    return t("scheduleSummary.daily", { time: draft.timeLocal, utcTime });
  };
}

/**
 * An `intervalStr` short enough for a table cell — "Daily, 04:00",
 * "Weekly, Monday 02:10" — for a website's Schedules, where each source's
 * row says how often (docs/plans/active/website-schedules-plan.md, WS1).
 * The time is the schedule's own; a schedule kept in UTC says so.
 */
export function useShortScheduleSummary() {
  const t = useTranslations("admin.workflows.schedules");

  return (intervalStr: string) => {
    const draft = hydrateScheduleDraft(intervalStr);
    if (draft.mode === "targetedTimes") {
      return normalizeTimes(draft.timesLocal).join(", ") || t("scheduleSummary.targetedEmpty");
    }
    const time = draft.timezone === "UTC" ? t("scheduleShort.utc", { time: draft.timeLocal }) : draft.timeLocal;
    const day = t(`editor.fields.interval.days.${DAY_KEYS[draft.dayOfWeek] ?? "monday"}`);
    switch (draft.cadence) {
      case "hourly":
        return t("scheduleShort.hourly", { hours: String(draft.everyHours) });
      case "weekly":
        return t("scheduleShort.weekly", { day, time });
      case "fortnightly":
        return t("scheduleShort.fortnightly", { day, time });
      case "monthly":
        return t("scheduleShort.monthly", { day: String(draft.dayOfMonth), time });
      default:
        return t("scheduleShort.daily", { time });
    }
  };
}
