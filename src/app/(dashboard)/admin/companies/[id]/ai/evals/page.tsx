"use client";

import { useState } from "react";
import Link from "next/link";
import { useAction, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  Play,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  AdminLoadMoreFooter,
  AdminTableEmptyRow,
  AdminTableLoadingRow,
  AdminTableShell,
} from "@/src/app/(dashboard)/admin/_components/AdminTable";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
import { formatDateTime } from "@/src/lib/dates";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { useAdminAction } from "@/src/hooks/useAdminAction";

type CompanyEvalCase = Doc<"companyEvalCases">;
type CompanyEvalRun = Doc<"companyEvalRuns">;

/**
 * The stored result of a run, in the words an admin would use.
 *
 * `NEEDS_REVIEW` is stored but never shown: to a reader it means "we did not
 * manage to test this", which is what it now says. A run that could not complete
 * lands here too, so this is the only place that decides how an untested check
 * reads, rather than three screens each guessing.
 */
function describeStatus(status: CompanyEvalRun["status"] | undefined) {
  if (status === "PASSED") return { label: "Passing", tone: "text-emerald-400" };
  if (status === "FAILED") return { label: "Failing", tone: "text-red-400" };
  if (status === undefined) return { label: "Not run", tone: "text-muted" };
  return { label: "Not tested", tone: "text-amber-400" };
}

function getLatestRun(runs: CompanyEvalRun[] | undefined, evalCaseId: Id<"companyEvalCases">) {
  return runs?.find((run) => run.evalCaseId === evalCaseId);
}

/**
 * One sentence instead of five counters.
 *
 * The page used to lead with Cases / Blockers / Passed / Failed / Pass rate, all
 * reading 0 on a company that had just arrived — the largest thing on the screen
 * measured nothing, which reads as broken rather than as new. And "Pass rate 0%"
 * and "nothing has run" are the same number meaning opposite things.
 */
function buildHeadline(summary: {
  totalCases: number;
  passedRuns: number;
  failedRuns: number;
  needsReviewRuns: number;
  notRunCases: number;
} | undefined) {
  if (summary === undefined) return "Loading…";
  if (summary.totalCases === 0) return "";

  const parts: string[] = [];
  if (summary.failedRuns > 0) parts.push(`${summary.failedRuns} failing`);
  const untested = summary.needsReviewRuns + summary.notRunCases;
  if (untested > 0) parts.push(`${untested} not tested yet`);

  const lead = `${summary.passedRuns} of ${summary.totalCases} check${summary.totalCases === 1 ? "" : "s"} passing.`;
  return parts.length > 0 ? `${lead} ${parts.join(", ")}.` : lead;
}

export default function CompanyAiEvalsPage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  const aiHref = `/admin/companies/${companyId}/ai`;
  const summary = useQuery(api.companyEvals.getSummary, { companyId });
  const latestRuns = useQuery(api.companyEvals.getLatestRunsForCompany, { companyId });
  const archiveCase = useMutation(api.companyEvals.archiveCase);
  const createStarterCases = useMutation(api.companyEvals.createStarterCases);
  const runCheck = useAction(api.companyEvalRuns.runCheck);
  const runBatch = useAction(api.companyEvalRuns.runBatch);
  // Unproven checks first. Once everything passes, the button re-runs the lot —
  // because a check that passed last week is not evidence about today, especially
  // after the memory or skills behind it changed.
  const unprovenEstimate = useQuery(api.companyEvals.getBatchEstimate, { companyId, mode: "FAILED_OR_NOT_RUN" });
  const batchMode = (unprovenEstimate?.selectedCount ?? 0) > 0 ? "FAILED_OR_NOT_RUN" : "ALL";
  const batchEstimate = useQuery(api.companyEvals.getBatchEstimate, { companyId, mode: batchMode });
  const cases = usePaginatedQuery(
    api.companyEvals.getCasesForCompany,
    { companyId, status: "ACTIVE" },
    { initialNumItems: ADMIN_PAGE_SIZE }
  );

  const [archiveTarget, setArchiveTarget] = useState<CompanyEvalCase | null>(null);
  const [confirmBatch, setConfirmBatch] = useState(false);
  const [batchNotice, setBatchNotice] = useState("");

  const archiveAction = useAdminAction({ scope: "admin-company-evals-archive" });
  // Its own runner, keyed per row, so running one check does not disable every
  // other button on the page.
  const runAction = useAdminAction({ scope: "admin-company-evals-run" });
  const batchAction = useAdminAction({ scope: "admin-company-evals-batch" });
  const starterAction = useAdminAction({ scope: "admin-company-evals-starters" });

  // An empty screen with only "add one" leaves the reader to invent a check from
  // nothing, which is the hardest possible first step. These are the failures that
  // actually embarrass people.
  const handleAddStarters = async () => {
    setBatchNotice("");
    const outcome = await starterAction.run(() => createStarterCases({ companyId }), {
      fallbackMessage: "The starter checks could not be added.",
    });
    if (outcome.ok) setBatchNotice(`Added ${outcome.data.created} starter checks. Press Run checks to see how your AI does.`);
  };

  const handleArchiveCase = async () => {
    if (!archiveTarget) return;
    const outcome = await archiveAction.run(() => archiveCase({ evalCaseId: archiveTarget._id }), {
      fallbackMessage: "The check could not be removed.",
    });
    if (!outcome.ok) return;
    setArchiveTarget(null);
  };

  const handleRunCheck = async (evalCaseId: Id<"companyEvalCases">) => {
    setBatchNotice("");
    await runAction.run(() => runCheck({ evalCaseId }), {
      key: `run:${evalCaseId}`,
      fallbackMessage: "The check could not be run.",
    });
  };

  const handleRunBatch = async () => {
    setBatchNotice("");
    const outcome = await batchAction.run(() => runBatch({ companyId, mode: batchMode }), {
      fallbackMessage: "The checks could not be started.",
      suppressErrorToast: true,
    });
    setConfirmBatch(false);
    if (!outcome.ok) return;
    setBatchNotice(
      outcome.data.scheduled === 0
        ? "Nothing needed running."
        : `Running ${outcome.data.scheduled} check${outcome.data.scheduled === 1 ? "" : "s"}. Results appear here as each one finishes.`
    );
  };

  // What pressing the button will actually run. The label stays "Run checks" — a
  // button says what it does, and how things stand is the sentence beside it.
  const runnableCount = batchEstimate?.selectedCount ?? 0;
  const hasChecks = cases.results.length > 0;

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <header className="flex flex-col gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-foreground">
            <ClipboardCheck className="h-6 w-6 text-brand" />
            Checks
          </h1>
          <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-secondary">
            A check is a question, and a description of a good answer. Running one asks your
            company AI the question, then has a second AI mark the answer.
          </p>
        </div>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          {buildHeadline(summary) && (
            <p className="text-[15px] font-semibold text-foreground">{buildHeadline(summary)}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {hasChecks && (
              <button
                type="button"
                onClick={() => setConfirmBatch(true)}
                disabled={batchAction.isBusy() || runnableCount === 0}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[8px] bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {batchAction.isBusy() ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Run checks
              </button>
            )}
            {/* On an empty screen the invitation lives in the table, with the
                sentence explaining why anyone would want one. A second identical
                button above it is just noise. */}
            {hasChecks && (
              <Link
                href={`${aiHref}/evals/new?returnTo=${encodeURIComponent(`${aiHref}/evals`)}`}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[8px] border border-border-dim px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-foreground/5"
              >
                <Plus className="h-4 w-4" />
                New check
              </Link>
            )}
          </div>
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

      {/* The same table the Skill Center uses. This screen previously had a bespoke
          stack of rows carrying five uppercase machine constants each. */}
      <AdminTableShell
        minWidthClassName="min-w-[760px]"
        footer={cases.results.length > 0 ? (
          <AdminLoadMoreFooter
            visibleCount={cases.results.length}
            canLoadMore={cases.status === "CanLoadMore"}
            isLoading={cases.status === "LoadingMore"}
            onLoadMore={() => cases.loadMore(ADMIN_PAGE_SIZE)}
          />
        ) : undefined}
      >
        <thead>
          <tr className="border-b border-border-dim text-[11px] uppercase tracking-[0.1em] text-muted">
            <th className="px-4 py-3 font-medium">Check</th>
            <th className="px-4 py-3 font-medium w-[130px]">Status</th>
            <th className="px-4 py-3 font-medium w-[120px]">Must pass</th>
            <th className="px-4 py-3 font-medium w-[170px]">Last run</th>
            <th className="px-4 py-3 font-medium w-[150px] text-right"></th>
          </tr>
        </thead>
        <tbody>
          {cases.status === "LoadingFirstPage" ? (
            <AdminTableLoadingRow colSpan={5} />
          ) : cases.results.length === 0 ? (
            <AdminTableEmptyRow
              colSpan={5}
              icon={<ClipboardCheck className="h-8 w-8 text-muted/30" />}
              label="No checks yet"
              action={
                <div className="flex flex-col items-center gap-3">
                  <p className="max-w-sm text-[13px] normal-case tracking-normal text-secondary">
                    A check catches your AI saying something wrong before a customer sees it.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={handleAddStarters}
                      disabled={starterAction.isBusy()}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-[8px] bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand/90 disabled:opacity-50"
                    >
                      {starterAction.isBusy() ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      Add 3 starter checks
                    </button>
                    <Link
                      href={`${aiHref}/evals/new?returnTo=${encodeURIComponent(`${aiHref}/evals`)}`}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-[8px] border border-border-dim px-4 text-[13px] font-semibold normal-case tracking-normal text-foreground transition-colors hover:bg-foreground/5"
                    >
                      <Plus className="h-4 w-4" />
                      Write my own
                    </Link>
                  </div>
                </div>
              }
            />
          ) : cases.results.map((evalCase) => {
            const latestRun = getLatestRun(latestRuns, evalCase._id);
            const status = describeStatus(latestRun?.status);
            const isRunning = runAction.isBusy(`run:${evalCase._id}`);

            return (
              <tr key={evalCase._id} className="border-b border-border-dim/50 hover:bg-foreground/[0.02] transition-colors">
                <td className="px-4 py-3">
                  <Link
                    href={`${aiHref}/evals/${evalCase._id}?returnTo=${encodeURIComponent(`${aiHref}/evals`)}`}
                    className="text-[13px] font-semibold text-foreground hover:text-brand transition-colors"
                  >
                    {evalCase.name}
                  </Link>
                  <div className="text-[12px] text-secondary line-clamp-1 max-w-[520px]">{evalCase.prompt}</div>
                </td>
                <td className={`px-4 py-3 text-[13px] font-semibold ${status.tone}`}>{status.label}</td>
                <td className="px-4 py-3 text-[12px] text-secondary">
                  {evalCase.severity === "BLOCKER" ? "Yes" : "No"}
                </td>
                <td className="px-4 py-3 text-[12px] text-secondary">
                  {latestRun ? formatDateTime(latestRun.completedAt) : "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => handleRunCheck(evalCase._id)}
                      disabled={isRunning}
                      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] px-2.5 text-[12px] font-semibold text-secondary transition-colors hover:bg-foreground/5 hover:text-foreground disabled:opacity-50"
                    >
                      {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                      Run
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${evalCase.name}`}
                      title="Remove"
                      onClick={() => setArchiveTarget(evalCase)}
                      className="p-2 rounded-md text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </AdminTableShell>

      {/* Running is real provider work, so it says what it will do before it does
          it. The old batch button spent nothing, which is why it proved nothing. */}
      <SonaeModal isOpen={confirmBatch} onClose={() => setConfirmBatch(false)} title="Run checks" size="sm">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3 text-[13px] leading-relaxed text-secondary">
            <p>
              This asks your company AI {runnableCount} question{runnableCount === 1 ? "" : "s"}, then has a second AI mark each answer — {batchEstimate?.providerCallCount ?? 0} AI calls in total, which cost money.
            </p>
            <p>Results appear on this page as each one finishes. You can leave the page.</p>
            {batchEstimate?.isCapped && (
              <p className="text-amber-200">
                Only the first {batchEstimate.cap} checks will run this time. Run again afterwards to cover the rest.
              </p>
            )}
          </div>
          <div className="flex justify-end gap-3 border-t border-border-dim pt-5">
            <button type="button" onClick={() => setConfirmBatch(false)} disabled={batchAction.isBusy()} className="rounded-[8px] px-4 py-2 text-[13px] font-semibold text-secondary transition-colors hover:bg-foreground/5 hover:text-foreground disabled:opacity-50">
              Cancel
            </button>
            <button type="button" onClick={handleRunBatch} disabled={batchAction.isBusy()} className="inline-flex items-center gap-2 rounded-[8px] bg-brand px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand/90 disabled:opacity-50">
              {batchAction.isBusy() ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run checks
            </button>
          </div>
        </div>
      </SonaeModal>

      <SonaeModal isOpen={Boolean(archiveTarget)} onClose={() => setArchiveTarget(null)} title="Remove check" size="sm">
        <div className="flex flex-col gap-6">
          <p className="text-[13px] leading-relaxed text-secondary">
            This stops the check counting towards readiness. Its past results stay in the audit record.
          </p>
          <div className="flex justify-end gap-3 border-t border-border-dim pt-5">
            <button type="button" onClick={() => setArchiveTarget(null)} disabled={archiveAction.isBusy()} className="rounded-[8px] px-4 py-2 text-[13px] font-semibold text-secondary transition-colors hover:bg-foreground/5 hover:text-foreground disabled:opacity-50">
              Cancel
            </button>
            <button type="button" onClick={handleArchiveCase} disabled={archiveAction.isBusy()} className="inline-flex items-center gap-2 rounded-[8px] bg-red-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50">
              {archiveAction.isBusy() ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Remove
            </button>
          </div>
        </div>
      </SonaeModal>
    </div>
  );
}
