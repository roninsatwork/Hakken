"use client";

import { getErrorMessage } from "@/src/lib/errors";
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { SquareTerminal, RefreshCcw, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { AdminSaveFeedback } from "@/src/app/(dashboard)/admin/_components/AdminSaveControls";
import { AiRuleSafetyWarningPanel } from "@/src/app/(dashboard)/admin/_components/AiRuleSafetyWarning";
import { AdminWriteButton } from "@/src/app/(dashboard)/admin/_components/AdminAccessLevel";


export default function AgentSystemPromptPage() {
  const t = useTranslations("admin.agents.details.systemPrompt");
  const params = useParams();
  const agentId = params.id as Id<"agents">;

  const agent = useQuery(api.agents.get, { id: agentId });
  const updateAgent = useMutation(api.agents.updateAgent);

  const [promptValue, setPromptValue] = useState("");
  const [jobValue, setJobValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const initializedAgentIdRef = useRef<Id<"agents"> | null>(null);

  const currentPrompt = agent?.systemPrompt ?? "";
  const currentJob = agent?.standingObjective ?? "";
  const isLoaded = agent !== undefined;

  useEffect(() => {
    if (!agent || initializedAgentIdRef.current === agent._id) return;

    initializedAgentIdRef.current = agent._id;
    setPromptValue(agent.systemPrompt ?? "");
    setJobValue(agent.standingObjective ?? "");
  }, [agent]);

  const hasUnsavedChanges = isLoaded && (promptValue !== currentPrompt || jobValue !== currentJob);

  const handleSave = async () => {
    if (!hasUnsavedChanges || isSaving) return;

    setIsSaving(true);
    setSaveStatus("idle");

    try {
      await updateAgent({ id: agentId, systemPrompt: promptValue, standingObjective: jobValue });
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3500);
    } catch (error: unknown) {
      console.error("Failed to commit System Prompt protocol:", error);
      setSaveStatus("error");
      setErrorMessage(getErrorMessage(error, t("errors.saveFailed")));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevert = () => {
    if (isLoaded) {
      setPromptValue(currentPrompt);
      setJobValue(currentJob);
      setSaveStatus("idle");
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-12 w-full h-full">
      {/* Admin Headers */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-[18px] font-semibold text-foreground tracking-tight flex items-center gap-2">
            <SquareTerminal className="w-5 h-5 text-brand" />
            {t("title")}
          </h2>
          <p className="text-[13px] text-secondary mt-1 tracking-wide">
            {t("subtitle", { name: agent?.name || "this agent" })}
          </p>
        </div>

        {/* Dynamic Action Area */}
        <div className="flex items-center gap-3">
          {hasUnsavedChanges && (
            <AdminWriteButton
              onClick={handleRevert}
              disabled={isSaving}
              className="flex items-center gap-2 px-3 py-2 rounded-full border border-border-dim text-secondary text-[12px] font-medium tracking-wide hover:bg-hover transition-colors disabled:opacity-50"
            >
              <RefreshCcw className="w-3.5 h-3.5" />
              <span>{t("revertButton")}</span>
            </AdminWriteButton>
          )}

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
            <span>{t("saveButton")}</span>
          </AdminWriteButton>
        </div>
      </header>

      <AdminSaveFeedback
        status={saveStatus}
        successTitle={t("feedback.success.title")}
        successMessage={t("feedback.success.subtitle")}
        errorTitle={t("feedback.error.title")}
        errorMessage={errorMessage}
      />

      {/* Flat Content Flow Section */}
      <div className="w-full h-[1px] bg-border-dim my-2" />

      {/* The job comes first because it is the thing that decides whether the
          agent can be run at all. Behaviour is refinement on top of it. */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 rounded-full bg-brand text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-brand/20">1</div>
          <span className="text-foreground text-[14px] font-bold tracking-wide">{t("sections.job.title")}</span>
        </div>

        <div className="flex flex-col gap-2 group">
          <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase ml-1">{t("sections.job.label")}</label>
          <textarea
            value={jobValue}
            onChange={(e) => setJobValue(e.target.value)}
            disabled={!isLoaded || isSaving}
            rows={4}
            className="w-full resize-none p-5 bg-transparent border border-border-dim rounded-[10px] text-foreground/90 font-mono text-[13px] leading-relaxed tracking-wide placeholder:text-muted/50 focus:outline-none focus:border-foreground/30 transition-colors dark:bg-[#111111]/30 custom-scrollbar"
            placeholder={t("sections.job.placeholder")}
            spellCheck={false}
          />
        </div>
      </section>

      <section className="flex flex-col gap-6 flex-1 min-h-[50vh] h-full relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-brand text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-brand/20">2</div>
            <span className="text-foreground text-[14px] font-bold tracking-wide">{t("sections.editor.title")}</span>
          </div>

          <div className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-mono tracking-widest transition-colors ${hasUnsavedChanges ? "bg-amber-500/10 text-amber-500 font-bold" : "bg-border-dim text-muted"
            }`}>
            {hasUnsavedChanges ? t("sections.editor.statusUnsaved") : t("sections.editor.statusSynced")}
          </div>
        </div>

        <div className="flex flex-col gap-2 flex-1 relative group">
          {/* The technical name, on the field it belongs to. Somebody who knows
              what a system prompt is should not have to guess which box it is. */}
          <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase ml-1">{t("sections.editor.label")}</label>
          <div className="relative flex-1 w-full bg-transparent border border-border-dim rounded-[10px] overflow-hidden transition-colors group-focus-within:border-foreground/30 shadow-sm dark:bg-[#111111]/30">
            {!isLoaded ? (
              <div className="absolute inset-0 flex items-center justify-center bg-transparent backdrop-blur-sm z-20">
                <div className="flex flex-col items-center gap-3 text-muted">
                  <RefreshCcw className="w-5 h-5 animate-spin opacity-50" />
                  <span className="text-[11px] font-mono tracking-widest uppercase">{t("sections.editor.loading")}</span>
                </div>
              </div>
            ) : null}

            <textarea
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              disabled={!isLoaded || isSaving}
              className="absolute inset-0 w-full h-full resize-none p-5 bg-transparent text-foreground/90 font-mono text-[13px] leading-relaxed tracking-wide placeholder:text-muted/50 focus:outline-none custom-scrollbar"
              placeholder={t("sections.editor.placeholder")}
              spellCheck={false}
            />
          </div>
        </div>

        <AiRuleSafetyWarningPanel trigger="" instruction={promptValue} subject="prompt" />
      </section>
    </div>
  );
}
