"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  ArrowLeft,
  Activity,
  CheckCircle2,
  XCircle,
  Loader2,
  Play,
  Terminal,
  Code
} from "lucide-react";
import { useTranslations } from "next-intl";

export default function WorkflowExecutionLogPage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations('admin.workflows.logs.report');
  const tCommon = useTranslations('common');
  const executionId = params.id as string;

  const exec = useQuery((api as any).scheduler.getWorkflowExecution, { executionId: executionId as any });

  const safeParseJSON = (str: string) => {
    try {
      return JSON.stringify(JSON.parse(str), null, 2);
    } catch (e) {
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
          <span className="text-[14px] text-foreground/80">{new Date(exec.startedAt).toLocaleString()}</span>
        </div>
      </div>

      <div className="w-full h-[1px] bg-border-dim/50 my-2" />

      {/* Execution State Payload */}
      <div className="flex flex-col gap-4 relative">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-secondary" />
          <span className="text-[13px] font-bold tracking-widest uppercase text-foreground">{t('output.title')}</span>
        </div>

        <div className="relative w-full rounded-[16px] overflow-hidden bg-[#0A0A0A] border border-border-dim/40 shadow-inner group">
          <div className="absolute top-0 left-0 right-0 h-10 bg-[#111111] border-b border-border-dim/40 flex items-center px-4">
            <div className="flex items-center gap-2">
              <Code className="w-4 h-4 text-muted/50" />
              <span className="text-[11px] font-mono text-muted">execution_state.json</span>
            </div>
          </div>
          <pre className="p-6 pt-16 overflow-x-auto text-[13px] font-mono text-[#D4D4D4] leading-relaxed custom-scrollbar">
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
