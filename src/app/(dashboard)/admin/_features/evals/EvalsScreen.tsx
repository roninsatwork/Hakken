"use client";

import { useState } from "react";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
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
  AdminPaginationFooter,
  AdminSearchBar,
  AdminTableEmptyRow,
  AdminTableLoadingRow,
  AdminTableShell,
} from "@/src/app/(dashboard)/admin/_components/AdminTable";
import { AdminPageHeader } from "@/src/app/(dashboard)/admin/_components/AdminPageHeader";
import { AiWorkspaceNav } from "@/src/app/(dashboard)/admin/ai/_components/AiWorkspaceNav";
import { useServerPagedTable } from "@/src/app/(dashboard)/admin/_lib/useServerPagedTable";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
import { formatDateTime } from "@/src/lib/dates";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { AdminWriteButton } from "@/src/app/(dashboard)/admin/_components/AdminAccessLevel";

type CompanyEvalCase = Doc<"companyEvalCases">;

const RESULT_FILTERS: Array<{ value: "ALL" | "PASSED" | "FAILED" | "NOT_RUN"; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "PASSED", label: "Passing" },
  { value: "FAILED", label: "Failing" },
  { value: "NOT_RUN", label: "Not run" },
];
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

  const lead = `${summary.passedRuns} of ${summary.totalCases} eval${summary.totalCases === 1 ? "" : "s"} passing.`;
  return parts.length > 0 ? `${lead} ${parts.join(", ")}.` : lead;
}

/**
 * Evals, at both heights (Anthony's ruling, 2026-08-16). Without a company
 * this is the global AI's own list — added to and edited by hand, never
 * written for it: the Examiner drafts for companies only, because a draft
 * needs a reviewer and the platform's brain has no other reader.
 */
export function EvalsScreen({ companyId }: { companyId?: Id<"companies"> }) {
  const evalsHref = companyId ? `/admin/companies/${companyId}/ai/evals` : "/admin/ai/evals";
  const scopeArgs = companyId ? { companyId } : {};
  const summary = useQuery(api.companyEvals.getSummary, scopeArgs);
  const proposedCases =
    useQuery(
      api.wikiExamGrowth.listProposedCasesForCompany,
      companyId ? { companyId } : "skip"
    ) ?? [];
  const decideProposed = useMutation(api.wikiExamGrowth.decideProposedCaseForCompany);
  const deleteCase = useMutation(api.companyEvals.deleteCase);
  const createStarterCases = useMutation(api.companyEvals.createStarterCases);
  const runCheck = useAction(api.companyEvalRuns.runCheck);
  const runBatch = useAction(api.companyEvalRuns.runBatch);
  // Unproven evals first. Once everything passes, the button re-runs the lot —
  // because an eval that passed last week is not evidence about today, especially
  // after the memory or skills behind it changed.
  const unprovenEstimate = useQuery(api.companyEvals.getBatchEstimate, { ...scopeArgs, mode: "FAILED_OR_NOT_RUN" });
  const batchMode = (unprovenEstimate?.selectedCount ?? 0) > 0 ? "FAILED_OR_NOT_RUN" : "ALL";
  const batchEstimate = useQuery(api.companyEvals.getBatchEstimate, { ...scopeArgs, mode: batchMode });
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<"ALL" | "PASSED" | "FAILED" | "NOT_RUN">("ALL");
  const searchTerm = search.trim();
  const cases = useServerPagedTable(api.companyEvals.getCasesForCompany, {
    ...scopeArgs,
    status: "ACTIVE" as const,
    ...(searchTerm ? { searchTerm } : {}),
    ...(result === "ALL" ? {} : { result }),
  });

  const [deleteTarget, setDeleteTarget] = useState<CompanyEvalCase | null>(null);
  const [confirmBatch, setConfirmBatch] = useState(false);
  const [batchNotice, setBatchNotice] = useState("");

  const deleteAction = useAdminAction({ scope: "admin-company-evals-delete" });
  // Its own runner, keyed per row, so running one eval does not disable every
  // other button on the page.
  const runAction = useAdminAction({ scope: "admin-company-evals-run" });
  const batchAction = useAdminAction({ scope: "admin-company-evals-batch" });
  const starterAction = useAdminAction({ scope: "admin-company-evals-starters" });

  // An empty screen with only "add one" leaves the reader to invent an eval from
  // nothing, which is the hardest possible first step. These are the failures that
  // actually embarrass people.
  const handleAddStarters = async () => {
    setBatchNotice("");
    const outcome = await starterAction.run(() => createStarterCases({ companyId: companyId as Id<"companies"> }), {
      fallbackMessage: "The starter evals could not be added.",
    });
    if (outcome.ok) setBatchNotice(`Added ${outcome.data.created} starter evals. Press Run evals to see how your AI does.`);
  };

  const handleDeleteCase = async () => {
    if (!deleteTarget) return;
    const outcome = await deleteAction.run(() => deleteCase({ evalCaseId: deleteTarget._id }), {
      fallbackMessage: "The eval could not be deleted.",
    });
    if (!outcome.ok) return;
    setDeleteTarget(null);
  };

  const handleRunCheck = async (evalCaseId: Id<"companyEvalCases">) => {
    setBatchNotice("");
    await runAction.run(() => runCheck({ evalCaseId }), {
      key: `run:${evalCaseId}`,
      fallbackMessage: "The eval could not be run.",
    });
  };

  const handleRunBatch = async () => {
    setBatchNotice("");
    const outcome = await batchAction.run(() => runBatch({ ...scopeArgs, mode: batchMode }), {
      fallbackMessage: "The evals could not be started.",
      suppressErrorToast: true,
    });
    setConfirmBatch(false);
    if (!outcome.ok) return;
    setBatchNotice(
      outcome.data.scheduled === 0
        ? "Nothing needed running."
        : `Running ${outcome.data.scheduled} eval${outcome.data.scheduled === 1 ? "" : "s"}. Results appear here as each one finishes.`
    );
  };

  // What pressing the button will actually run. The label stays "Run evals" — a
  // button says what it does, and how things stand is the sentence beside it.
  const runnableCount = batchEstimate?.selectedCount ?? 0;
  const hasEvals = cases.rows.length > 0;

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <AdminPageHeader
        icon={<ClipboardCheck className="h-6 w-6 text-brand" />}
        title="Evals"
        description={
          companyId
            ? "An eval is a question, and a description of a good answer. Running one asks this company's AI the question, then has a second AI mark the answer."
            : "An eval is a question, and a description of a good answer. Running one asks the global AI the question, then has a second AI mark the answer."
        }
        divider
      />

      {!companyId && <AiWorkspaceNav />}

      <header className="flex flex-col gap-4">

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          {buildHeadline(summary) && (
            <p className="text-[15px] font-semibold text-foreground">{buildHeadline(summary)}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {hasEvals && (
              <AdminWriteButton
                type="button"
                onClick={() => setConfirmBatch(true)}
                disabled={batchAction.isBusy() || runnableCount === 0}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[8px] bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {batchAction.isBusy() ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Run evals
              </AdminWriteButton>
            )}
            {/* On an empty screen the invitation lives in the table, with the
                sentence explaining why anyone would want one. A second identical
                button above it is just noise. */}
            {hasEvals && (
              <Link
                href={`${evalsHref}/new?returnTo=${encodeURIComponent(evalsHref)}`}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[8px] border border-border-dim px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-foreground/5"
              >
                <Plus className="h-4 w-4" />
                New eval
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
      {companyId && proposedCases.length > 0 && (
        <div className="flex flex-col gap-3 rounded-[16px] border border-brand/30 bg-brand/5 p-5">
          <span className="text-[14px] font-semibold text-foreground">
            {proposedCases.length === 1
              ? "1 drafted eval from a real question"
              : `${proposedCases.length} drafted evals from real questions`}
          </span>
          <p className="text-[12px] text-secondary">
            The Examiner drafted these from questions people actually asked. A draft runs nothing
            and gates nothing until you approve it; a rejected one never returns.
          </p>
          <ul className="flex flex-col divide-y divide-border-dim/60">
            {proposedCases.map((draft) => (
              <li key={draft.caseId} className="flex items-start justify-between gap-4 py-3">
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="text-[13px] font-medium text-foreground">“{draft.prompt}”</span>
                  <span className="text-[12px] text-secondary line-clamp-2">{draft.expectedBehavior}</span>
                </div>
                <span className="flex items-center gap-2 shrink-0">
                  <AdminWriteButton
                    onClick={() => void decideProposed({ companyId, caseId: draft.caseId, approve: true })}
                    className="px-3 py-1 rounded-[8px] bg-brand text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
                  >
                    Approve
                  </AdminWriteButton>
                  <AdminWriteButton
                    onClick={() => void decideProposed({ companyId, caseId: draft.caseId, approve: false })}
                    className="px-3 py-1 rounded-[8px] border border-border-dim text-secondary text-[12px] font-medium hover:text-foreground transition-colors"
                  >
                    Reject
                  </AdminWriteButton>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <AdminSearchBar value={search} onChange={setSearch} placeholder="Search evals..." />
        </div>
        <div className="flex items-center gap-1 rounded-[12px] border border-border-dim bg-card/40 p-1">
          {RESULT_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setResult(option.value)}
              className={`px-3 py-1.5 rounded-[9px] text-[12px] font-medium transition-colors ${
                result === option.value
                  ? "bg-brand text-white"
                  : "text-secondary hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <AdminTableShell
        minWidthClassName="min-w-[760px]"
        footer={
          <AdminPaginationFooter
            page={cases.page}
            totalPages={cases.totalPages}
            totalCount={cases.loadedCount}
            pageSize={ADMIN_PAGE_SIZE}
            isLoading={cases.isLoadingMore}
            onPageChange={cases.goToPage}
            labels={{ empty: "No evals" }}
          />
        }
      >
        <thead>
          <tr className="border-b border-border-dim text-[11px] uppercase tracking-[0.1em] text-muted">
            <th className="px-4 py-3 font-medium">Eval</th>
            <th className="px-4 py-3 font-medium w-[130px]">Status</th>
            <th className="px-4 py-3 font-medium w-[120px]">Must pass</th>
            <th className="px-4 py-3 font-medium w-[170px]">Last run</th>
            <th className="px-4 py-3 font-medium w-[150px] text-right"></th>
          </tr>
        </thead>
        <tbody>
          {cases.isLoading ? (
            <AdminTableLoadingRow colSpan={5} />
          ) : cases.rows.length === 0 ? (
            <AdminTableEmptyRow
              colSpan={5}
              icon={<ClipboardCheck className="h-8 w-8 text-muted/30" />}
              label="No evals yet"
              action={
                <div className="flex flex-col items-center gap-3">
                  <p className="max-w-sm text-[13px] normal-case tracking-normal text-secondary">
                    A eval catches your AI saying something wrong before a customer sees it.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {companyId && (
                      <AdminWriteButton
                        type="button"
                        onClick={handleAddStarters}
                        disabled={starterAction.isBusy()}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-[8px] bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand/90 disabled:opacity-50"
                      >
                        {starterAction.isBusy() ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        Add 3 starter evals
                      </AdminWriteButton>
                    )}
                    <Link
                      href={`${evalsHref}/new?returnTo=${encodeURIComponent(evalsHref)}`}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-[8px] border border-border-dim px-4 text-[13px] font-semibold normal-case tracking-normal text-foreground transition-colors hover:bg-foreground/5"
                    >
                      <Plus className="h-4 w-4" />
                      Write my own
                    </Link>
                  </div>
                </div>
              }
            />
          ) : cases.rows.map((evalCase) => {
            // Read straight off the case. The list used to fetch a thousand runs to
            // work out this one status and date per row.
            const status = describeStatus(evalCase.lastRunStatus);
            const isRunning = runAction.isBusy(`run:${evalCase._id}`);

            return (
              <tr key={evalCase._id} className="border-b border-border-dim/50 hover:bg-foreground/[0.02] transition-colors">
                <td className="px-4 py-3">
                  <Link
                    href={`${evalsHref}/${evalCase._id}?returnTo=${encodeURIComponent(evalsHref)}`}
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
                  {evalCase.lastRunAt ? formatDateTime(evalCase.lastRunAt) : "—"}
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
                    <AdminWriteButton
                      type="button"
                      aria-label={`Delete ${evalCase.name}`}
                      title="Delete"
                      onClick={() => setDeleteTarget(evalCase)}
                      className="p-2 rounded-md text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </AdminWriteButton>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </AdminTableShell>

      {/* Running is real provider work, so it says what it will do before it does
          it. The old batch button spent nothing, which is why it proved nothing. */}
      <SonaeModal isOpen={confirmBatch} onClose={() => setConfirmBatch(false)} title="Run evals" size="sm">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3 text-[13px] leading-relaxed text-secondary">
            <p>
              This asks the {companyId ? "company" : "global"} AI {runnableCount} question{runnableCount === 1 ? "" : "s"}, then has a second AI mark each answer — {batchEstimate?.providerCallCount ?? 0} AI calls in total, which cost money.
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

      <SonaeModal isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="Delete eval" size="sm">
        <div className="flex flex-col gap-6">
          <p className="text-[13px] leading-relaxed text-secondary">
            This deletes <span className="font-semibold text-foreground">{deleteTarget?.name}</span> and
            its results for good. There is no undo.
          </p>
          <div className="flex justify-end gap-3 border-t border-border-dim pt-5">
            <button type="button" onClick={() => setDeleteTarget(null)} disabled={deleteAction.isBusy()} className="rounded-[8px] px-4 py-2 text-[13px] font-semibold text-secondary transition-colors hover:bg-foreground/5 hover:text-foreground disabled:opacity-50">
              Cancel
            </button>
            <AdminWriteButton type="button" onClick={handleDeleteCase} disabled={deleteAction.isBusy()} className="inline-flex items-center gap-2 rounded-[8px] bg-red-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50">
              {deleteAction.isBusy() ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete eval
            </AdminWriteButton>
          </div>
        </div>
      </SonaeModal>
    </div>
  );
}
