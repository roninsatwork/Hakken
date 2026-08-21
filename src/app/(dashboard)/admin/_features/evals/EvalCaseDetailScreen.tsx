"use client";

import Link from "next/link";
import { useAction, useQuery } from "convex/react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, ClipboardCheck, Loader2, Pencil, Play, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  CompanyAiFormPageHeader,
  getSafeCompanyAiReturnTo,
  getSafeGlobalAiReturnTo,
} from "@/src/app/(dashboard)/admin/companies/[id]/ai/_components/CompanyAiFormPage";
import { formatDateTime } from "@/src/lib/dates";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { Button } from "@/src/ui/atoms/Button";

type CompanyEvalRun = Doc<"companyEvalRuns">;

type RunResult = {
  label: string;
  passed: boolean;
  detail: string;
};

/**
 * The eval detail page.
 *
 * Neither testing surface had one. The company screen expanded a row in place and
 * clamped the answer to two lines; the agent screen put everything in modals. The
 * single most useful thing either surface can show is **the answer the AI actually
 * gave and why it was marked down**, and it was the hardest thing to read.
 *
 * History matters for the same reason: a regression reads as "passed for three
 * weeks, started failing on Tuesday", which a single red badge cannot say.
 */
function describeResult(
  status: CompanyEvalRun["status"] | undefined,
  t: (key: string) => string
) {
  if (status === "PASSED") return { label: t("status.passing"), tone: "text-emerald-400" };
  if (status === "FAILED") return { label: t("status.failing"), tone: "text-red-400" };
  if (status === undefined) return { label: t("status.notRunYet"), tone: "text-muted" };
  return { label: t("status.notTested"), tone: "text-amber-400" };
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

/**
 * What the run cost, if the models behind it are priced.
 *
 * Zero and "not priced" are different facts, so an unpriced run says nothing rather
 * than claiming it was free.
 */
function formatRunCost(run: CompanyEvalRun | undefined) {
  if (!run?.costJson) return null;
  try {
    const parsed = JSON.parse(run.costJson) as { totalGBP?: unknown };
    if (typeof parsed.totalGBP !== "number" || !Number.isFinite(parsed.totalGBP) || parsed.totalGBP <= 0) return null;
    // Sub-cent runs are the norm here, so cents with two decimals read better than
    // a string of zeros after a currency sign. Dollars, because the stored figure
    // is the provider's own price and nothing converts it.
    const cents = parsed.totalGBP * 100;
    return cents < 1 ? `${cents.toFixed(2)}¢` : `$${parsed.totalGBP.toFixed(2)}`;
  } catch {
    return null;
  }
}

function parseSampleCount(run: CompanyEvalRun | undefined) {
  if (!run?.tokenUsageJson) return 1;
  try {
    const parsed = JSON.parse(run.tokenUsageJson) as { samples?: unknown };
    return typeof parsed.samples === "number" && parsed.samples > 0 ? parsed.samples : 1;
  } catch {
    return 1;
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

/** One eval and its history, at both heights. */
export function EvalCaseDetailScreen({
  companyId,
  evalCaseId,
}: {
  companyId?: Id<"companies">;
  evalCaseId: Id<"companyEvalCases">;
}) {
  const t = useTranslations("ai.evals.detail");
  const searchParams = useSearchParams();
  const evalsHref = companyId ? `/admin/companies/${companyId}/ai/evals` : "/admin/ai/evals";
  const backHref = companyId
    ? getSafeCompanyAiReturnTo(searchParams.get("returnTo"), companyId, evalsHref)
    : getSafeGlobalAiReturnTo(searchParams.get("returnTo"), evalsHref);

  const evalCase = useQuery(api.companyEvals.getCaseById, { evalCaseId });
  const runs = useQuery(api.companyEvals.getRunsForCase, { evalCaseId });
  const runCheck = useAction(api.companyEvalRuns.runCheck);
  const action = useAdminAction({ scope: "admin-company-eval-detail-run" });

  const latestRun = runs?.[0];
  const results = parseResults(latestRun);
  const evidence = parseEvidenceCounts(latestRun);
  const result = describeResult(latestRun?.status, t);
  const runCost = formatRunCost(latestRun);
  const sampleCount = parseSampleCount(latestRun);

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
        description={t("description")}
        icon={<ClipboardCheck className="h-6 w-6 text-brand" />}
      />

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className={`text-[18px] font-semibold ${result.tone}`}>{result.label}</span>
          {latestRun && (
            <span className="text-[12px] text-secondary">{t("lastRun", { date: formatDateTime(latestRun.completedAt) })}</span>
          )}
          {evalCase.severity === "BLOCKER" && (
            <span className="text-[12px] text-secondary">{t("mustPassBadge")}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
        <Link
          href={`${evalsHref}/${evalCaseId}/edit?returnTo=${encodeURIComponent(backHref)}`}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[8px] border border-border-dim px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-foreground/5"
        >
          <Pencil className="h-4 w-4" />
          {t("edit")}
        </Link>
        <Button
          variant="brand"
          onClick={() => action.run(() => runCheck({ evalCaseId }), { fallbackMessage: t("runFailed") })}
          disabled={action.isBusy()}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[8px] font-semibold disabled:opacity-50"
        >
          {action.isBusy() ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {t("runThis")}
        </Button>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
          <h2 className="text-[11px] uppercase tracking-[0.1em] text-muted">{t("question")}</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-foreground">{evalCase.prompt}</p>
        </div>
        <div className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
          <h2 className="text-[11px] uppercase tracking-[0.1em] text-muted">{t("goodAnswer")}</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-foreground">{evalCase.expectedBehavior}</p>
        </div>
      </section>

      {/* The answer in full. This was a two-line clamp inside an expander, which is
          the one thing an admin needs to read when an eval fails. */}
      <section className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
        <h2 className="text-[11px] uppercase tracking-[0.1em] text-muted">{t("answered")}</h2>
        {runs === undefined ? (
          <Loader2 className="mt-3 h-4 w-4 animate-spin text-brand" />
        ) : !latestRun ? (
          <p className="mt-2 text-[13px] text-muted">
            {t.rich("neverRun", {
              highlight: (chunks) => <span className="text-foreground">{chunks}</span>,
            })}
          </p>
        ) : (
          <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-foreground">{latestRun.answer}</p>
        )}
        {latestRun && (
          <p className="mt-4 text-[12px] text-secondary">
            {t("evidence", { documents: evidence.documents, memories: evidence.memories, skills: evidence.skills })}
            {latestRun.resolvedModelId ? ` ${t("answeredBy", { model: latestRun.resolvedModelId })}` : ""}
            {sampleCount > 1 ? ` ${t("askedTimes", { count: sampleCount })}` : ""}
            {runCost ? ` ${t("cost", { cost: runCost })}` : ""}
          </p>
        )}
      </section>

      {results.length > 0 && (
        <section className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
          <h2 className="text-[11px] uppercase tracking-[0.1em] text-muted">{t("marked")}</h2>
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
          <h2 className="text-[11px] uppercase tracking-[0.1em] text-muted">{t("earlierRuns")}</h2>
          <div className="mt-3 flex flex-col gap-2">
            {runs.slice(1).map((run) => {
              const earlier = describeResult(run.status, t);
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
