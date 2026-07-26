"use client";

import Link from "next/link";
import { useAction, useQuery } from "convex/react";
import { useParams, useSearchParams } from "next/navigation";
import { CheckCircle2, ClipboardCheck, Loader2, Pencil, Play, XCircle } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  CompanyAiFormPageHeader,
  getSafeCompanyAiReturnTo,
} from "@/src/app/(dashboard)/admin/companies/[id]/ai/_components/CompanyAiFormPage";
import { formatDateTime } from "@/src/lib/dates";
import { useAdminAction } from "@/src/hooks/useAdminAction";

type CompanyEvalRun = Doc<"companyEvalRuns">;

type RunResult = {
  label: string;
  passed: boolean;
  detail: string;
};

/**
 * The check detail page.
 *
 * Neither testing surface had one. The company screen expanded a row in place and
 * clamped the answer to two lines; the agent screen put everything in modals. The
 * single most useful thing either surface can show is **the answer the AI actually
 * gave and why it was marked down**, and it was the hardest thing to read.
 *
 * History matters for the same reason: a regression reads as "passed for three
 * weeks, started failing on Tuesday", which a single red badge cannot say.
 */
function describeResult(status: CompanyEvalRun["status"] | undefined) {
  if (status === "PASSED") return { label: "Passing", tone: "text-emerald-400" };
  if (status === "FAILED") return { label: "Failing", tone: "text-red-400" };
  if (status === undefined) return { label: "Not run yet", tone: "text-muted" };
  return { label: "Not tested", tone: "text-amber-400" };
}

function parseResults(run: CompanyEvalRun | undefined): RunResult[] {
  if (!run) return [];
  try {
    const parsed = JSON.parse(run.deterministicResultsJson) as RunResult[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseEvidenceCounts(run: CompanyEvalRun | undefined) {
  if (!run?.evidenceJson) return { documents: 0, memories: 0, skills: 0 };
  try {
    const parsed = JSON.parse(run.evidenceJson) as {
      sourceIds?: unknown[];
      memoryIds?: unknown[];
      skillIds?: unknown[];
    };
    return {
      documents: Array.isArray(parsed.sourceIds) ? parsed.sourceIds.length : 0,
      memories: Array.isArray(parsed.memoryIds) ? parsed.memoryIds.length : 0,
      skills: Array.isArray(parsed.skillIds) ? parsed.skillIds.length : 0,
    };
  } catch {
    return { documents: 0, memories: 0, skills: 0 };
  }
}

export default function CompanyEvalCaseDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const companyId = params.id as Id<"companies">;
  const evalCaseId = params.evalCaseId as Id<"companyEvalCases">;
  const fallbackHref = `/admin/companies/${companyId}/ai/evals`;
  const backHref = getSafeCompanyAiReturnTo(searchParams.get("returnTo"), companyId, fallbackHref);

  const evalCase = useQuery(api.companyEvals.getCaseById, { evalCaseId });
  const runs = useQuery(api.companyEvals.getRunsForCase, { evalCaseId });
  const runCheck = useAction(api.companyEvalRuns.runCheck);
  const action = useAdminAction({ scope: "admin-company-eval-detail-run" });

  const latestRun = runs?.[0];
  const results = parseResults(latestRun);
  const evidence = parseEvidenceCounts(latestRun);
  const result = describeResult(latestRun?.status);

  if (evalCase === undefined) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <CompanyAiFormPageHeader
        backHref={backHref}
        title={evalCase.name}
        description="What this check asks, and what your AI said the last time it was asked."
        icon={<ClipboardCheck className="h-6 w-6 text-brand" />}
      />

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className={`text-[18px] font-semibold ${result.tone}`}>{result.label}</span>
          {latestRun && (
            <span className="text-[12px] text-secondary">Last run {formatDateTime(latestRun.completedAt)}</span>
          )}
          {evalCase.severity === "BLOCKER" && (
            <span className="text-[12px] text-secondary">Must pass before going live</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
        <Link
          href={`/admin/companies/${companyId}/ai/evals/${evalCaseId}/edit?returnTo=${encodeURIComponent(backHref)}`}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[8px] border border-border-dim px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-foreground/5"
        >
          <Pencil className="h-4 w-4" />
          Edit
        </Link>
        <button
          type="button"
          onClick={() => action.run(() => runCheck({ evalCaseId }), { fallbackMessage: "The check could not be run." })}
          disabled={action.isBusy()}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[8px] bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand/90 disabled:opacity-50"
        >
          {action.isBusy() ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Run this check
        </button>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
          <h2 className="text-[11px] uppercase tracking-[0.1em] text-muted">The question</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-foreground">{evalCase.prompt}</p>
        </div>
        <div className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
          <h2 className="text-[11px] uppercase tracking-[0.1em] text-muted">What a good answer must do</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-foreground">{evalCase.expectedBehavior}</p>
        </div>
      </section>

      {/* The answer in full. This was a two-line clamp inside an expander, which is
          the one thing an admin needs to read when a check fails. */}
      <section className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
        <h2 className="text-[11px] uppercase tracking-[0.1em] text-muted">What your AI answered</h2>
        {runs === undefined ? (
          <Loader2 className="mt-3 h-4 w-4 animate-spin text-brand" />
        ) : !latestRun ? (
          <p className="mt-2 text-[13px] text-muted">
            This check has never been run. Press <span className="text-foreground">Run this check</span> to ask your AI.
          </p>
        ) : (
          <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-foreground">{latestRun.answer}</p>
        )}
        {latestRun && (
          <p className="mt-4 text-[12px] text-secondary">
            Used {evidence.documents} document{evidence.documents === 1 ? "" : "s"}, {evidence.memories} memor{evidence.memories === 1 ? "y" : "ies"} and {evidence.skills} skill{evidence.skills === 1 ? "" : "s"}
            {latestRun.resolvedModelId ? ` · answered by ${latestRun.resolvedModelId}` : ""}
          </p>
        )}
      </section>

      {results.length > 0 && (
        <section className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
          <h2 className="text-[11px] uppercase tracking-[0.1em] text-muted">How it was marked</h2>
          <div className="mt-3 flex flex-col gap-3">
            {results.map((entry, index) => (
              <div key={`${entry.label}-${index}`} className="flex items-start gap-3">
                {entry.passed
                  ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />}
                <div>
                  <div className="text-[13px] font-semibold text-foreground">{entry.label}</div>
                  <p className="text-[12px] leading-relaxed text-secondary">{entry.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* History, so a regression reads as a change rather than as one red badge. */}
      {runs !== undefined && runs.length > 1 && (
        <section className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
          <h2 className="text-[11px] uppercase tracking-[0.1em] text-muted">Earlier runs</h2>
          <div className="mt-3 flex flex-col gap-2">
            {runs.slice(1).map((run) => {
              const earlier = describeResult(run.status);
              return (
                <div key={run._id} className="flex items-center justify-between gap-4 border-b border-border-dim/40 pb-2 last:border-0 last:pb-0">
                  <span className={`text-[13px] font-semibold ${earlier.tone}`}>{earlier.label}</span>
                  <span className="text-[12px] text-secondary">{formatDateTime(run.completedAt)}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
