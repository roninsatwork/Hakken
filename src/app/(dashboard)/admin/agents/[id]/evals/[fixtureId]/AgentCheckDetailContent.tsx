"use client";

import type { ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import { useTranslations } from "next-intl";
import { ClipboardCheck, XCircle } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { formatDateTime } from "@/src/lib/dates";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";

const MUST_PASS_TAG = "critical";

export type AgentCheckDetail = NonNullable<
  FunctionReturnType<typeof api.agentEvalFixtures.getCheckDetail>
>;

type Status = {
  label: string;
  tone: string;
};

type AgentCheckDetailContentProps = {
  detail: AgentCheckDetail;
  backHref: string;
  status: Status;
  action: ReactNode;
  earlierRuns: ReactNode;
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

export default function AgentCheckDetailContent({
  detail,
  backHref,
  status,
  action,
  earlierRuns,
}: AgentCheckDetailContentProps) {
  const t = useTranslations("admin.agents.details.evals");
  const latest = detail.history[0];
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
        action={action}
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
                    tool: tool,
                    highlight: (chunks) => <span className="font-semibold">{chunks}</span>,
                  })}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* History, so a regression reads as a change rather than as one red row. */}
      {earlierRuns}
    </div>
  );
}
