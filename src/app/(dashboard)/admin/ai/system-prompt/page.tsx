"use client";

import { useAdminAction } from "@/src/hooks/useAdminAction";
import { lazy, Suspense, useState } from "react";
import { useTranslations } from "next-intl";
import {
  TerminalSquare,
  Save,
  RefreshCcw
} from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AiRuleSafetyWarningPanel } from "@/src/app/(dashboard)/admin/_components/AiRuleSafetyWarning";
import { AiWorkspaceNav } from "../_components/AiWorkspaceNav";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";

const DeferredSaveFeedback = lazy(async () => {
  const { SaveFeedback: Component } = await import("@/src/ui/components/screens/SaveControls");
  return { default: Component };
});

export default function SystemPromptPage() {
  const t = useTranslations("ai.systemPrompt");
  const currentPrompt = useQuery(api.system.getSystemPrompt);
  const updatePrompt = useMutation(api.system.updateSystemPrompt);

  const [promptValue, setPromptValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const action = useAdminAction({ scope: "admin-system-prompt" });
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [hasLoadedPrompt, setHasLoadedPrompt] = useState(false);
  if (currentPrompt !== undefined && !hasLoadedPrompt) {
    setHasLoadedPrompt(true);
    setPromptValue(currentPrompt || "");
  }

  const hasUnsavedChanges = currentPrompt !== undefined && promptValue !== currentPrompt;

  const handleSave = async () => {
    if (!hasUnsavedChanges || isSaving) return;

    setIsSaving(true);
    setSaveStatus("idle");

    const outcome = await action.run(async () => {
      await updatePrompt({ prompt: promptValue });
    }, { key: "save", suppressErrorToast: true, fallbackMessage: t("error.defaultMsg") });
    if (outcome.ok) {
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3500);
    } else {
      setSaveStatus("error");
      if (outcome.message) setErrorMessage(outcome.message);
    }
    setIsSaving(false);
  };

  const handleRevert = () => {
    if (currentPrompt !== undefined) {
      setPromptValue(currentPrompt || "");
      setSaveStatus("idle");
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-12 w-full h-full">
      {/* Admin Headers */}
      <PageHeader
        icon={<TerminalSquare className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
        divider
        action={
          <div className="flex items-center gap-3">
            {hasUnsavedChanges && (
              <WriteButton
                onClick={handleRevert}
                disabled={isSaving}
                className="flex items-center gap-2 px-3 py-2 rounded-full border border-border-dim text-secondary text-[12px] font-medium tracking-wide hover:bg-hover transition-colors disabled:opacity-50"
              >
                <RefreshCcw className="w-3.5 h-3.5" />
                <span>{t("revert")}</span>
              </WriteButton>
            )}

            <WriteButton
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
              <span>{t("commit")}</span>
            </WriteButton>
          </div>
        }
      />

      <AiWorkspaceNav />

      {saveStatus !== "idle" ? (
        <Suspense fallback={null}>
          <DeferredSaveFeedback
            status={saveStatus}
            successTitle={t("success.title")}
            successMessage={t("success.message")}
            errorTitle={t("error.title")}
            errorMessage={errorMessage}
          />
        </Suspense>
      ) : null}

      {/* Flat Content Flow Section */}
      <div className="w-full h-[1px] bg-border-dim my-2" />

      <section className="flex flex-col gap-6 flex-1 min-h-[75vh] h-full relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-brand text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-brand/20">1</div>
            <span className="text-foreground text-[14px] font-bold tracking-wide">{t("section.title")}</span>
          </div>

          <div className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-mono tracking-widest transition-colors ${hasUnsavedChanges ? "bg-amber-500/10 text-amber-500 font-bold" : "bg-border-dim text-muted"
            }`}>
            {hasUnsavedChanges ? t("section.unsaved") : t("section.synced")}
          </div>
        </div>

        <div className="flex flex-col gap-2 flex-1 relative group">
          <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase ml-1">{t("section.label")}</label>
          <div className="relative flex-1 w-full bg-transparent border border-border-dim rounded-[10px] overflow-hidden transition-colors group-focus-within:border-foreground/30 shadow-sm dark:bg-[#111111]/30">
            {currentPrompt === undefined ? (
              <div className="absolute inset-0 flex items-center justify-center bg-transparent backdrop-blur-sm z-20">
                <div className="flex flex-col items-center gap-3 text-muted">
                  <RefreshCcw className="w-5 h-5 animate-spin opacity-50" />
                  <span className="text-[11px] font-mono tracking-widest uppercase">{t("section.connecting")}</span>
                </div>
              </div>
            ) : null}

            <textarea
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              disabled={currentPrompt === undefined || isSaving}
              className="absolute inset-0 w-full h-full resize-none p-5 bg-transparent text-foreground/90 font-mono text-[13px] leading-relaxed tracking-wide placeholder:text-muted/50 focus:outline-none custom-scrollbar"
              placeholder={t("section.placeholder")}
              spellCheck={false}
            />
          </div>
        </div>

        <AiRuleSafetyWarningPanel trigger="" instruction={promptValue} subject="prompt" />
      </section>
    </div>
  );
}
