"use client";

import { getErrorMessage } from "@/src/lib/errors";
import { lazy, Suspense, useState, useEffect, useRef } from "react";
import { 
  TerminalSquare, 
  Save, 
  RefreshCcw
} from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { AiRuleSafetyWarningPanel } from "@/src/app/(dashboard)/admin/_components/AiRuleSafetyWarning";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { useTranslations } from "next-intl";

const DeferredSaveFeedback = lazy(async () => {
  const { SaveFeedback: Component } = await import("@/src/ui/components/screens/SaveControls");
  return { default: Component };
});

export default function CompanySystemPromptPage() {
  const t = useTranslations("admin.companyDetails.prompt");
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  
  const company = useQuery(api.companies.getCompanyById, { id: companyId });
  const updatePrompt = useMutation(api.companies.updateCompanyPrompt);
  
  const [promptValue, setPromptValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const initializedCompanyIdRef = useRef<Id<"companies"> | null>(null);

  const currentPrompt = company?.systemPrompt ?? "";
  const isLoaded = company !== undefined;

  useEffect(() => {
    if (!company || initializedCompanyIdRef.current === company._id) return;

    initializedCompanyIdRef.current = company._id;
    setPromptValue(company.systemPrompt ?? "");
  }, [company]);

  const hasUnsavedChanges = isLoaded && promptValue !== currentPrompt;

  const handleSave = async () => {
    if (!hasUnsavedChanges || isSaving) return;
    
    setIsSaving(true);
    setSaveStatus("idle");
    
    try {
      await updatePrompt({ id: companyId, systemPrompt: promptValue });
      setSaveStatus("success");
      // Reset success status after exactly 3.5s for seamless fluid feedback
      setTimeout(() => setSaveStatus("idle"), 3500);
    } catch (error: unknown) {
      console.error("Failed to commit System Prompt protocol:", error);
      setSaveStatus("error");
      setErrorMessage(getErrorMessage(error, t("saveFailedFallback")));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevert = () => {
    if (isLoaded) {
      setPromptValue(currentPrompt);
      setSaveStatus("idle");
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-12 w-full h-full">
      <PageHeader
        icon={<TerminalSquare className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("subtitle", { name: company?.name || t("thisWorkspace") })}
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
              className={`flex items-center gap-2 px-5 py-2 rounded-full font-medium tracking-wide text-[12px] transition-all duration-300 shadow-sm ${
                hasUnsavedChanges
                  ? "bg-foreground text-background hover:opacity-90 dark:shadow-black/30"
                  : "bg-card border border-border-dim text-muted cursor-not-allowed"
              }`}
            >
              {isSaving ? (
                <RefreshCcw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>{t("savePrompt")}</span>
            </WriteButton>
          </div>
        }
      />

      {saveStatus !== "idle" ? (
        <Suspense fallback={null}>
          <DeferredSaveFeedback
            status={saveStatus}
            successTitle={t("savedTitle")}
            successMessage={t("savedMessage")}
            errorTitle={t("saveFailedTitle")}
            errorMessage={errorMessage}
          />
        </Suspense>
      ) : null}

      {/* Flat Content Flow Section */}
      <div className="w-full h-[1px] bg-border-dim my-2" />

      <section className="flex flex-col gap-6 flex-1 min-h-[40vh] h-full relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-5 h-5 rounded-full bg-brand text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-brand/20">1</div>
             <span className="text-foreground text-[14px] font-bold tracking-wide">{t("sectionTitle")}</span>
          </div>
           
           <div className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-mono tracking-widest transition-colors ${
             hasUnsavedChanges ? "bg-amber-500/10 text-amber-500 font-bold" : "bg-border-dim text-muted"
           }`}>
             {hasUnsavedChanges ? t("unsaved") : t("synced")}
           </div>
        </div>

        <div className="flex flex-col gap-2 flex-1 relative group">
          <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase ml-1">{t("instructionsLabel")}</label>
          <div className="relative flex-1 w-full bg-transparent border border-border-dim rounded-[10px] overflow-hidden transition-colors group-focus-within:border-foreground/30 shadow-sm dark:bg-[#111111]/30">
            {!isLoaded ? (
              <div className="absolute inset-0 flex items-center justify-center bg-transparent backdrop-blur-sm z-20">
                 <div className="flex flex-col items-center gap-3 text-muted">
                   <RefreshCcw className="w-5 h-5 animate-spin opacity-50" />
                   <span className="text-[11px] font-mono tracking-widest uppercase">{t("connecting")}</span>
                 </div>
              </div>
            ) : null}

            <textarea
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              disabled={!isLoaded || isSaving}
              className="absolute inset-0 w-full h-full resize-none p-5 bg-transparent text-foreground/90 font-mono text-[13px] leading-relaxed tracking-wide placeholder:text-muted/50 focus:outline-none custom-scrollbar"
              placeholder={t("placeholder")}
              spellCheck={false}
            />
          </div>
        </div>

        <AiRuleSafetyWarningPanel trigger="" instruction={promptValue} subject="prompt" />
      </section>
    </div>
  );
}
