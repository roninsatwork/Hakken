"use client";

import { useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useParams } from "next/navigation";
import { Brain, Loader2, Trash2, AlertTriangle, Check, X, SlidersHorizontal, Lightbulb } from "lucide-react";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
import { AdminLoadMoreFooter } from "@/src/app/(dashboard)/admin/_components/AdminTable";
import { formatDateTime } from "@/src/lib/dates";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";

type AgentMemory = Doc<"agentMemories">;
type ReviewActionId = `memory:${Id<"agentMemoryCandidates">}` | `suggestion:${Id<"agentImprovementSuggestions">}`;

function getKindColor(kind: AgentMemory["kind"]) {
  if (kind === "PREFERENCE") return "text-indigo-500 bg-indigo-500/10 border-indigo-500/20";
  if (kind === "SUMMARY") return "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
  if (kind === "INSTRUCTION") return "text-amber-500 bg-amber-500/10 border-amber-500/20";
  return "text-secondary bg-foreground/5 border-border-dim";
}

function getQualityColor(score: number) {
  if (score >= 0.75) return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  if (score >= 0.45) return "text-amber-400 bg-amber-500/10 border-amber-500/20";
  return "text-red-400 bg-red-500/10 border-red-500/20";
}

function formatQualityScore(score: number) {
  return `${Math.round(score * 100)}%`;
}

function getFlagLabel(flag: string) {
  return flag.toLowerCase().replaceAll("_", " ");
}

function getRiskColor(risk: string) {
  if (risk === "HIGH") return "text-red-400 bg-red-500/10 border-red-500/20";
  if (risk === "MEDIUM") return "text-amber-400 bg-amber-500/10 border-amber-500/20";
  return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
}

function getReviewTypeLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

export default function AgentMemoryPage() {
  const params = useParams();
  const agentId = params.id as Id<"agents">;
  const deleteMemory = useMutation(api.agentMemories.deleteMemory);
  const decideCandidate = useMutation(api.agentMemoryCandidates.decideCandidate);
  const decideSuggestion = useMutation(api.agentImprovementSuggestions.decideSuggestion);
  const memoryQuality = useQuery(api.agentMemories.getQualityForAgent, { agentId });
  const reviewInbox = useQuery(api.agentMemoryCandidates.getReviewInboxForAgent, { agentId });
  const { results: memories, status, loadMore } = usePaginatedQuery(
    api.agentMemories.getForAgent,
    { agentId },
    { initialNumItems: ADMIN_PAGE_SIZE }
  );
  const [pendingDelete, setPendingDelete] = useState<AgentMemory | null>(null);
  const [activeDeletion, setActiveDeletion] = useState<Id<"agentMemories"> | null>(null);
  const [activeReviewAction, setActiveReviewAction] = useState<ReviewActionId | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [reviewNotice, setReviewNotice] = useState("");

  const isLoading = status === "LoadingFirstPage";
  const isLoadingMore = status === "LoadingMore";
  const canLoadMore = status === "CanLoadMore";
  const qualityByMemoryId = new Map((memoryQuality ?? []).map((entry) => [entry.memory._id, entry]));
  const reviewCount = memoryQuality?.filter((entry) => entry.flags.length > 0 || entry.qualityScore < 0.45).length ?? 0;
  const unusedCount = memoryQuality?.filter((entry) => entry.usageCount === 0).length ?? 0;

  const handleMemoryDecision = async (candidateId: Id<"agentMemoryCandidates">, decision: "APPROVED" | "REJECTED") => {
    setActiveReviewAction(`memory:${candidateId}`);
    setReviewError("");
    setReviewNotice("");
    try {
      await decideCandidate({
        candidateId,
        decision,
        ...(decision === "REJECTED" ? { rejectionReason: "Rejected from the agent memory review inbox" } : {}),
      });
      setReviewNotice(decision === "APPROVED" ? "Memory candidate approved and applied." : "Memory candidate rejected.");
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "The memory candidate could not be reviewed.");
    } finally {
      setActiveReviewAction(null);
    }
  };

  const handleSuggestionDecision = async (suggestionId: Id<"agentImprovementSuggestions">, decision: "APPROVED" | "REJECTED") => {
    setActiveReviewAction(`suggestion:${suggestionId}`);
    setReviewError("");
    setReviewNotice("");
    try {
      await decideSuggestion({
        suggestionId,
        decision,
        apply: decision === "APPROVED",
        ...(decision === "REJECTED" ? { rejectionReason: "Rejected from the agent memory review inbox" } : {}),
      });
      setReviewNotice(decision === "APPROVED" ? "Improvement suggestion approved and applied." : "Improvement suggestion rejected.");
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "The improvement suggestion could not be reviewed.");
    } finally {
      setActiveReviewAction(null);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300 w-full h-full antialiased">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
          <div>
            <h2 className="text-[18px] font-semibold text-foreground tracking-tight flex items-center gap-2">
              <Brain className="w-5 h-5 text-brand" />
              Agent memory
            </h2>
            <p className="text-[13px] text-secondary mt-1">
              Inspect retained agent facts, preferences, summaries, and instructions.
            </p>
          </div>
        </div>

        {memoryQuality && memoryQuality.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="border border-border-dim rounded-[8px] bg-black/20 px-4 py-3">
              <div className="text-[10px] uppercase font-mono tracking-widest text-muted">Tracked memories</div>
              <div className="text-[20px] font-semibold text-foreground mt-1">{memoryQuality.length}</div>
            </div>
            <div className="border border-border-dim rounded-[8px] bg-black/20 px-4 py-3">
              <div className="text-[10px] uppercase font-mono tracking-widest text-muted">Needs review</div>
              <div className="text-[20px] font-semibold text-amber-400 mt-1">{reviewCount}</div>
            </div>
            <div className="border border-border-dim rounded-[8px] bg-black/20 px-4 py-3">
              <div className="text-[10px] uppercase font-mono tracking-widest text-muted">Unused</div>
              <div className="text-[20px] font-semibold text-secondary mt-1">{unusedCount}</div>
            </div>
          </div>
        )}

        <div className="border border-border-dim rounded-[8px] bg-black/20 px-4 py-4 flex flex-col gap-4">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
            <div>
              <h3 className="text-[14px] font-semibold text-foreground tracking-tight flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-brand" />
                Learning review inbox
              </h3>
              <p className="text-[12px] text-secondary mt-1">
                Review proposed memories, reflections, and agent improvement changes before anything becomes durable behavior.
              </p>
            </div>
            <div className="grid grid-cols-4 gap-2 min-w-0 lg:min-w-[420px]">
              {[
                { label: "Open", value: reviewInbox?.totals.open ?? 0 },
                { label: "Memory", value: reviewInbox?.totals.memoryCandidates ?? 0 },
                { label: "Suggestions", value: reviewInbox?.totals.improvementSuggestions ?? 0 },
                { label: "High risk", value: reviewInbox?.totals.highRisk ?? 0 },
              ].map((stat) => (
                <div key={stat.label} className="rounded-[8px] border border-border-dim bg-white/[0.02] px-3 py-2 min-w-0">
                  <div className="text-[10px] uppercase tracking-widest font-mono text-muted truncate">{stat.label}</div>
                  <div className="text-[17px] font-semibold text-foreground mt-1">{reviewInbox ? stat.value : "..."}</div>
                </div>
              ))}
            </div>
          </div>

          {(reviewError || reviewNotice) && (
            <div className={`rounded-[8px] border px-3 py-2 text-[13px] ${
              reviewError
                ? "border-red-500/20 bg-red-500/10 text-red-400"
                : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
            }`}>
              {reviewError || reviewNotice}
            </div>
          )}

          {!reviewInbox ? (
            <div className="py-8 flex items-center justify-center text-muted">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : reviewInbox.totals.open === 0 ? (
            <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-5 text-[13px] text-secondary">
              No learning items are waiting for review.
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
              <div className="flex flex-col gap-2">
                <div className="text-[11px] uppercase tracking-widest font-mono text-muted">Memory candidates</div>
                {reviewInbox.memoryCandidates.length === 0 ? (
                  <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-3 py-4 text-[12px] text-secondary">
                    No proposed memories.
                  </div>
                ) : reviewInbox.memoryCandidates.slice(0, 5).map((candidate) => (
                  <div key={candidate.candidateId} className="rounded-[8px] border border-border-dim bg-white/[0.02] px-3 py-3 flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${getRiskColor(candidate.riskLevel)}`}>
                        {candidate.riskLevel}
                      </span>
                      <span className="text-[10px] uppercase font-mono tracking-widest text-muted">{candidate.kind}</span>
                      <span className="text-[10px] uppercase font-mono tracking-widest text-muted">{Math.round(candidate.confidence * 100)}%</span>
                    </div>
                    <p className="text-[12px] text-secondary leading-relaxed whitespace-pre-wrap">{candidate.content}</p>
                    {candidate.sourceRun && (
                      <p className="text-[11px] text-muted leading-relaxed">Source: {candidate.sourceRun.objective}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleMemoryDecision(candidate.candidateId, "APPROVED")}
                        disabled={activeReviewAction === `memory:${candidate.candidateId}`}
                        className="px-3 py-1.5 rounded-[8px] border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-[12px] font-semibold disabled:opacity-50 flex items-center gap-2"
                      >
                        {activeReviewAction === `memory:${candidate.candidateId}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMemoryDecision(candidate.candidateId, "REJECTED")}
                        disabled={activeReviewAction === `memory:${candidate.candidateId}`}
                        className="px-3 py-1.5 rounded-[8px] border border-red-500/20 bg-red-500/10 text-red-400 text-[12px] font-semibold disabled:opacity-50 flex items-center gap-2"
                      >
                        <X className="w-3.5 h-3.5" />
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2">
                <div className="text-[11px] uppercase tracking-widest font-mono text-muted">Improvement suggestions</div>
                {reviewInbox.improvementSuggestions.length === 0 ? (
                  <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-3 py-4 text-[12px] text-secondary">
                    No proposed changes.
                  </div>
                ) : reviewInbox.improvementSuggestions.slice(0, 5).map((suggestion) => (
                  <div key={suggestion.suggestionId} className="rounded-[8px] border border-border-dim bg-white/[0.02] px-3 py-3 flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${getRiskColor(suggestion.riskLevel)}`}>
                        {suggestion.riskLevel}
                      </span>
                      <span className="text-[10px] uppercase font-mono tracking-widest text-muted">{getReviewTypeLabel(suggestion.type)}</span>
                    </div>
                    <div>
                      <div className="text-[13px] text-foreground font-semibold leading-snug">{suggestion.title}</div>
                      <p className="text-[12px] text-secondary leading-relaxed mt-1">{suggestion.description}</p>
                    </div>
                    {suggestion.sourceRun && (
                      <p className="text-[11px] text-muted leading-relaxed">Source: {suggestion.sourceRun.objective}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleSuggestionDecision(suggestion.suggestionId, "APPROVED")}
                        disabled={activeReviewAction === `suggestion:${suggestion.suggestionId}`}
                        className="px-3 py-1.5 rounded-[8px] border border-indigo-500/20 bg-indigo-500/10 text-indigo-300 text-[12px] font-semibold disabled:opacity-50 flex items-center gap-2"
                      >
                        {activeReviewAction === `suggestion:${suggestion.suggestionId}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <SlidersHorizontal className="w-3.5 h-3.5" />}
                        Apply
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSuggestionDecision(suggestion.suggestionId, "REJECTED")}
                        disabled={activeReviewAction === `suggestion:${suggestion.suggestionId}`}
                        className="px-3 py-1.5 rounded-[8px] border border-red-500/20 bg-red-500/10 text-red-400 text-[12px] font-semibold disabled:opacity-50 flex items-center gap-2"
                      >
                        <X className="w-3.5 h-3.5" />
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2">
                <div className="text-[11px] uppercase tracking-widest font-mono text-muted">Reflection evidence</div>
                {reviewInbox.reflections.length === 0 ? (
                  <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-3 py-4 text-[12px] text-secondary">
                    No unresolved reflections.
                  </div>
                ) : reviewInbox.reflections.slice(0, 5).map((reflection) => (
                  <div key={reflection.reflectionId} className="rounded-[8px] border border-border-dim bg-white/[0.02] px-3 py-3 flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${getRiskColor(reflection.riskLevel)}`}>
                        {reflection.riskLevel}
                      </span>
                      <span className="text-[10px] uppercase font-mono tracking-widest text-muted">{getReviewTypeLabel(reflection.category)}</span>
                      <span className="text-[10px] uppercase font-mono tracking-widest text-muted">{Math.round(reflection.confidence * 100)}%</span>
                    </div>
                    <p className="text-[12px] text-secondary leading-relaxed">{reflection.rootCause}</p>
                    {reflection.proposedEvalFixture && (
                      <p className="text-[11px] text-sky-300 leading-relaxed">Eval: {reflection.proposedEvalFixture}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="w-full py-16 flex items-center justify-center text-muted">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : memories.length === 0 ? (
          <div className="w-full flex-1 min-h-[360px] border border-border-dim bg-white/[0.02] rounded-[8px] flex flex-col items-center justify-center gap-4">
            <Brain className="w-10 h-10 text-brand opacity-60" />
            <div className="text-center flex flex-col items-center gap-1">
              <span className="text-[16px] font-semibold text-foreground tracking-tight">No memory stored</span>
              <span className="text-secondary text-[13px]">This agent has no active retained memory.</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {memories.map((memory) => {
              const quality = qualityByMemoryId.get(memory._id);

              return (
                <div key={memory._id} className="flex flex-col gap-4 px-5 py-4 border rounded-[8px] bg-black/20 border-border-dim w-full group">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-2 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-full border ${getKindColor(memory.kind)}`}>
                          {memory.kind}
                        </span>
                        <span className="text-[11px] font-mono text-muted">
                          Importance {memory.importance.toFixed(2)}
                        </span>
                        {quality && (
                          <span className={`text-[11px] font-mono px-2 py-1 rounded-full border ${getQualityColor(quality.qualityScore)}`}>
                            Quality {formatQualityScore(quality.qualityScore)}
                          </span>
                        )}
                        <span className="text-[11px] font-mono text-muted">
                          {formatDateTime(memory.updatedAt)}
                        </span>
                      </div>
                      <p className="text-[14px] text-foreground leading-relaxed whitespace-pre-wrap">
                        {memory.content}
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        setDeleteError("");
                        setPendingDelete(memory);
                      }}
                      disabled={activeDeletion === memory._id}
                      className="p-2 rounded-md hover:bg-red-500/10 text-muted hover:text-red-400 transition-all disabled:opacity-50"
                      title="Delete memory"
                    >
                      {activeDeletion === memory._id ? <Loader2 className="w-4 h-4 animate-spin text-red-400" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>

                  {quality && (
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                      <span className="text-muted">Used {quality.usageCount}</span>
                      <span className="text-emerald-400">Success {quality.successCount}</span>
                      <span className="text-red-400">Failed {quality.failureCount}</span>
                      <span className="text-amber-400">Cancelled {quality.cancelledCount}</span>
                      {quality.lastUsedAt && <span className="text-muted">Last used {formatDateTime(quality.lastUsedAt)}</span>}
                      {quality.flags.map((flag) => (
                        <span key={flag} className="px-2 py-1 rounded-full border border-amber-500/20 bg-amber-500/10 text-amber-400">
                          {getFlagLabel(flag)}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3 text-[11px] text-muted font-mono">
                    {memory.sourceRunId && <span>run: {memory.sourceRunId}</span>}
                    {memory.sourceThreadId && <span>thread: {memory.sourceThreadId}</span>}
                    {memory.userId && <span>user: {memory.userId}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <AdminLoadMoreFooter
          visibleCount={memories.length}
          canLoadMore={canLoadMore}
          isLoading={isLoadingMore}
          onLoadMore={() => loadMore(ADMIN_PAGE_SIZE)}
          labels={{
            empty: "No memory stored",
            showing: (count) => `Showing ${count} memories`,
            loadMore: "Load more memories",
            loading: "Loading memories...",
          }}
        />
      </div>

      <SonaeModal
        isOpen={!!pendingDelete}
        onClose={() => !activeDeletion && setPendingDelete(null)}
        title="Delete memory"
        size="sm"
      >
        <div className="flex flex-col gap-6">
          <p className="text-[14px] text-secondary leading-relaxed">
            This removes the memory from future agent observations and records an audit event.
          </p>
          {deleteError && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-[13px] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="font-medium">{deleteError}</span>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setPendingDelete(null)}
              disabled={!!activeDeletion}
              className="px-5 py-2.5 rounded-[8px] text-[13px] font-medium text-secondary hover:text-foreground hover:bg-white/5 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!!activeDeletion}
              onClick={async () => {
                if (!pendingDelete) return;
                setActiveDeletion(pendingDelete._id);
                setDeleteError("");
                try {
                  await deleteMemory({ memoryId: pendingDelete._id });
                  setPendingDelete(null);
                } catch (error) {
                  setDeleteError(error instanceof Error ? error.message : "Failed to delete memory.");
                } finally {
                  setActiveDeletion(null);
                }
              }}
              className="px-5 py-2.5 rounded-[8px] bg-red-500 text-white text-[13px] font-medium hover:bg-red-600 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {activeDeletion ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Delete
            </button>
          </div>
        </div>
      </SonaeModal>
    </>
  );
}
