"use client";

import { lazy, Suspense } from "react";
import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { FlaskConical, Loader2, Play } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatDateTime } from "@/src/lib/dates";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { Button } from "@/src/ui/components/screens/Button";
import type { AgentCheckDetail } from "./AgentCheckDetailContent";

const AgentCheckDetailContent = lazy(() => import("./AgentCheckDetailContent"));

type CheckRun = {
  status: string;
  gradingMode: string;
};

function describeStatus(entry: CheckRun | undefined, t: (key: string) => string) {
  if (!entry) return { label: t("status.notRunYet"), tone: "text-muted" };
  if (entry.gradingMode !== "MODEL_GRADED") return { label: t("status.setupOnly"), tone: "text-amber-400" };
  if (entry.status === "SUCCESS") return { label: t("status.passing"), tone: "text-emerald-400" };
  if (entry.status === "FAILED") return { label: t("status.failing"), tone: "text-red-400" };
  return { label: t("status.running"), tone: "text-secondary" };
}

function DetailLoadingState() {
  return (
    <div className="flex min-h-[420px] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-brand" />
    </div>
  );
}

function EarlierRuns({ history }: { history: AgentCheckDetail["history"] }) {
  const t = useTranslations("admin.agents.details.evals");

  return (
    <section className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
      <h2 className="text-[11px] uppercase tracking-[0.1em] text-muted">{t("detail.earlierRuns")}</h2>
      <div className="mt-3 flex flex-col gap-2">
        {history.map((run) => {
          const earlier = describeStatus(run, t);
          return (
            <div key={run.runId} className="flex items-center justify-between gap-4 border-b border-border-dim/40 pb-2 last:border-0 last:pb-0">
              <span className={`text-[13px] font-semibold ${earlier.tone}`}>{earlier.label}</span>
              <span className="text-[12px] text-secondary">{formatDateTime(run.completedAt)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * The check detail page for an agent.
 *
 * The company screen got one first; this is the same idea for the other surface. What
 * an agent actually produced, and why it was marked down, was previously reachable
 * only from an undifferentiated stream of every run the agent had ever had, clamped
 * to two lines. It is the most useful thing this feature holds.
 */
export default function AgentCheckDetailPage() {
  const t = useTranslations("admin.agents.details.evals");
  const params = useParams();
  const agentId = params.id as Id<"agents">;
  const fixtureId = params.fixtureId as Id<"agentEvalFixtures">;
  const backHref = `/admin/agents/${agentId}/evals`;

  const detail = useQuery(api.agentEvalFixtures.getCheckDetail, { fixtureId });
  const runSmokeEval = useMutation(api.agentEvalFixtures.runSmokeEval);
  const runRehearsalEval = useMutation(api.agentEvalFixtures.runRehearsalEval);
  const action = useAdminAction({ scope: "admin-agent-check-detail-run" });
  const rehearseAction = useAdminAction({ scope: "admin-agent-check-detail-rehearse" });

  if (detail === undefined) {
    return <DetailLoadingState />;
  }

  const latest = detail.history[0];
  const status = describeStatus(latest, t);

  return (
    <Suspense fallback={<DetailLoadingState />}>
      <AgentCheckDetailContent
        detail={detail}
        backHref={backHref}
        status={status}
        earlierRuns={detail.history.length > 1 ? <EarlierRuns history={detail.history.slice(1)} /> : null}
        action={
          <div className="flex shrink-0 items-center gap-2">
            {/* A rehearsal runs the agent for real but records its writes instead
                of performing them, then grades what it did. The safe way to ask
                "would it behave?" against live data. */}
            {/* Raw: sidebar-toned chip — its bg-sidebar fills match no variant's colours. */}
            <button
              type="button"
              onClick={() => rehearseAction.run(
                () => runRehearsalEval({ agentId, fixtureId }),
                { fallbackMessage: t("detail.rehearseFailed") },
              )}
              disabled={rehearseAction.isBusy() || action.isBusy()}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-[8px] border border-border-dim bg-sidebar/50 px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-sidebar disabled:opacity-50"
            >
              {rehearseAction.isBusy() ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
              {t("detail.rehearse")}
            </button>
            <Button
              variant="brand"
              onClick={() => action.run(
                () => runSmokeEval({ agentId, fixtureId, gradingMode: "MODEL_GRADED" }),
                { fallbackMessage: t("detail.runCheckFailed") },
              )}
              disabled={action.isBusy() || rehearseAction.isBusy()}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-[8px] font-semibold disabled:opacity-50"
            >
              {action.isBusy() ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {t("detail.runThisCheck")}
            </Button>
          </div>
        }
      />
    </Suspense>
  );
}
