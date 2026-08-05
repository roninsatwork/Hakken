"use client";

import { getErrorMessage } from "@/src/lib/errors";
import { useState, useEffect, useRef } from "react";
import { 
  TerminalSquare, 
  Save, 
  RefreshCcw
} from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { AdminSaveFeedback } from "@/src/app/(dashboard)/admin/_components/AdminSaveControls";
import { AiRuleSafetyWarningPanel } from "@/src/app/(dashboard)/admin/_components/AiRuleSafetyWarning";
import { AdminWriteButton } from "@/src/app/(dashboard)/admin/_components/AdminAccessLevel";


export default function CompanySystemPromptPage() {
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
      setErrorMessage(getErrorMessage(error, "Failed to save changes."));
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
      {/* Admin Headers */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <TerminalSquare className="w-6 h-6 text-brand" />
            Company Prompt
          </h1>
          <p className="text-[13px] text-secondary mt-1 tracking-wide">
            Custom instructions and rules that apply to all AI agents in {company?.name || "this workspace"}.
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
              <span>Revert</span>
            </AdminWriteButton>
          )}

          <AdminWriteButton 
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
            <span>Save Prompt</span>
          </AdminWriteButton>
        </div>
      </header>

      <AdminSaveFeedback
        status={saveStatus}
        successTitle="Prompt Saved"
        successMessage="The company prompt was successfully updated."
        errorTitle="Save Failed"
        errorMessage={errorMessage}
      />

      {/* Flat Content Flow Section */}
      <div className="w-full h-[1px] bg-border-dim my-2" />

      <section className="flex flex-col gap-6 flex-1 min-h-[40vh] h-full relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-5 h-5 rounded-full bg-brand text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-brand/20">1</div>
             <span className="text-foreground text-[14px] font-bold tracking-wide">Company Instructions</span>
          </div>
           
           <div className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-mono tracking-widest transition-colors ${
             hasUnsavedChanges ? "bg-amber-500/10 text-amber-500 font-bold" : "bg-border-dim text-muted"
           }`}>
             {hasUnsavedChanges ? "Unsaved" : "Synced"}
           </div>
        </div>

        <div className="flex flex-col gap-2 flex-1 relative group">
          <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase ml-1">INSTRUCTIONS</label>
          <div className="relative flex-1 w-full bg-transparent border border-border-dim rounded-[10px] overflow-hidden transition-colors group-focus-within:border-foreground/30 shadow-sm dark:bg-[#111111]/30">
            {!isLoaded ? (
              <div className="absolute inset-0 flex items-center justify-center bg-transparent backdrop-blur-sm z-20">
                 <div className="flex flex-col items-center gap-3 text-muted">
                   <RefreshCcw className="w-5 h-5 animate-spin opacity-50" />
                   <span className="text-[11px] font-mono tracking-widest uppercase">Connecting...</span>
                 </div>
              </div>
            ) : null}

            <textarea
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              disabled={!isLoaded || isSaving}
              className="absolute inset-0 w-full h-full resize-none p-5 bg-transparent text-foreground/90 font-mono text-[13px] leading-relaxed tracking-wide placeholder:text-muted/50 focus:outline-none custom-scrollbar"
              placeholder="Initialize the company-specific operating boundaries here... E.g., The primary focus of this workspace is..."
              spellCheck={false}
            />
          </div>
        </div>

        <AiRuleSafetyWarningPanel trigger="" instruction={promptValue} subject="prompt" />
      </section>
    </div>
  );
}
