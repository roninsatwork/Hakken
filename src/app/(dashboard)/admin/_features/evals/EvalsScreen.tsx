"use client";

import dynamic from "next/dynamic";
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
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { RowIconButton, SearchBar } from "@/src/ui/components/screens/Table";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { AiWorkspaceNav } from "@/src/app/(dashboard)/admin/ai/_components/AiWorkspaceNav";
import { useServerPagedTable } from "@/src/hooks/useServerPagedTable";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { formatDateTime } from "@/src/lib/dates";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";

type CompanyEvalCase = Doc<"companyEvalCases">;

const RESULT_FILTERS: Array<{ value: "ALL" | "PASSED" | "FAILED" | "NOT_RUN"; labelKey: string }> = [
  { value: "ALL", labelKey: "filters.all" },
  { value: "PASSED", labelKey: "filters.passing" },
  { value: "FAILED", labelKey: "filters.failing" },
  { value: "NOT_RUN", labelKey: "filters.notRun" },
];
type CompanyEvalRun = Doc<"companyEvalRuns">;

const loadEvalDialogs = () =>
  import("./EvalDialogs").then((module) => module.EvalDialogs);
const EvalDialogs = dynamic(loadEvalDialogs);

/**
 * The stored result of a run, in the words an admin would use.
 *
 * `NEEDS_REVIEW` is stored but never shown: to a reader it means "we did not
 * manage to test this", which is what it now says. A run that could not complete
 * lands here too, so this is the only place that decides how an untested check
 * reads, rather than three screens each guessing.
 */
function describeStatus(
  status: CompanyEvalRun["status"] | undefined,
  t: (key: string) => string
) {
  if (status === "PASSED") return { label: t("status.passing"), tone: "text-emerald-400" };
  if (status === "FAILED") return { label: t("status.failing"), tone: "text-red-400" };
  if (status === undefined) return { label: t("status.notRun"), tone: "text-muted" };
  return { label: t("status.notTested"), tone: "text-amber-400" };
}

/**
 * One sentence instead of five counters.
 *
 * The page used to lead with Cases / Blockers / Passed / Failed / Pass rate, all
 * reading 0 on a company that had just arrived — the largest thing on the screen
 * measured nothing, which reads as broken rather than as new. And "Pass rate 0%"
 * and "nothing has run" are the same number meaning opposite things.
 */
function buildHeadline(
  summary: {
    totalCases: number;
    passedRuns: number;
    failedRuns: number;
    needsReviewRuns: number;
    notRunCases: number;
  } | undefined,
  t: (key: string, params?: Record<string, number>) => string
) {
  if (summary === undefined) return t("headline.loading");
  if (summary.totalCases === 0) return "";

  const parts: string[] = [];
  if (summary.failedRuns > 0) parts.push(t("headline.failing", { count: summary.failedRuns }));
  const untested = summary.needsReviewRuns + summary.notRunCases;
  if (untested > 0) parts.push(t("headline.notTested", { count: untested }));

  const lead = t("headline.lead", { passed: summary.passedRuns, total: summary.totalCases });
  return parts.length > 0 ? `${lead} ${parts.join(", ")}.` : lead;
}

/**
 * Evals, at both heights (Anthony's ruling, 2026-08-16). Without a company
 * this is the global AI's own list — added to and edited by hand, never
 * written for it: the Examiner drafts for companies only, because a draft
 * needs a reviewer and the platform's brain has no other reader.
 */
export function EvalsScreen({ companyId }: { companyId?: Id<"companies"> }) {
  const t = useTranslations("ai.evals.list");
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
  const proposedAction = useAdminAction({ scope: "admin-company-evals-proposed" });

  const handleDecideProposed = (caseId: Id<"companyEvalCases">, approve: boolean) =>
    proposedAction.run(
      () => decideProposed({ companyId: companyId as Id<"companies">, caseId, approve }),
      { key: caseId, fallbackMessage: t("notices.proposedFailed") },
    );

  // An empty screen with only "add one" leaves the reader to invent an eval from
  // nothing, which is the hardest possible first step. These are the failures that
  // actually embarrass people.
  const handleAddStarters = async () => {
    setBatchNotice("");
    const outcome = await starterAction.run(() => createStarterCases({ companyId: companyId as Id<"companies"> }), {
      fallbackMessage: t("notices.startersFailed"),
    });
    if (outcome.ok) setBatchNotice(t("notices.startersAdded", { count: outcome.data.created }));
  };

  const handleDeleteCase = async () => {
    if (!deleteTarget) return;
    const outcome = await deleteAction.run(() => deleteCase({ evalCaseId: deleteTarget._id }), {
      fallbackMessage: t("notices.deleteFailed"),
    });
    if (!outcome.ok) return;
    setDeleteTarget(null);
  };

  const handleRunCheck = async (evalCaseId: Id<"companyEvalCases">) => {
    setBatchNotice("");
    await runAction.run(() => runCheck({ evalCaseId }), {
      key: `run:${evalCaseId}`,
      fallbackMessage: t("notices.runFailed"),
    });
  };

  const handleRunBatch = async () => {
    setBatchNotice("");
    const outcome = await batchAction.run(() => runBatch({ ...scopeArgs, mode: batchMode }), {
      fallbackMessage: t("notices.batchFailed"),
      suppressErrorToast: true,
    });
    setConfirmBatch(false);
    if (!outcome.ok) return;
    setBatchNotice(
      outcome.data.scheduled === 0
        ? t("notices.nothingToRun")
        : t("notices.batchStarted", { count: outcome.data.scheduled })
    );
  };

  // What pressing the button will actually run. The label stays "Run evals" — a
  // button says what it does, and how things stand is the sentence beside it.
  const runnableCount = batchEstimate?.selectedCount ?? 0;
  const hasEvals = cases.rows.length > 0;

  const openBatchDialog = () => {
    void loadEvalDialogs();
    setConfirmBatch(true);
  };

  const openDeleteDialog = (evalCase: CompanyEvalCase) => {
    void loadEvalDialogs();
    setDeleteTarget(evalCase);
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader
        icon={<ClipboardCheck className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={companyId ? t("companyDescription") : t("globalDescription")}
        divider
      />

      {!companyId && <AiWorkspaceNav />}

      <header className="flex flex-col gap-4">

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          {buildHeadline(summary, t) && (
            <p className="text-[15px] font-semibold text-foreground">{buildHeadline(summary, t)}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {hasEvals && (
              <WriteButton
                type="button"
                onClick={openBatchDialog}
                disabled={batchAction.isBusy() || runnableCount === 0}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[8px] bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {batchAction.isBusy() ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {t("runEvals")}
              </WriteButton>
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
                {t("newEval")}
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
            {t("proposed.headline", { count: proposedCases.length })}
          </span>
          <p className="text-[12px] text-secondary">
            {t("proposed.description")}
          </p>
          <ul className="flex flex-col divide-y divide-border-dim/60">
            {proposedCases.map((draft) => (
              <li key={draft.caseId} className="flex items-start justify-between gap-4 py-3">
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="text-[13px] font-medium text-foreground">{t("proposed.prompt", { prompt: draft.prompt })}</span>
                  <span className="text-[12px] text-secondary line-clamp-2">{draft.expectedBehavior}</span>
                </div>
                <span className="flex items-center gap-2 shrink-0">
                  <WriteButton
                    onClick={() => void handleDecideProposed(draft.caseId, true)}
                    className="px-3 py-1 rounded-[8px] bg-brand text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
                  >
                    {t("proposed.approve")}
                  </WriteButton>
                  <WriteButton
                    onClick={() => void handleDecideProposed(draft.caseId, false)}
                    className="px-3 py-1 rounded-[8px] border border-border-dim text-secondary text-[12px] font-medium hover:text-foreground transition-colors"
                  >
                    {t("proposed.reject")}
                  </WriteButton>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <SearchBar value={search} onChange={setSearch} placeholder={t("searchPlaceholder")} />
        </div>
        <div className="flex items-center gap-1 rounded-[12px] border border-border-dim bg-card/40 p-1">
          {RESULT_FILTERS.map((option) => (
            /* Raw: segmented filter — the active option swaps its colours; no kit variant is stateful. */
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
              {t(option.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <DataTable
        rows={cases.isLoading ? undefined : cases.rows}
        rowKey={(evalCase) => evalCase._id}
        minWidthClassName="min-w-[760px]"
        empty={{
          icon: <ClipboardCheck className="h-8 w-8 text-muted/30" />,
          label: t("empty.label"),
          action: (
            <div className="flex flex-col items-center gap-3">
              <p className="max-w-sm text-[13px] normal-case tracking-normal text-secondary">
                {t("empty.hint")}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {companyId && (
                  <WriteButton
                    type="button"
                    onClick={handleAddStarters}
                    disabled={starterAction.isBusy()}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-[8px] bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand/90 disabled:opacity-50"
                  >
                    {starterAction.isBusy() ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {t("empty.addStarters")}
                  </WriteButton>
                )}
                <Link
                  href={`${evalsHref}/new?returnTo=${encodeURIComponent(evalsHref)}`}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-[8px] border border-border-dim px-4 text-[13px] font-semibold normal-case tracking-normal text-foreground transition-colors hover:bg-foreground/5"
                >
                  <Plus className="h-4 w-4" />
                  {t("empty.writeOwn")}
                </Link>
              </div>
            </div>
          ),
        }}
        footer={{
          mode: "paged",
          page: cases.page,
          totalPages: cases.totalPages,
          totalCount: cases.loadedCount,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: cases.isBusy,
          onPageChange: cases.goToPage,
          labels: { empty: t("empty.table") },
        }}
        columns={[
          {
            key: "eval",
            header: t("columns.eval"),
            cell: (evalCase) => (
              <>
                <Link
                  href={`${evalsHref}/${evalCase._id}?returnTo=${encodeURIComponent(evalsHref)}`}
                  className="text-[13px] font-semibold text-foreground hover:text-brand transition-colors"
                >
                  {evalCase.name}
                </Link>
                <div className="text-[12px] text-secondary line-clamp-1 max-w-[520px]">{evalCase.prompt}</div>
              </>
            ),
          },
          {
            key: "status",
            header: t("columns.status"),
            className: "w-[130px]",
            // Read straight off the case. The list used to fetch a thousand runs
            // to work out this one status and date per row.
            cell: (evalCase) => {
              const status = describeStatus(evalCase.lastRunStatus, t);
              return <span className={`text-[13px] font-semibold ${status.tone}`}>{status.label}</span>;
            },
          },
          {
            key: "mustPass",
            header: t("columns.mustPass"),
            className: "w-[120px]",
            cell: (evalCase) => (
              <span className="text-[12px] text-secondary">
                {evalCase.severity === "BLOCKER" ? t("yes") : t("no")}
              </span>
            ),
          },
          {
            key: "lastRun",
            header: t("columns.lastRun"),
            className: "w-[170px]",
            cell: (evalCase) => (
              <span className="text-[12px] text-secondary">
                {evalCase.lastRunAt ? formatDateTime(evalCase.lastRunAt) : "—"}
              </span>
            ),
          },
          {
            key: "actions",
            header: "",
            align: "right",
            className: "w-[150px]",
            cell: (evalCase) => {
              const isRunning = runAction.isBusy(`run:${evalCase._id}`);
              return (
                <div className="flex items-center justify-end gap-1">
                  {/* Raw: borderless row action with a foreground/5 hover — quiet's border and fill match no pixel of it. */}
                  <button
                    type="button"
                    onClick={() => handleRunCheck(evalCase._id)}
                    disabled={isRunning}
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] px-2.5 text-[12px] font-semibold text-secondary transition-colors hover:bg-foreground/5 hover:text-foreground disabled:opacity-50"
                  >
                    {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    {t("run")}
                  </button>
                  <RowIconButton
                    label={t("deleteRow", { name: evalCase.name })}
                    tone="danger"
                    onClick={() => openDeleteDialog(evalCase)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </RowIconButton>
                </div>
              );
            },
          },
        ]}
      />

      {confirmBatch || deleteTarget ? (
        <EvalDialogs
          batch={{
            body: t(companyId ? "batchModal.bodyCompany" : "batchModal.bodyGlobal", {
              count: runnableCount,
              calls: batchEstimate?.providerCallCount ?? 0,
            }),
            busy: batchAction.isBusy(),
            cancelLabel: t("batchModal.cancel"),
            cappedMessage: batchEstimate?.isCapped
              ? t("batchModal.capped", { cap: batchEstimate.cap })
              : undefined,
            confirmLabel: t("runEvals"),
            open: confirmBatch,
            stayMessage: t("batchModal.stay"),
            title: t("batchModal.title"),
          }}
          deletion={{
            body: t.rich("deleteModal.body", {
              name: deleteTarget?.name ?? "",
              highlight: (chunks) => (
                <span className="font-semibold text-foreground">{chunks}</span>
              ),
            }),
            busy: deleteAction.isBusy(),
            cancelLabel: t("deleteModal.cancel"),
            confirmLabel: t("deleteModal.confirm"),
            open: Boolean(deleteTarget),
            title: t("deleteModal.title"),
          }}
          onBatchClose={() => setConfirmBatch(false)}
          onBatchConfirm={handleRunBatch}
          onDeleteClose={() => setDeleteTarget(null)}
          onDeleteConfirm={handleDeleteCase}
        />
      ) : null}
    </div>
  );
}
