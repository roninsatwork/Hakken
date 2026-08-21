"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ToggleLeft, ToggleRight } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { getErrorMessage } from "@/src/lib/errors";
import { SaveAction, SaveError } from "@/src/ui/components/screens/SaveControls";
import { SettingBlock } from "./SettingBlock";
import { useTranslations } from "next-intl";

type SwitchKey =
  | "autoReflection"
  | "outcomeWeightedRanking"
  | "endUserFeedback"
  | "retrievalPriors"
  | "autonomousMemory";

type SwitchState = Record<SwitchKey, boolean>;

/**
 * Each row explains itself in operator language, because the person deciding
 * whether to switch learning behaviour off mid-incident should not need the
 * plan document open to know what stops.
 */
const LEARNING_SWITCHES: Array<{ key: SwitchKey; labelKey: string; subKey: string }> = [
  { key: "autoReflection", labelKey: "autoReflection", subKey: "autoReflectionSub" },
  { key: "outcomeWeightedRanking", labelKey: "outcomeWeightedRanking", subKey: "outcomeWeightedRankingSub" },
  { key: "endUserFeedback", labelKey: "endUserFeedback", subKey: "endUserFeedbackSub" },
  { key: "retrievalPriors", labelKey: "retrievalPriors", subKey: "retrievalPriorsSub" },
];

/**
 * The self-improvement switches from docs/plans/active/self-improvement-plan.md.
 *
 * The first four switches control learning that reorders or scores. The
 * autonomy switch below them is different in kind — with it on, what the AI
 * learns is saved to memory immediately, with no per-memory approval (owner
 * decision, 2026-08-10). It renders apart with its own explanation because
 * it is the one switch that changes who writes memory.
 */
export function SelfImprovementSection() {
  const t = useTranslations("admin.settings.selfImprovement");
  const config = useQuery(api.selfImprovementConfig.getConfig, {});
  const updateConfig = useMutation(api.selfImprovementConfig.updateConfig);

  const [switches, setSwitches] = useState<SwitchState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (config) setSwitches(config);
  }, [config]);

  const handleSave = async () => {
    if (!switches) return;
    setIsSaving(true);
    setSaveError("");
    try {
      await updateConfig(switches);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      setSaveError(getErrorMessage(error, t("saveFailed")));
    } finally {
      setIsSaving(false);
    }
  };

  const renderToggle = (key: SwitchKey, label: string, sub: string) => {
    const isOn = switches?.[key] ?? false;
    return (
      // Stays raw: a full-width aria-pressed toggle card — matches no variant.
      <button
        key={key}
        type="button"
        aria-pressed={isOn}
        disabled={switches === null}
        onClick={() => switches && setSwitches({ ...switches, [key]: !switches[key] })}
        className="flex items-center justify-between gap-4 w-full rounded-[16px] border border-border-dim bg-background/50 p-5 text-left transition-colors hover:bg-hover/40 disabled:opacity-50"
      >
        <span className="flex flex-col gap-1 min-w-0">
          <span className={`text-[14px] font-semibold ${isOn ? "text-foreground" : "text-muted"}`}>
            {label} — {isOn ? t("on") : t("off")}
          </span>
          <span className="text-[12px] text-secondary leading-relaxed">{sub}</span>
        </span>
        <span className={`flex-shrink-0 transition-colors ${isOn ? "text-brand" : "text-muted"}`}>
          {isOn ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
        </span>
      </button>
    );
  };

  return (
    <SettingBlock
      title={t("title")}
      sub={t("subtitle")}
    >
      <div className="flex flex-col gap-3">
        {LEARNING_SWITCHES.map((entry) => renderToggle(entry.key, t(entry.labelKey), t(entry.subKey)))}

        <div className="mt-2 rounded-[16px] border border-warning/30 bg-warning/5 p-4 flex flex-col gap-3">
          <p className="text-[12px] text-secondary leading-relaxed">
            {t("autonomyExplainer")}
          </p>
          {renderToggle(
            "autonomousMemory",
            t("autonomousMemory"),
            t("autonomousMemorySub")
          )}
        </div>

        <SaveError>{saveError}</SaveError>

        <div className="flex justify-end">
          <SaveAction
            onClick={handleSave}
            isSaving={isSaving}
            showSuccess={saveSuccess}
            label={t("save")}
            savingLabel={t("saving")}
            successLabel={t("saved")}
            disabled={switches === null}
          />
        </div>
      </div>
    </SettingBlock>
  );
}
