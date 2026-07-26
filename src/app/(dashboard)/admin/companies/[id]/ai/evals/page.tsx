"use client";

import { useState } from "react";
import Link from "next/link";
import { useAction, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ClipboardCheck,
  FlaskConical,
  Loader2,
  PencilLine,
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
import { useAdminAction } from "@/src/hooks/useAdminAction";

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

// A pass rate of 0% and a pass rate of "nothing has run" look identical as a
// number and mean opposite things. An empty account read as total failure.
function formatPassRate(summary: { latestRuns: number; passRate: number } | undefined) {
  if (summary === undefined) return "...";
  // Falsy rather than `=== 0`, so an unknown run count reads as "no data" too.
  // Guessing in the other direction prints a rate nothing supports.
  if (!summary.latestRuns) return "—";
  return formatPercent(summary.passRate);
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
  const latestRuns = useQuery(api.companyEvals.getLatestRunsForCompany, { companyId });
  const archiveCase = useMutation(api.companyEvals.archiveCase);
  const runCheck = useAction(api.companyEvalRuns.runCheck);
  const runBatch = useAction(api.companyEvalRuns.runBatch);
  const batchEstimate = useQuery(api.companyEvals.getBatchEstimate, { companyId, mode: "FAILED_OR_NOT_RUN" });
  const cases = usePaginatedQuery(
    api.companyEvals.getCasesForCompany,
    { companyId, status: "ACTIVE" },
    { initialNumItems: ADMIN_PAGE_SIZE }
  );

  const [archiveTarget, setArchiveTarget] = useState<CompanyEvalCase | null>(null);
  const [expandedCaseId, setExpandedCaseId] = useState<Id<"companyEvalCases"> | null>(null);
  const [confirmBatch, setConfirmBatch] = useState(false);
  const [batchNotice, setBatchNotice] = useState("");

  const archiveAction = useAdminAction({ scope: "admin-company-evals-archive" });
  // Its own runner, so one check failing does not disable every other row's button
  // and does not surface in the batch banner.
  const runAction = useAdminAction({ scope: "admin-company-evals-run" });
  const batchAction = useAdminAction({ scope: "admin-company-evals-batch" });

  const handleRunCheck = async (evalCaseId: Id<"companyEvalCases">) => {
    setBatchNotice("");
    await runAction.run(() => runCheck({ evalCaseId }), {
      key: `run:${evalCaseId}`,
      fallbackMessage: "The eval could not be run.",
    });
  };

  const handleRunBatch = async () => {
    setBatchNotice("");
    const outcome = await batchAction.run(() => runBatch({ companyId, mode: "FAILED_OR_NOT_RUN" }), {
      fallbackMessage: "The evals could not be queued.",
      suppressErrorToast: true,
    });
    setConfirmBatch(false);
    if (!outcome.ok) return;
    setBatchNotice(
      outcome.data.scheduled === 0
        ? "Nothing needed running. Every eval already has a passing result."
        : `Running ${outcome.data.scheduled} eval${outcome.data.scheduled === 1 ? "" : "s"}. Results appear here as each one finishes.`
    );
  };

  const activeRuns = useQuery(
    api.companyEvals.getRunsForCase,
    expandedCaseId ? { evalCaseId: expandedCaseId } : "skip"
  );

  const handleArchiveCase = async () => {
    if (!archiveTarget) return;
    const outcome = await archiveAction.run(() => archiveCase({ evalCaseId: archiveTarget._id }), {
      fallbackMessage: "The eval case could not be archived.",
    });
    if (!outcome.ok) return;
    if (expandedCaseId === archiveTarget._id) setExpandedCaseId(null);
    setArchiveTarget(null);
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <header className="flex flex-col gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-foreground">
            <ClipboardCheck className="h-6 w-6 text-brand" />
            Company Evals
          </h1>
          <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-secondary">
            Define readiness tests for company chat, widget behavior, memory usage, model routing, and public answer boundaries.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3 2xl:grid-cols-5">
          {[
            { label: "Cases", value: summary?.totalCases ?? 0 },
            { label: "Blockers", value: summary?.blockerCases ?? 0 },
            { label: "Passed", value: summary?.passedRuns ?? 0 },
            { label: "Failed", value: summary?.failedRuns ?? 0 },
            { label: "Pass rate", value: formatPassRate(summary) },
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

      {(batchNotice || batchAction.error) && (
        <section className={`rounded-[8px] border px-4 py-3 text-[13px] ${
          batchAction.error ? "border-red-500/20 bg-red-500/10 text-red-200" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
        }`}>
          <div className="flex items-start gap-3">
            {batchAction.error ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
            <p>{batchAction.error || batchNotice}</p>
          </div>
        </section>
      )}

      <section className="rounded-[8px] border border-border-dim bg-sidebar/30 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border-dim px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-[14px] font-semibold text-foreground">Active Eval Cases</h2>
            <p className="mt-0.5 text-[12px] text-secondary">Running an eval asks your company AI the question, then has a second model mark the answer.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(cases.status === "LoadingFirstPage" || latestRuns === undefined) && (
              <div className="flex h-9 items-center px-2">
                <Loader2 className="h-4 w-4 animate-spin text-brand" />
              </div>
            )}
            <button
              type="button"
              onClick={() => setConfirmBatch(true)}
              disabled={batchAction.isBusy() || (batchEstimate?.selectedCount ?? 0) === 0}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[8px] bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {batchAction.isBusy() ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {(batchEstimate?.selectedCount ?? 0) === 0
                ? "All evals passing"
                : `Run ${batchEstimate?.selectedCount} unproven`}
            </button>
            <Link
              href={`${aiHref}/evals/new?returnTo=${encodeURIComponent(`${aiHref}/evals`)}`}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[8px] border border-border-dim px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-foreground/5"
            >
              <Plus className="h-4 w-4" />
              New eval
            </Link>
          </div>
        </div>

        <div className="divide-y divide-border-dim">
          {cases.status === "LoadingFirstPage" ? (
            <div className="px-4 py-12 text-center">
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-brand" />
            </div>
          ) : cases.results.length === 0 ? (
            <div className="px-4 py-12 text-center text-[13px] text-muted">No active company evals yet.</div>
          ) : cases.results.map((evalCase) => {
            const latestRun = getLatestRun(latestRuns, evalCase._id);
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
                    <button
                      type="button"
                      onClick={() => handleRunCheck(evalCase._id)}
                      disabled={runAction.isBusy(`run:${evalCase._id}`)}
                      className="inline-flex h-8 items-center justify-center gap-2 rounded-[8px] border border-emerald-500/20 bg-emerald-500/10 px-3 text-[12px] font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {runAction.isBusy(`run:${evalCase._id}`)
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Play className="h-3.5 w-3.5" />}
                      Run
                    </button>
                    <Link
                      href={`${aiHref}/evals/${evalCase._id}/run?returnTo=${encodeURIComponent(`${aiHref}/evals`)}`}
                      className="inline-flex h-8 items-center justify-center gap-2 rounded-[8px] border border-border-dim px-3 text-[12px] font-semibold text-foreground transition-colors hover:bg-foreground/5"
                    >
                      <PencilLine className="h-3.5 w-3.5" />
                      Record by hand
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

      {/* Running is now real provider work, so it says what it will do before it
          does it. The old batch button spent nothing, which is exactly why it
          proved nothing. */}
      <SonaeModal isOpen={confirmBatch} onClose={() => setConfirmBatch(false)} title="Run evals" size="sm">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3 text-[13px] leading-relaxed text-secondary">
            <p>
              This asks your company AI {batchEstimate?.selectedCount ?? 0} question{batchEstimate?.selectedCount === 1 ? "" : "s"}, then has a second model mark each answer — {batchEstimate?.providerCallCount ?? 0} AI calls in total, which cost money.
            </p>
            <p>Results appear on this page as each one finishes. You can leave the page.</p>
            {batchEstimate?.isCapped && (
              <p className="text-amber-200">
                Only the first {batchEstimate.cap} evals will run this time. Run again afterwards to cover the rest.
              </p>
            )}
          </div>
          <div className="flex justify-end gap-3 border-t border-border-dim pt-5">
            <button type="button" onClick={() => setConfirmBatch(false)} disabled={batchAction.isBusy()} className="rounded-[8px] px-4 py-2 text-[13px] font-semibold text-secondary transition-colors hover:bg-foreground/5 hover:text-foreground disabled:opacity-50">
              Cancel
            </button>
            <button type="button" onClick={handleRunBatch} disabled={batchAction.isBusy()} className="inline-flex items-center gap-2 rounded-[8px] bg-brand px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand/90 disabled:opacity-50">
              {batchAction.isBusy() ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run evals
            </button>
          </div>
        </div>
      </SonaeModal>

      <SonaeModal isOpen={Boolean(archiveTarget)} onClose={() => setArchiveTarget(null)} title="Archive Eval" size="sm">
        <div className="flex flex-col gap-6">
          <p className="text-[13px] leading-relaxed text-secondary">
            This removes the eval case from active readiness scoring. Existing run evidence remains available in audit records.
          </p>
          <div className="flex justify-end gap-3 border-t border-border-dim pt-5">
            <button type="button" onClick={() => setArchiveTarget(null)} disabled={archiveAction.isBusy()} className="rounded-[8px] px-4 py-2 text-[13px] font-semibold text-secondary transition-colors hover:bg-foreground/5 hover:text-foreground disabled:opacity-50">
              Cancel
            </button>
            <button type="button" onClick={handleArchiveCase} disabled={archiveAction.isBusy()} className="inline-flex items-center gap-2 rounded-[8px] bg-red-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50">
              {archiveAction.isBusy() ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
              Archive
            </button>
          </div>
        </div>
      </SonaeModal>
    </div>
  );
}
