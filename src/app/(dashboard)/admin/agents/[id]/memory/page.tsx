"use client";

import { useState, type FormEvent } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArchiveX,
  Brain,
  Check,
  ClipboardCheck,
  Edit2,
  ExternalLink,
  Loader2,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
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
  adminModalTextareaClassName,
} from "@/src/app/(dashboard)/admin/_components/AdminModalForm";
import {
  MemoryApplyModeBadge,
  MemoryApplyModeChoice,
  MemoryContentField,
  type MemoryApplyMode,
} from "@/src/app/(dashboard)/admin/_components/MemoryFields";
import { formatDateTime } from "@/src/lib/dates";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { MAX_ALWAYS_MEMORIES } from "@/convex/utils/memoryApplication";
import { AdminWriteButton } from "@/src/app/(dashboard)/admin/_components/AdminAccessLevel";

type AgentMemory = Doc<"agentMemories">;
type SourceRunSummary = {
  runId: Id<"agentRuns">;
  status: string;
  triggerType: string;
  objective: string;
  error: string;
  startedAt: number;
  completedAt?: number;
  costGBP?: number;
};
type SourceSkillSummary = {
  skillId: Id<"agentSkills">;
  name: string;
  category: string;
  riskLevel: string;
  skillVersionId?: Id<"agentSkillVersions">;
  versionNumber?: number;
  attributionReason?: string;
};
type ReviewerSummary = {
  userId: Id<"users">;
  name: string;
  email?: string;
  role?: string;
};
type PatchPreviewRow = {
  operation: "APPEND" | "SET" | "CREATE" | "REVIEW";
  target: string;
  before?: string;
  after?: string;
  note?: string;
};

const EMPTY_FORM = { content: "", applyMode: "WHEN_RELEVANT" as MemoryApplyMode };

/**
 * A memory written before applyMode existed still has to read as something, so
 * it falls back to what its old kind was really saying.
 */
function resolveApplyMode(memory: { applyMode?: MemoryApplyMode; kind?: string }): MemoryApplyMode {
  if (memory.applyMode) return memory.applyMode;
  return memory.kind === "INSTRUCTION" || memory.kind === "PREFERENCE" ? "ALWAYS" : "WHEN_RELEVANT";
}

/**
 * How runs that used this memory have gone (self-improvement plan, Phase 2).
 * The same counters the runtime ranking blends in, shown so a memory moving
 * up or down the retrieval order is explainable from this screen. Text labels
 * with a blue/amber accent — never a colour alone.
 */
function MemoryTrackRecord({ memory }: { memory: AgentMemory }) {
  const successCount = memory.successCount ?? 0;
  const troubleCount = (memory.failureCount ?? 0) + (memory.cancelledCount ?? 0);
  const total = successCount + troubleCount;

  if (total === 0) {
    return <span className="text-[11px] text-muted">No history yet</span>;
  }

  const label = troubleCount > successCount ? "Review" : "Helping";
  const labelClass = troubleCount > successCount
    ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
    : "text-sky-400 bg-sky-500/10 border-sky-500/20";

  return (
    <div className="flex flex-col gap-1">
      <span className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${labelClass}`}>
        {label}
      </span>
      <span className="text-[11px] text-secondary">
        {successCount} helped · {troubleCount} in failed runs
      </span>
    </div>
  );
}

function getRiskColor(risk: string) {
  if (risk === "HIGH") return "text-red-400 bg-red-500/10 border-red-500/20";
  if (risk === "MEDIUM") return "text-amber-400 bg-amber-500/10 border-amber-500/20";
  return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
}

function getStatusColor(status: string) {
  if (status === "PROPOSED" || status === "GENERATED") return "text-sky-300 bg-sky-500/10 border-sky-500/20";
  if (status === "APPLIED" || status === "CONVERTED") return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  if (status === "REJECTED" || status === "DISMISSED") return "text-red-400 bg-red-500/10 border-red-500/20";
  return "text-secondary bg-foreground/5 border-border-dim";
}

function getReviewTypeLabel(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().replaceAll("_", " ");
}

function formatCostGBP(value?: number) {
  if (typeof value !== "number") return null;
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 4 }).format(value);
}

function formatPatchValue(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "Unpreviewable value";
  }
}

function getPatchRows(proposedPatchJson: string) {
  try {
    const parsed = JSON.parse(proposedPatchJson) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return [{ key: "patch", value: formatPatchValue(parsed) }];
    }
    return Object.entries(parsed).map(([key, value]) => ({ key, value: formatPatchValue(value) }));
  } catch {
    return [{ key: "patch", value: proposedPatchJson }];
  }
}

function SourceRunDetail({ sourceRun, agentId }: { sourceRun: SourceRunSummary | null; agentId: Id<"agents"> }) {
  if (!sourceRun) return null;
  const cost = formatCostGBP(sourceRun.costGBP);

  return (
    <div className="rounded-[8px] border border-border-dim bg-black/20 px-3 py-2 flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase font-mono tracking-widest text-muted">{sourceRun.triggerType}</span>
        <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-0.5 rounded-md border ${getStatusColor(sourceRun.status)}`}>
          {sourceRun.status}
        </span>
        <span className="text-[10px] font-mono text-muted">{formatDateTime(sourceRun.startedAt)}</span>
      </div>
      <p className="text-[11px] text-secondary leading-relaxed">{sourceRun.objective}</p>
      {(sourceRun.error || cost) && (
        <div className="flex flex-wrap gap-2 text-[10px] font-mono text-muted">
          {sourceRun.error && <span>{sourceRun.error}</span>}
          {cost && <span>{cost}</span>}
        </div>
      )}
      <Link
        href={`/admin/agents/${agentId}/runs?runId=${sourceRun.runId}`}
        className="text-[11px] text-brand hover:text-brand-light font-semibold flex items-center gap-1 w-fit"
      >
        <ExternalLink className="w-3 h-3" />
        Open run detail
      </Link>
    </div>
  );
}

function SourceSkillDetail({ sourceSkill }: { sourceSkill?: SourceSkillSummary | null }) {
  if (!sourceSkill) return null;
  const versionLabel = typeof sourceSkill.versionNumber === "number" ? `v${sourceSkill.versionNumber}` : "pinned version";

  return (
    <div className="rounded-[8px] border border-sky-500/20 bg-sky-500/10 px-3 py-2 flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase font-mono tracking-widest text-sky-300">Skill attribution</span>
        <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-0.5 rounded-md border ${getRiskColor(sourceSkill.riskLevel)}`}>
          {sourceSkill.riskLevel}
        </span>
        <span className="text-[10px] font-mono text-muted">{versionLabel}</span>
      </div>
      <Link
        href={`/admin/ai/skills/${sourceSkill.skillId}`}
        className="text-[12px] text-foreground hover:text-brand-light font-semibold flex items-center gap-1 w-fit"
      >
        <ExternalLink className="w-3 h-3" />
        {sourceSkill.name}
      </Link>
      {sourceSkill.attributionReason && (
        <p className="text-[11px] text-secondary leading-relaxed">{sourceSkill.attributionReason}</p>
      )}
    </div>
  );
}

function getOperationColor(operation: PatchPreviewRow["operation"]) {
  if (operation === "APPEND") return "text-sky-300 bg-sky-500/10 border-sky-500/20";
  if (operation === "CREATE") return "text-emerald-300 bg-emerald-500/10 border-emerald-500/20";
  if (operation === "REVIEW") return "text-amber-300 bg-amber-500/10 border-amber-500/20";
  return "text-secondary bg-foreground/5 border-border-dim";
}

function PatchPreview({
  proposedPatchJson,
  patchPreview,
}: {
  proposedPatchJson: string;
  patchPreview?: PatchPreviewRow[];
}) {
  const fallbackRows = getPatchRows(proposedPatchJson);

  return (
    <div className="rounded-[8px] border border-border-dim bg-black/20 overflow-hidden">
      <div className="px-3 py-2 border-b border-border-dim text-[10px] uppercase tracking-widest font-mono text-muted">
        Proposed change
      </div>
      {patchPreview && patchPreview.length > 0 ? (
        <div className="divide-y divide-border-dim">
          {patchPreview.slice(0, 6).map((row, index) => (
            <div key={`${row.operation}:${row.target}:${index}`} className="px-3 py-2 flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-[10px] uppercase tracking-widest font-mono px-2 py-0.5 rounded-md border ${getOperationColor(row.operation)}`}>
                  {row.operation}
                </span>
                <span className="text-[11px] font-semibold text-foreground">{row.target}</span>
              </div>
              {row.before && <p className="text-[11px] text-muted leading-relaxed">Before: {row.before}</p>}
              {row.after && (
                <pre className="text-[11px] text-secondary whitespace-pre-wrap break-words font-mono leading-relaxed max-h-28 overflow-auto">
                  {row.after}
                </pre>
              )}
              {row.note && <p className="text-[11px] text-muted leading-relaxed">{row.note}</p>}
            </div>
          ))}
          {patchPreview.length > 6 && (
            <div className="px-3 py-2 text-[11px] text-muted">
              {patchPreview.length - 6} more changes hidden.
            </div>
          )}
        </div>
      ) : (
        <div className="divide-y divide-border-dim">
          {fallbackRows.slice(0, 6).map((row) => (
            <div key={row.key} className="grid grid-cols-1 sm:grid-cols-[130px_1fr] gap-1 px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest font-mono text-muted break-words">{getReviewTypeLabel(row.key)}</div>
              <pre className="text-[11px] text-secondary whitespace-pre-wrap break-words font-mono leading-relaxed max-h-28 overflow-auto">
                {row.value}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewMetadata({
  reviewedAt,
  reviewer,
  reason,
  appliedEffect,
}: {
  reviewedAt?: number;
  reviewer?: ReviewerSummary | null;
  reason?: string;
  appliedEffect?: string | null;
}) {
  if (!reviewedAt && !reviewer && !reason && !appliedEffect) return null;

  return (
    <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-3 py-2 flex flex-col gap-1 text-[11px] text-muted">
      {(reviewedAt || reviewer) && (
        <div className="flex flex-wrap gap-2">
          {reviewer && <span>Reviewed by {reviewer.name}</span>}
          {reviewedAt && <span>{formatDateTime(reviewedAt)}</span>}
        </div>
      )}
      {reason && <p className="text-red-300 leading-relaxed">{reason}</p>}
      {appliedEffect && <p className="text-emerald-300 leading-relaxed">{appliedEffect}</p>}
    </div>
  );
}

export default function AgentMemoryPage() {
  const params = useParams();
  const agentId = params.id as Id<"agents">;

  const createMemory = useMutation(api.agentMemories.createMemory);
  const updateMemory = useMutation(api.agentMemories.updateMemory);
  const deleteMemory = useMutation(api.agentMemories.deleteMemory);
  const restoreMemory = useMutation(api.agentMemories.restoreMemory);
  const decideCandidate = useMutation(api.agentMemoryCandidates.decideCandidate);
  const decideSuggestion = useMutation(api.agentImprovementSuggestions.decideSuggestion);
  const createEvalFixture = useMutation(api.agentEvalFixtures.createFromRun);
  const dismissReflection = useMutation(api.agentRunReflections.dismissReflection);

  const [showRemoved, setShowRemoved] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);

  const memories = usePaginatedQuery(
    api.agentMemories.getForAgent,
    {
      agentId,
      isActive: !showRemoved,
      ...(searchTerm.trim() ? { searchTerm: searchTerm.trim() } : {}),
    },
    { initialNumItems: ADMIN_PAGE_SIZE },
  );
  // Only what is waiting: the mode and reviewer pill rows filtered a list that
  // was already three columns wide, and nothing was reachable through them that
  // the run detail does not show better.
  const reviewInbox = useQuery(api.agentMemoryCandidates.getReviewInboxForAgent, { agentId, mode: "OPEN" });

  const [editorTarget, setEditorTarget] = useState<AgentMemory | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<AgentMemory | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Id<"agentMemoryCandidates"> | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const action = useAdminAction({ scope: "admin-agent-memory" });

  const isLoading = memories.status === "LoadingFirstPage";
  const pageStart = (page - 1) * ADMIN_PAGE_SIZE;
  const pageMemories = memories.results.slice(pageStart, pageStart + ADMIN_PAGE_SIZE);
  const knownTotal = memories.results.length;
  const totalPages = Math.max(1, Math.ceil(knownTotal / ADMIN_PAGE_SIZE));

  const alwaysUsed = memories.results.filter(
    (memory) => memory.isActive && resolveApplyMode(memory) === "ALWAYS",
  ).length;
  const alwaysRemaining = Math.max(0, MAX_ALWAYS_MEMORIES - alwaysUsed);

  const goToPage = (next: number) => {
    setPage(next);
    if (memories.results.length < next * ADMIN_PAGE_SIZE && memories.status === "CanLoadMore") {
      memories.loadMore(ADMIN_PAGE_SIZE);
    }
  };

  const openEditor = (memory: AgentMemory | null) => {
    action.clearError();
    setEditorTarget(memory);
    setFormData(memory
      ? { content: memory.content, applyMode: resolveApplyMode(memory) }
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
            content: formData.content,
            applyMode: formData.applyMode,
          });
          return;
        }
        await createMemory({ agentId, content: formData.content, applyMode: formData.applyMode });
      },
      { fallbackMessage: "The memory could not be saved.", suppressErrorToast: true },
    );
    if (!outcome.ok) return;
    setIsEditorOpen(false);
    setEditorTarget(null);
    setFormData(EMPTY_FORM);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const outcome = await action.run(() => deleteMemory({ memoryId: deleteTarget._id }), {
      fallbackMessage: "The memory could not be removed.",
      suppressErrorToast: true,
    });
    if (!outcome.ok) return;
    setDeleteTarget(null);
  };

  const handleRestore = async (memory: AgentMemory) => {
    await action.run(() => restoreMemory({ memoryId: memory._id }), {
      key: memory._id,
      successMessage: "Memory restored.",
      fallbackMessage: "The memory could not be restored.",
    });
  };

  const handleApproveCandidate = async (candidateId: Id<"agentMemoryCandidates">) => {
    await action.run(() => decideCandidate({ candidateId, decision: "APPROVED" }), {
      key: `memory:${candidateId}`,
      successMessage: "Added to this agent's memory.",
      fallbackMessage: "The suggestion could not be approved.",
    });
  };

  const handleRejectCandidate = async () => {
    if (!rejectTarget) return;
    const outcome = await action.run(
      () => decideCandidate({
        candidateId: rejectTarget,
        decision: "REJECTED",
        ...(rejectionReason ? { rejectionReason } : {}),
      }),
      { fallbackMessage: "The suggestion could not be turned down.", suppressErrorToast: true },
    );
    if (!outcome.ok) return;
    setRejectTarget(null);
    setRejectionReason("");
  };

  const handleSuggestionDecision = async (
    suggestionId: Id<"agentImprovementSuggestions">,
    decision: "APPROVED" | "REJECTED",
  ) => {
    await action.run(
      () => decideSuggestion({
        suggestionId,
        decision,
        apply: decision === "APPROVED",
        ...(decision === "REJECTED" ? { rejectionReason: "Turned down from the agent memory screen" } : {}),
      }),
      {
        key: `suggestion:${suggestionId}`,
        successMessage: decision === "APPROVED" ? "Change applied." : "Suggestion turned down.",
        fallbackMessage: "The suggestion could not be reviewed.",
      },
    );
  };

  const handleCreateEvalFromReflection = async (reflectionId: Id<"agentRunReflections">, runId: Id<"agentRuns">) => {
    await action.run(() => createEvalFixture({ runId }), {
      key: `reflection:${reflectionId}`,
      successMessage: "Eval created from the source run.",
      fallbackMessage: "The eval could not be created.",
    });
  };

  const handleDismissReflection = async (reflectionId: Id<"agentRunReflections">) => {
    await action.run(
      () => dismissReflection({ reflectionId, reason: "Dismissed from the agent memory screen" }),
      {
        key: `reflection:${reflectionId}`,
        successMessage: "Dismissed.",
        fallbackMessage: "The reflection could not be dismissed.",
      },
    );
  };

  const memoryCandidates = reviewInbox?.memoryCandidates ?? [];
  const improvementSuggestions = reviewInbox?.improvementSuggestions ?? [];
  const reflections = reviewInbox?.reflections ?? [];
  const hasSuggestions = memoryCandidates.length + improvementSuggestions.length + reflections.length > 0;

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-foreground">
              <Brain className="h-6 w-6 text-brand" />
              Agent memory
            </h1>
            <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-secondary">
              What this agent knows. Up to {MAX_ALWAYS_MEMORIES} can apply to every message &mdash; the rest are
              looked up when the conversation calls for them.
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
              showing: (start, end, total) => `Showing ${start}-${end} of ${total} loaded`,
            }}
          />
        ) : undefined}
      >
        <thead>
          <AdminTableHeaderRow>
            <AdminTableHeaderCell>What the agent knows</AdminTableHeaderCell>
            <AdminTableHeaderCell className="w-[150px]">Applies</AdminTableHeaderCell>
            <AdminTableHeaderCell className="w-[150px]">Track record</AdminTableHeaderCell>
            <AdminTableHeaderCell className="w-[190px]">Added</AdminTableHeaderCell>
            <AdminTableHeaderCell className="w-[110px]" align="right"> </AdminTableHeaderCell>
          </AdminTableHeaderRow>
        </thead>
        <tbody>
          {isLoading ? (
            <AdminTableLoadingRow colSpan={5} />
          ) : pageMemories.length === 0 ? (
            <AdminTableEmptyRow
              colSpan={5}
              icon={<Brain className="h-8 w-8 text-muted/30" />}
              label={showRemoved ? "Nothing has been removed" : "No memories yet — add what the agent should know"}
            />
          ) : pageMemories.map((memory) => (
            <tr
              key={memory._id}
              className="group border-b border-border-dim/50 transition-colors hover:bg-foreground/[0.02]"
            >
              <td className="px-4 py-3">
                <p className="whitespace-pre-line text-[12px] leading-relaxed text-secondary line-clamp-3">
                  {memory.content}
                </p>
              </td>
              <td className="px-4 py-3">
                <MemoryApplyModeBadge applyMode={resolveApplyMode(memory)} />
              </td>
              <td className="px-4 py-3">
                <MemoryTrackRecord memory={memory} />
              </td>
              <td className="px-4 py-3 text-[12px] text-secondary">{formatDateTime(memory.createdAt)}</td>
              <td className="px-4 py-3">
                <AdminRowActions>
                  {showRemoved ? (
                    <AdminRowIconButton label="Put this memory back" onClick={() => handleRestore(memory)}>
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
                          setDeleteTarget(memory);
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
            <h2 className="text-[14px] font-semibold text-foreground">Suggestions</h2>
            <p className="mt-0.5 text-[12px] text-secondary">
              Raised from this agent&rsquo;s runs. Nothing here takes effect until it is approved.
            </p>
          </div>
          {reviewInbox === undefined && <Loader2 className="h-4 w-4 animate-spin text-brand" />}
        </div>

        {reviewInbox === undefined ? (
          <div className="px-4 py-10 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-brand" />
          </div>
        ) : !hasSuggestions ? (
          <div className="px-4 py-10 text-center text-[13px] text-muted">Nothing waiting for review.</div>
        ) : (
          <div className="divide-y divide-border-dim">
            {memoryCandidates.map((candidate) => (
              <div key={candidate.candidateId} className="flex flex-col gap-3 px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] uppercase font-mono tracking-widest text-muted">Memory</span>
                  <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-0.5 rounded-md border ${getRiskColor(candidate.riskLevel)}`}>
                    {candidate.riskLevel}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-secondary">{candidate.content}</p>
                <SourceSkillDetail sourceSkill={candidate.sourceSkill} />
                <SourceRunDetail sourceRun={candidate.sourceRun} agentId={agentId} />
                <ReviewMetadata
                  reviewedAt={candidate.reviewedAt}
                  reviewer={candidate.reviewer}
                  reason={candidate.rejectionReason}
                />
                {candidate.status === "PROPOSED" && (
                  <div className="flex flex-wrap gap-2">
                    <AdminWriteButton
                      type="button"
                      onClick={() => handleApproveCandidate(candidate.candidateId)}
                      disabled={action.isBusy(`memory:${candidate.candidateId}`)}
                      className="inline-flex h-8 items-center gap-2 rounded-[8px] border border-emerald-500/20 bg-emerald-500/10 px-3 text-[12px] font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/15 disabled:opacity-50"
                    >
                      {action.isBusy(`memory:${candidate.candidateId}`)
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Check className="h-3.5 w-3.5" />}
                      Approve
                    </AdminWriteButton>
                    <button
                      type="button"
                      onClick={() => {
                        action.clearError();
                        setRejectTarget(candidate.candidateId);
                      }}
                      disabled={action.isBusy(`memory:${candidate.candidateId}`)}
                      className="inline-flex h-8 items-center gap-2 rounded-[8px] border border-border-dim px-3 text-[12px] font-semibold text-secondary transition-colors hover:text-foreground disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />
                      Turn down
                    </button>
                  </div>
                )}
              </div>
            ))}

            {improvementSuggestions.map((suggestion) => (
              <div key={suggestion.suggestionId} className="flex flex-col gap-3 px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] uppercase font-mono tracking-widest text-muted">
                    {getReviewTypeLabel(suggestion.type)}
                  </span>
                  <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-0.5 rounded-md border ${getRiskColor(suggestion.riskLevel)}`}>
                    {suggestion.riskLevel}
                  </span>
                </div>
                <div>
                  <div className="text-[13px] font-semibold leading-snug text-foreground">{suggestion.title}</div>
                  <p className="mt-1 text-[12px] leading-relaxed text-secondary">{suggestion.description}</p>
                </div>
                <SourceRunDetail sourceRun={suggestion.sourceRun} agentId={agentId} />
                <PatchPreview proposedPatchJson={suggestion.proposedPatchJson} patchPreview={suggestion.patchPreview} />
                <ReviewMetadata
                  reviewedAt={suggestion.reviewedAt}
                  reviewer={suggestion.reviewer}
                  reason={suggestion.rejectionReason}
                  appliedEffect={suggestion.appliedEffect}
                />
                {suggestion.status === "PROPOSED" && (
                  <div className="flex flex-wrap gap-2">
                    <AdminWriteButton
                      type="button"
                      onClick={() => handleSuggestionDecision(suggestion.suggestionId, "APPROVED")}
                      disabled={action.isBusy(`suggestion:${suggestion.suggestionId}`)}
                      className="inline-flex h-8 items-center gap-2 rounded-[8px] border border-indigo-500/20 bg-indigo-500/10 px-3 text-[12px] font-semibold text-indigo-300 transition-colors hover:bg-indigo-500/15 disabled:opacity-50"
                    >
                      {action.isBusy(`suggestion:${suggestion.suggestionId}`)
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <SlidersHorizontal className="h-3.5 w-3.5" />}
                      Apply
                    </AdminWriteButton>
                    <AdminWriteButton
                      type="button"
                      onClick={() => handleSuggestionDecision(suggestion.suggestionId, "REJECTED")}
                      disabled={action.isBusy(`suggestion:${suggestion.suggestionId}`)}
                      className="inline-flex h-8 items-center gap-2 rounded-[8px] border border-border-dim px-3 text-[12px] font-semibold text-secondary transition-colors hover:text-foreground disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />
                      Turn down
                    </AdminWriteButton>
                  </div>
                )}
              </div>
            ))}

            {reflections.map((reflection) => (
              <div key={reflection.reflectionId} className="flex flex-col gap-3 px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] uppercase font-mono tracking-widest text-muted">
                    {getReviewTypeLabel(reflection.category)}
                  </span>
                  <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-0.5 rounded-md border ${getRiskColor(reflection.riskLevel)}`}>
                    {reflection.riskLevel}
                  </span>
                </div>
                <p className="text-[12px] leading-relaxed text-secondary">{reflection.rootCause}</p>
                <SourceRunDetail sourceRun={reflection.sourceRun} agentId={agentId} />
                {reflection.proposedEvalFixture && (
                  <p className="text-[11px] leading-relaxed text-sky-300">Eval: {reflection.proposedEvalFixture}</p>
                )}
                <ReviewMetadata
                  reviewedAt={reflection.reviewedAt}
                  reviewer={reflection.reviewer}
                  reason={reflection.dismissalReason}
                />
                {reflection.status === "GENERATED" && (
                  <div className="flex flex-wrap gap-2">
                    {reflection.sourceRun && reflection.proposedEvalFixture && (
                      <AdminWriteButton
                        type="button"
                        onClick={() => handleCreateEvalFromReflection(reflection.reflectionId, reflection.sourceRun!.runId)}
                        disabled={action.isBusy(`reflection:${reflection.reflectionId}`)}
                        className="inline-flex h-8 items-center gap-2 rounded-[8px] border border-brand/30 bg-brand/10 px-3 text-[12px] font-semibold text-brand transition-colors hover:bg-brand/15 disabled:opacity-50"
                      >
                        {action.isBusy(`reflection:${reflection.reflectionId}`)
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <ClipboardCheck className="h-3.5 w-3.5" />}
                        Create eval
                      </AdminWriteButton>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDismissReflection(reflection.reflectionId)}
                      disabled={action.isBusy(`reflection:${reflection.reflectionId}`)}
                      className="inline-flex h-8 items-center gap-2 rounded-[8px] border border-border-dim px-3 text-[12px] font-semibold text-secondary transition-colors hover:text-foreground disabled:opacity-50"
                    >
                      <ArchiveX className="h-3.5 w-3.5" />
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <SonaeModal
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        title={editorTarget ? "Edit memory" : "Add memory"}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
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
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Remove memory"
        size="sm"
      >
        <div className="flex flex-col gap-5">
          <p className="text-[13px] leading-relaxed text-secondary">
            The agent stops using this straight away. It stays under &ldquo;Removed&rdquo; and can be put back.
          </p>
          <AdminModalFormError>{action.error}</AdminModalFormError>
          <div className="flex justify-end gap-3 border-t border-border-dim pt-5">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              disabled={action.isBusy()}
              className="rounded-[8px] px-4 py-2 text-[13px] font-semibold text-secondary transition-colors hover:bg-foreground/5 hover:text-foreground disabled:opacity-50"
            >
              Cancel
            </button>
            <AdminWriteButton
              type="button"
              onClick={handleDelete}
              disabled={action.isBusy()}
              className="inline-flex items-center gap-2 rounded-[8px] bg-red-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
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
          <AdminModalFormField label="Why?" hint="Optional">
            <textarea
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              className={adminModalTextareaClassName}
              placeholder="Why should the agent not remember this?"
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
              onClick={handleRejectCandidate}
              disabled={action.isBusy()}
              className="inline-flex items-center gap-2 rounded-[8px] bg-red-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
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
