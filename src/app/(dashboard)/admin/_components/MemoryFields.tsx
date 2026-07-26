"use client";

import { AdminModalFormField, adminModalTextareaClassName } from "./AdminModalForm";

/**
 * The one thing that changes what a memory does.
 *
 * Company memory used to ask for one of eight categories and agent memory for
 * one of four kinds, and neither changed anything at runtime. This asks the
 * only question with an answer the reader can act on: does this apply to every
 * answer, or only when it comes up?
 */
export type MemoryApplyMode = "ALWAYS" | "WHEN_RELEVANT";

export const MEMORY_APPLY_MODE_OPTIONS: Array<{
  value: MemoryApplyMode;
  label: string;
  hint: string;
}> = [
  {
    value: "ALWAYS",
    label: "Always",
    hint: "Added to every answer. Use for tone and for things the AI must never get wrong.",
  },
  {
    value: "WHEN_RELEVANT",
    label: "When relevant",
    hint: "Looked up when the conversation touches on it. Use for facts and details.",
  },
];

export function MemoryApplyModeBadge({ applyMode }: { applyMode: MemoryApplyMode }) {
  const isAlways = applyMode === "ALWAYS";
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${
        isAlways
          ? "border-brand/30 bg-brand/10 text-brand"
          : "border-border-dim bg-foreground/5 text-secondary"
      }`}
    >
      {isAlways ? "Always" : "When relevant"}
    </span>
  );
}

type MemoryApplyModeChoiceProps = {
  value: MemoryApplyMode;
  onChange: (value: MemoryApplyMode) => void;
  /** How many Always slots remain, so the limit is visible before it is hit. */
  alwaysRemaining?: number;
};

export function MemoryApplyModeChoice({ value, onChange, alwaysRemaining }: MemoryApplyModeChoiceProps) {
  return (
    <AdminModalFormField label="When should the AI use this?">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {MEMORY_APPLY_MODE_OPTIONS.map((option) => {
          const isSelected = value === option.value;
          // Only blocked when the reader is not already on it: switching away
          // and back must always be possible.
          const isFull = option.value === "ALWAYS"
            && !isSelected
            && alwaysRemaining !== undefined
            && alwaysRemaining <= 0;

          return (
            <button
              key={option.value}
              type="button"
              disabled={isFull}
              onClick={() => onChange(option.value)}
              className={`flex flex-col gap-1 rounded-[10px] border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                isSelected
                  ? "border-brand/50 bg-brand/5"
                  : "border-border-dim hover:border-border-dim/80 hover:bg-foreground/[0.02]"
              }`}
            >
              <span className="text-[13px] font-semibold text-foreground">{option.label}</span>
              <span className="text-[11px] leading-relaxed text-secondary">
                {isFull ? "No Always slots left. Change one of the others first." : option.hint}
              </span>
            </button>
          );
        })}
      </div>
    </AdminModalFormField>
  );
}

type MemoryContentFieldProps = {
  value: string;
  onChange: (value: string) => void;
};

export function MemoryContentField({ value, onChange }: MemoryContentFieldProps) {
  return (
    <AdminModalFormField label="What the AI should know">
      <textarea
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${adminModalTextareaClassName} min-h-[180px]`}
        placeholder="We do not give delivery dates over chat. Ask the customer to email orders@ instead."
      />
    </AdminModalFormField>
  );
}
