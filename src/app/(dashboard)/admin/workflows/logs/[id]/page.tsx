"use client";

import { useParams, useRouter } from "next/navigation";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  ArrowLeft,
  Activity,
  CheckCircle2,
  XCircle,
  Loader2,
  Play,
  Terminal,
  Code,
  Copy,
  Check,
  Clock,
  Unlock,
  PlayCircle
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { getErrorMessage } from "@/src/lib/errors";
import { formatDateTime } from "@/src/lib/dates";

type WorkflowExecutionDetail = Doc<"workflowExecutions"> & {
  workflowName: string;
  startedByName: string;
  steps: Doc<"workflowExecutionSteps">[];
};

export default function WorkflowExecutionLogPage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations('admin.workflows.logs.report');
  const tCommon = useTranslations('common');
  const executionId = params.id as Id<"workflowExecutions">;

  const exec = useQuery(api.scheduler.getWorkflowExecution, { executionId }) as WorkflowExecutionDetail | null | undefined;
  const resumeApprovalStep = useAction(api.workflowRuntime.resumeApprovalStep);
  const [copied, setCopied] = useState(false);
  const [isResuming, setIsResuming] = useState<string | null>(null);
  const [resumeMessage, setResumeMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleApprove = async (nodeId: string, workflowId: Id<"workflows">) => {
    setIsResuming(nodeId);
    setResumeMessage(null);
    try {
      await resumeApprovalStep({ executionId, nodeId, workflowId, action: "APPROVED" });
      setResumeMessage({ type: "success", text: t('feedback.resumeSuccess') });
    } catch (error: unknown) {
      setResumeMessage({
        type: "error",
        text: getErrorMessage(error, t('feedback.resumeFailed')),
      });
    } finally {
      setIsResuming(null);
    }
  };

  const handleCopy = () => {
    if (!exec?.state) return;
    navigator.clipboard.writeText(safeParseJSON(exec.state));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const safeParseJSON = (str: string) => {
    try {
      return JSON.stringify(JSON.parse(str), null, 2);
    } catch {
      return str; // If it's just raw text, return it as string
    }
  };

  if (exec === undefined) {
    return <div className="flex items-center justify-center p-20 text-muted"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  if (exec === null) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4 text-center">
        <XCircle className="w-12 h-12 text-red-500/50" />
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold text-foreground">{t('notFound.title')}</h2>
          <p className="text-secondary text-sm">{t('notFound.description')}</p>
        </div>
        <button onClick={() => router.push("/admin/workflows/logs")} className="px-6 py-2.5 mt-4 rounded-full bg-sidebar border border-border-dim text-sm hover:text-foreground">
          {t('notFound.back')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/admin/workflows/logs")}
            className="w-10 h-10 rounded-full bg-sidebar/50 border border-border-dim flex items-center justify-center text-muted hover:text-foreground hover:bg-foreground/5 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <Activity className="w-6 h-6 text-brand" />
              {t('title')}
            </h1>
            <p className="text-[13px] text-secondary mt-1">{t('description')}</p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <span className="text-[10px] text-muted tracking-[0.2em] uppercase font-mono">{t('meta.status')}</span>
          {exec.status === "SUCCESS" && <span className="flex items-center gap-1.5 text-green-500 font-bold text-[14px] uppercase"><CheckCircle2 className="w-5 h-5" /> {tCommon('status.success')}</span>}
          {exec.status === "FAILED" && <span className="flex items-center gap-1.5 text-red-500 font-bold text-[14px] uppercase"><XCircle className="w-5 h-5" /> {tCommon('status.failed')}</span>}
          {exec.status === "RUNNING" && <span className="flex items-center gap-1.5 text-blue-500 font-bold text-[14px] uppercase"><Loader2 className="w-5 h-5 animate-spin" /> {tCommon('status.running')}</span>}
        </div>
      </div>

      {/* Meta Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
        <div className="flex flex-col gap-2 p-5 rounded-[16px] bg-sidebar/30 border border-border-dim/50">
          <span className="text-[10px] text-muted uppercase font-mono tracking-widest flex items-center gap-2"><Play className="w-3 h-3" /> {t('meta.trigger')}</span>
          <span className="text-[15px] font-semibold text-foreground">{exec.triggerType}</span>
        </div>
        <div className="flex flex-col gap-2 p-5 rounded-[16px] bg-sidebar/30 border border-border-dim/50">
          <span className="text-[10px] text-muted uppercase font-mono tracking-widest">{t('meta.target')}</span>
          <span className="text-[15px] font-semibold text-brand">{exec.workflowName}</span>
        </div>
        <div className="flex flex-col gap-2 p-5 rounded-[16px] bg-sidebar/30 border border-border-dim/50">
          <span className="text-[10px] text-muted uppercase font-mono tracking-widest">{t('meta.startedAt')}</span>
          <span className="text-[14px] text-foreground/80">{formatDateTime(exec.startedAt)}</span>
        </div>
      </div>

      <div className="w-full h-[1px] bg-border-dim/50 my-2" />

      {resumeMessage && (
        <div className={`flex items-center gap-2 rounded-[12px] border px-4 py-3 text-[13px] ${
          resumeMessage.type === "success"
            ? "border-[#10b981]/20 bg-[#10b981]/10 text-[#10b981]"
            : "border-red-500/20 bg-red-500/10 text-red-500"
        }`}>
          {resumeMessage.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          <span>{resumeMessage.text}</span>
        </div>
      )}

      {/* Visual Execution Steps */}
      {exec.steps && exec.steps.length > 0 && (
        <div className="flex flex-col gap-4 mt-2">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-secondary" />
            <span className="text-[13px] font-bold tracking-widest uppercase text-foreground">Execution Steps</span>
          </div>

          <div className="flex flex-col gap-3">
            {exec.steps.map((step, idx) => (
              <div key={step._id} className="flex flex-col gap-3 p-5 rounded-[16px] bg-sidebar/30 border border-border-dim/50 transition-all hover:bg-sidebar/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-border-dim/30 text-[11px] font-mono font-bold text-muted">
                      {idx + 1}
                    </span>
                    <span className="font-semibold text-foreground text-[14px]">Node: {step.nodeId}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {step.status === "SUCCESS" && <span className="flex items-center gap-1.5 px-3 py-1 bg-green-500/10 text-green-500 rounded-full font-bold text-[11px] uppercase"><CheckCircle2 className="w-3.5 h-3.5" /> SUCCESS</span>}
                    {step.status === "FAILED" && <span className="flex items-center gap-1.5 px-3 py-1 bg-red-500/10 text-red-500 rounded-full font-bold text-[11px] uppercase"><XCircle className="w-3.5 h-3.5" /> FAILED</span>}
                    {step.status === "RUNNING" && <span className="flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 text-blue-500 rounded-full font-bold text-[11px] uppercase"><Loader2 className="w-3.5 h-3.5 animate-spin" /> RUNNING</span>}
                    {step.status === "PENDING" && <span className="flex items-center gap-1.5 px-3 py-1 bg-gray-500/10 text-gray-500 rounded-full font-bold text-[11px] uppercase"><Clock className="w-3.5 h-3.5" /> PENDING</span>}
                    {step.status === "PENDING_APPROVAL" && <span className="flex items-center gap-1.5 px-3 py-1 bg-orange-500/10 text-orange-500 rounded-full font-bold text-[11px] uppercase"><Unlock className="w-3.5 h-3.5" /> NEEDS APPROVAL</span>}
                  </div>
                </div>

                {step.error && (
                  <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-[8px] text-[13px] text-red-400 font-mono">
                    {step.error}
                  </div>
                )}
                
                {step.status === "PENDING_APPROVAL" && (
                  <div className="mt-2 flex">
                    <button
                      onClick={() => exec.workflowId && handleApprove(step.nodeId, exec.workflowId)}
                      disabled={isResuming === step.nodeId}
                      className="flex items-center gap-2 px-5 py-2.5 bg-brand text-background rounded-full font-bold text-[13px] hover:bg-brand/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-brand/20"
                    >
                      {isResuming === step.nodeId ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                      Approve & Resume Flow
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Execution State Payload */}
      <div className="flex flex-col gap-4 relative mt-4">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-secondary" />
          <span className="text-[13px] font-bold tracking-widest uppercase text-foreground">{t('output.title')}</span>
        </div>

        <div className="relative w-full rounded-[16px] overflow-hidden bg-[#0A0A0A] border border-border-dim/40 shadow-inner group">
          <div className="absolute top-0 left-0 right-0 h-10 bg-[#111111] border-b border-border-dim/40 flex items-center justify-between px-4 z-10">
            <div className="flex items-center gap-2">
              <Code className="w-4 h-4 text-muted/50" />
              <span className="text-[11px] font-mono text-muted">execution_state.json</span>
            </div>
            
            {exec.state && (
              <button
                onClick={handleCopy}
                className="p-1.5 rounded-[6px] bg-white/5 border border-white/10 text-muted hover:text-foreground hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all"
                title="Copy to clipboard"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-brand" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
          <pre className="p-6 pt-16 overflow-x-auto text-[13px] font-mono text-[#D4D4D4] leading-relaxed custom-scrollbar relative z-0">
            {exec.state ? (
              safeParseJSON(exec.state)
            ) : (
              <span className="text-muted/50 italic">{t('output.noOutput')}</span>
            )}
          </pre>
        </div>
      </div>
    </div>
  );
}
