"use client";

import { useState, useEffect } from "react";
import { 
  Activity,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Database,
  LineChart, 
  MessageSquare,
  Save, 
  RefreshCcw,
} from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { getErrorMessage } from "@/src/lib/errors";
import { AdminSaveFeedback } from "@/src/app/(dashboard)/admin/_components/AdminSaveControls";

function formatCount(value: number) {
  return new Intl.NumberFormat("en-GB").format(value);
}

export default function AnalyticsPage() {
  const currentId = useQuery(api.system.getAnalyticsId);
  const health = useQuery(api.analyticsCron.getAnalyticsDataHealthForAdmin, { daysBack: 7 });
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
  const healthIssueCount = health
    ? health.snapshotCoverage.missingGlobalDates.length +
      health.snapshotCoverage.duplicateSnapshotGroups.length +
      health.messageDimensions.missingDimensions +
      health.messageDimensions.mismatched +
      health.messageDimensions.missingThreads
    : 0;
  const isHealthLoading = health === undefined;
  const isHealthy = !isHealthLoading && healthIssueCount === 0;

  const handleSave = async () => {
    if (!hasUnsavedChanges || isSaving) return;
    
    setIsSaving(true);
    setSaveStatus("idle");
    
    try {
      await updateId({ trackingId: trackingId.trim() });
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3500);
    } catch (error: unknown) {
      console.error("Failed to save analytics configuration:", error);
      setSaveStatus("error");
      setErrorMessage(getErrorMessage(error, "Failed to transmit changes to the persistent Edge store."));
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

      <AdminSaveFeedback
        status={saveStatus}
        successTitle="Tracking Integrated"
        successMessage="The structural analytics script identifier was successfully deployed to the platform core."
        errorTitle="Transmission Failure"
        errorMessage={errorMessage}
      />

      {/* Flat Content Flow Section */}
      <div className="w-full h-[1px] bg-border-dim my-2" />

      <section className="flex flex-col gap-5 relative">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-500 flex items-center justify-center shadow-md shadow-emerald-500/10">
              <Activity className="w-3 h-3" />
            </div>
            <div>
              <span className="text-foreground text-[14px] font-bold tracking-wide">Analytics Data Health</span>
              <p className="text-[12px] text-muted mt-0.5">
                Snapshot coverage, dimension drift, and live ingestion over the last 7 days.
              </p>
            </div>
          </div>

          <div className={`inline-flex items-center gap-2 self-start sm:self-auto px-3 py-1.5 rounded-full border text-[10px] uppercase font-mono tracking-widest ${
            isHealthLoading
              ? "border-border-dim text-muted bg-card"
              : isHealthy
                ? "border-emerald-500/20 text-emerald-500 bg-emerald-500/10"
                : "border-amber-500/20 text-amber-500 bg-amber-500/10"
          }`}>
            {isHealthLoading ? (
              <RefreshCcw className="w-3 h-3 animate-spin" />
            ) : isHealthy ? (
              <CheckCircle2 className="w-3 h-3" />
            ) : (
              <AlertTriangle className="w-3 h-3" />
            )}
            <span>{isHealthLoading ? "Checking" : isHealthy ? "Healthy" : `${healthIssueCount} signals`}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="rounded-[10px] border border-border-dim bg-card/40 p-4 flex flex-col gap-3 min-h-[132px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted">Snapshots</span>
              <Database className="w-4 h-4 text-brand" />
            </div>
            <div className="text-2xl font-semibold text-foreground">
              {health ? formatCount(health.snapshotCoverage.totalSnapshots) : "--"}
            </div>
            <p className="text-[12px] text-secondary leading-relaxed">
              {health
                ? `${formatCount(health.snapshotCoverage.missingGlobalDates.length)} missing global dates, ${formatCount(health.snapshotCoverage.duplicateSnapshotGroups.length)} duplicate groups.`
                : "Loading snapshot coverage."}
            </p>
          </div>

          <div className="rounded-[10px] border border-border-dim bg-card/40 p-4 flex flex-col gap-3 min-h-[132px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted">Dimensions</span>
              <MessageSquare className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-semibold text-foreground">
              {health ? formatCount(health.messageDimensions.scanned) : "--"}
            </div>
            <p className="text-[12px] text-secondary leading-relaxed">
              {health
                ? `${formatCount(health.messageDimensions.missingDimensions)} missing, ${formatCount(health.messageDimensions.mismatched)} mismatched, ${formatCount(health.messageDimensions.missingThreads)} missing threads.`
                : "Loading recent message checks."}
            </p>
          </div>

          <div className="rounded-[10px] border border-border-dim bg-card/40 p-4 flex flex-col gap-3 min-h-[132px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted">Live Today</span>
              <Activity className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-2xl font-semibold text-foreground">
              {health ? formatCount(health.liveToday.assistantMessages) : "--"}
            </div>
            <p className="text-[12px] text-secondary leading-relaxed">
              {health
                ? `${formatCount(health.liveToday.agentTransactions)} agent transactions on ${health.liveToday.date}.`
                : "Loading today's live ingestion."}
            </p>
          </div>

          <div className="rounded-[10px] border border-border-dim bg-card/40 p-4 flex flex-col gap-3 min-h-[132px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted">Window</span>
              <CalendarDays className="w-4 h-4 text-rose-500" />
            </div>
            <div className="text-2xl font-semibold text-foreground">
              {health ? `${health.daysBack}d` : "--"}
            </div>
            <p className="text-[12px] text-secondary leading-relaxed">
              {health
                ? `${health.checkedDates[0]} through ${health.checkedDates[health.checkedDates.length - 1]}.`
                : "Loading checked date range."}
            </p>
          </div>
        </div>

        {health && !isHealthy ? (
          <div className="rounded-[10px] border border-amber-500/20 bg-amber-500/10 p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-amber-500">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-[12px] font-bold uppercase tracking-widest">Operator attention needed</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-[12px] text-secondary leading-relaxed">
              <p>
                Missing snapshot dates: {health.snapshotCoverage.missingGlobalDates.length > 0
                  ? health.snapshotCoverage.missingGlobalDates.join(", ")
                  : "none"}.
              </p>
              <p>
                Duplicate snapshot groups: {health.snapshotCoverage.duplicateSnapshotGroups.length > 0
                  ? health.snapshotCoverage.duplicateSnapshotGroups.map((group) => `${group.date} ${group.type}:${group.scopeId}`).join(", ")
                  : "none"}.
              </p>
              <p>
                Message dimension examples: {health.messageDimensions.examples.length > 0
                  ? health.messageDimensions.examples.join(", ")
                  : "none"}.
              </p>
              <p>
                Next action: run the documented Convex health/backfill commands before removing legacy analytics fallbacks.
              </p>
            </div>
          </div>
        ) : null}
      </section>

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
