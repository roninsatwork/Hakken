"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ClipboardCheck, Eye, Loader2, PlayCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatDateTime } from "@/src/lib/dates";
import {
  getSmokeEvalModeKey,
  getSmokeEvalTone,
} from "@/src/app/(dashboard)/admin/agents/_lib/runStatusRules";
import type { AdminActionRunner } from "@/src/hooks/useAdminAction";
import { Button } from "@/src/ui/components/screens/Button";
import { STATUS_TONE_CLASSES } from "@/src/ui/components/screens/statusTone";
import { useToast } from "@/src/context/ToastContext";

// The suite is page-level rather than per-row, so it needs a key of its own
// to avoid sharing a busy flag with every row action.
const EVAL_SUITE_KEY = "eval-suite";

/**
 * Eval health: fixture coverage, the smoke eval history, and the one button
 * that runs the whole contract suite.
 *
 * The two queries live here rather than on the page because nothing else reads
 * them — the page was paying for both on every visit even when the reader never
 * scrolled this far.
 */
export function EvalHealthPanel({
  agentId,
  action,
  onInspectRun,
}: {
  agentId: Id<"agents">;
  action: AdminActionRunner;
  onInspectRun: (runId: Id<"agentRuns">) => void;
}) {
  const t = useTranslations("admin.agents.details.runs.evalHealth");
  const tLabels = useTranslations("admin.agents.labels");
  const { showToast } = useToast();
  const runEvalSuite = useMutation(api.agentEvalFixtures.runEvalSuite);
  const evalFixtures = useQuery(api.agentEvalFixtures.getRecentForAgent, { agentId });
  const smokeEvalHistory = useQuery(api.agentEvalFixtures.getSmokeEvalHistory, { agentId, limit: 5 });
  const activeEvalFixtureCount = evalFixtures?.length ?? 0;

  const handleRunEvalSuite = async () => {
    const outcome = await action.run(() => runEvalSuite({ agentId }), {
      key: EVAL_SUITE_KEY,
      fallbackMessage: t("suiteFailed"),
    });
    if (!outcome.ok) return;
    const { total, passed, failed, active } = outcome.data;
    showToast(
      t("suiteResult", { total, passed, failed, active }),
      failed > 0 ? "info" : "success",
    );
  };

  return (
    <div className="border border-border-dim rounded-[14px] bg-card px-4 py-4 flex flex-col gap-4">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-foreground tracking-tight flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-brand" />
            {t("title")}
          </h3>
          <p className="text-[12px] text-secondary mt-1">
            {t("description")}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
          <Button
            variant="accent"
            onClick={handleRunEvalSuite}
            disabled={!evalFixtures || activeEvalFixtureCount === 0 || action.isBusy(EVAL_SUITE_KEY)}
            className="disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-9"
          >
            {action.isBusy(EVAL_SUITE_KEY) ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
            {t("runSuite")}
          </Button>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-6 gap-y-2 min-w-0 lg:min-w-[540px]">
            {[
              { label: t("stats.fixtures"), value: evalFixtures ? activeEvalFixtureCount.toLocaleString() : "..." },
              { label: t("stats.smokeEvals"), value: smokeEvalHistory ? smokeEvalHistory.totals.total.toLocaleString() : "..." },
              { label: t("stats.passed"), value: smokeEvalHistory ? smokeEvalHistory.totals.passed.toLocaleString() : "..." },
              { label: t("stats.failed"), value: smokeEvalHistory ? smokeEvalHistory.totals.failed.toLocaleString() : "..." },
              { label: t("stats.modelGraded"), value: smokeEvalHistory ? smokeEvalHistory.totals.modelGraded.toLocaleString() : "..." },
            ].map((stat) => (
              <div key={stat.label} className="min-w-0">
                <div className="text-[10px] uppercase tracking-widest font-mono text-muted truncate">{stat.label}</div>
                <div className="text-[17px] font-semibold text-foreground tracking-tight">{stat.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {!smokeEvalHistory ? (
        <div className="py-8 flex items-center justify-center text-muted">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : smokeEvalHistory.entries.length === 0 ? (
        <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-6 text-[13px] text-secondary">
          {t("empty")}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {smokeEvalHistory.entries.map((entry) => (
            <div key={entry.runId} className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-3 flex flex-col gap-3 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${STATUS_TONE_CLASSES[getSmokeEvalTone(entry.status)]}`}>
                      {entry.status.replace("_", " ")}
                    </span>
                    <span className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-border-dim bg-white/[0.03] text-secondary">
                      {tLabels(getSmokeEvalModeKey(entry.gradingMode))}
                    </span>
                  </div>
                  <p className="text-[13px] text-foreground mt-2 leading-relaxed line-clamp-2">
                    {entry.fixture?.objective || entry.objective}
                  </p>
                </div>
                <span className="text-[11px] font-mono text-muted shrink-0">
                  {formatDateTime(entry.completedAt ?? entry.startedAt)}
                </span>
              </div>

              <div className="flex flex-wrap gap-2 text-[11px] font-mono text-muted">
                {entry.fixture && <span>{entry.fixture.type.toLowerCase().replaceAll("_", " ")}</span>}
                {entry.modelId && <span>{t("model", { model: entry.modelId })}</span>}
                {entry.agentVersionId && <span>{t("version", { version: entry.agentVersionId })}</span>}
              </div>

              {(entry.finalOutput || entry.error) && (
                <p className={`text-[12px] leading-relaxed line-clamp-2 ${entry.status === "FAILED" ? "text-destructive" : "text-secondary"}`}>
                  {entry.error || entry.finalOutput}
                </p>
              )}

              {entry.missingToolMappings.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {entry.missingToolMappings.map((mapping) => (
                    <span key={mapping} className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-destructive/20 bg-destructive/10 text-destructive">
                      {t("missing", { mapping })}
                    </span>
                  ))}
                </div>
              )}

              {entry.expectedBlockedActionSummaries.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {entry.expectedBlockedActionSummaries.map((summary) => (
                    <span key={summary} className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-warning/20 bg-warning/10 text-warning">
                      {t("blocked", { summary })}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  variant="quiet"
                  onClick={() => onInspectRun(entry.runId)}
                  className="text-[11px] flex items-center gap-2"
                >
                  <Eye className="w-3.5 h-3.5" />
                  {t("inspectRun")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
