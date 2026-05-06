"use client";

import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Activity, Loader2, CheckCircle2, XCircle, RefreshCcw } from "lucide-react";
import Header from "@/src/ui/components/layout/Header";
import { useState } from "react";

export default function PropertiesLogsPage() {
  const latestRuns = useQuery(api.properties.getLatestRuns) || [];
  const syncRun = useAction(api.apify.syncRunStatus);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const handleSync = async (runId: string) => {
    setSyncingId(runId);
    try {
      await syncRun({ runId });
    } catch (e) {
      console.error(e);
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <Activity className="w-6 h-6 text-brand" />
              Extraction Logs
            </h1>
            <p className="text-[13px] text-secondary mt-1">
              Monitor the live status and history of your autonomous data extraction agents.
            </p>
          </div>
        </div>

        <div className="bg-sidebar/40 border border-border-dim rounded-[32px] p-8 sm:p-10 backdrop-blur-xl shadow-xl w-full relative overflow-hidden">
          <div className="flex flex-col gap-4">
            {latestRuns.length === 0 ? (
              <div className="p-8 rounded-[20px] border border-border-dim bg-background/30 text-center">
                <span className="text-[14px] text-muted font-medium">No extraction jobs have been dispatched yet.</span>
              </div>
            ) : (
              latestRuns.map((run: any) => (
                <div key={run._id} className="flex flex-col sm:flex-row sm:items-center justify-between p-6 rounded-[24px] border border-border-dim bg-background/50 hover:bg-background/80 transition-colors gap-6 shadow-sm">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-4">
                      <span className="text-[15px] font-medium text-foreground tracking-wide font-mono opacity-90">{run.runId}</span>
                      {run.status === "PENDING" && (
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand/10 text-brand text-[11px] font-bold uppercase tracking-widest border border-brand/20"><Loader2 className="w-3.5 h-3.5 animate-spin" /> In Progress</span>
                          <button 
                            onClick={() => handleSync(run.runId)}
                            disabled={syncingId === run.runId}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background border border-border-dim text-secondary hover:text-foreground transition-colors text-[11px] font-bold uppercase tracking-widest hover:border-brand/30"
                          >
                            <RefreshCcw className={`w-3.5 h-3.5 ${syncingId === run.runId ? 'animate-spin' : ''}`} />
                            Sync Status
                          </button>
                        </div>
                      )}
                      {run.status === "COMPLETED" && <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#10b981]/10 text-[#10b981] text-[11px] font-bold uppercase tracking-widest border border-[#10b981]/20"><CheckCircle2 className="w-3.5 h-3.5" /> Completed</span>}
                      {run.status === "FAILED" && <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/10 text-red-500 text-[11px] font-bold uppercase tracking-widest border border-red-500/20"><XCircle className="w-3.5 h-3.5" /> Failed</span>}
                    </div>
                    <span className="text-[13px] text-secondary font-medium">
                      Dispatched: {new Date(run.startedAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex flex-col sm:items-end gap-2">
                    <span className="text-[14px] text-foreground font-medium">
                      {run.propertiesScraped !== undefined ? (
                        <strong className="font-semibold text-brand text-[16px]">{run.propertiesScraped}</strong>
                      ) : (
                        "—"
                      )} properties scraped
                    </span>
                    {run.completedAt && (
                      <span className="text-[12px] text-muted">
                        Finished: {new Date(run.completedAt).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
