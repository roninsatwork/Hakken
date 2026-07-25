"use client";

import { useMemo, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Brain, Loader2, Trash2, AlertTriangle, Check, X, SlidersHorizontal, Lightbulb, ClipboardCheck, ArchiveX, ExternalLink } from "lucide-react";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
import { AdminLoadMoreFooter } from "@/src/app/(dashboard)/admin/_components/AdminTable";
import { formatDateTime } from "@/src/lib/dates";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";

type AgentMemory = Doc<"agentMemories">;
type ReviewInboxMode = "OPEN" | "REVIEWED" | "HIGH_RISK" | "ALL";
type ReviewColumnKey = "memoryCandidates" | "improvementSuggestions" | "reflections";
type ReviewReviewerFilter = "ALL" | "UNREVIEWED" | `reviewer:${Id<"users">}`;
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
type ReviewGuidance = {
  priority: "HIGH" | "MEDIUM" | "LOW" | "CLEAR";
  label: string;
  detail: string;
  nextAction: string;
};

const REVIEW_INBOX_MODES: Array<{ value: ReviewInboxMode; label: string }> = [
  { value: "OPEN", label: "Open" },
  { value: "REVIEWED", label: "Reviewed" },
  { value: "HIGH_RISK", label: "High risk" },
  { value: "ALL", label: "All" },
];
const REVIEW_COLUMN_PAGE_SIZE = 5;
const INITIAL_REVIEW_VISIBLE_COUNTS: Record<ReviewColumnKey, number> = {
  memoryCandidates: REVIEW_COLUMN_PAGE_SIZE,
  improvementSuggestions: REVIEW_COLUMN_PAGE_SIZE,
  reflections: REVIEW_COLUMN_PAGE_SIZE,
};

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

function getStatusColor(status: string) {
  if (status === "PROPOSED" || status === "GENERATED") return "text-sky-300 bg-sky-500/10 border-sky-500/20";
  if (status === "APPLIED" || status === "CONVERTED") return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  if (status === "REJECTED" || status === "DISMISSED") return "text-red-400 bg-red-500/10 border-red-500/20";
  return "text-secondary bg-foreground/5 border-border-dim";
}

function getGuidanceColor(priority: ReviewGuidance["priority"]) {
  if (priority === "HIGH") return "border-red-500/20 bg-red-500/10 text-red-300";
  if (priority === "MEDIUM") return "border-amber-500/20 bg-amber-500/10 text-amber-300";
  if (priority === "LOW") return "border-sky-500/20 bg-sky-500/10 text-sky-300";
  return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
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
  const href = `/admin/agents/${agentId}/runs?runId=${sourceRun.runId}`;

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
        href={href}
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
      <p className="text-[11px] text-secondary leading-relaxed">
        {sourceSkill.category}
        {sourceSkill.attributionReason ? `: ${sourceSkill.attributionReason}` : ""}
      </p>
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
        Proposed patch
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
              {row.before && (
                <p className="text-[11px] text-muted leading-relaxed">
                  Before: {row.before}
                </p>
              )}
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
              {patchPreview.length - 6} more patch operations hidden.
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
          {fallbackRows.length > 6 && (
            <div className="px-3 py-2 text-[11px] text-muted">
              {fallbackRows.length - 6} more patch fields hidden.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReviewMetadata({
  reviewedAt,
  reviewer,
  reason,
  appliedAgentVersionId,
  appliedSkillVersionId,
  appliedEffect,
}: {
  reviewedAt?: number;
  reviewer?: ReviewerSummary | null;
  reason?: string;
  appliedAgentVersionId?: Id<"agentVersions">;
  appliedSkillVersionId?: Id<"agentSkillVersions">;
  appliedEffect?: string | null;
}) {
  if (!reviewedAt && !reviewer && !reason && !appliedAgentVersionId && !appliedSkillVersionId && !appliedEffect) return null;

  return (
    <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-3 py-2 flex flex-col gap-1 text-[11px] text-muted">
      {(reviewedAt || reviewer) && (
        <div className="flex flex-wrap gap-2">
          {reviewer && <span>Reviewed by {reviewer.name}{reviewer.role ? ` (${getReviewTypeLabel(reviewer.role)})` : ""}</span>}
          {reviewedAt && <span>{formatDateTime(reviewedAt)}</span>}
        </div>
      )}
      {reason && <p className="text-red-300 leading-relaxed">{reason}</p>}
      {appliedEffect && <p className="text-emerald-300 leading-relaxed">{appliedEffect}</p>}
      {appliedAgentVersionId && (
        <p className="font-mono break-all">version: {appliedAgentVersionId}</p>
      )}
      {appliedSkillVersionId && (
        <p className="font-mono break-all">skill version: {appliedSkillVersionId}</p>
      )}
    </div>
  );
}

function ReviewColumnPager({
  visibleCount,
  totalCount,
  onShowMore,
  onShowLess,
}: {
  visibleCount: number;
  totalCount: number;
  onShowMore: () => void;
  onShowLess: () => void;
}) {
  if (totalCount <= REVIEW_COLUMN_PAGE_SIZE) return null;
  const boundedVisibleCount = Math.min(visibleCount, totalCount);

  return (
    <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-3 py-2 flex flex-wrap items-center justify-between gap-2">
      <span className="text-[11px] text-muted">
        Showing {boundedVisibleCount} of {totalCount}
      </span>
      <div className="flex gap-2">
        {boundedVisibleCount > REVIEW_COLUMN_PAGE_SIZE && (
          <button
            type="button"
            onClick={onShowLess}
            className="px-2.5 py-1 rounded-[8px] border border-border-dim text-[11px] font-semibold text-secondary hover:text-foreground hover:bg-white/[0.05]"
          >
            Show less
          </button>
        )}
        {boundedVisibleCount < totalCount && (
          <button
            type="button"
            onClick={onShowMore}
            className="px-2.5 py-1 rounded-[8px] border border-brand/30 bg-brand/10 text-brand text-[11px] font-semibold"
          >
            Show more
          </button>
        )}
      </div>
    </div>
  );
}

function matchesReviewerFilter<T extends { reviewer?: ReviewerSummary | null }>(item: T, filter: ReviewReviewerFilter) {
  if (filter === "ALL") return true;
  if (filter === "UNREVIEWED") return !item.reviewer;
  return item.reviewer?.userId === filter.replace("reviewer:", "");
}

export default function AgentMemoryPage() {
  const params = useParams();
  const agentId = params.id as Id<"agents">;
  const deleteMemory = useMutation(api.agentMemories.deleteMemory);
  const decideCandidate = useMutation(api.agentMemoryCandidates.decideCandidate);
  const decideSuggestion = useMutation(api.agentImprovementSuggestions.decideSuggestion);
  const createEvalFixture = useMutation(api.agentEvalFixtures.createFromRun);
  const dismissReflection = useMutation(api.agentRunReflections.dismissReflection);
  const memoryQuality = useQuery(api.agentMemories.getQualityForAgent, { agentId });
  const { results: memories, status, loadMore } = usePaginatedQuery(
    api.agentMemories.getForAgent,
    { agentId },
    { initialNumItems: ADMIN_PAGE_SIZE }
  );
  const [pendingDelete, setPendingDelete] = useState<AgentMemory | null>(null);
  const action = useAdminAction({ scope: "admin-agent-memory" });
  // The delete modal shows its own failure, and the review banner behind it
  // shows `action.error`, so they cannot share a runner without printing the
  // same sentence twice.
  const deleteAction = useAdminAction({ scope: "admin-agent-memory-delete" });
  const [reviewInboxMode, setReviewInboxMode] = useState<ReviewInboxMode>("OPEN");
  const [reviewerFilter, setReviewerFilter] = useState<ReviewReviewerFilter>("ALL");
  const [reviewVisibleCounts, setReviewVisibleCounts] = useState<Record<ReviewColumnKey, number>>(INITIAL_REVIEW_VISIBLE_COUNTS);

  const [reviewNotice, setReviewNotice] = useState("");
  const reviewInbox = useQuery(api.agentMemoryCandidates.getReviewInboxForAgent, { agentId, mode: reviewInboxMode });

  const isLoading = status === "LoadingFirstPage";
  const isLoadingMore = status === "LoadingMore";
  const canLoadMore = status === "CanLoadMore";
  const qualityByMemoryId = new Map((memoryQuality ?? []).map((entry) => [entry.memory._id, entry]));
  const reviewCount = memoryQuality?.filter((entry) => entry.flags.length > 0 || entry.qualityScore < 0.45).length ?? 0;
  const unusedCount = memoryQuality?.filter((entry) => entry.usageCount === 0).length ?? 0;
  const reviewerOptions = useMemo(() => {
    const reviewers = new Map<Id<"users">, ReviewerSummary>();
    for (const item of [
      ...(reviewInbox?.memoryCandidates ?? []),
      ...(reviewInbox?.improvementSuggestions ?? []),
      ...(reviewInbox?.reflections ?? []),
    ]) {
      if (item.reviewer) reviewers.set(item.reviewer.userId, item.reviewer);
    }
    return Array.from(reviewers.values()).sort((left, right) => left.name.localeCompare(right.name));
  }, [reviewInbox]);
  const filteredMemoryCandidates = reviewInbox?.memoryCandidates.filter((candidate) => matchesReviewerFilter(candidate, reviewerFilter)) ?? [];
  const filteredImprovementSuggestions = reviewInbox?.improvementSuggestions.filter((suggestion) => matchesReviewerFilter(suggestion, reviewerFilter)) ?? [];
  const filteredReflections = reviewInbox?.reflections.filter((reflection) => matchesReviewerFilter(reflection, reviewerFilter)) ?? [];
  const visibleMemoryCandidates = filteredMemoryCandidates.slice(0, reviewVisibleCounts.memoryCandidates);
  const visibleImprovementSuggestions = filteredImprovementSuggestions.slice(0, reviewVisibleCounts.improvementSuggestions);
  const visibleReflections = filteredReflections.slice(0, reviewVisibleCounts.reflections);

  const updateReviewVisibleCount = (key: ReviewColumnKey, direction: "MORE" | "LESS") => {
    setReviewVisibleCounts((counts) => {
      const totalCount = key === "memoryCandidates"
        ? filteredMemoryCandidates.length
        : key === "improvementSuggestions"
          ? filteredImprovementSuggestions.length
          : filteredReflections.length;
      const nextCount = direction === "MORE"
        ? Math.min(counts[key] + REVIEW_COLUMN_PAGE_SIZE, totalCount)
        : REVIEW_COLUMN_PAGE_SIZE;
      return { ...counts, [key]: nextCount };
    });
  };

  const handleMemoryDecision = async (candidateId: Id<"agentMemoryCandidates">, decision: "APPROVED" | "REJECTED") => {
    setReviewNotice("");
    const outcome = await action.run(
      () => decideCandidate({
        candidateId,
        decision,
        ...(decision === "REJECTED" ? { rejectionReason: "Rejected from the agent memory review inbox" } : {}),
      }),
      { key: `memory:${candidateId}`, fallbackMessage: "The memory candidate could not be reviewed.", suppressErrorToast: true },
    );
    if (outcome.ok) {
      setReviewNotice(decision === "APPROVED" ? "Memory candidate approved and applied." : "Memory candidate rejected.");
    }
  };

  const handleSuggestionDecision = async (suggestionId: Id<"agentImprovementSuggestions">, decision: "APPROVED" | "REJECTED") => {
    setReviewNotice("");
    const outcome = await action.run(
      () => decideSuggestion({
        suggestionId,
        decision,
        apply: decision === "APPROVED",
        ...(decision === "REJECTED" ? { rejectionReason: "Rejected from the agent memory review inbox" } : {}),
      }),
      { key: `suggestion:${suggestionId}`, fallbackMessage: "The improvement suggestion could not be reviewed.", suppressErrorToast: true },
    );
    if (outcome.ok) {
      setReviewNotice(decision === "APPROVED" ? "Improvement suggestion approved and applied." : "Improvement suggestion rejected.");
    }
  };

  const handleCreateEvalFromReflection = async (reflectionId: Id<"agentRunReflections">, runId: Id<"agentRuns">) => {
    setReviewNotice("");
    const outcome = await action.run(() => createEvalFixture({ runId }), {
      key: `reflection:${reflectionId}`,
      fallbackMessage: "The eval fixture could not be created.",
      suppressErrorToast: true,
    });
    if (outcome.ok) setReviewNotice("Eval fixture created from the reflection source run.");
  };

  const handleDismissReflection = async (reflectionId: Id<"agentRunReflections">) => {
    setReviewNotice("");
    const outcome = await action.run(
      () => dismissReflection({ reflectionId, reason: "Dismissed from the agent memory review inbox" }),
      { key: `reflection:${reflectionId}`, fallbackMessage: "The reflection could not be dismissed.", suppressErrorToast: true },
    );
    if (outcome.ok) setReviewNotice("Reflection dismissed.");
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
                { label: "Total", value: reviewInbox?.totals.open ?? 0 },
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

          {reviewInbox?.reviewGuidance ? (
            <div className={`rounded-[8px] border px-4 py-3 flex flex-col gap-2 ${getGuidanceColor(reviewInbox.reviewGuidance.priority)}`}>
              <div className="flex flex-wrap items-center gap-2">
                <ClipboardCheck className="w-4 h-4" />
                <span className="text-[10px] uppercase tracking-widest font-mono">{reviewInbox.reviewGuidance.priority}</span>
                <span className="text-[13px] font-semibold text-foreground">{reviewInbox.reviewGuidance.label}</span>
              </div>
              <p className="text-[12px] leading-relaxed text-secondary">{reviewInbox.reviewGuidance.detail}</p>
              <p className="text-[12px] leading-relaxed text-foreground">{reviewInbox.reviewGuidance.nextAction}</p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {REVIEW_INBOX_MODES.map((mode) => (
              <button
                key={mode.value}
                type="button"
                onClick={() => {
                  setReviewInboxMode(mode.value);
                  setReviewerFilter("ALL");
                  setReviewVisibleCounts({ ...INITIAL_REVIEW_VISIBLE_COUNTS });
                  action.clearError();
                  setReviewNotice("");
                }}
                className={`px-3 py-1.5 rounded-[8px] border text-[12px] font-semibold transition-colors ${
                  reviewInboxMode === mode.value
                    ? "border-brand/40 bg-brand/15 text-brand"
                    : "border-border-dim bg-white/[0.02] text-secondary hover:text-foreground hover:bg-white/[0.05]"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-widest font-mono text-muted">Reviewer</span>
            {[
              { value: "ALL" as ReviewReviewerFilter, label: "All" },
              { value: "UNREVIEWED" as ReviewReviewerFilter, label: "Unreviewed" },
              ...reviewerOptions.map((reviewer) => ({
                value: `reviewer:${reviewer.userId}` as ReviewReviewerFilter,
                label: reviewer.name,
              })),
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setReviewerFilter(option.value);
                  setReviewVisibleCounts({ ...INITIAL_REVIEW_VISIBLE_COUNTS });
                }}
                className={`px-3 py-1.5 rounded-[8px] border text-[12px] font-semibold transition-colors ${
                  reviewerFilter === option.value
                    ? "border-sky-500/40 bg-sky-500/15 text-sky-300"
                    : "border-border-dim bg-white/[0.02] text-secondary hover:text-foreground hover:bg-white/[0.05]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {(action.error || reviewNotice) && (
            <div className={`rounded-[8px] border px-3 py-2 text-[13px] ${
              action.error
                ? "border-red-500/20 bg-red-500/10 text-red-400"
                : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
            }`}>
              {action.error || reviewNotice}
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
                {filteredMemoryCandidates.length === 0 ? (
                  <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-3 py-4 text-[12px] text-secondary">
                    No memory candidates match this filter.
                  </div>
                ) : visibleMemoryCandidates.map((candidate) => (
                  <div key={candidate.candidateId} className="rounded-[8px] border border-border-dim bg-white/[0.02] px-3 py-3 flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${getRiskColor(candidate.riskLevel)}`}>
                        {candidate.riskLevel}
                      </span>
                      <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${getStatusColor(candidate.status)}`}>
                        {candidate.status}
                      </span>
                      <span className="text-[10px] uppercase font-mono tracking-widest text-muted">{candidate.kind}</span>
                      <span className="text-[10px] uppercase font-mono tracking-widest text-muted">{Math.round(candidate.confidence * 100)}%</span>
                    </div>
                    <p className="text-[12px] text-secondary leading-relaxed whitespace-pre-wrap">{candidate.content}</p>
                    <SourceSkillDetail sourceSkill={candidate.sourceSkill} />
                    <SourceRunDetail sourceRun={candidate.sourceRun} agentId={agentId} />
                    <ReviewMetadata
                      reviewedAt={candidate.reviewedAt}
                      reviewer={candidate.reviewer}
                      reason={candidate.rejectionReason}
                    />
                    {candidate.status === "PROPOSED" && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleMemoryDecision(candidate.candidateId, "APPROVED")}
                          disabled={action.isBusy(`memory:${candidate.candidateId}`)}
                          className="px-3 py-1.5 rounded-[8px] border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-[12px] font-semibold disabled:opacity-50 flex items-center gap-2"
                        >
                          {action.isBusy(`memory:${candidate.candidateId}`) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMemoryDecision(candidate.candidateId, "REJECTED")}
                          disabled={action.isBusy(`memory:${candidate.candidateId}`)}
                          className="px-3 py-1.5 rounded-[8px] border border-red-500/20 bg-red-500/10 text-red-400 text-[12px] font-semibold disabled:opacity-50 flex items-center gap-2"
                        >
                          <X className="w-3.5 h-3.5" />
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                <ReviewColumnPager
                  visibleCount={reviewVisibleCounts.memoryCandidates}
                  totalCount={filteredMemoryCandidates.length}
                  onShowMore={() => updateReviewVisibleCount("memoryCandidates", "MORE")}
                  onShowLess={() => updateReviewVisibleCount("memoryCandidates", "LESS")}
                />
              </div>

              <div className="flex flex-col gap-2">
                <div className="text-[11px] uppercase tracking-widest font-mono text-muted">Improvement suggestions</div>
                {filteredImprovementSuggestions.length === 0 ? (
                  <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-3 py-4 text-[12px] text-secondary">
                    No improvement suggestions match this filter.
                  </div>
                ) : visibleImprovementSuggestions.map((suggestion) => (
                  <div key={suggestion.suggestionId} className="rounded-[8px] border border-border-dim bg-white/[0.02] px-3 py-3 flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${getRiskColor(suggestion.riskLevel)}`}>
                        {suggestion.riskLevel}
                      </span>
                      <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${getStatusColor(suggestion.status)}`}>
                        {suggestion.status}
                      </span>
                      <span className="text-[10px] uppercase font-mono tracking-widest text-muted">{getReviewTypeLabel(suggestion.type)}</span>
                    </div>
                    <div>
                      <div className="text-[13px] text-foreground font-semibold leading-snug">{suggestion.title}</div>
                      <p className="text-[12px] text-secondary leading-relaxed mt-1">{suggestion.description}</p>
                    </div>
                    <SourceRunDetail sourceRun={suggestion.sourceRun} agentId={agentId} />
                    <PatchPreview proposedPatchJson={suggestion.proposedPatchJson} patchPreview={suggestion.patchPreview} />
                    <ReviewMetadata
                      reviewedAt={suggestion.reviewedAt}
                      reviewer={suggestion.reviewer}
                      reason={suggestion.rejectionReason}
                      appliedAgentVersionId={suggestion.appliedAgentVersionId}
                      appliedSkillVersionId={suggestion.appliedSkillVersionId}
                      appliedEffect={suggestion.appliedEffect}
                    />
                    {suggestion.status === "PROPOSED" && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleSuggestionDecision(suggestion.suggestionId, "APPROVED")}
                          disabled={action.isBusy(`suggestion:${suggestion.suggestionId}`)}
                          className="px-3 py-1.5 rounded-[8px] border border-indigo-500/20 bg-indigo-500/10 text-indigo-300 text-[12px] font-semibold disabled:opacity-50 flex items-center gap-2"
                        >
                          {action.isBusy(`suggestion:${suggestion.suggestionId}`) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <SlidersHorizontal className="w-3.5 h-3.5" />}
                          Apply
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSuggestionDecision(suggestion.suggestionId, "REJECTED")}
                          disabled={action.isBusy(`suggestion:${suggestion.suggestionId}`)}
                          className="px-3 py-1.5 rounded-[8px] border border-red-500/20 bg-red-500/10 text-red-400 text-[12px] font-semibold disabled:opacity-50 flex items-center gap-2"
                        >
                          <X className="w-3.5 h-3.5" />
                          Dismiss
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                <ReviewColumnPager
                  visibleCount={reviewVisibleCounts.improvementSuggestions}
                  totalCount={filteredImprovementSuggestions.length}
                  onShowMore={() => updateReviewVisibleCount("improvementSuggestions", "MORE")}
                  onShowLess={() => updateReviewVisibleCount("improvementSuggestions", "LESS")}
                />
              </div>

              <div className="flex flex-col gap-2">
                <div className="text-[11px] uppercase tracking-widest font-mono text-muted">Reflection evidence</div>
                {filteredReflections.length === 0 ? (
                  <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-3 py-4 text-[12px] text-secondary">
                    No reflection evidence matches this filter.
                  </div>
                ) : visibleReflections.map((reflection) => (
                  <div key={reflection.reflectionId} className="rounded-[8px] border border-border-dim bg-white/[0.02] px-3 py-3 flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${getRiskColor(reflection.riskLevel)}`}>
                        {reflection.riskLevel}
                      </span>
                      <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${getStatusColor(reflection.status)}`}>
                        {reflection.status}
                      </span>
                      <span className="text-[10px] uppercase font-mono tracking-widest text-muted">{getReviewTypeLabel(reflection.category)}</span>
                      <span className="text-[10px] uppercase font-mono tracking-widest text-muted">{Math.round(reflection.confidence * 100)}%</span>
                    </div>
                    <p className="text-[12px] text-secondary leading-relaxed">{reflection.rootCause}</p>
                    <SourceRunDetail sourceRun={reflection.sourceRun} agentId={agentId} />
                    {reflection.proposedEvalFixture && (
                      <p className="text-[11px] text-sky-300 leading-relaxed">Eval: {reflection.proposedEvalFixture}</p>
                    )}
                    <ReviewMetadata
                      reviewedAt={reflection.reviewedAt}
                      reviewer={reflection.reviewer}
                      reason={reflection.dismissalReason}
                    />
                    {reflection.status === "GENERATED" && (
                      <div className="flex flex-wrap gap-2">
                        {reflection.sourceRun && reflection.proposedEvalFixture && (
                          <button
                            type="button"
                            onClick={() => handleCreateEvalFromReflection(reflection.reflectionId, reflection.sourceRun!.runId)}
                            disabled={action.isBusy(`reflection:${reflection.reflectionId}`)}
                            className="px-3 py-1.5 rounded-[8px] border border-brand/30 bg-brand/10 text-brand text-[12px] font-semibold disabled:opacity-50 flex items-center gap-2"
                          >
                            {action.isBusy(`reflection:${reflection.reflectionId}`) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ClipboardCheck className="w-3.5 h-3.5" />}
                            Create eval
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDismissReflection(reflection.reflectionId)}
                          disabled={action.isBusy(`reflection:${reflection.reflectionId}`)}
                          className="px-3 py-1.5 rounded-[8px] border border-red-500/20 bg-red-500/10 text-red-400 text-[12px] font-semibold disabled:opacity-50 flex items-center gap-2"
                        >
                          {action.isBusy(`reflection:${reflection.reflectionId}`) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArchiveX className="w-3.5 h-3.5" />}
                          Dismiss
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                <ReviewColumnPager
                  visibleCount={reviewVisibleCounts.reflections}
                  totalCount={filteredReflections.length}
                  onShowMore={() => updateReviewVisibleCount("reflections", "MORE")}
                  onShowLess={() => updateReviewVisibleCount("reflections", "LESS")}
                />
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
                        deleteAction.clearError();
                        setPendingDelete(memory);
                      }}
                      disabled={deleteAction.isBusy(memory._id)}
                      className="p-2 rounded-md hover:bg-red-500/10 text-muted hover:text-red-400 transition-all disabled:opacity-50"
                      title="Delete memory"
                    >
                      {deleteAction.isBusy(memory._id) ? <Loader2 className="w-4 h-4 animate-spin text-red-400" /> : <Trash2 className="w-4 h-4" />}
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
        onClose={() => !deleteAction.isBusy() && setPendingDelete(null)}
        title="Delete memory"
        size="sm"
      >
        <div className="flex flex-col gap-6">
          <p className="text-[14px] text-secondary leading-relaxed">
            This removes the memory from future agent observations and records an audit event.
          </p>
          {deleteAction.error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-[13px] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="font-medium">{deleteAction.error}</span>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setPendingDelete(null)}
              disabled={deleteAction.isBusy()}
              className="px-5 py-2.5 rounded-[8px] text-[13px] font-medium text-secondary hover:text-foreground hover:bg-white/5 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleteAction.isBusy()}
              onClick={async () => {
                if (!pendingDelete) return;
                const outcome = await deleteAction.run(
                  () => deleteMemory({ memoryId: pendingDelete._id }),
                  {
                    key: pendingDelete._id,
                    fallbackMessage: "Failed to delete memory.",
                    suppressErrorToast: true,
                  },
                );
                if (!outcome.ok) return;
                setPendingDelete(null);
              }}
              className="px-5 py-2.5 rounded-[8px] bg-red-500 text-white text-[13px] font-medium hover:bg-red-600 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {deleteAction.isBusy() ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Delete
            </button>
          </div>
        </div>
      </SonaeModal>
    </>
  );
}
