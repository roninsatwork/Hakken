"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { use, useState } from "react";
import { FileText, ArrowLeft, Loader2, CheckCircle2, XCircle, Copy, Check } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

export default function ExecutionTraceDetailPage({ params }: { params: Promise<{ id: Id<"agents">, logId: Id<"agentLogs"> }> }) {
  const t = useTranslations("admin.agents.details.logs.detail");
  const unwrappedParams = use(params);
  const agentId = unwrappedParams.id;
  const logId = unwrappedParams.logId;

  const log = useQuery(api.agentLogs.getLogById, { id: logId });
  
  const [activeTab, setActiveTab] = useState<"payload" | "config">("payload");
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!log) return;
    const content = activeTab === "payload" ? log.responseContent : log.promptContent;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (log === undefined) {
    return (
      <div className="flex w-full min-h-[40vh] items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted" />
      </div>
    );
  }

  if (log === null) {
    return (
      <div className="flex w-full min-h-[40vh] items-center text-rose-500 font-mono tracking-wide">
        {t("notFound")}
      </div>
    );
  }

  const isFailed = log.interactionType.toUpperCase().includes("ERROR") || log.interactionType.toUpperCase().includes("FAIL");
  const formattedDate = new Date(log.createdAt).toLocaleString("en-GB", { 
    day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" 
  });

  return (
    <div className="flex flex-col gap-6 w-full h-full pb-10 animate-in fade-in duration-300 min-h-0">
      
      {/* Detail Header */}
      <header className="flex flex-col gap-2 border-b border-border-dim/50 pb-6 w-full mt-2 shrink-0">
        <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <FileText className="w-5 h-5 text-brand" />
          {t("title")}
        </h2>
        
        <div className="flex items-center gap-3 text-[13px]">
          <span className="text-secondary/70">
            {t("recorded", { date: formattedDate })}
          </span>
          <div className="h-4 w-[1px] bg-border-dim/50" />
          
          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] border text-[10px] uppercase tracking-widest font-bold ${
            isFailed ? "text-rose-500 border-rose-500/20 bg-rose-500/10" : "text-[#10b981] border-[#10b981]/20 bg-[#10b981]/10"
          }`}>
            {isFailed ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            <span>{log.interactionType}</span>
          </div>
        </div>

        <Link
          href={`/admin/agents/${agentId}/logs`}
          className="flex items-center gap-2 text-[12px] font-bold tracking-wide text-muted hover:text-foreground transition-colors mt-2 w-max"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{t("back")}</span>
        </Link>
      </header>

      {/* Tabs Layout */}
      <div className="flex items-center gap-6 border-b border-border-dim/30 w-full px-2 shrink-0">
        {/* Raw (both tabs): underline tabs — the active tab swaps colour and draws its bar; no kit variant is stateful. */}
        <button
          onClick={() => setActiveTab("payload")}
          className={`py-3 text-[12px] font-bold tracking-[0.1em] transition-colors relative uppercase ${
            activeTab === "payload" ? "text-foreground" : "text-muted hover:text-secondary"
          }`}
        >
          {t("tabs.payload")}
          {activeTab === "payload" && (
            <div className="absolute bottom-[-1px] left-0 w-full h-[2px] bg-brand" />
          )}
        </button>
        <button
          onClick={() => setActiveTab("config")}
          className={`py-3 text-[12px] font-bold tracking-[0.1em] transition-colors relative uppercase ${
            activeTab === "config" ? "text-foreground" : "text-muted hover:text-secondary"
          }`}
        >
          {t("tabs.config")}
          {activeTab === "config" && (
            <div className="absolute bottom-[-1px] left-0 w-full h-[2px] bg-brand" />
          )}
        </button>
      </div>

      {/* Trace Body */}
      <div className="w-full relative group bg-black/40 border border-white/5 rounded-[12px] overflow-hidden -mt-2 flex-1 flex flex-col min-h-0">
        
        {/* Raw: hover-revealed copy chip floating over the pane — its fills and reveal match no variant. */}
        <button
          onClick={handleCopy}
          className="absolute top-4 right-4 z-20 p-2 rounded-[8px] bg-white/5 border border-white/10 text-muted hover:text-foreground hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all"
          title={t("copyTitle")}
        >
          {copied ? <Check className="w-4 h-4 text-brand" /> : <Copy className="w-4 h-4" />}
        </button>
        
        <pre className="flex-1 p-6 custom-scrollbar w-full overflow-auto text-[13px] font-mono text-secondary/90 leading-relaxed whitespace-pre-wrap">
          {activeTab === "payload" ? log.responseContent : log.promptContent}
        </pre>
      </div>

    </div>
  );
}
