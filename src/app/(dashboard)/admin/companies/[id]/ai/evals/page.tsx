"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import {
  Archive,
  CheckCircle2,
  ClipboardCheck,
  FlaskConical,
  Loader2,
  Play,
  Plus,
  XCircle,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { AdminLoadMoreFooter } from "@/src/app/(dashboard)/admin/_components/AdminTable";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
import { formatDateTime } from "@/src/lib/dates";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";

type CompanyEvalCase = Doc<"companyEvalCases">;
type CompanyEvalRun = Doc<"companyEvalRuns">;
type EvalSeverity = CompanyEvalCase["severity"];

type DeterministicResult = {
  label: string;
  passed: boolean;
  detail: string;
};

function getSeverityClasses(severity: EvalSeverity) {
  if (severity === "BLOCKER") return "border-red-500/20 bg-red-500/10 text-red-300";
  if (severity === "WARNING") return "border-amber-500/20 bg-amber-500/10 text-amber-300";
  return "border-blue-500/20 bg-blue-500/10 text-blue-300";
}

function getRunClasses(status: CompanyEvalRun["status"] | string | undefined) {
  if (status === "PASSED") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
  if (status === "FAILED") return "border-red-500/20 bg-red-500/10 text-red-300";
  return "border-amber-500/20 bg-amber-500/10 text-amber-300";
}

function formatPercent(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0%";
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function getLatestRun(runs: CompanyEvalRun[] | undefined, evalCaseId: Id<"companyEvalCases">) {
  return runs?.find((run) => run.evalCaseId === evalCaseId);
}

function parseRunResults(run: CompanyEvalRun | undefined) {
  if (!run) return [];
  try {
    const parsed = JSON.parse(run.deterministicResultsJson) as DeterministicResult[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function CompanyAiEvalsPage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  const aiHref = `/admin/companies/${companyId}/ai`;
  const summary = useQuery(api.companyEvals.getSummary, { companyId });
  const archiveCase = useMutation(api.companyEvals.archiveCase);
  const cases = usePaginatedQuery(
    api.companyEvals.getCasesForCompany,
    { companyId, status: "ACTIVE" },
    { initialNumItems: ADMIN_PAGE_SIZE }
  );

  const [archiveTarget, setArchiveTarget] = useState<CompanyEvalCase | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedCaseId, setExpandedCaseId] = useState<Id<"companyEvalCases"> | null>(null);

  const activeRuns = useQuery(
    api.companyEvals.getRunsForCase,
    expandedCaseId ? { evalCaseId: expandedCaseId } : "skip"
  );

  const handleArchiveCase = async () => {
    if (!archiveTarget) return;
    setIsSubmitting(true);
    try {
      await archiveCase({ evalCaseId: archiveTarget._id });
      if (expandedCaseId === archiveTarget._id) setExpandedCaseId(null);
      setArchiveTarget(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-foreground">
              <ClipboardCheck className="h-6 w-6 text-brand" />
              Company Evals
            </h1>
            <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-secondary">
              Define readiness tests for company chat, widget behavior, memory usage, model routing, and public answer boundaries.
            </p>
          </div>
          <Link
            href={`${aiHref}/evals/new?returnTo=${encodeURIComponent(`${aiHref}/evals`)}`}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[8px] bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand/90"
          >
            <Plus className="h-4 w-4" />
            New eval
          </Link>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: "Cases", value: summary?.totalCases ?? 0 },
            { label: "Blockers", value: summary?.blockerCases ?? 0 },
            { label: "Passed", value: summary?.passedRuns ?? 0 },
            { label: "Failed", value: summary?.failedRuns ?? 0 },
            { label: "Pass rate", value: formatPercent(summary?.passRate) },
          ].map((metric) => (
            <div key={metric.label} className="rounded-[8px] border border-border-dim bg-sidebar/30 p-4">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted">{metric.label}</div>
              <div className="mt-2 text-2xl font-semibold text-foreground">
                {summary === undefined ? "..." : typeof metric.value === "number" ? metric.value.toLocaleString() : metric.value}
              </div>
            </div>
          ))}
        </div>
      </header>

      <section className="rounded-[8px] border border-border-dim bg-sidebar/30 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border-dim px-4 py-3">
          <div>
            <h2 className="text-[14px] font-semibold text-foreground">Active Eval Cases</h2>
            <p className="mt-0.5 text-[12px] text-secondary">Manual deterministic runs first; LLM judging comes after the proof model is stable.</p>
          </div>
          {cases.status === "LoadingFirstPage" && <Loader2 className="h-4 w-4 animate-spin text-brand" />}
        </div>

        <div className="divide-y divide-border-dim">
          {cases.status === "LoadingFirstPage" ? (
            <div className="px-4 py-12 text-center">
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-brand" />
            </div>
          ) : cases.results.length === 0 ? (
            <div className="px-4 py-12 text-center text-[13px] text-muted">No active company evals yet.</div>
          ) : cases.results.map((evalCase) => {
            const latestRun = evalCase.lastRunId && activeRuns ? getLatestRun(activeRuns, evalCase._id) : undefined;
            const isExpanded = expandedCaseId === evalCase._id;
            const runResults = isExpanded ? parseRunResults(activeRuns?.[0]) : [];

            return (
              <div key={evalCase._id} className="px-4 py-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[14px] font-semibold text-foreground">{evalCase.name}</h3>
                      <span className={`rounded-md border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ${getSeverityClasses(evalCase.severity)}`}>
                        {evalCase.severity}
                      </span>
                      <span className="rounded-md border border-border-dim bg-foreground/5 px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-secondary">
                        {evalCase.category}
                      </span>
                      {latestRun && (
                        <span className={`rounded-md border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ${getRunClasses(latestRun.status)}`}>
                          {latestRun.status} {formatPercent(latestRun.score)}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-[12px] leading-relaxed text-secondary">{evalCase.prompt}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted">{evalCase.expectedBehavior}</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-[10px] font-mono uppercase tracking-widest text-muted">
                      <span>{evalCase.targetSurface}</span>
                      {evalCase.expectedModelUseCase && <span>model: {evalCase.expectedModelUseCase}</span>}
                      <span>{formatDateTime(evalCase.updatedAt)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setExpandedCaseId(isExpanded ? null : evalCase._id)}
                      className="inline-flex h-8 items-center justify-center gap-2 rounded-[8px] border border-border-dim px-3 text-[12px] font-semibold text-foreground transition-colors hover:bg-foreground/5"
                    >
                      <FlaskConical className="h-3.5 w-3.5" />
                      Evidence
                    </button>
                    <Link
                      href={`${aiHref}/evals/${evalCase._id}/run?returnTo=${encodeURIComponent(`${aiHref}/evals`)}`}
                      className="inline-flex h-8 items-center justify-center gap-2 rounded-[8px] border border-emerald-500/20 bg-emerald-500/10 px-3 text-[12px] font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/15"
                    >
                      <Play className="h-3.5 w-3.5" />
                      Run
                    </Link>
                    <button
                      type="button"
                      onClick={() => setArchiveTarget(evalCase)}
                      className="inline-flex h-8 items-center justify-center gap-2 rounded-[8px] border border-red-500/20 bg-red-500/10 px-3 text-[12px] font-semibold text-red-300 transition-colors hover:bg-red-500/15"
                    >
                      <Archive className="h-3.5 w-3.5" />
                      Archive
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-4 rounded-[8px] border border-border-dim bg-background/50 p-3">
                    {activeRuns === undefined ? (
                      <Loader2 className="h-4 w-4 animate-spin text-brand" />
                    ) : activeRuns.length === 0 ? (
                      <p className="text-[12px] text-muted">No runs recorded yet.</p>
                    ) : (
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-md border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ${getRunClasses(activeRuns[0].status)}`}>
                            Latest {activeRuns[0].status}
                          </span>
                          <span className="text-[10px] font-mono uppercase tracking-widest text-muted">{formatDateTime(activeRuns[0].completedAt)}</span>
                        </div>
                        <p className="text-[12px] leading-relaxed text-secondary">{activeRuns[0].answer}</p>
                        {runResults.length > 0 && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {runResults.map((result) => (
                              <div key={result.detail} className="rounded-[8px] border border-border-dim bg-sidebar/30 p-3">
                                <div className="flex items-center gap-2 text-[12px] font-semibold text-foreground">
                                  {result.passed ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <XCircle className="h-3.5 w-3.5 text-red-400" />}
                                  {result.label}
                                </div>
                                <p className="mt-1 text-[11px] leading-relaxed text-muted">{result.detail}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <AdminLoadMoreFooter
          visibleCount={cases.results.length}
          canLoadMore={cases.status === "CanLoadMore"}
          isLoading={cases.status === "LoadingMore"}
          onLoadMore={() => cases.loadMore(ADMIN_PAGE_SIZE)}
        />
      </section>

      <SonaeModal isOpen={Boolean(archiveTarget)} onClose={() => setArchiveTarget(null)} title="Archive Eval" size="sm">
        <div className="flex flex-col gap-6">
          <p className="text-[13px] leading-relaxed text-secondary">
            This removes the eval case from active readiness scoring. Existing run evidence remains available in audit records.
          </p>
          <div className="flex justify-end gap-3 border-t border-border-dim pt-5">
            <button type="button" onClick={() => setArchiveTarget(null)} disabled={isSubmitting} className="rounded-[8px] px-4 py-2 text-[13px] font-semibold text-secondary transition-colors hover:bg-foreground/5 hover:text-foreground disabled:opacity-50">
              Cancel
            </button>
            <button type="button" onClick={handleArchiveCase} disabled={isSubmitting} className="inline-flex items-center gap-2 rounded-[8px] bg-red-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
              Archive
            </button>
          </div>
        </div>
      </SonaeModal>
    </div>
  );
}
