"use client";

import { useState, type FormEvent } from "react";
import { formatUpToGBP } from "@/src/lib/currency";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
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
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import {
  ModalFormActions,
  ModalFormError,
  ModalFormField,
  modalTextareaClassName,
} from "@/src/ui/components/screens/ModalForm";
import {
  MemoryApplyModeBadge,
  MemoryApplyModeChoice,
  MemoryContentField,
  type MemoryApplyMode,
} from "@/src/app/(dashboard)/admin/_components/MemoryFields";
import { formatDateTime } from "@/src/lib/dates";
import HakkenModal from "@/src/ui/components/feedback/HakkenModal";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { STATUS_TONE_CLASSES, toneForStatus } from "@/src/ui/components/screens/statusTone";
import { MAX_ALWAYS_MEMORIES } from "@/convex/utils/memoryApplication";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Button } from "@/src/ui/components/screens/Button";

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
  const t = useTranslations("admin.agents.details.memory");
  const successCount = memory.successCount ?? 0;
  const troubleCount = (memory.failureCount ?? 0) + (memory.cancelledCount ?? 0);
  const total = successCount + troubleCount;

  if (total === 0) {
    return <span className="text-[11px] text-muted">{t("trackRecord.noHistory")}</span>;
  }

  const label = troubleCount > successCount ? t("trackRecord.review") : t("trackRecord.helping");
  const tone = troubleCount > successCount ? "warning" : "info";

  return (
    <div className="flex flex-col gap-1">
      <StatusPill tone={tone}>{label}</StatusPill>
      <span className="text-[11px] text-secondary">
        {t("trackRecord.summary", { success: successCount, trouble: troubleCount })}
      </span>
    </div>
  );
}

function getReviewTypeLabel(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().replaceAll("_", " ");
}

function formatCostGBP(value?: number) {
  if (typeof value !== "number") return null;
  return formatUpToGBP(value);
}

function formatPatchValue(value: unknown, unpreviewableLabel: string) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return unpreviewableLabel;
  }
}

function getPatchRows(proposedPatchJson: string, unpreviewableLabel: string) {
  try {
    const parsed = JSON.parse(proposedPatchJson) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return [{ key: "patch", value: formatPatchValue(parsed, unpreviewableLabel) }];
    }
    return Object.entries(parsed).map(([key, value]) => ({ key, value: formatPatchValue(value, unpreviewableLabel) }));
  } catch {
    return [{ key: "patch", value: proposedPatchJson }];
  }
}

function SourceRunDetail({ sourceRun, agentId }: { sourceRun: SourceRunSummary | null; agentId: Id<"agents"> }) {
  const t = useTranslations("admin.agents.details.memory");
  if (!sourceRun) return null;
  const cost = formatCostGBP(sourceRun.costGBP);

  return (
    <div className="rounded-[8px] border border-border-dim bg-black/20 px-3 py-2 flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase font-mono tracking-widest text-muted">{sourceRun.triggerType}</span>
        <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-0.5 rounded-md border ${STATUS_TONE_CLASSES[toneForStatus(sourceRun.status)]}`}>
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
        {t("sourceRun.openRun")}
      </Link>
    </div>
  );
}

function SourceSkillDetail({ sourceSkill }: { sourceSkill?: SourceSkillSummary | null }) {
  const t = useTranslations("admin.agents.details.memory");
  if (!sourceSkill) return null;
  const versionLabel = typeof sourceSkill.versionNumber === "number"
    ? t("sourceSkill.version", { number: sourceSkill.versionNumber })
    : t("sourceSkill.pinnedVersion");

  return (
    <div className="rounded-[8px] border border-info/20 bg-info/10 px-3 py-2 flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase font-mono tracking-widest text-info">{t("sourceSkill.attribution")}</span>
        <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-0.5 rounded-md border ${STATUS_TONE_CLASSES[toneForStatus(sourceSkill.riskLevel)]}`}>
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
  if (operation === "APPEND") return STATUS_TONE_CLASSES.info;
  if (operation === "CREATE") return STATUS_TONE_CLASSES.success;
  if (operation === "REVIEW") return STATUS_TONE_CLASSES.warning;
  return STATUS_TONE_CLASSES.neutral;
}

function PatchPreview({
  proposedPatchJson,
  patchPreview,
}: {
  proposedPatchJson: string;
  patchPreview?: PatchPreviewRow[];
}) {
  const t = useTranslations("admin.agents.details.memory");
  const fallbackRows = getPatchRows(proposedPatchJson, t("patch.unpreviewable"));

  return (
    <div className="rounded-[8px] border border-border-dim bg-black/20 overflow-hidden">
      <div className="px-3 py-2 border-b border-border-dim text-[10px] uppercase tracking-widest font-mono text-muted">
        {t("patch.proposedChange")}
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
              {row.before && <p className="text-[11px] text-muted leading-relaxed">{t("patch.before", { value: row.before })}</p>}
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
              {t("patch.moreHidden", { count: patchPreview.length - 6 })}
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
  const t = useTranslations("admin.agents.details.memory");
  if (!reviewedAt && !reviewer && !reason && !appliedEffect) return null;

  return (
    <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-3 py-2 flex flex-col gap-1 text-[11px] text-muted">
      {(reviewedAt || reviewer) && (
        <div className="flex flex-wrap gap-2">
          {reviewer && <span>{t("reviewedBy", { name: reviewer.name })}</span>}
          {reviewedAt && <span>{formatDateTime(reviewedAt)}</span>}
        </div>
      )}
      {reason && <p className="text-destructive leading-relaxed">{reason}</p>}
      {appliedEffect && <p className="text-success leading-relaxed">{appliedEffect}</p>}
    </div>
  );
}

export default function AgentMemoryPage() {
  const t = useTranslations("admin.agents.details.memory");
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
    { initialNumItems: TABLE_PAGE_SIZE },
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
  const pageStart = (page - 1) * TABLE_PAGE_SIZE;
  const pageMemories = memories.results.slice(pageStart, pageStart + TABLE_PAGE_SIZE);
  const knownTotal = memories.results.length;
  const totalPages = Math.max(1, Math.ceil(knownTotal / TABLE_PAGE_SIZE));

  const alwaysUsed = memories.results.filter(
    (memory) => memory.isActive && resolveApplyMode(memory) === "ALWAYS",
  ).length;
  const alwaysRemaining = Math.max(0, MAX_ALWAYS_MEMORIES - alwaysUsed);

  const goToPage = (next: number) => {
    setPage(next);
    if (memories.results.length < next * TABLE_PAGE_SIZE && memories.status === "CanLoadMore") {
      memories.loadMore(TABLE_PAGE_SIZE);
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
      { fallbackMessage: t("saveFailed"), suppressErrorToast: true },
    );
    if (!outcome.ok) return;
    setIsEditorOpen(false);
    setEditorTarget(null);
    setFormData(EMPTY_FORM);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const outcome = await action.run(() => deleteMemory({ memoryId: deleteTarget._id }), {
      fallbackMessage: t("removeFailed"),
      suppressErrorToast: true,
    });
    if (!outcome.ok) return;
    setDeleteTarget(null);
  };

  const handleRestore = async (memory: AgentMemory) => {
    await action.run(() => restoreMemory({ memoryId: memory._id }), {
      key: memory._id,
      successMessage: t("restored"),
      fallbackMessage: t("restoreFailed"),
    });
  };

  const handleApproveCandidate = async (candidateId: Id<"agentMemoryCandidates">) => {
    await action.run(() => decideCandidate({ candidateId, decision: "APPROVED" }), {
      key: `memory:${candidateId}`,
      successMessage: t("candidateApproved"),
      fallbackMessage: t("approveFailed"),
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
      { fallbackMessage: t("turnDownFailed"), suppressErrorToast: true },
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
        successMessage: decision === "APPROVED" ? t("suggestionApplied") : t("suggestionRejected"),
        fallbackMessage: t("suggestionReviewFailed"),
      },
    );
  };

  const handleCreateEvalFromReflection = async (reflectionId: Id<"agentRunReflections">, runId: Id<"agentRuns">) => {
    await action.run(() => createEvalFixture({ runId }), {
      key: `reflection:${reflectionId}`,
      successMessage: t("evalCreated"),
      fallbackMessage: t("evalCreateFailed"),
    });
  };

  const handleDismissReflection = async (reflectionId: Id<"agentRunReflections">) => {
    await action.run(
      () => dismissReflection({ reflectionId, reason: "Dismissed from the agent memory screen" }),
      {
        key: `reflection:${reflectionId}`,
        successMessage: t("dismissed"),
        fallbackMessage: t("dismissFailed"),
      },
    );
  };

  const memoryCandidates = reviewInbox?.memoryCandidates ?? [];
  const improvementSuggestions = reviewInbox?.improvementSuggestions ?? [];
  const reflections = reviewInbox?.reflections ?? [];
  const hasSuggestions = memoryCandidates.length + improvementSuggestions.length + reflections.length > 0;

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader
        icon={<Brain className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={t("description", { max: MAX_ALWAYS_MEMORIES })}
        action={
          <Button
            variant="brand"
            onClick={() => openEditor(null)}
            className="inline-flex h-9 items-center justify-center gap-2 self-start rounded-[8px] font-semibold"
          >
            <Plus className="h-4 w-4" />
            {t("addMemory")}
          </Button>
        }
      />

      <DataTable
        rows={isLoading ? undefined : pageMemories}
        rowKey={(memory) => memory._id}
        minWidthClassName="min-w-[720px]"
        search={{
          value: searchTerm,
          onChange: (value) => {
            setSearchTerm(value);
            setPage(1);
          },
          placeholder: t("searchPlaceholder"),
        }}
        filters={
          <div className="flex items-center gap-1 rounded-[10px] border border-border-dim bg-sidebar/30 p-1">
            {[
              { label: t("filters.inUse"), removed: false },
              { label: t("filters.removed"), removed: true },
            ].map((tab) => (
              /* Raw: segmented filter — the active option swaps its colours; no kit variant is stateful. */
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
        }
        empty={{
          icon: <Brain className="h-8 w-8 text-muted/30" />,
          label: showRemoved
            ? t("empty.removed")
            : t("empty.none"),
        }}
        /* The pager used to be hidden whenever the list was empty. It now stays,
           because it is the only thing on the screen that says how many there
           are, and a table that grows a footer the moment it has rows reads as a
           layout jump rather than a count. */
        footer={{
          mode: "paged",
          page,
          totalPages,
          totalCount: knownTotal,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: memories.status === "LoadingMore",
          onPageChange: goToPage,
          labels: {
            showing: (start, end, total) => t("footer.showing", { start, end, total }),
            empty: showRemoved ? t("footer.emptyRemoved") : t("footer.emptyNone"),
          },
        }}
        columns={[
          {
            key: "content",
            header: t("columns.content"),
            cell: (memory) => (
              <>
                {memory.autoApplied && (
                  <StatusPill tone="warning" className="mb-1">
                    {t("savedByAi")}
                  </StatusPill>
                )}
                <p className="whitespace-pre-line text-[12px] leading-relaxed text-secondary line-clamp-3">
                  {memory.content}
                </p>
              </>
            ),
          },
          {
            key: "applies",
            header: t("columns.applies"),
            className: "w-[150px]",
            cell: (memory) => <MemoryApplyModeBadge applyMode={resolveApplyMode(memory)} />,
          },
          {
            key: "trackRecord",
            header: t("columns.trackRecord"),
            className: "w-[150px]",
            cell: (memory) => <MemoryTrackRecord memory={memory} />,
          },
          {
            key: "added",
            header: t("columns.added"),
            className: "w-[190px] text-[12px] text-secondary",
            cell: (memory) => formatDateTime(memory.createdAt),
          },
          {
            key: "actions",
            header: " ",
            align: "right",
            className: "w-[110px]",
            cell: (memory) => (
              <RowActions>
                {showRemoved ? (
                  <RowIconButton label={t("rowActions.restore")} onClick={() => handleRestore(memory)}>
                    {action.isBusy(memory._id)
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <RotateCcw className="h-4 w-4" />}
                  </RowIconButton>
                ) : (
                  <>
                    <RowIconButton label={t("rowActions.edit")} onClick={() => openEditor(memory)}>
                      <Edit2 className="h-4 w-4" />
                    </RowIconButton>
                    <RowIconButton
                      label={t("rowActions.remove")}
                      tone="danger"
                      onClick={() => {
                        action.clearError();
                        setDeleteTarget(memory);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </RowIconButton>
                  </>
                )}
              </RowActions>
            ),
          },
        ]}
      />

      <section className="overflow-hidden rounded-[16px] border border-border-dim/80 bg-sidebar/20">
        <div className="flex items-center justify-between gap-3 border-b border-border-dim px-4 py-3">
          <div>
            <h2 className="text-[14px] font-semibold text-foreground">{t("suggestions.title")}</h2>
            <p className="mt-0.5 text-[12px] text-secondary">
              {t("suggestions.description")}
            </p>
          </div>
          {reviewInbox === undefined && <Loader2 className="h-4 w-4 animate-spin text-brand" />}
        </div>

        {reviewInbox === undefined ? (
          <div className="px-4 py-10 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-brand" />
          </div>
        ) : !hasSuggestions ? (
          <div className="px-4 py-10 text-center text-[13px] text-muted">{t("suggestions.nothingWaiting")}</div>
        ) : (
          <div className="divide-y divide-border-dim">
            {memoryCandidates.map((candidate) => (
              <div key={candidate.candidateId} className="flex flex-col gap-3 px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] uppercase font-mono tracking-widest text-muted">{t("suggestions.memoryTag")}</span>
                  <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-0.5 rounded-md border ${STATUS_TONE_CLASSES[toneForStatus(candidate.riskLevel)]}`}>
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
                    <WriteButton
                      type="button"
                      onClick={() => handleApproveCandidate(candidate.candidateId)}
                      disabled={action.isBusy(`memory:${candidate.candidateId}`)}
                      className="inline-flex h-8 items-center gap-2 rounded-[8px] border border-success/20 bg-success/10 px-3 text-[12px] font-semibold text-success transition-colors hover:bg-success/15 disabled:opacity-50"
                    >
                      {action.isBusy(`memory:${candidate.candidateId}`)
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Check className="h-3.5 w-3.5" />}
                      {t("suggestions.approve")}
                    </WriteButton>
                    <Button
                      variant="outline"
                      onClick={() => {
                        action.clearError();
                        setRejectTarget(candidate.candidateId);
                      }}
                      disabled={action.isBusy(`memory:${candidate.candidateId}`)}
                      className="inline-flex h-8 items-center gap-2 rounded-[8px] px-3 text-[12px] font-semibold disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />
                      {t("suggestions.turnDown")}
                    </Button>
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
                  <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-0.5 rounded-md border ${STATUS_TONE_CLASSES[toneForStatus(suggestion.riskLevel)]}`}>
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
                    <WriteButton
                      type="button"
                      onClick={() => handleSuggestionDecision(suggestion.suggestionId, "APPROVED")}
                      disabled={action.isBusy(`suggestion:${suggestion.suggestionId}`)}
                      className="inline-flex h-8 items-center gap-2 rounded-[8px] border border-indigo-500/20 bg-indigo-500/10 px-3 text-[12px] font-semibold text-indigo-300 transition-colors hover:bg-indigo-500/15 disabled:opacity-50"
                    >
                      {action.isBusy(`suggestion:${suggestion.suggestionId}`)
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <SlidersHorizontal className="h-3.5 w-3.5" />}
                      {t("suggestions.apply")}
                    </WriteButton>
                    <WriteButton
                      type="button"
                      onClick={() => handleSuggestionDecision(suggestion.suggestionId, "REJECTED")}
                      disabled={action.isBusy(`suggestion:${suggestion.suggestionId}`)}
                      className="inline-flex h-8 items-center gap-2 rounded-[8px] border border-border-dim px-3 text-[12px] font-semibold text-secondary transition-colors hover:text-foreground disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />
                      {t("suggestions.turnDown")}
                    </WriteButton>
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
                  <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-0.5 rounded-md border ${STATUS_TONE_CLASSES[toneForStatus(reflection.riskLevel)]}`}>
                    {reflection.riskLevel}
                  </span>
                </div>
                <p className="text-[12px] leading-relaxed text-secondary">{reflection.rootCause}</p>
                <SourceRunDetail sourceRun={reflection.sourceRun} agentId={agentId} />
                {reflection.proposedEvalFixture && (
                  <p className="text-[11px] leading-relaxed text-info">{t("suggestions.evalPrefix", { fixture: reflection.proposedEvalFixture })}</p>
                )}
                <ReviewMetadata
                  reviewedAt={reflection.reviewedAt}
                  reviewer={reflection.reviewer}
                  reason={reflection.dismissalReason}
                />
                {reflection.status === "GENERATED" && (
                  <div className="flex flex-wrap gap-2">
                    {reflection.sourceRun && reflection.proposedEvalFixture && (
                      <WriteButton
                        type="button"
                        onClick={() => handleCreateEvalFromReflection(reflection.reflectionId, reflection.sourceRun!.runId)}
                        disabled={action.isBusy(`reflection:${reflection.reflectionId}`)}
                        className="inline-flex h-8 items-center gap-2 rounded-[8px] border border-brand/30 bg-brand/10 px-3 text-[12px] font-semibold text-brand transition-colors hover:bg-brand/15 disabled:opacity-50"
                      >
                        {action.isBusy(`reflection:${reflection.reflectionId}`)
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <ClipboardCheck className="h-3.5 w-3.5" />}
                        {t("suggestions.createEval")}
                      </WriteButton>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => handleDismissReflection(reflection.reflectionId)}
                      disabled={action.isBusy(`reflection:${reflection.reflectionId}`)}
                      className="inline-flex h-8 items-center gap-2 rounded-[8px] px-3 text-[12px] font-semibold disabled:opacity-50"
                    >
                      <ArchiveX className="h-3.5 w-3.5" />
                      {t("suggestions.dismiss")}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <HakkenModal
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        title={editorTarget ? t("editor.editTitle") : t("editor.addTitle")}
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
          <ModalFormError>{action.error}</ModalFormError>
          <ModalFormActions
            cancelLabel={t("editor.cancel")}
            submitLabel={action.isBusy() ? t("editor.saving") : t("editor.save")}
            isSubmitting={action.isBusy()}
            onCancel={() => setIsEditorOpen(false)}
          />
        </form>
      </HakkenModal>

      <HakkenModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title={t("removeModal.title")}
        size="sm"
      >
        <div className="flex flex-col gap-5">
          <p className="text-[13px] leading-relaxed text-secondary">
            {t("removeModal.body")}
          </p>
          <ModalFormError>{action.error}</ModalFormError>
          <div className="flex justify-end gap-3 border-t border-border-dim pt-5">
            <Button
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              disabled={action.isBusy()}
              className="px-4 py-2 font-semibold hover:bg-foreground/5"
            >
              {t("removeModal.cancel")}
            </Button>
            <WriteButton
              type="button"
              onClick={handleDelete}
              disabled={action.isBusy()}
              className="inline-flex items-center gap-2 rounded-[8px] bg-destructive px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-destructive/90 disabled:opacity-50"
            >
              {action.isBusy() ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {t("removeModal.confirm")}
            </WriteButton>
          </div>
        </div>
      </HakkenModal>

      <HakkenModal
        isOpen={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        title={t("rejectModal.title")}
        size="sm"
      >
        <div className="flex flex-col gap-5">
          <ModalFormField label={t("rejectModal.whyLabel")} hint={t("rejectModal.optional")}>
            <textarea
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              className={modalTextareaClassName}
              placeholder={t("rejectModal.placeholder")}
            />
          </ModalFormField>
          <ModalFormError>{action.error}</ModalFormError>
          <div className="flex justify-end gap-3 border-t border-border-dim pt-5">
            <Button
              variant="ghost"
              onClick={() => setRejectTarget(null)}
              disabled={action.isBusy()}
              className="px-4 py-2 font-semibold hover:bg-foreground/5"
            >
              {t("rejectModal.cancel")}
            </Button>
            <WriteButton
              type="button"
              onClick={handleRejectCandidate}
              disabled={action.isBusy()}
              className="inline-flex items-center gap-2 rounded-[8px] bg-destructive px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-destructive/90 disabled:opacity-50"
            >
              {action.isBusy() ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              {t("rejectModal.confirm")}
            </WriteButton>
          </div>
        </div>
      </HakkenModal>
    </div>
  );
}
