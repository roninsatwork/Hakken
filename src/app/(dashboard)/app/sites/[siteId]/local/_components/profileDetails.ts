"use client";

import { useTranslations } from "next-intl";

/**
 * "What your profile shows", in words (docs/plans/active/discovery-local-
 * reputation-ai-plan.md; drawn on "Local · Business profile"): the server
 * sends each detail as facts and a verdict (`siteLocalProfile.ts`), and the
 * screen words it in the reader's language — the detail's name, what Google
 * shows, and what to do about it.
 */

export type DetailRow = {
  detail: "CLAIMED" | "CATEGORY" | "OTHER_CATEGORIES" | "DESCRIPTION" | "ADDRESS" | "WEBSITE" | "HOURS" | "BOOKING" | "SERVICES" | "PHOTOS" | "REPLIES";
  verdict: "GOOD" | "FIX" | "UNKNOWN";
  text: string | null;
  other: string | null;
  count: number | null;
  of: number | null;
  average: number | null;
  days: Array<string | null> | null;
};

/** A description's words shown in the table before "…". */
const DESCRIPTION_SHOWN = 110;

/** A week's opening hours as runs of days alike: "Monday to Friday, 09:00–18:00 · Saturday to Sunday, closed". */
export function useHoursWords(): (days: ReadonlyArray<string | null>) => string | null {
  const t = useTranslations("sites.local.profile.details");
  return (days) => {
    const runs: Array<{ from: number; to: number; hours: string | null }> = [];
    days.forEach((hours, at) => {
      const last = runs[runs.length - 1];
      if (last && last.hours === hours && last.to === at - 1) last.to = at;
      else runs.push({ from: at, to: at, hours });
    });
    const shown = runs.filter((run) => run.hours !== null);
    if (shown.length === 0) return null;
    return shown.map((run) => {
      const span = run.from === run.to ? t(`days.${run.from}`) : t("dayRange", { from: t(`days.${run.from}`), to: t(`days.${run.to}`) });
      return t("dayHours", { days: span, hours: run.hours === "Closed" ? t("closed") : run.hours ?? "" });
    }).join(" · ");
  };
}

export function useDetailWords(): (row: DetailRow) => { detail: string; shows: string; check: string } {
  const t = useTranslations("sites.local.profile.details");
  const hoursWords = useHoursWords();
  const none = t("none");
  return (row) => {
    const detail = t(`names.${row.detail}`);
    const shows = (() => {
      switch (row.detail) {
        case "CLAIMED":
          return row.verdict === "UNKNOWN" ? t("notKnown") : row.verdict === "GOOD" ? t("yes") : t("no");
        case "DESCRIPTION":
          return row.text ? (row.text.length > DESCRIPTION_SHOWN ? `${row.text.slice(0, DESCRIPTION_SHOWN).trimEnd()}…` : row.text) : none;
        case "ADDRESS":
          return [row.text, row.other].filter(Boolean).join(" · ") || none;
        case "HOURS":
          return (row.days && hoursWords(row.days)) || none;
        case "BOOKING":
          if (row.text) return t("hasOne");
          return row.count ? t("bookingNone", { count: row.count, of: row.of ?? 0 }) : none;
        case "SERVICES":
          if (!row.count) return none;
          return row.of === 0 ? t("servicesNoPrices", { count: row.count, names: row.text ?? "" }) : t("services", { count: row.count, names: row.text ?? "" });
        case "PHOTOS":
          if (row.count === null) return t("notKnown");
          return row.average === null ? String(row.count) : t("photos", { count: row.count, average: row.average });
        case "REPLIES":
          return row.of === null ? t("readWithReviews") : t("answeredOf", { count: row.count ?? 0, of: row.of });
        default:
          return row.text ?? none;
      }
    })();
    const check = (() => {
      if (row.verdict === "UNKNOWN") return t("notReadYet");
      if (row.verdict === "GOOD") return row.detail === "CATEGORY" && row.other ? t("sameAsTop") : t("good");
      switch (row.detail) {
        case "CLAIMED": return t("claimIt");
        case "CATEGORY": return row.text && row.other ? t("topIs", { category: row.other }) : t("addOne");
        case "OTHER_CATEGORIES": return t("addMore");
        case "ADDRESS": return row.text ? t("addPhone") : t("addAddress");
        case "WEBSITE": return row.text ? t("pointsElsewhere") : t("addWebsite");
        case "HOURS": return t("addHours");
        case "SERVICES": return row.count ? t("addPrices") : t("addServices");
        case "PHOTOS": return t("fewerThanRivals");
        case "REPLIES": return t("answerMore");
        default: return t("addOne");
      }
    })();
    return { detail, shows, check };
  };
}

/**
 * A profile's opening hours changing, as Rival activity says it: the days that
 * changed, each "Saturday: now 10:00–14:00, was closed". Filed as
 * "5:Closed>10:00–14:00" (Monday is 0) by `profileChanges` on the server.
 */
export function useHoursChangeWords(): (text: string) => string {
  const t = useTranslations("sites.local.profile.details");
  const hours = (value: string) => (value === "Closed" ? t("closed") : value || t("none"));
  return (text) => text.split(";").flatMap((change) => {
    const [day, span] = change.split(":");
    const [was, now] = (span ?? "").split(">");
    const at = Number(day);
    if (!Number.isInteger(at) || at < 0 || at > 6) return [];
    return [t("hoursChange", { day: t(`days.${at}`), now: hours(now ?? ""), was: hours(was ?? "") })];
  }).join(" · ");
}

/** What a rival's activity line says happened, and the change it made: a post, a category, its rating moving. */
export type ActivityKind = "POST" | "OFFER" | "EVENT" | "CATEGORY_ADDED" | "CATEGORY_REMOVED" | "HOURS_CHANGED" | "NAME_CHANGED" | "WEBSITE_CHANGED" | "RATING_CHANGE" | "PHOTOS_ADDED";
export type ActivityLine = { kind: ActivityKind; text: string | null; from: number | null; to: number | null };

/**
 * An activity line's "What" and "Detail" in words, as Rival activity says
 * them — and One business, which lists one rival's lines the same way.
 */
export function useActivityWords(): { what: (line: ActivityLine) => string; detail: (line: ActivityLine) => string } {
  const t = useTranslations("sites.local.activity");
  const hoursWords = useHoursChangeWords();
  return {
    what: (line) => t(`kinds.${line.kind}`),
    detail: (line) => {
      switch (line.kind) {
        case "RATING_CHANGE": return t("details.rating", { from: line.from?.toFixed(1) ?? "", to: line.to?.toFixed(1) ?? "" });
        case "PHOTOS_ADDED": return t("details.photos", { count: (line.to ?? 0) - (line.from ?? 0), total: line.to ?? 0 });
        case "CATEGORY_ADDED": return t("details.categoryAdded", { category: line.text ?? "" });
        case "CATEGORY_REMOVED": return t("details.categoryRemoved", { category: line.text ?? "" });
        case "HOURS_CHANGED": return hoursWords(line.text ?? "");
        case "NAME_CHANGED": return t("details.name", { name: line.text ?? "" });
        case "WEBSITE_CHANGED": return t("details.website", { website: line.text ?? "" });
        default: return line.text ? `"${line.text}"` : "–";
      }
    },
  };
}
