"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { CheckCircle2, ChevronDown, Clock3, Repeat2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/src/ui/components/screens/Button";
import { Field } from "@/src/ui/components/screens/Field";
import {
  addTargetedTime,
  formatUtcPreview,
  getPrimaryScheduleTime,
  normalizeTimes,
  removeTargetedTime,
  type ScheduleCadence,
  type ScheduleDraft,
  type ScheduleTargetKind,
} from "@/src/app/(dashboard)/admin/_lib/scheduleConfig";

type ScheduleBuilderProps = {
  draft: ScheduleDraft;
  onChange: (draft: ScheduleDraft) => void;
  targetKind: ScheduleTargetKind;
};

const cadenceOptions: Array<{ id: ScheduleCadence; labelKey: string }> = [
  { id: "hourly", labelKey: "fields.interval.hourly" },
  { id: "daily", labelKey: "fields.interval.daily" },
  { id: "weekly", labelKey: "fields.interval.weekly" },
  { id: "monthly", labelKey: "fields.interval.monthly" },
];

const dayOptions = [
  { value: 1, labelKey: "fields.interval.days.monday" },
  { value: 2, labelKey: "fields.interval.days.tuesday" },
  { value: 3, labelKey: "fields.interval.days.wednesday" },
  { value: 4, labelKey: "fields.interval.days.thursday" },
  { value: 5, labelKey: "fields.interval.days.friday" },
  { value: 6, labelKey: "fields.interval.days.saturday" },
  { value: 0, labelKey: "fields.interval.days.sunday" },
];

function SelectShell(props: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-2 min-w-[220px]">
      <label className="text-[10px] font-mono tracking-[0.28em] text-muted uppercase">{props.label}</label>
      <div className="relative">
        {props.children}
        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      </div>
    </div>
  );
}

function ModeCard(props: {
  active: boolean;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    // Stays raw: a selected-state mode card whose colours swap with selection — matches no variant.
    <button
      type="button"
      onClick={props.onClick}
      className={`relative min-h-[136px] flex-1 rounded-[16px] border p-7 text-left transition-all ${
        props.active
          ? "border-brand bg-brand/10 text-foreground"
          : "border-border-dim bg-transparent text-muted hover:border-border"
      }`}
    >
      <span className={`mb-5 flex h-11 w-11 items-center justify-center rounded-full ${props.active ? "bg-brand/20 text-brand" : "bg-foreground/5 text-muted"}`}>
        {props.icon}
      </span>
      <span className={`block text-[18px] font-bold ${props.active ? "text-foreground" : "text-muted"}`}>{props.title}</span>
      <span className="mt-2 block text-[14px] leading-relaxed text-secondary">{props.description}</span>
      {props.active && <CheckCircle2 className="absolute right-7 top-7 h-6 w-6 text-brand" />}
    </button>
  );
}

function buildSummary(t: ReturnType<typeof useTranslations>, draft: ScheduleDraft, targetKind: ScheduleTargetKind) {
  const target = t(`summary.targets.${targetKind}`);
  const utcTime = formatUtcPreview(getPrimaryScheduleTime(draft));

  if (draft.mode === "targetedTimes") {
    const times = normalizeTimes(draft.timesLocal);
    if (times.length === 0) return t("summary.targetedEmpty", { target });
    return t("summary.targeted", {
      target,
      times: times.join(", "),
      utcTimes: times.map(formatUtcPreview).join(", "),
    });
  }

  if (draft.cadence === "hourly") {
    return t("summary.hourly", {
      target,
      hours: String(draft.everyHours),
      localTime: draft.startTimeLocal,
      utcTime,
    });
  }

  if (draft.cadence === "weekly") {
    return t("summary.weekly", {
      target,
      day: t(dayOptions.find((day) => day.value === draft.dayOfWeek)?.labelKey ?? "fields.interval.days.monday"),
      localTime: draft.timeLocal,
      utcTime,
    });
  }

  if (draft.cadence === "monthly") {
    return t("summary.monthly", {
      target,
      day: String(draft.dayOfMonth),
      localTime: draft.timeLocal,
      utcTime,
    });
  }

  return t("summary.daily", {
    target,
    localTime: draft.timeLocal,
    utcTime,
  });
}

export default function ScheduleBuilder({ draft, onChange, targetKind }: ScheduleBuilderProps) {
  const t = useTranslations("admin.workflows.schedules.editor");
  const [pendingTime, setPendingTime] = useState("09:00");
  const selectedTime = getPrimaryScheduleTime(draft);
  const selectedUtcTime = formatUtcPreview(selectedTime);

  const update = (updates: Partial<ScheduleDraft>) => onChange({ ...draft, ...updates });

  return (
    <section className="flex flex-col gap-8">
      <div className="grid gap-4 lg:grid-cols-2">
        <ModeCard
          active={draft.mode === "recurring"}
          description={t("scheduleMode.recurring.description")}
          icon={<Repeat2 className="h-6 w-6" />}
          onClick={() => update({ mode: "recurring" })}
          title={t("scheduleMode.recurring.title")}
        />
        <ModeCard
          active={draft.mode === "targetedTimes"}
          description={t("scheduleMode.targeted.description")}
          icon={<Clock3 className="h-6 w-6" />}
          onClick={() => update({ mode: "targetedTimes" })}
          title={t("scheduleMode.targeted.title")}
        />
      </div>

      {draft.mode === "recurring" ? (
        <div className="flex flex-wrap items-end gap-6">
          <div className="flex min-w-[320px] flex-col gap-2">
            <label className="text-[10px] font-mono tracking-[0.28em] text-muted uppercase">{t("fields.interval.executionInterval")}</label>
            <div className="grid grid-cols-4 rounded-[12px] border border-border-dim p-1">
              {cadenceOptions.map((option) => (
                // Stays raw: a segmented-control cell whose fill swaps with selection — matches no variant.
                <button
                  key={option.id}
                  type="button"
                  onClick={() => update({ cadence: option.id })}
                  className={`rounded-[8px] px-4 py-2.5 text-[13px] font-bold transition-all ${
                    draft.cadence === option.id ? "bg-foreground/10 text-foreground" : "text-muted hover:bg-foreground/5 hover:text-foreground"
                  }`}
                >
                  {t(option.labelKey)}
                </button>
              ))}
            </div>
          </div>

          {draft.cadence === "hourly" && (
            <SelectShell label={t("fields.interval.everyXHours")}>
              <select
                value={draft.everyHours}
                onChange={(event) => update({ everyHours: Number(event.target.value) })}
                className="h-12 w-full appearance-none rounded-[10px] border border-border-dim bg-transparent px-4 pr-11 text-[14px] text-foreground outline-none transition-colors focus:border-brand/40"
              >
                {[1, 2, 3, 4, 6, 8, 12, 24].map((hours) => (
                  <option key={hours} value={hours}>{t("fields.interval.everyHoursOption", { hours })}</option>
                ))}
              </select>
            </SelectShell>
          )}

          {draft.cadence === "weekly" && (
            <SelectShell label={t("fields.interval.dayOfWeek")}>
              <select
                value={draft.dayOfWeek}
                onChange={(event) => update({ dayOfWeek: Number(event.target.value) })}
                className="h-12 w-full appearance-none rounded-[10px] border border-border-dim bg-transparent px-4 pr-11 text-[14px] text-foreground outline-none transition-colors focus:border-brand/40"
              >
                {dayOptions.map((day) => (
                  <option key={day.value} value={day.value}>{t(day.labelKey)}</option>
                ))}
              </select>
            </SelectShell>
          )}

          {draft.cadence === "monthly" && (
            <SelectShell label={t("fields.interval.dayOfMonth")}>
              <select
                value={draft.dayOfMonth}
                onChange={(event) => update({ dayOfMonth: Number(event.target.value) })}
                className="h-12 w-full appearance-none rounded-[10px] border border-border-dim bg-transparent px-4 pr-11 text-[14px] text-foreground outline-none transition-colors focus:border-brand/40"
              >
                {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
            </SelectShell>
          )}

          {/* The UTC reading used to sit on the right of the label row; it is
              the hint under the box now, which is where the shared field puts
              anything that explains the value. */}
          <div className="flex min-w-[220px] flex-col gap-2">
            <Field
              label={draft.cadence === "hourly" ? t("fields.interval.initialStartTime") : t("fields.interval.timeLabel")}
              hint={`${selectedUtcTime} UTC`}
              type="time"
              value={draft.cadence === "hourly" ? draft.startTimeLocal : draft.timeLocal}
              onChange={(event) => draft.cadence === "hourly"
                ? update({ startTimeLocal: event.target.value })
                : update({ timeLocal: event.target.value })}
              className="font-mono"
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(280px,540px)_minmax(320px,680px)]">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex min-w-[220px] flex-col gap-2">
              <Field
                label={t("fields.interval.timeLabel")}
                hint={`${formatUtcPreview(pendingTime)} UTC`}
                type="time"
                value={pendingTime}
                onChange={(event) => setPendingTime(event.target.value)}
                className="font-mono"
              />
            </div>
            <Button
              variant="primary"
              onClick={() => onChange(addTargetedTime(draft, pendingTime))}
              className="h-12 py-0 text-[14px] font-bold shadow-none"
            >
              {t("fields.interval.addTime")}
            </Button>
          </div>

          <div className="rounded-[12px] border border-border-dim p-4">
            <div className="mb-4 text-[10px] font-mono uppercase tracking-[0.28em] text-muted">{t("fields.interval.configuredTimes")}</div>
            <div className="flex flex-col gap-3">
              {normalizeTimes(draft.timesLocal).length === 0 ? (
                <div className="rounded-[10px] border border-dashed border-border-dim px-4 py-6 text-[13px] text-muted">{t("fields.interval.noConfiguredTimes")}</div>
              ) : (
                normalizeTimes(draft.timesLocal).map((time) => (
                  <div key={time} className="flex items-center justify-between rounded-[10px] border border-border-dim px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className="font-mono text-[16px] font-bold text-foreground">{time} <span className="font-sans text-[12px] text-muted">{t("fields.interval.localLabel")}</span></span>
                      <span className="font-mono text-[12px] text-muted">{formatUtcPreview(time)} UTC</span>
                    </div>
                    {/* Stays raw: a borderless red text action — ghost is grey and destructive is a bordered pill. */}
                    <button
                      type="button"
                      onClick={() => onChange(removeTargetedTime(draft, time))}
                      className="flex items-center gap-2 rounded-[8px] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-red-500 transition-colors hover:bg-red-500/10"
                    >
                      <Trash2 className="h-4 w-4" />
                      {t("fields.interval.removeTime")}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 rounded-[12px] border border-border-dim px-5 py-4 text-[15px] font-semibold text-foreground">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-brand" />
        <span>{buildSummary(t, draft, targetKind)}</span>
      </div>
    </section>
  );
}
