"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ToggleLeft, ToggleRight } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { getErrorMessage } from "@/src/lib/errors";
import { AdminSaveAction, AdminSaveError } from "@/src/app/(dashboard)/admin/_components/AdminSaveControls";
import { SettingBlock } from "./SettingBlock";

type SwitchKey =
  | "autoReflection"
  | "outcomeWeightedRanking"
  | "endUserFeedback"
  | "retrievalPriors"
  | "autoApplyLowRisk";

type SwitchState = Record<SwitchKey, boolean>;

/**
 * Each row explains itself in operator language, because the person deciding
 * whether to switch learning behaviour off mid-incident should not need the
 * plan document open to know what stops.
 */
const LEARNING_SWITCHES: Array<{ key: SwitchKey; label: string; sub: string }> = [
  {
    key: "autoReflection",
    label: "Learn from failed runs",
    sub: "When an agent run fails, the platform writes up why and queues anything worth remembering for review. Off: write-ups only happen when an admin asks on the run screen.",
  },
  {
    key: "outcomeWeightedRanking",
    label: "Prefer memories with a good track record",
    sub: "Approved memories that keep helping rank higher; ones present in failed runs rank lower. Nothing is ever hidden or removed by this. Off: newest-first ordering.",
  },
  {
    key: "endUserFeedback",
    label: "Feedback buttons in chat",
    sub: "Users can mark an answer Helpful or Not right, and that feeds the suggestion queue. Off: the buttons disappear and nothing is collected.",
  },
  {
    key: "retrievalPriors",
    label: "Knowledge search learns from rated answers",
    sub: "Documents that keep producing well-rated answers get a small ranking boost, within a hard cap. Off: pure text relevance.",
  },
];

/**
 * The self-improvement switches from docs/plans/active/self-improvement-plan.md.
 *
 * The first four switches control learning that only reorders or proposes —
 * a person still approves every new memory. The autonomy switch is different
 * in kind, which is why it renders apart with its own warning: it is the one
 * setting on this screen that lets the AI believe something no one approved.
 */
export function SelfImprovementSection() {
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
      setSaveError(getErrorMessage(error, "Could not save the learning switches."));
    } finally {
      setIsSaving(false);
    }
  };

  const renderToggle = (key: SwitchKey, label: string, sub: string) => {
    const isOn = switches?.[key] ?? false;
    return (
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
            {label} — {isOn ? "on" : "off"}
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
      title="Self-Improvement"
      sub="How the AI learns from what happens. Every switch takes effect platform-wide as soon as it is saved."
    >
      <div className="flex flex-col gap-3">
        {LEARNING_SWITCHES.map((entry) => renderToggle(entry.key, entry.label, entry.sub))}

        <div className="mt-2 rounded-[16px] border border-amber-500/30 bg-amber-500/5 p-4 flex flex-col gap-3">
          <p className="text-[12px] text-secondary leading-relaxed">
            The switch below is different from the ones above. With it on, the AI may
            save certain low-risk facts to its own memory without anyone approving
            them first — they are marked, reviewable, and expire after 30 days unless
            confirmed, but they change answers from the moment they are saved. Leave
            it off unless that trade has been decided deliberately.
          </p>
          {renderToggle(
            "autoApplyLowRisk",
            "Autonomous memory (low-risk facts only)",
            "The AI saves LOW-risk facts and summaries itself, on probation, capped per day. Off: every memory waits for approval."
          )}
        </div>

        <AdminSaveError>{saveError}</AdminSaveError>

        <div className="flex justify-end">
          <AdminSaveAction
            onClick={handleSave}
            isSaving={isSaving}
            showSuccess={saveSuccess}
            label="Save switches"
            savingLabel="Saving..."
            successLabel="Saved"
            disabled={switches === null}
          />
        </div>
      </div>
    </SettingBlock>
  );
}
