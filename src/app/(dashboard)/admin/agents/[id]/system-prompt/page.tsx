"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams } from "next/navigation";
import { Id } from "@/convex/_generated/dataModel";
import { SquareTerminal, RefreshCcw, Save, CheckCircle2, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function AgentSystemPromptPage() {
  const params = useParams();
  const agentId = params.id as Id<"agents">;
  
  const agent = useQuery(api.agents.get, { id: agentId });
  const updateAgent = useMutation(api.agents.updateAgent);

  const [promptValue, setPromptValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const currentPrompt = agent?.systemPrompt ?? "";
  const isLoaded = agent !== undefined;

  // Sync state once data loads
  useEffect(() => {
    if (isLoaded) {
      setPromptValue(currentPrompt);
    }
  }, [isLoaded, currentPrompt]);

  const hasUnsavedChanges = isLoaded && promptValue !== currentPrompt;

  const handleSave = async () => {
    if (!hasUnsavedChanges || isSaving) return;
    
    setIsSaving(true);
    setSaveStatus("idle");
    
    try {
      await updateAgent({ id: agentId, systemPrompt: promptValue });
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3500);
    } catch (error: any) {
      console.error("Failed to commit System Prompt protocol:", error);
      setSaveStatus("error");
      setErrorMessage(error.message || "Failed to transmit changes to the persistent store.");
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
          <h2 className="text-[18px] font-semibold text-foreground tracking-tight flex items-center gap-2">
            <SquareTerminal className="w-5 h-5 text-brand" />
            Agent System Prompt
          </h2>
          <p className="text-[13px] text-secondary mt-1 tracking-wide">
            Tenant-specific protocol overrides injected into the neural pipeline for {agent?.name || "this agent"}.
          </p>
        </div>
        
        {/* Dynamic Action Area */}
        <div className="flex items-center gap-3">
          {hasUnsavedChanges && (
            <button 
              onClick={handleRevert}
              disabled={isSaving}
              className="flex items-center gap-2 px-3 py-2 rounded-full border border-border-dim text-secondary text-[12px] font-medium tracking-wide hover:bg-hover transition-colors disabled:opacity-50"
            >
              <RefreshCcw className="w-3.5 h-3.5" />
              <span>Revert</span>
            </button>
          )}

          <button 
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
            <span>Commit Configuration</span>
          </button>
        </div>
      </header>

      {/* Inline Sonae Success Feedback */}
      <AnimatePresence mode="wait">
        {saveStatus === "success" && (
          <motion.div 
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-3 w-full bg-[#10b981]/10 border border-[#10b981]/20 rounded-[12px] p-4 text-[#10b981]">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <div className="flex flex-col">
                <span className="font-semibold text-[13px] tracking-wide">Protocol Synchronized</span>
                <span className="text-[12px] opacity-80">The structural system prompt was successfully deployed for this agent.</span>
              </div>
            </div>
          </motion.div>
        )}
        
        {saveStatus === "error" && (
          <motion.div 
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-3 w-full bg-red-500/10 border border-red-500/20 rounded-[12px] p-4 text-red-500">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <div className="flex flex-col">
                <span className="font-semibold text-[13px] tracking-wide">Transmission Failure</span>
                <span className="text-[12px] opacity-80">{errorMessage}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Flat Content Flow Section */}
      <div className="w-full h-[1px] bg-border-dim my-2" />

      <section className="flex flex-col gap-6 flex-1 min-h-[75vh] h-full relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-5 h-5 rounded-full bg-brand text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-brand/20">1</div>
             <span className="text-foreground text-[14px] font-bold tracking-wide">Agent Prompt Payload</span>
          </div>
           
           <div className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-mono tracking-widest transition-colors ${
             hasUnsavedChanges ? "bg-amber-500/10 text-amber-500 font-bold" : "bg-border-dim text-muted"
           }`}>
             {hasUnsavedChanges ? "Unsaved" : "Synced"}
           </div>
        </div>

        <div className="flex flex-col gap-2 flex-1 relative group">
          <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase ml-1">AGENT INSTRUCTION</label>
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
              placeholder="Initialize the agent-specific operating boundaries here... E.g., The primary focus of this agent is..."
              spellCheck={false}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
