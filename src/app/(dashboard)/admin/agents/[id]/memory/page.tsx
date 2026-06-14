"use client";

import { useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useParams } from "next/navigation";
import { Brain, Loader2, Trash2, AlertTriangle } from "lucide-react";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
import { AdminLoadMoreFooter } from "@/src/app/(dashboard)/admin/_components/AdminTable";
import { formatDateTime } from "@/src/lib/dates";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";

type AgentMemory = Doc<"agentMemories">;

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

export default function AgentMemoryPage() {
  const params = useParams();
  const agentId = params.id as Id<"agents">;
  const deleteMemory = useMutation(api.agentMemories.deleteMemory);
  const memoryQuality = useQuery(api.agentMemories.getQualityForAgent, { agentId });
  const { results: memories, status, loadMore } = usePaginatedQuery(
    api.agentMemories.getForAgent,
    { agentId },
    { initialNumItems: ADMIN_PAGE_SIZE }
  );
  const [pendingDelete, setPendingDelete] = useState<AgentMemory | null>(null);
  const [activeDeletion, setActiveDeletion] = useState<Id<"agentMemories"> | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const isLoading = status === "LoadingFirstPage";
  const isLoadingMore = status === "LoadingMore";
  const canLoadMore = status === "CanLoadMore";
  const qualityByMemoryId = new Map((memoryQuality ?? []).map((entry) => [entry.memory._id, entry]));
  const reviewCount = memoryQuality?.filter((entry) => entry.flags.length > 0 || entry.qualityScore < 0.45).length ?? 0;
  const unusedCount = memoryQuality?.filter((entry) => entry.usageCount === 0).length ?? 0;

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
