"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Loader2,
  Play,
  RotateCcw,
  ShieldCheck,
  Wrench,
  XCircle,
} from "lucide-react";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";

// Mirrors the list page's RiskBadge. This was previously hardcoded to the
// emerald "low risk" styling, so a MEDIUM or HIGH risk script was presented as
// safe on the very screen where it is run. Unknown values fall back to the
// most cautious styling rather than the least.
const RISK_BADGE_CLASSES: Record<string, string> = {
  LOW: "bg-emerald-500/10 text-emerald-500",
  MEDIUM: "bg-amber-500/10 text-amber-500",
  HIGH: "bg-red-500/10 text-red-500",
};

function formatDate(timestamp?: number) {
  if (!timestamp) return "Never";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function StatusBadge({ status }: { status?: "RUNNING" | "SUCCESS" | "FAILED" }) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[6px] text-[11px] font-medium bg-foreground/5 text-secondary">
        <Clock3 className="w-3.5 h-3.5" />
        Not run
      </span>
    );
  }

  const statusClass = status === "SUCCESS"
    ? "bg-emerald-500/10 text-emerald-500"
    : status === "FAILED"
      ? "bg-red-500/10 text-red-500"
      : "bg-brand/10 text-brand";
  const Icon = status === "SUCCESS" ? CheckCircle2 : status === "FAILED" ? XCircle : Loader2;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-[6px] text-[11px] font-medium ${statusClass}`}>
      <Icon className={`w-3.5 h-3.5 ${status === "RUNNING" ? "animate-spin" : ""}`} />
      {status}
    </span>
  );
}

export default function MaintenanceScriptDetailPage() {
  const router = useRouter();
  const params = useParams<{ scriptId: string }>();
  const scriptId = params.scriptId ?? "";
  const script = useQuery(api.maintenanceScripts.get, { scriptId });
  const runScript = useMutation(api.maintenanceScripts.run);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const handleRun = async () => {
    setIsRunning(true);
    setFeedback(null);
    try {
      const result = await runScript({ scriptId });
      if (result.success) {
        setFeedback({ type: "success", message: result.summary ?? "Maintenance script completed." });
        setIsConfirmOpen(false);
      } else {
        setFeedback({ type: "error", message: result.error ?? "Maintenance script failed." });
      }
    } catch {
      setFeedback({ type: "error", message: "Maintenance script could not be started." });
    } finally {
      setIsRunning(false);
    }
  };

  if (script === undefined) {
    return (
      <div className="w-full h-[50vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand opacity-80" />
      </div>
    );
  }

  if (script === null) {
    return (
      <div className="flex flex-col gap-5">
        <Link href="/admin/settings/scripts" className="inline-flex items-center gap-2 text-[13px] text-secondary hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
          Back to maintenance
        </Link>
        <div className="border border-border-dim rounded-[16px] p-8 bg-sidebar/20">
          <h1 className="text-xl font-semibold text-foreground">Maintenance script not found</h1>
          <p className="text-[13px] text-secondary mt-2">This script is not in the approved maintenance registry.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-16">
      <button
        type="button"
        onClick={() => router.push("/admin/settings/scripts")}
        className="inline-flex items-center gap-2 text-[13px] text-secondary hover:text-foreground w-fit"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to maintenance
      </button>

      <header className="flex flex-col lg:flex-row lg:items-start justify-between gap-5 pb-6 border-b border-border-dim/50">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Wrench className="w-6 h-6 text-brand" />
            {script.name}
          </h1>
          <p className="text-[13px] text-secondary tracking-wide max-w-2xl">{script.shortDescription}</p>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <span className="px-2 py-1 rounded-[6px] text-[11px] font-medium bg-foreground/5 text-secondary">{script.category}</span>
            <span className={`px-2 py-1 rounded-[6px] text-[11px] font-medium ${RISK_BADGE_CLASSES[script.riskLevel] ?? RISK_BADGE_CLASSES.HIGH}`}>{script.riskLevel} risk</span>
            <StatusBadge status={script.lastRun?.status} />
          </div>
        </div>

        <WriteButton
          type="button"
          onClick={() => setIsConfirmOpen(true)}
          disabled={isRunning}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-[10px] bg-foreground text-background text-[13px] font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10 disabled:opacity-50"
        >
          {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Run script
        </WriteButton>
      </header>

      {feedback ? (
        <div className={`flex items-start gap-3 p-4 rounded-[12px] border text-[13px] ${
          feedback.type === "success"
            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
            : "bg-red-500/10 border-red-500/20 text-red-500"
        }`}>
          {feedback.type === "success" ? <CheckCircle2 className="w-4 h-4 mt-0.5" /> : <XCircle className="w-4 h-4 mt-0.5" />}
          <span>{feedback.message}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6">
        <section className="flex flex-col gap-4">
          <div className="border border-border-dim rounded-[16px] p-6 bg-sidebar/20">
            <h2 className="text-[15px] font-semibold text-foreground mb-2">What this does</h2>
            <p className="text-[13px] text-secondary leading-relaxed">{script.description}</p>
          </div>

          <div className="border border-border-dim rounded-[16px] p-6 bg-sidebar/20">
            <h2 className="text-[15px] font-semibold text-foreground mb-2">When to run it</h2>
            <p className="text-[13px] text-secondary leading-relaxed">{script.whenToRun}</p>
          </div>

          <div className="border border-border-dim rounded-[16px] p-6 bg-sidebar/20">
            <h2 className="text-[15px] font-semibold text-foreground mb-3">What it changes</h2>
            <ul className="flex flex-col gap-2">
              {script.changes.map((change) => (
                <li key={change} className="flex items-start gap-2 text-[13px] text-secondary">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                  <span>{change}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          <div className="border border-border-dim rounded-[16px] p-5 bg-sidebar/20">
            <h2 className="text-[13px] font-semibold text-foreground mb-4 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-brand" />
              Safety notes
            </h2>
            <div className="flex flex-col gap-4 text-[12.5px] text-secondary leading-relaxed">
              <div>
                <span className="block text-[11px] uppercase tracking-[0.12em] text-muted mb-1">Repeatability</span>
                {script.repeatability}
              </div>
              <div>
                <span className="block text-[11px] uppercase tracking-[0.12em] text-muted mb-1">Expected duration</span>
                {script.expectedDuration}
              </div>
              <div>
                <span className="block text-[11px] uppercase tracking-[0.12em] text-muted mb-1">Last run</span>
                {formatDate(script.lastRun?.completedAt ?? script.lastRun?.startedAt)}
              </div>
              <div>
                <span className="block text-[11px] uppercase tracking-[0.12em] text-muted mb-1">Last run by</span>
                {script.lastRun?.actorName ?? "None"}
              </div>
            </div>
          </div>

          <div className="border border-border-dim rounded-[16px] p-5 bg-sidebar/20">
            <h2 className="text-[13px] font-semibold text-foreground mb-4 flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-brand" />
              Recent runs
            </h2>
            <div className="flex flex-col gap-3">
              {script.history.length === 0 ? (
                <p className="text-[12.5px] text-secondary">No runs recorded yet.</p>
              ) : (
                script.history.map((run) => (
                  <div key={run._id} className="flex flex-col gap-1 border-b border-border-dim/50 pb-3 last:border-b-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <StatusBadge status={run.status} />
                      <span className="text-[11px] text-muted">{formatDate(run.completedAt ?? run.startedAt)}</span>
                    </div>
                    <p className="text-[12px] text-secondary">{run.summary ?? run.error ?? "Run recorded."}</p>
                    <span className="text-[11px] text-muted">{run.actorName ?? "Super Admin"}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>

      <SonaeModal
        isOpen={isConfirmOpen}
        onClose={() => {
          if (!isRunning) setIsConfirmOpen(false);
        }}
        title={`Run ${script.name}`}
        size="md"
      >
        <div className="flex flex-col gap-4 text-[14px] text-secondary leading-relaxed">
          <p>{script.description}</p>
          <div className="bg-foreground/[0.03] border border-border-dim rounded-[12px] p-4">
            <span className="block text-[11px] uppercase tracking-[0.12em] text-muted mb-1">Before you run</span>
            This action is audited and should only be run when the notes on this page match the issue you are fixing.
          </div>
          {feedback?.type === "error" ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-[10px] p-3 text-red-500 text-[13px]">
              {feedback.message}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-border-dim">
          <button
            type="button"
            onClick={() => setIsConfirmOpen(false)}
            className="px-5 py-2.5 rounded-[10px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-sm font-medium"
            disabled={isRunning}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleRun}
            disabled={isRunning}
            className="px-5 py-2.5 rounded-[10px] bg-foreground text-background hover:bg-foreground/90 transition-all text-sm font-medium shadow-lg shadow-foreground/10 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Run script
          </button>
        </div>
      </SonaeModal>
    </div>
  );
}
