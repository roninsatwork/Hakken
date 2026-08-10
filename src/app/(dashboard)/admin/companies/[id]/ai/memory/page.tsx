"use client";

import { useState, type FormEvent } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { useParams } from "next/navigation";
import {
  BrainCircuit,
  Check,
  Edit2,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  AdminPaginationFooter,
  AdminRowActions,
  AdminRowIconButton,
  AdminSearchBar,
  AdminTableEmptyRow,
  AdminTableHeaderCell,
  AdminTableHeaderRow,
  AdminTableLoadingRow,
  AdminTableShell,
} from "@/src/app/(dashboard)/admin/_components/AdminTable";
import {
  AdminModalFormActions,
  AdminModalFormError,
  AdminModalFormField,
  adminModalInputClassName,
  adminModalTextareaClassName,
} from "@/src/app/(dashboard)/admin/_components/AdminModalForm";
import {
  MemoryApplyModeBadge,
  MemoryApplyModeChoice,
  MemoryContentField,
  type MemoryApplyMode,
} from "@/src/app/(dashboard)/admin/_components/MemoryFields";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
import { formatDateTime } from "@/src/lib/dates";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { StatusPill } from "@/src/ui/atoms/StatusPill";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { MAX_ALWAYS_MEMORIES } from "@/convex/utils/memoryApplication";
import { AdminWriteButton } from "@/src/app/(dashboard)/admin/_components/AdminAccessLevel";

type CompanyMemory = Doc<"companyMemories">;
type CompanyMemoryCandidate = Doc<"companyMemoryCandidates">;

const EMPTY_FORM = { title: "", content: "", applyMode: "WHEN_RELEVANT" as MemoryApplyMode };

/**
 * A memory written before applyMode existed still has to read as something, so
 * it falls back to what its old category was really saying.
 */
function resolveApplyMode(memory: { applyMode?: MemoryApplyMode; category?: string }): MemoryApplyMode {
  if (memory.applyMode) return memory.applyMode;
  return memory.category === "TONE" || memory.category === "BOUNDARY" ? "ALWAYS" : "WHEN_RELEVANT";
}

export default function CompanyAiMemoryPage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;

  const createMemory = useMutation(api.companyMemories.createMemory);
  const updateMemory = useMutation(api.companyMemories.updateMemory);
  const archiveMemory = useMutation(api.companyMemories.archiveMemory);
  const restoreMemory = useMutation(api.companyMemories.restoreMemory);
  const approveCandidate = useMutation(api.companyMemories.approveCandidate);
  const rejectCandidate = useMutation(api.companyMemories.rejectCandidate);

  const [showRemoved, setShowRemoved] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);

  const memories = usePaginatedQuery(
    api.companyMemories.getForCompany,
    {
      companyId,
      status: showRemoved ? "ARCHIVED" : "APPROVED",
      ...(searchTerm.trim() ? { searchTerm: searchTerm.trim() } : {}),
    },
    { initialNumItems: ADMIN_PAGE_SIZE },
  );
  const candidates = usePaginatedQuery(
    api.companyMemories.getCandidatesForCompany,
    { companyId, status: "PROPOSED" },
    { initialNumItems: ADMIN_PAGE_SIZE },
  );

  const [editorTarget, setEditorTarget] = useState<CompanyMemory | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [archiveTarget, setArchiveTarget] = useState<CompanyMemory | null>(null);
  const [rejectTarget, setRejectTarget] = useState<CompanyMemoryCandidate | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  // One runner: only one modal is open at a time and each clears the error as
  // it opens, so a stale failure never surfaces in the wrong dialog.
  const action = useAdminAction({ scope: "admin-company-memory" });

  const isLoading = memories.status === "LoadingFirstPage";
  const pageStart = (page - 1) * ADMIN_PAGE_SIZE;
  const pageMemories = memories.results.slice(pageStart, pageStart + ADMIN_PAGE_SIZE);
  // No maintained total for a company's memories, so the count is what has been
  // fetched — honest, if conservative, while more pages remain.
  const knownTotal = memories.results.length;
  const totalPages = Math.max(1, Math.ceil(knownTotal / ADMIN_PAGE_SIZE));

  const alwaysUsed = memories.results.filter(
    (memory) => memory.status === "APPROVED" && resolveApplyMode(memory) === "ALWAYS",
  ).length;
  const alwaysRemaining = Math.max(0, MAX_ALWAYS_MEMORIES - alwaysUsed);

  const goToPage = (next: number) => {
    setPage(next);
    if (memories.results.length < next * ADMIN_PAGE_SIZE && memories.status === "CanLoadMore") {
      memories.loadMore(ADMIN_PAGE_SIZE);
    }
  };

  const openEditor = (memory: CompanyMemory | null) => {
    action.clearError();
    setEditorTarget(memory);
    setFormData(memory
      ? { title: memory.title, content: memory.content, applyMode: resolveApplyMode(memory) }
      : EMPTY_FORM);
    setIsEditorOpen(true);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const outcome = await action.run(
      async () => {
        if (editorTarget) {
          await updateMemory({
            memoryId: editorTarget._id,
            title: formData.title,
            content: formData.content,
            applyMode: formData.applyMode,
          });
          return;
        }
        await createMemory({
          companyId,
          title: formData.title || undefined,
          content: formData.content,
          applyMode: formData.applyMode,
        });
      },
      {
        fallbackMessage: "The memory could not be saved.",
        // The dialog renders the message itself, so a toast would repeat it.
        suppressErrorToast: true,
      },
    );
    if (!outcome.ok) return;
    setIsEditorOpen(false);
    setEditorTarget(null);
    setFormData(EMPTY_FORM);
  };

  const handleArchive = async () => {
    if (!archiveTarget) return;
    const outcome = await action.run(() => archiveMemory({ memoryId: archiveTarget._id }), {
      fallbackMessage: "The memory could not be removed.",
      suppressErrorToast: true,
    });
    if (!outcome.ok) return;
    setArchiveTarget(null);
  };

  const handleRestore = async (memory: CompanyMemory) => {
    await action.run(() => restoreMemory({ memoryId: memory._id }), {
      key: memory._id,
      successMessage: "Memory restored.",
      fallbackMessage: "The memory could not be restored.",
    });
  };

  const handleApprove = async (candidate: CompanyMemoryCandidate) => {
    await action.run(() => approveCandidate({ candidateId: candidate._id }), {
      key: candidate._id,
      fallbackMessage: "The suggestion could not be approved.",
    });
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    const outcome = await action.run(
      () => rejectCandidate({ candidateId: rejectTarget._id, rejectionReason: rejectionReason || undefined }),
      { fallbackMessage: "The suggestion could not be turned down.", suppressErrorToast: true },
    );
    if (!outcome.ok) return;
    setRejectTarget(null);
    setRejectionReason("");
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-foreground">
              <BrainCircuit className="h-6 w-6 text-brand" />
              Company Memory
            </h1>
            <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-secondary">
              What this company&rsquo;s AI knows. Up to {MAX_ALWAYS_MEMORIES} can apply to every answer &mdash; the
              rest are looked up when the conversation calls for them.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openEditor(null)}
            className="inline-flex h-9 items-center justify-center gap-2 self-start rounded-[8px] bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand/90"
          >
            <Plus className="h-4 w-4" />
            Add memory
          </button>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex-1">
            <AdminSearchBar
              value={searchTerm}
              onChange={(value) => {
                setSearchTerm(value);
                setPage(1);
              }}
              placeholder="Search memories"
            />
          </div>
          <div className="flex items-center gap-1 rounded-[10px] border border-border-dim bg-sidebar/30 p-1">
            {[
              { label: "In use", removed: false },
              { label: "Removed", removed: true },
            ].map((tab) => (
              <button
                key={tab.label}
                type="button"
                onClick={() => {
                  setShowRemoved(tab.removed);
                  setPage(1);
                }}
                className={`rounded-[7px] px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                  showRemoved === tab.removed
                    ? "bg-foreground/10 text-foreground"
                    : "text-secondary hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <AdminTableShell
        minWidthClassName="min-w-[720px]"
        // No pager over an empty list: it would only repeat the empty row
        // above it in fewer words.
        footer={knownTotal > 0 ? (
          <AdminPaginationFooter
            page={page}
            totalPages={totalPages}
            totalCount={knownTotal}
            pageSize={ADMIN_PAGE_SIZE}
            isLoading={memories.status === "LoadingMore"}
            onPageChange={goToPage}
            labels={{
              // The total is what has been fetched, so it is described as such
              // rather than claiming a number the screen cannot know.
              showing: (start, end, total) => `Showing ${start}-${end} of ${total} loaded`,
            }}
          />
        ) : undefined}
      >
        <thead>
          <AdminTableHeaderRow>
            <AdminTableHeaderCell>What the AI knows</AdminTableHeaderCell>
            <AdminTableHeaderCell className="w-[150px]">Applies</AdminTableHeaderCell>
            <AdminTableHeaderCell className="w-[190px]">Added</AdminTableHeaderCell>
            <AdminTableHeaderCell className="w-[110px]" align="right"> </AdminTableHeaderCell>
          </AdminTableHeaderRow>
        </thead>
        <tbody>
          {isLoading ? (
            <AdminTableLoadingRow colSpan={4} />
          ) : pageMemories.length === 0 ? (
            <AdminTableEmptyRow
              colSpan={4}
              icon={<BrainCircuit className="h-8 w-8 text-muted/30" />}
              label={showRemoved ? "Nothing has been removed" : "No memories yet — add what the AI should know"}
            />
          ) : pageMemories.map((memory) => (
            <tr
              key={memory._id}
              className="group border-b border-border-dim/50 transition-colors hover:bg-foreground/[0.02]"
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-foreground">{memory.title}</span>
                  {memory.autoApplied && (
                    <StatusPill tone="warning">
                      Saved by the AI
                    </StatusPill>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-secondary line-clamp-3">
                  {memory.content}
                </p>
              </td>
              <td className="px-4 py-3">
                <MemoryApplyModeBadge applyMode={resolveApplyMode(memory)} />
              </td>
              <td className="px-4 py-3 text-[12px] text-secondary">{formatDateTime(memory.createdAt)}</td>
              <td className="px-4 py-3">
                <AdminRowActions>
                  {showRemoved ? (
                    <AdminRowIconButton
                      label="Put this memory back"
                      onClick={() => handleRestore(memory)}
                    >
                      {action.isBusy(memory._id)
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <RotateCcw className="h-4 w-4" />}
                    </AdminRowIconButton>
                  ) : (
                    <>
                      <AdminRowIconButton label="Edit memory" onClick={() => openEditor(memory)}>
                        <Edit2 className="h-4 w-4" />
                      </AdminRowIconButton>
                      <AdminRowIconButton
                        label="Remove memory"
                        tone="danger"
                        onClick={() => {
                          action.clearError();
                          setArchiveTarget(memory);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </AdminRowIconButton>
                    </>
                  )}
                </AdminRowActions>
              </td>
            </tr>
          ))}
        </tbody>
      </AdminTableShell>

      <section className="overflow-hidden rounded-[16px] border border-border-dim/80 bg-sidebar/20">
        <div className="flex items-center justify-between gap-3 border-b border-border-dim px-4 py-3">
          <div>
            <h2 className="text-[14px] font-semibold text-foreground">Suggested memories</h2>
            <p className="mt-0.5 text-[12px] text-secondary">
              Spotted in real conversations. Nothing here reaches the AI until it is approved.
            </p>
          </div>
          {candidates.status === "LoadingFirstPage" && <Loader2 className="h-4 w-4 animate-spin text-brand" />}
        </div>
        <div className="divide-y divide-border-dim">
          {candidates.status === "LoadingFirstPage" ? (
            <div className="px-4 py-10 text-center">
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-brand" />
            </div>
          ) : candidates.results.length === 0 ? (
            <div className="px-4 py-10 text-center text-[13px] text-muted">
              Nothing waiting for review.
            </div>
          ) : candidates.results.map((candidate) => (
            <div key={candidate._id} className="px-4 py-4">
              {candidate.title && (
                <h3 className="text-[13px] font-semibold text-foreground">{candidate.title}</h3>
              )}
              <p className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-secondary">
                {candidate.content}
              </p>
              {candidate.reason && (
                <p className="mt-2 text-[11px] leading-relaxed text-muted">{candidate.reason}</p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <AdminWriteButton
                  type="button"
                  onClick={() => handleApprove(candidate)}
                  disabled={action.isBusy(candidate._id)}
                  className="inline-flex h-8 items-center justify-center gap-2 rounded-[8px] border border-success/20 bg-success/10 px-3 text-[12px] font-semibold text-success transition-colors hover:bg-success/15 disabled:opacity-50"
                >
                  {action.isBusy(candidate._id)
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Check className="h-3.5 w-3.5" />}
                  Approve
                </AdminWriteButton>
                <button
                  type="button"
                  onClick={() => {
                    action.clearError();
                    setRejectTarget(candidate);
                  }}
                  disabled={action.isBusy(candidate._id)}
                  className="inline-flex h-8 items-center justify-center gap-2 rounded-[8px] border border-border-dim px-3 text-[12px] font-semibold text-secondary transition-colors hover:text-foreground disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />
                  Turn down
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <SonaeModal
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        title={editorTarget ? "Edit memory" : "Add memory"}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <AdminModalFormField label="Title" hint={editorTarget ? undefined : "Optional"}>
            <input
              type="text"
              value={formData.title}
              onChange={(event) => setFormData((current) => ({ ...current, title: event.target.value }))}
              className={adminModalInputClassName}
              placeholder="No delivery dates over chat"
            />
          </AdminModalFormField>
          <MemoryContentField
            value={formData.content}
            onChange={(content) => setFormData((current) => ({ ...current, content }))}
          />
          <MemoryApplyModeChoice
            value={formData.applyMode}
            onChange={(applyMode) => setFormData((current) => ({ ...current, applyMode }))}
            alwaysRemaining={
              editorTarget && resolveApplyMode(editorTarget) === "ALWAYS"
                ? alwaysRemaining + 1
                : alwaysRemaining
            }
          />
          <AdminModalFormError>{action.error}</AdminModalFormError>
          <AdminModalFormActions
            cancelLabel="Cancel"
            submitLabel={action.isBusy() ? "Saving..." : "Save memory"}
            isSubmitting={action.isBusy()}
            onCancel={() => setIsEditorOpen(false)}
          />
        </form>
      </SonaeModal>

      <SonaeModal
        isOpen={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        title="Remove memory"
        size="sm"
      >
        <div className="flex flex-col gap-5">
          <p className="text-[13px] leading-relaxed text-secondary">
            The AI stops using this straight away. It stays under &ldquo;Removed&rdquo; and can be put back.
          </p>
          <AdminModalFormError>{action.error}</AdminModalFormError>
          <div className="flex justify-end gap-3 border-t border-border-dim pt-5">
            <button
              type="button"
              onClick={() => setArchiveTarget(null)}
              disabled={action.isBusy()}
              className="rounded-[8px] px-4 py-2 text-[13px] font-semibold text-secondary transition-colors hover:bg-foreground/5 hover:text-foreground disabled:opacity-50"
            >
              Cancel
            </button>
            <AdminWriteButton
              type="button"
              onClick={handleArchive}
              disabled={action.isBusy()}
              className="inline-flex items-center gap-2 rounded-[8px] bg-destructive px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-destructive/90 disabled:opacity-50"
            >
              {action.isBusy() ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Remove
            </AdminWriteButton>
          </div>
        </div>
      </SonaeModal>

      <SonaeModal
        isOpen={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        title="Turn down suggestion"
        size="sm"
      >
        <div className="flex flex-col gap-5">
          <p className="text-[13px] leading-relaxed text-secondary">
            This wording will not be suggested again.
          </p>
          <AdminModalFormField label="Why?" hint="Optional">
            <textarea
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              className={adminModalTextareaClassName}
              placeholder="Why should this not become company memory?"
            />
          </AdminModalFormField>
          <AdminModalFormError>{action.error}</AdminModalFormError>
          <div className="flex justify-end gap-3 border-t border-border-dim pt-5">
            <button
              type="button"
              onClick={() => setRejectTarget(null)}
              disabled={action.isBusy()}
              className="rounded-[8px] px-4 py-2 text-[13px] font-semibold text-secondary transition-colors hover:bg-foreground/5 hover:text-foreground disabled:opacity-50"
            >
              Cancel
            </button>
            <AdminWriteButton
              type="button"
              onClick={handleReject}
              disabled={action.isBusy()}
              className="inline-flex items-center gap-2 rounded-[8px] bg-destructive px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-destructive/90 disabled:opacity-50"
            >
              {action.isBusy() ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              Turn down
            </AdminWriteButton>
          </div>
        </div>
      </SonaeModal>
    </div>
  );
}
