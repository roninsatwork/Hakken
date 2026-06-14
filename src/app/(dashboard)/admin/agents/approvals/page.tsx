"use client";

import { useState } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
import { AdminLoadMoreFooter } from "@/src/app/(dashboard)/admin/_components/AdminTable";
import { AlertTriangle, CheckCircle2, Clock, Loader2, ShieldCheck, XCircle } from "lucide-react";
import Link from "next/link";

type Decision = "APPROVED" | "REJECTED" | "CANCELLED";

function safeFormatJson(value?: string) {
  if (!value) return null;
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export default function AgentApprovalsPage() {
  const decideApproval = useMutation(api.agentRuns.decideApproval);
  const {
    results: approvals,
    status,
    loadMore,
  } = usePaginatedQuery(api.agentRuns.getPendingApprovals, {}, { initialNumItems: ADMIN_PAGE_SIZE });
  const [submittingId, setSubmittingId] = useState<Id<"agentRunApprovals"> | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const isLoading = status === "LoadingFirstPage";
  const isLoadingMore = status === "LoadingMore";
  const canLoadMore = status === "CanLoadMore";

  const submitDecision = async (approvalId: Id<"agentRunApprovals">, decision: Decision) => {
    if (submittingId) return;

    setSubmittingId(approvalId);
    setFeedback(null);
    try {
      await decideApproval({
        approvalId,
        decision,
        decisionReason: `${decision.toLowerCase()} from agent approvals queue.`,
      });
      setFeedback({
        type: "success",
        text: decision === "APPROVED" ? "Approval recorded. The run will resume." : "Decision recorded.",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to record approval decision.",
      });
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full pb-12 animate-in fade-in slide-in-from-bottom-2">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-brand" />
            Agent approvals
          </h1>
          <p className="text-[14px] text-secondary mt-1 tracking-wide max-w-2xl">
            Review paused agent tool calls before they continue.
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-[8px] border border-border-dim bg-card/40 text-[12px] text-secondary">
          <Clock className="w-4 h-4 text-amber-500" />
          {approvals.length} pending
        </div>
      </header>

      {feedback && (
        <div className={`flex items-center gap-2 rounded-[8px] border px-4 py-3 text-[13px] ${
          feedback.type === "success"
            ? "border-[#10b981]/20 bg-[#10b981]/10 text-[#10b981]"
            : "border-red-500/20 bg-red-500/10 text-red-500"
        }`}>
          {feedback.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          <span>{feedback.text}</span>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {isLoading ? (
          [1, 2, 3].map((item) => (
            <div key={item} className="w-full h-[168px] bg-card/60 animate-pulse rounded-[8px] border border-border-dim/50" />
          ))
        ) : approvals.length === 0 ? (
          <div className="w-full py-16 flex flex-col items-center justify-center gap-4 border border-dashed border-border-dim rounded-[8px]">
            <ShieldCheck className="w-8 h-8 text-muted/30" />
            <span className="text-muted text-[13px] font-medium tracking-widest uppercase">No pending approvals</span>
          </div>
        ) : (
          approvals.map((entry) => {
            const preview = safeFormatJson(entry.approval.previewJson);
            const isSubmitting = submittingId === entry.approval._id;

            return (
              <div
                key={entry.approval._id}
                className="flex flex-col gap-4 p-5 rounded-[8px] border border-border-dim bg-card shadow-sm"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="flex flex-col gap-2 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded-[6px] text-[9px] font-bold tracking-[0.1em] uppercase border text-amber-500 bg-amber-500/10 border-amber-500/20">
                        Approval required
                      </span>
                      {entry.toolCall?.sideEffectLevel && (
                        <span className="px-2 py-0.5 rounded-[6px] text-[9px] font-bold tracking-[0.1em] uppercase border text-secondary bg-foreground/5 border-border-dim">
                          {entry.toolCall.sideEffectLevel}
                        </span>
                      )}
                      <span className="text-[12px] text-muted font-mono">{entry.approval._id}</span>
                    </div>

                    <div>
                      <h2 className="text-[16px] font-semibold text-foreground">
                        {entry.toolCall?.normalizedToolName || "Tool call"}
                      </h2>
                      <p className="text-[13px] text-secondary mt-1">
                        {entry.approval.message || "This agent run is paused until an administrator reviews the tool call."}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[12px] text-muted">
                      <span>Agent: {entry.agent?.name || "Unknown"}</span>
                      <span>Run: {entry.run?.objective || "Unknown objective"}</span>
                      {entry.run?._id && (
                        <Link href={`/admin/agents/${entry.run.agentId}`} className="text-brand hover:underline">
                          Open agent
                        </Link>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => submitDecision(entry.approval._id, "APPROVED")}
                      disabled={isSubmitting}
                      className="flex items-center gap-2 px-4 py-2 rounded-[8px] bg-brand text-background text-[13px] font-semibold hover:opacity-90 disabled:opacity-50"
                    >
                      {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Approve
                    </button>
                    <button
                      onClick={() => submitDecision(entry.approval._id, "REJECTED")}
                      disabled={isSubmitting}
                      className="flex items-center gap-2 px-4 py-2 rounded-[8px] border border-red-500/30 bg-red-500/10 text-red-500 text-[13px] font-semibold hover:bg-red-500/15 disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </button>
                    <button
                      onClick={() => submitDecision(entry.approval._id, "CANCELLED")}
                      disabled={isSubmitting}
                      className="flex items-center gap-2 px-4 py-2 rounded-[8px] border border-border-dim text-secondary text-[13px] font-semibold hover:text-foreground hover:bg-foreground/5 disabled:opacity-50"
                    >
                      <AlertTriangle className="w-4 h-4" />
                      Cancel
                    </button>
                  </div>
                </div>

                {preview && (
                  <pre className="max-h-[240px] overflow-auto rounded-[8px] border border-border-dim bg-background/60 p-4 text-[12px] leading-relaxed text-secondary">
                    {preview}
                  </pre>
                )}
              </div>
            );
          })
        )}
      </div>

      <AdminLoadMoreFooter
        visibleCount={approvals.length}
        canLoadMore={canLoadMore}
        isLoading={isLoadingMore}
        onLoadMore={() => loadMore(ADMIN_PAGE_SIZE)}
        labels={{
          empty: "No pending approvals",
          showing: (count) => `Showing ${count} approvals`,
          loadMore: "Load more approvals",
          loading: "Loading approvals...",
        }}
      />
    </div>
  );
}
