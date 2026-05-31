"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  LineChart, 
  Save, 
  RefreshCcw,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function AnalyticsPage() {
  const currentId = useQuery(api.system.getAnalyticsId);
  const updateId = useMutation(api.system.updateAnalyticsId);
  
  const [trackingId, setTrackingId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  // Sync state once data loads
  useEffect(() => {
    if (currentId !== undefined) {
      setTrackingId(currentId || "");
    }
  }, [currentId]);

  const hasUnsavedChanges = currentId !== undefined && trackingId !== currentId;

  const handleSave = async () => {
    if (!hasUnsavedChanges || isSaving) return;
    
    setIsSaving(true);
    setSaveStatus("idle");
    
    try {
      await updateId({ trackingId: trackingId.trim() });
      setSaveStatus("success");
      // Reset success status after exactly 3.5s for seamless fluid feedback
      setTimeout(() => setSaveStatus("idle"), 3500);
    } catch (error: unknown) {
      console.error("Failed to save analytics configuration:", error);
      setSaveStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Failed to transmit changes to the persistent Edge store.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevert = () => {
    if (currentId !== undefined) {
      setTrackingId(currentId || "");
      setSaveStatus("idle");
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-12 w-full h-full">
      {/* Admin Headers */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <LineChart className="w-6 h-6 text-brand" />
            Global Analytics Engine
          </h1>
          <p className="text-[13px] text-secondary mt-1 tracking-wide">
            Integrate Google Tag Manager (GTM) or Google Analytics (GA4) system-wide.
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
                <span className="font-semibold text-[13px] tracking-wide">Tracking Integrated</span>
                <span className="text-[12px] opacity-80">The structural analytics script identifier was successfully deployed to the platform core.</span>
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

      <section className="flex flex-col gap-6 relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-5 h-5 rounded-full bg-brand text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-brand/20">1</div>
             <span className="text-foreground text-[14px] font-bold tracking-wide">Tracking Container Code</span>
          </div>
           
           <div className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-mono tracking-widest transition-colors ${
             hasUnsavedChanges ? "bg-amber-500/10 text-amber-500 font-bold" : "bg-border-dim text-muted"
           }`}>
             {hasUnsavedChanges ? "Unsaved" : "Synced"}
           </div>
        </div>

        <div className="flex flex-col gap-2 relative group max-w-xl">
          <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase ml-1">Universal Tracking ID</label>
          <div className="relative w-full bg-transparent border border-border-dim rounded-[10px] overflow-hidden transition-colors group-focus-within:border-foreground/30 shadow-sm dark:bg-[#111111]/30">
            {currentId === undefined ? (
              <div className="absolute inset-0 flex items-center justify-center bg-transparent backdrop-blur-sm z-20">
                 <div className="flex flex-col items-center gap-3 text-muted">
                   <RefreshCcw className="w-5 h-5 animate-spin opacity-50" />
                   <span className="text-[11px] font-mono tracking-widest uppercase">Connecting...</span>
                 </div>
              </div>
            ) : null}

            <input
              value={trackingId}
              onChange={(e) => setTrackingId(e.target.value)}
              disabled={currentId === undefined || isSaving}
              className="w-full outline-none border-none p-5 bg-transparent text-foreground/90 font-mono text-[14px] leading-relaxed tracking-widest placeholder:text-muted/50 focus:outline-none"
              placeholder="e.g. GTM-XXXXXXX or G-XXXXXXX"
              spellCheck={false}
            />
          </div>
          <p className="text-[13px] text-muted font-light leading-relaxed px-1 mt-1">
            Specify the Google Tag Manager (GTM-XXXXX) ID, or Google Analytics Universal (G-XXXXX/AW-XXXXX) ID. The system safely mounts this ID using the Next.js official third-party router logic so it avoids execution-blocking delays and guarantees platform stability. Leave blank and click commit to remove analytics completely.
          </p>
        </div>
      </section>
    </div>
  );
}
