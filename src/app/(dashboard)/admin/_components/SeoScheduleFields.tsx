"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/src/ui/components/screens/Button";
import { Select } from "@/src/ui/components/screens/Select";
import { Field } from "@/src/ui/components/screens/Field";
import { cn } from "@/src/ui/lib/utils";
import type { ScheduleCadence, ScheduleDraft } from "@/src/app/(dashboard)/admin/_lib/scheduleConfig";

/**
 * How often SEO data is pulled, as four choices and one sentence.
 *
 * The generic `ScheduleBuilder` is the right control for a workflow, which may
 * legitimately want "every four hours" or a list of exact times. It is the
 * wrong one here: SEO metrics do not move hourly, and offering an hourly pull
 * on a service billed per call invites an expensive mistake. Anthony, seeing
 * the builder on this screen: *"this goes against the webhook and slower
 * cheaper method of DataForSEO does it not."*
 *
 * The shape is the mockup he picked: four cadence cards, then a single line
 * reading "on Monday at 02:00". The first build of it stacked a labelled
 * dropdown, a labelled time box and a separately headed toggle down the card —
 * *"does the screen even look like B?"* — so the row is deliberately one row,
 * with the connecting words as the labels rather than headings above each box.
 *
 * The *format* underneath is still the platform's own `ScheduleDraft` — the
 * same serialiser, the same server-side reader, the same dispatcher. Shared
 * vocabulary, narrower choice.
 *
 * **Queued or live was a third control here and is gone.** Live turned out to
 * be four times cheaper than queueing and two of the four engines could never
 * queue at all, so every engine is now asked live and there is no choice left
 * to offer. What it wrote — `seoPreferLive` — was read by nothing in the
 * pipeline, which is the same fault this component was built to correct: a
 * setting nobody acted on. The field itself was removed on 2026-09-23.
 */

const CADENCES: ReadonlyArray<{ value: Extract<ScheduleCadence, "daily" | "weekly" | "fortnightly" | "monthly">; recommended?: boolean }> = [
  { value: "daily" },
  { value: "weekly", recommended: true },
  { value: "fortnightly" },
  { value: "monthly" },
];

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

/** The boxes on the row are the kit's field height, so the line has one baseline. */
const ROW_CONTROL = "h-[46px] rounded-[12px] border-border-dim bg-black/20 px-4 pr-10 text-[14px]";

/** A connecting word, sized and spaced to sit on the row rather than above it. */
function RowWord({ htmlFor, children }: { htmlFor: string; children: string }) {
  return (
    <label htmlFor={htmlFor} className="text-[13px] text-muted">
      {children}
    </label>
  );
}

type SeoScheduleFieldsProps = {
  draft: ScheduleDraft;
  onChange: (draft: ScheduleDraft) => void;
};

export function SeoScheduleFields({ draft, onChange }: SeoScheduleFieldsProps) {
  const t = useTranslations("admin.companyDataCollection");
  const tDays = useTranslations("admin.workflows.schedules.editor.fields.interval.days");

  const setCadence = (cadence: ScheduleDraft["cadence"]) =>
    onChange({ ...draft, mode: "recurring", cadence });

  // Weekly and fortnightly both hang off a weekday; only fortnightly needs to
  // know which week, and only monthly needs a day of the month.
  const needsWeekday = draft.cadence === "weekly" || draft.cadence === "fortnightly";

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CADENCES.map((option) => {
          const selected = draft.cadence === option.value;
          return (
            // The kit's bordered chip, grown into a card: same border, radius
            // and focus ring as every other button in the section, with the
            // selected fill the only thing this screen adds.
            <Button
              key={option.value}
              variant="outline"
              role="radio"
              aria-checked={selected}
              onClick={() => setCadence(option.value)}
              className={cn(
                "flex w-full flex-col items-start gap-0.5 rounded-[12px] px-4 py-3.5 text-left",
                selected
                  ? "border-brand bg-brand/10"
                  : "bg-black/20 hover:border-brand/40",
              )}
            >
              <span className={cn("text-[15px] font-semibold", selected ? "text-brand" : "text-foreground")}>
                {t(`cadence.${option.value}`)}
              </span>
              <span className={cn("text-[13px]", selected ? "text-brand/70" : "text-muted")}>
                {option.recommended ? t("recommended") : t(`cadenceCost.${option.value}`)}
              </span>
            </Button>
          );
        })}
      </div>

      {/*
        One line: on <day> at <time>. The connecting words are the labels —
        tied to their box, so clicking one still focuses it — which is what
        keeps this a sentence rather than a column of headed fields.
      */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3 border-t border-border-dim pt-5">
        {needsWeekday ? (
          <>
            <RowWord htmlFor="seo-day-of-week">{t("dayLabel")}</RowWord>
            <Select
              id="seo-day-of-week"
              value={String(draft.dayOfWeek)}
              onChange={(next) => onChange({ ...draft, dayOfWeek: Number(next) })}
              className="w-[150px]"
              selectClassName={ROW_CONTROL}
            >
              {DAY_KEYS.map((key, index) => (
                <option key={key} value={index}>{tDays(key)}</option>
              ))}
            </Select>
          </>
        ) : null}

        {draft.cadence === "monthly" ? (
          <>
            <RowWord htmlFor="seo-day-of-month">{t("dayOfMonthLabel")}</RowWord>
            <Select
              id="seo-day-of-month"
              value={String(draft.dayOfMonth)}
              onChange={(next) => onChange({ ...draft, dayOfMonth: Number(next) })}
              className="w-[110px]"
              selectClassName={ROW_CONTROL}
            >
              {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
                <option key={day} value={day}>{day}</option>
              ))}
            </Select>
          </>
        ) : null}

        <Field
          id="seo-time"
          label={t("timeLabel")}
          type="time"
          value={draft.timeLocal}
          onChange={(event) => onChange({ ...draft, timeLocal: event.target.value })}
          // The label sits beside the box on this row, and the kit's label
          // carries a top margin for the stacked case that would drop it off
          // the line here.
          wrapperClassName="flex-row items-center gap-3 [&>label]:mt-0 [&>label]:font-normal [&>label]:text-[13px] [&>label]:text-muted"
          className="w-[120px]"
        />

        {draft.cadence === "fortnightly" ? (
          /*
            Which Monday. "Every other Monday" is meaningless without it, and
            anchoring to a date rather than counting from the last run is what
            stops a pause moving the fortnight onto the wrong week.
          */
          <Field
            id="seo-anchor"
            label={t("anchorLabel")}
            type="date"
            value={draft.anchorDate}
            onChange={(event) => onChange({ ...draft, anchorDate: event.target.value })}
            wrapperClassName="flex-row items-center gap-3 [&>label]:mt-0 [&>label]:font-normal [&>label]:text-[13px] [&>label]:text-muted"
            className="w-[170px]"
          />
        ) : null}

      </div>
    </div>
  );
}
