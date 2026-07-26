"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ClipboardCheck, Loader2, Play, XCircle } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatDateTime } from "@/src/lib/dates";
import { useAdminAction } from "@/src/hooks/useAdminAction";

const MUST_PASS_TAG = "critical";

type CheckRun = {
  status: string;
  gradingMode: string;
};

/**
 * What the run cost. Zero and "not priced" are different facts, so an unpriced run
 * says nothing rather than claiming it was free.
 */
function formatRunCost(costGBP: number | undefined) {
  if (typeof costGBP !== "number" || !Number.isFinite(costGBP) || costGBP <= 0) return null;
  const pence = costGBP * 100;
  return pence < 1 ? `${pence.toFixed(2)}p` : `£${costGBP.toFixed(2)}`;
}

function describeStatus(entry: CheckRun | undefined) {
  if (!entry) return { label: "Not run yet", tone: "text-muted" };
  if (entry.gradingMode !== "MODEL_GRADED") return { label: "Setup only", tone: "text-amber-400" };
  if (entry.status === "SUCCESS") return { label: "Passing", tone: "text-emerald-400" };
  if (entry.status === "FAILED") return { label: "Failing", tone: "text-red-400" };
  return { label: "Running…", tone: "text-secondary" };
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
  const params = useParams();
  const agentId = params.id as Id<"agents">;
  const fixtureId = params.fixtureId as Id<"agentEvalFixtures">;
  const backHref = `/admin/agents/${agentId}/evals`;

  const detail = useQuery(api.agentEvalFixtures.getCheckDetail, { fixtureId });
  const runSmokeEval = useMutation(api.agentEvalFixtures.runSmokeEval);
  const action = useAdminAction({ scope: "admin-agent-check-detail-run" });

  if (detail === undefined) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    );
  }

  const latest = detail.history[0];
  const status = describeStatus(latest);
  const mustPass = detail.check.tags.includes(MUST_PASS_TAG);

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <header className="flex flex-col gap-3">
        <Link
          href={backHref}
          className="inline-flex w-fit items-center gap-2 text-[12px] font-semibold text-secondary transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to checks
        </Link>
        <h1 className="flex items-start gap-3 text-2xl font-bold tracking-tight text-foreground">
          <ClipboardCheck className="mt-1 h-6 w-6 shrink-0 text-brand" />
          {detail.check.objective}
        </h1>
      </header>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className={`text-[18px] font-semibold ${status.tone}`}>{status.label}</span>
          {latest && <span className="text-[12px] text-secondary">Last run {formatDateTime(latest.completedAt)}</span>}
          {mustPass && <span className="text-[12px] text-secondary">Must pass before going live</span>}
        </div>
        <button
          type="button"
          onClick={() => action.run(
            () => runSmokeEval({ agentId, fixtureId, gradingMode: "MODEL_GRADED" }),
            { fallbackMessage: "The check could not be run." },
          )}
          disabled={action.isBusy()}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[8px] bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand/90 disabled:opacity-50"
        >
          {action.isBusy() ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Run this check
        </button>
      </div>

      <section className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
        <h2 className="text-[11px] uppercase tracking-[0.1em] text-muted">What a good result must do</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-foreground">{detail.check.expectedFinalOutputRubric}</p>
      </section>

      {/* What the agent produced, in full. */}
      <section className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
        <h2 className="text-[11px] uppercase tracking-[0.1em] text-muted">What the agent did</h2>
        {!latest ? (
          <p className="mt-2 text-[13px] text-muted">
            This check has never been run. Press <span className="text-foreground">Run this check</span> to give the agent the task.
          </p>
        ) : (
          <>
            <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-foreground">
              {latest.error || latest.finalOutput || "The agent produced no readable output."}
            </p>
            {latest.gradingMode !== "MODEL_GRADED" && (
              <p className="mt-4 text-[12px] text-amber-300">
                This was a setup check. It confirms the agent is wired up correctly and asks it nothing,
                so it is not evidence the agent works.
              </p>
            )}
            <p className="mt-4 text-[12px] text-secondary">
              {latest.modelId ? `Answered by ${latest.modelId}` : "Model not recorded"}
              {typeof latest.inputTokens === "number" ? ` · ${latest.inputTokens} in / ${latest.outputTokens ?? 0} out` : ""}
              {detail.check.sampleCount > 1 ? ` · asked up to ${detail.check.sampleCount} times` : ""}
              {formatRunCost(latest.costGBP) ? ` · cost ${formatRunCost(latest.costGBP)}` : ""}
            </p>
          </>
        )}
      </section>

      {latest && (latest.failures.length > 0 || latest.missingToolMappings.length > 0) && (
        <section className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
          <h2 className="text-[11px] uppercase tracking-[0.1em] text-muted">What went wrong</h2>
          <div className="mt-3 flex flex-col gap-2">
            {latest.failures.map((failure) => (
              <div key={failure} className="flex items-start gap-3">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <p className="text-[13px] leading-relaxed text-foreground">{failure}</p>
              </div>
            ))}
            {latest.missingToolMappings.map((tool) => (
              <div key={tool} className="flex items-start gap-3">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <p className="text-[13px] leading-relaxed text-foreground">
                  This agent does not have the tool <span className="font-semibold">{tool}</span> available.
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* History, so a regression reads as a change rather than as one red row. */}
      {detail.history.length > 1 && (
        <section className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
          <h2 className="text-[11px] uppercase tracking-[0.1em] text-muted">Earlier runs</h2>
          <div className="mt-3 flex flex-col gap-2">
            {detail.history.slice(1).map((run) => {
              const earlier = describeStatus(run);
              return (
                <div key={run.runId} className="flex items-center justify-between gap-4 border-b border-border-dim/40 pb-2 last:border-0 last:pb-0">
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
