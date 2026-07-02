"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import {
  Archive,
  BrainCircuit,
  Check,
  Clock,
  Edit2,
  Loader2,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  AdminLoadMoreFooter,
  AdminRowActions,
  AdminRowIconButton,
} from "@/src/app/(dashboard)/admin/_components/AdminTable";
import {
  AdminModalFormField,
  adminModalTextareaClassName,
} from "@/src/app/(dashboard)/admin/_components/AdminModalForm";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
import { formatDateTime } from "@/src/lib/dates";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { CompanyAiSectionNav } from "../_components/CompanyAiSectionNav";

type CompanyMemory = Doc<"companyMemories">;
type CompanyMemoryCandidate = Doc<"companyMemoryCandidates">;

function getCategoryClasses(category: string) {
  if (category === "BOUNDARY") return "border-red-500/20 bg-red-500/10 text-red-300";
  if (category === "TONE") return "border-indigo-500/20 bg-indigo-500/10 text-indigo-300";
  if (category === "PREFERENCE") return "border-sky-500/20 bg-sky-500/10 text-sky-300";
  if (category === "SALES") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
  return "border-border-dim bg-foreground/5 text-secondary";
}

function formatPercent(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function MemoryBadge({ children, className = "" }: { children: string; className?: string }) {
  return (
    <span className={`rounded-md border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ${className}`}>
      {children}
    </span>
  );
}

export default function CompanyAiMemoryPage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  const aiHref = `/admin/companies/${companyId}/ai`;
  const summary = useQuery(api.companyMemories.getSummary, { companyId });
  const archiveMemory = useMutation(api.companyMemories.archiveMemory);
  const approveCandidate = useMutation(api.companyMemories.approveCandidate);
  const rejectCandidate = useMutation(api.companyMemories.rejectCandidate);

  const memories = usePaginatedQuery(
    api.companyMemories.getForCompany,
    { companyId, status: "APPROVED" },
    { initialNumItems: ADMIN_PAGE_SIZE }
  );
  const candidates = usePaginatedQuery(
    api.companyMemories.getCandidatesForCompany,
    { companyId, status: "PROPOSED" },
    { initialNumItems: ADMIN_PAGE_SIZE }
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<CompanyMemory | null>(null);
  const [rejectTarget, setRejectTarget] = useState<CompanyMemoryCandidate | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [reviewingId, setReviewingId] = useState<Id<"companyMemoryCandidates"> | null>(null);

  const isMemoryLoading = memories.status === "LoadingFirstPage";
  const isCandidateLoading = candidates.status === "LoadingFirstPage";

  const metrics = useMemo(() => [
    { label: "Approved", value: summary?.approved ?? 0 },
    { label: "Suggested", value: summary?.proposed ?? 0 },
    { label: "Archived", value: summary?.archived ?? 0 },
    { label: "Rejected", value: summary?.rejected ?? 0 },
  ], [summary]);
  const hasSuggestedMemories = (summary?.proposed ?? candidates.results.length) > 0;

  const handleApproveCandidate = async (candidateId: Id<"companyMemoryCandidates">) => {
    setReviewingId(candidateId);
    try {
      await approveCandidate({ candidateId });
    } finally {
      setReviewingId(null);
    }
  };

  const handleRejectCandidate = async () => {
    if (!rejectTarget) return;
    setReviewingId(rejectTarget._id);
    try {
      await rejectCandidate({ candidateId: rejectTarget._id, rejectionReason: rejectionReason || undefined });
      setRejectTarget(null);
      setRejectionReason("");
    } finally {
      setReviewingId(null);
    }
  };

  const handleArchiveMemory = async () => {
    if (!archiveTarget) return;
    setIsSubmitting(true);
    try {
      await archiveMemory({ memoryId: archiveTarget._id });
      setArchiveTarget(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderSuggestedMemoriesSection = () => (
    <div className="overflow-hidden rounded-[8px] border border-border-dim bg-sidebar/30">
      <div className="flex items-center justify-between gap-3 border-b border-border-dim px-4 py-3">
        <div>
          <h2 className="text-[14px] font-semibold text-foreground">Suggested memories</h2>
          <p className="mt-0.5 text-[12px] text-secondary">Proposed memories are not trusted AI context until approved.</p>
        </div>
        {isCandidateLoading && <Loader2 className="h-4 w-4 animate-spin text-brand" />}
      </div>
      <div className="divide-y divide-border-dim">
        {isCandidateLoading ? (
          <div className="px-4 py-10 text-center text-secondary">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-brand" />
          </div>
        ) : candidates.results.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-muted">
            No suggested memories waiting. Suggestions appear here before they become trusted AI memory.
          </div>
        ) : candidates.results.map((candidate) => (
          <div key={candidate._id} className="px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <MemoryBadge className={getCategoryClasses(candidate.category)}>{candidate.category}</MemoryBadge>
              <MemoryBadge>{formatPercent(candidate.confidence)}</MemoryBadge>
              <MemoryBadge>{candidate.sourceType}</MemoryBadge>
            </div>
            {candidate.title && <h3 className="mt-3 text-[13px] font-semibold text-foreground">{candidate.title}</h3>}
            <p className="mt-2 text-[12px] leading-relaxed text-secondary">{candidate.content}</p>
            {candidate.reason && <p className="mt-2 text-[11px] leading-relaxed text-muted">{candidate.reason}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleApproveCandidate(candidate._id)}
                disabled={reviewingId === candidate._id}
                className="inline-flex h-8 items-center justify-center gap-2 rounded-[8px] border border-emerald-500/20 bg-emerald-500/10 px-3 text-[12px] font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/15 disabled:opacity-50"
              >
                {reviewingId === candidate._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Approve memory
              </button>
              <button
                type="button"
                onClick={() => setRejectTarget(candidate)}
                disabled={reviewingId === candidate._id}
                className="inline-flex h-8 items-center justify-center gap-2 rounded-[8px] border border-red-500/20 bg-red-500/10 px-3 text-[12px] font-semibold text-red-300 transition-colors hover:bg-red-500/15 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
                Reject suggestion
              </button>
            </div>
          </div>
        ))}
      </div>
      <AdminLoadMoreFooter
        visibleCount={candidates.results.length}
        canLoadMore={candidates.status === "CanLoadMore"}
        isLoading={candidates.status === "LoadingMore"}
        onLoadMore={() => candidates.loadMore(ADMIN_PAGE_SIZE)}
      />
    </div>
  );

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-foreground">
              <BrainCircuit className="h-6 w-6 text-brand" />
              Company Memory
            </h1>
            <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-secondary">
              Trusted company facts, preferences, tone notes, and public boundaries for the AI workspace.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`${aiHref}/memory/candidates/new?returnTo=${encodeURIComponent(`${aiHref}/memory`)}`}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-[8px] border border-border-dim px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-foreground/5"
            >
              <Clock className="h-4 w-4" />
              Suggest memory
            </Link>
            <Link
              href={`${aiHref}/memory/new?returnTo=${encodeURIComponent(`${aiHref}/memory`)}`}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-[8px] bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand/90"
            >
              <Plus className="h-4 w-4" />
              Add approved memory
            </Link>
          </div>
        </div>

        <CompanyAiSectionNav />

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-[8px] border border-border-dim bg-sidebar/30 p-4">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted">{metric.label}</div>
              <div className="mt-2 text-2xl font-semibold text-foreground">
                {summary === undefined ? "..." : metric.value.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </header>

      <section className="rounded-[8px] border border-blue-500/20 bg-blue-500/10 p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />
          <div className="grid grid-cols-1 gap-3 text-[12px] leading-relaxed text-blue-100 md:grid-cols-2">
            <p>
              <span className="font-semibold text-blue-50">Approved memory</span> is trusted company context for the AI workspace.
            </p>
            <p>
              <span className="font-semibold text-blue-50">Suggested memory</span> waits here until someone approves or rejects it.
            </p>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        {hasSuggestedMemories && renderSuggestedMemoriesSection()}

        <div className="rounded-[8px] border border-border-dim bg-sidebar/30 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border-dim px-4 py-3">
            <div>
              <h2 className="text-[14px] font-semibold text-foreground">Approved memory</h2>
              <p className="mt-0.5 text-[12px] text-secondary">Trusted company context approved for future AI use.</p>
            </div>
            {isMemoryLoading && <Loader2 className="h-4 w-4 animate-spin text-brand" />}
          </div>
          <div className="divide-y divide-border-dim">
            {isMemoryLoading ? (
              <div className="px-4 py-10 text-center text-secondary">
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-brand" />
              </div>
            ) : memories.results.length === 0 ? (
              <div className="px-4 py-10 text-center text-[13px] text-muted">
                No approved memory yet. Approved memory is trusted company context for future AI answers.
              </div>
            ) : memories.results.map((memory) => (
              <div key={memory._id} className="group px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[13px] font-semibold text-foreground">{memory.title}</h3>
                      <MemoryBadge className={getCategoryClasses(memory.category)}>{memory.category}</MemoryBadge>
                      <MemoryBadge>{formatPercent(memory.confidence)}</MemoryBadge>
                    </div>
                    <p className="mt-2 text-[12px] leading-relaxed text-secondary">{memory.content}</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-[10px] font-mono uppercase tracking-widest text-muted">
                      <span>{memory.sourceType}</span>
                      <span>{formatDateTime(memory.updatedAt)}</span>
                      <span>{memory.usageCount} uses</span>
                    </div>
                  </div>
                  <AdminRowActions>
                    <Link
                      href={`${aiHref}/memory/${memory._id}/edit?returnTo=${encodeURIComponent(`${aiHref}/memory`)}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-border-dim text-secondary transition-colors hover:border-brand/30 hover:bg-brand/5 hover:text-brand"
                      aria-label="Edit memory"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Link>
                    <AdminRowIconButton label="Archive memory" tone="danger" onClick={() => setArchiveTarget(memory)}>
                      <Archive className="h-4 w-4" />
                    </AdminRowIconButton>
                  </AdminRowActions>
                </div>
              </div>
            ))}
          </div>
          <AdminLoadMoreFooter
            visibleCount={memories.results.length}
            canLoadMore={memories.status === "CanLoadMore"}
            isLoading={memories.status === "LoadingMore"}
            onLoadMore={() => memories.loadMore(ADMIN_PAGE_SIZE)}
          />
        </div>

        {!hasSuggestedMemories && renderSuggestedMemoriesSection()}
      </section>

      <SonaeModal
        isOpen={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        title="Archive Memory"
        size="sm"
      >
        <div className="flex flex-col gap-6">
          <p className="text-[13px] leading-relaxed text-secondary">
            This removes the memory from approved company context. The record stays available for audit.
          </p>
          <div className="flex justify-end gap-3 border-t border-border-dim pt-5">
            <button
              type="button"
              onClick={() => setArchiveTarget(null)}
              disabled={isSubmitting}
              className="rounded-[8px] px-4 py-2 text-[13px] font-semibold text-secondary transition-colors hover:bg-foreground/5 hover:text-foreground disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleArchiveMemory}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-[8px] bg-red-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
              {isSubmitting ? "Archiving..." : "Archive"}
            </button>
          </div>
        </div>
      </SonaeModal>

      <SonaeModal
        isOpen={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        title="Reject Suggested Memory"
        size="sm"
      >
        <div className="flex flex-col gap-5">
          <p className="text-[13px] leading-relaxed text-secondary">
            Rejected suggestions store a fingerprint so the same memory is blocked if it is proposed again.
          </p>
          <AdminModalFormField label="Reason" hint="Optional">
            <textarea
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              className={adminModalTextareaClassName}
              placeholder="Why should this not become company memory?"
            />
          </AdminModalFormField>
          <div className="flex justify-end gap-3 border-t border-border-dim pt-5">
            <button
              type="button"
              onClick={() => setRejectTarget(null)}
              className="rounded-[8px] px-4 py-2 text-[13px] font-semibold text-secondary transition-colors hover:bg-foreground/5 hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRejectCandidate}
              disabled={Boolean(reviewingId)}
              className="inline-flex items-center gap-2 rounded-[8px] bg-red-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
            >
              {reviewingId ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              Reject suggestion
            </button>
          </div>
        </div>
      </SonaeModal>
    </div>
  );
}
