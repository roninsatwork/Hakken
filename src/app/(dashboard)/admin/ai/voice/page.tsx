"use client";

import { getErrorMessage } from "@/src/lib/errors";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { AudioLines, Check, RefreshCcw, Save } from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AdminSaveFeedback } from "@/src/app/(dashboard)/admin/_components/AdminSaveControls";
import { AdminWriteButton } from "@/src/app/(dashboard)/admin/_components/AdminAccessLevel";
import { AiWorkspaceNav } from "../_components/AiWorkspaceNav";
import { cn } from "@/src/ui/lib/utils";

/**
 * One voice for everywhere Sonae speaks.
 *
 * Ask Sonae's voice overlay, the phone line and the reception screen all
 * read the same workspace setting, so the choice made here is the voice at
 * every door at once. The change applies to new conversations immediately —
 * a call already underway keeps the voice it started with.
 */
export default function SpokenVoicePage() {
  const t = useTranslations("aiVoice");
  const setting = useQuery(api.voiceSettings.getSpokenVoice, {});
  const setSpokenVoice = useMutation(api.voiceSettings.setSpokenVoice);

  const [draft, setDraft] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const selected = draft ?? setting?.voice;
  const hasUnsavedChanges = setting !== undefined && selected !== setting.voice;

  const handleSave = async () => {
    if (!hasUnsavedChanges || isSaving || !selected) return;
    setIsSaving(true);
    setSaveStatus("idle");
    try {
      await setSpokenVoice({ voice: selected });
      setDraft(null);
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3500);
    } catch (error: unknown) {
      setSaveStatus("error");
      setErrorMessage(getErrorMessage(error, t("error.message")));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-12 w-full">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <AudioLines className="w-6 h-6 text-brand" />
            {t("title")}
          </h1>
          <p className="text-[13px] text-secondary mt-1 tracking-wide">{t("subtitle")}</p>
        </div>

        <AdminWriteButton
          onClick={handleSave}
          disabled={!hasUnsavedChanges || isSaving}
          className={`flex items-center gap-2 px-5 py-2 rounded-full font-medium tracking-wide text-[12px] transition-all duration-300 shadow-sm ${hasUnsavedChanges
              ? "bg-foreground text-background hover:opacity-90 dark:shadow-black/30"
              : "bg-card border border-border-dim text-muted cursor-not-allowed"
            }`}
        >
          {isSaving ? (
            <RefreshCcw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          <span>{t("save")}</span>
        </AdminWriteButton>
      </header>

      <AiWorkspaceNav />

      <AdminSaveFeedback
        status={saveStatus}
        successTitle={t("success.title")}
        successMessage={t("success.message")}
        errorTitle={t("error.title")}
        errorMessage={errorMessage}
      />

      <div className="w-full h-[1px] bg-border-dim my-2" />

      <section className="flex flex-col gap-4 max-w-2xl">
        <p className="text-[13px] leading-relaxed text-secondary">{t("hint")}</p>

        {setting === undefined ? (
          <div className="flex items-center gap-3 text-muted py-8">
            <RefreshCcw className="w-4 h-4 animate-spin opacity-50" />
            <span className="text-[11px] font-mono tracking-widest uppercase">{t("loading")}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3" role="radiogroup" aria-label={t("title")}>
            {setting.options.map((option) => {
              const isSelected = option.key === selected;
              return (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setDraft(option.key)}
                  className={cn(
                    "flex items-center justify-between rounded-[12px] border px-5 py-4 text-left transition-colors",
                    isSelected
                      ? "border-brand/60 bg-brand/5"
                      : "border-border-dim hover:bg-hover"
                  )}
                >
                  <span className="flex flex-col gap-1">
                    <span className="text-[14px] font-medium text-foreground">{option.key}</span>
                    <span className="text-[12px] text-secondary">
                      {t(`voices.${option.key}`)}
                    </span>
                  </span>
                  {isSelected && <Check className="w-4 h-4 text-brand" />}
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
