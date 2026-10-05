"use client";

import { useTranslations } from "next-intl";

import { Field } from "@/src/ui/components/screens/Field";
import { SettingRow } from "@/src/ui/components/screens/SettingsCard";
import { AGENT_LIMIT_CEILINGS, AGENT_LIMIT_DEFAULTS } from "../_lib/agentLimits";

/**
 * What bounds a single run, said once for both agent screens.
 *
 * The create screen and the settings screen each drew these five boxes
 * themselves. They looked identical and were not: the settings screen offered a
 * ceiling of 500 steps and 500 tool calls, the create screen 100. Both stated
 * their figure as *the* platform ceiling, so a new agent appeared more tightly
 * bounded than an existing one and there was no way to tell from either screen
 * which was true. Anthony spotted it, 2026-08-17, reading them side by side:
 * *"the edit and the add agents have different bounds"*.
 *
 * Two things went wrong to allow that, and only fixing both closes it:
 *
 * 1. Each screen carried its own copy of the numbers. They now come from
 *    `agentLimits.ts`, which reads the runtime's own constants.
 * 2. Each screen drew its own boxes. Now there is one set, here — so a change to
 *    how a budget box behaves cannot land on one screen and miss the other.
 *
 * There was a guard against the first of those, and it watched only the settings
 * screen. The screen it did not watch is the one that drifted.
 */

export type AgentBudgetValues = {
  maxSteps: string;
  maxToolCalls: string;
  maxInputTokens: string;
  maxRuntimeMinutes: string;
  maxCostUsd: string;
};

type BudgetKey = keyof AgentBudgetValues;

const BUDGET_KEYS: BudgetKey[] = [
  "maxSteps",
  "maxToolCalls",
  "maxInputTokens",
  "maxRuntimeMinutes",
  "maxCostUsd",
];

/** A limit as it should read on screen: grouped, and empty while it is empty. */
function formatLimitNumber(raw: string) {
  if (!raw) return "";
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed.toLocaleString("en-GB") : raw;
}

export function AgentBudgetFields({
  values,
  onChange,
  layout = "grid",
  costPerWebsite = false,
}: {
  values: AgentBudgetValues;
  onChange: (key: BudgetKey, value: string) => void;
  /**
   * The DataForSEO Collector reads its spend as a limit per website in one
   * collection, its runs being as long as the queue
   * (docs/plans/active/collection-progress-plan.md, decision 3).
   */
  costPerWebsite?: boolean;
  /**
   * `rows` for the Settings page, which is one setting per row; `grid` for the
   * create screen. The same five boxes either way — only where the words sit.
   */
  layout?: "grid" | "rows";
}) {
  // The settings screen's own wording, on both screens, so the two cannot say
  // the same thing two different ways.
  const t = useTranslations("admin.agents.details.settings");
  const rows = layout === "rows";

  const fields = BUDGET_KEYS.map((key) => {
        // A number input cannot carry separators, so the token budget — the only
        // limit here in the millions — is a text box that formats what is typed
        // and strips the commas on the way out.
        const grouped = key === "maxInputTokens";
        const perWebsite = costPerWebsite && key === "maxCostUsd";
        const label = perWebsite
          ? t("sections.engine.budget.fields.maxCostUsdPerWebsite")
          : t(`sections.engine.budget.fields.${key}`);
        const figures = {
          value: AGENT_LIMIT_DEFAULTS[key].toLocaleString("en-GB"),
          ceiling: AGENT_LIMIT_CEILINGS[key].toLocaleString("en-GB"),
        };
        const hint = perWebsite ? t("sections.engine.budget.perWebsite", figures) : t("sections.engine.budget.inherits", figures);
        // Over the ceiling, said in the app's words rather than the browser's
        // own bubble (Anthony met "Value must be less than or equal to 50",
        // 2026-10-05): the server holds a higher figure to the ceiling.
        const over = Number(values[key]) > AGENT_LIMIT_CEILINGS[key];

        const field = (
          <Field
            key={key}
            label={label}
            labelHidden={rows}
            id={`agent-limit-${key}`}
            type={grouped ? "text" : "number"}
            inputMode={grouped ? "numeric" : undefined}
            {...(grouped ? {} : { min: 0 })}
            step={key === "maxCostUsd" ? "0.01" : "1"}
            value={grouped ? formatLimitNumber(values[key]) : values[key]}
            onChange={(event) =>
              onChange(key, grouped ? event.target.value.replace(/[^0-9]/g, "") : event.target.value)
            }
            placeholder={AGENT_LIMIT_DEFAULTS[key].toLocaleString("en-GB")}
            hint={rows ? undefined : hint}
            error={over ? t("sections.engine.budget.overCeiling", { ceiling: figures.ceiling }) : undefined}
            className="px-3 text-[13px] focus:border-brand/40"
          />
        );
        return rows
          ? <SettingRow key={key} label={label} description={hint}>{field}</SettingRow>
          : field;
      });

  return rows
    ? <div className="divide-y divide-border-dim/40">{fields}</div>
    : <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">{fields}</div>;
}
