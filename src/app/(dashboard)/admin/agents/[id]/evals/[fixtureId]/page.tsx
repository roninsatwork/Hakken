"use client";

import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ClipboardCheck, FlaskConical, Loader2, Play, XCircle } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatDateTime } from "@/src/lib/dates";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { Button } from "@/src/ui/atoms/Button";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";

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
  // Dollars: the stored figure is the provider's own price and nothing converts
  // it. Sub-cent runs are the norm here, so cents read better than a string of
  // zeros after a currency sign.
  const cents = costGBP * 100;
  return cents < 1 ? `${cents.toFixed(2)}¢` : `$${costGBP.toFixed(2)}`;
}

function describeStatus(entry: CheckRun | undefined, t: (key: string) => string) {
  if (!entry) return { label: t("status.notRunYet"), tone: "text-muted" };
  if (entry.gradingMode !== "MODEL_GRADED") return { label: t("status.setupOnly"), tone: "text-amber-400" };
  if (entry.status === "SUCCESS") return { label: t("status.passing"), tone: "text-emerald-400" };
  if (entry.status === "FAILED") return { label: t("status.failing"), tone: "text-red-400" };
  return { label: t("status.running"), tone: "text-secondary" };
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
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    );
  }

  const latest = detail.history[0];
  const status = describeStatus(latest, t);
  const mustPass = detail.check.tags.includes(MUST_PASS_TAG);

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <DetailHeader
        back={{ label: t("detail.back"), href: backHref }}
        icon={<ClipboardCheck className="mt-1 h-6 w-6 shrink-0 text-brand" />}
        title={detail.check.objective}
        pills={
          <>
            <span className={`text-[18px] font-semibold ${status.tone}`}>{status.label}</span>
            {latest && <span className="text-[12px] text-secondary">{t("detail.lastRun", { date: formatDateTime(latest.completedAt) })}</span>}
            {mustPass && <span className="text-[12px] text-secondary">{t("detail.mustPassBadge")}</span>}
          </>
        }
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

      <section className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
        <h2 className="text-[11px] uppercase tracking-[0.1em] text-muted">{t("detail.goodResult")}</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-foreground">{detail.check.expectedFinalOutputRubric}</p>
      </section>

      {/* What the agent produced, in full. */}
      <section className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
        <h2 className="text-[11px] uppercase tracking-[0.1em] text-muted">{t("detail.whatAgentDid")}</h2>
        {!latest ? (
          <p className="mt-2 text-[13px] text-muted">
            {t.rich("detail.neverRun", {
              highlight: (chunks) => <span className="text-foreground">{chunks}</span>,
            })}
          </p>
        ) : (
          <>
            <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-foreground">
              {latest.error || latest.finalOutput || t("detail.noOutput")}
            </p>
            {latest.gradingMode !== "MODEL_GRADED" && (
              <p className="mt-4 text-[12px] text-amber-300">
                {t("detail.setupNote")}
              </p>
            )}
            <p className="mt-4 text-[12px] text-secondary">
              {latest.modelId ? t("detail.answeredBy", { model: latest.modelId }) : t("detail.modelNotRecorded")}
              {typeof latest.inputTokens === "number" ? ` ${t("detail.tokensInOut", { input: latest.inputTokens, output: latest.outputTokens ?? 0 })}` : ""}
              {detail.check.sampleCount > 1 ? ` ${t("detail.askedUpTo", { count: detail.check.sampleCount })}` : ""}
              {formatRunCost(latest.costGBP) ? ` ${t("detail.cost", { cost: formatRunCost(latest.costGBP) ?? "" })}` : ""}
            </p>
          </>
        )}
      </section>

      {latest && (latest.failures.length > 0 || latest.missingToolMappings.length > 0) && (
        <section className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
          <h2 className="text-[11px] uppercase tracking-[0.1em] text-muted">{t("detail.whatWentWrong")}</h2>
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
                  {t.rich("detail.missingTool", {
                    tool: () => <span className="font-semibold">{tool}</span>,
                  })}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* History, so a regression reads as a change rather than as one red row. */}
      {detail.history.length > 1 && (
        <section className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
          <h2 className="text-[11px] uppercase tracking-[0.1em] text-muted">{t("detail.earlierRuns")}</h2>
          <div className="mt-3 flex flex-col gap-2">
            {detail.history.slice(1).map((run) => {
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
      )}
    </div>
  );
}
