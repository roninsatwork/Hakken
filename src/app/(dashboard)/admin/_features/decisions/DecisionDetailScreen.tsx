"use client";

import { useQuery } from "convex/react";
import { Scale } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatCurrencyGBP } from "@/src/lib/currency";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { DecisionPill } from "@/src/ui/components/screens/DecisionPill";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";

type RunRow = {
  id: Id<"decisionRuns">;
  createdAt: number;
  subjectKind: string;
  subjectId: string;
  answer: string;
  probabilities?: string;
  certainty?: "SURE" | "FAIRLY_SURE" | "NOT_SURE";
  outcome: "ACTED" | "HANDED_TO_PERSON" | "RECORDED";
  source: "TYPESAFE" | "TEXT_MODEL" | "RULES";
  fallbackReason?: "MODE_OFF" | "NO_MODEL" | "PROVIDER_FAILED";
  action?: string;
  costGBP: number;
};

function parseSpread(value?: string): Record<string, number> | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    return parsed as Record<string, number>;
  } catch {
    return undefined;
  }
}

function formatWhen(value: number, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

/**
 * One Decision: the question in the words the model sees, the answers it can
 * give, and its last runs with the pill on each. A record page, so a
 * `DetailHeader` with the quiet back row. Nothing here edits the question:
 * questions are code (plan, "Out of scope").
 */
export function DecisionDetailScreen({
  decisionKey,
  companyId,
}: {
  decisionKey: string;
  companyId?: Id<"companies">;
}) {
  const t = useTranslations("admin.decisions");
  const tDecisions = useTranslations("decisions");
  const locale = useLocale();
  const platformData = useQuery(api.decisions.detailForPlatform, companyId ? "skip" : { decisionKey });
  const companyData = useQuery(api.decisions.detailForCompany, companyId ? { companyId, decisionKey } : "skip");
  const data = companyId ? companyData : platformData;

  const backHref = companyId ? `/admin/companies/${companyId}/ai/decisions` : "/admin/ai/decisions";
  const copyKey = data?.decision.copyKey;
  const name = copyKey ? tDecisions(`catalogue.${copyKey}.name`) : "";
  const answerLabel = (answer: string) =>
    copyKey && tDecisions.has(`catalogue.${copyKey}.answers.${answer}`)
      ? tDecisions(`catalogue.${copyKey}.answers.${answer}`)
      : answer;
  const answerLabels = Object.fromEntries((data?.decision.answers ?? []).map((answer) => [answer, answerLabel(answer)]));
  const subjectKind = (kind: string) => (t.has(`subjectKinds.${kind}`) ? t(`subjectKinds.${kind}`) : kind);

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <DetailHeader
        back={{ label: t("detail.back"), href: backHref }}
        icon={<Scale className="w-6 h-6 text-brand" />}
        title={name || decisionKey}
        description={copyKey ? tDecisions(`catalogue.${copyKey}.description`) : ""}
        pills={
          data ? (
            <StatusPill tone="neutral">{t("detail.modeLine", { mode: tDecisions(`modes.${data.decision.effectiveMode}`) })}</StatusPill>
          ) : undefined
        }
      />

      {data && (
        <p className="text-[12.5px] leading-relaxed text-secondary">
          {t("detail.weekLine", {
            ran: data.isCapped ? t("ranAtLeast", { count: data.ranThisWeek }) : data.ranThisWeek,
            handed: data.handedThisWeek,
            cost: formatCurrencyGBP(data.costThisWeekGBP),
          })}{" "}
          {t(`stakes.${data.decision.stakes}`)}
        </p>
      )}

      {data && !data.provider.usable && (
        <p className="text-[12.5px] leading-relaxed text-warning">{t("usingSimpleRules")}</p>
      )}

      <div className="grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="rounded-[12px] border border-border-dim bg-card p-4">
          <h3 className="text-[14px] font-semibold text-foreground tracking-tight">{t("detail.questionTitle")}</h3>
          <pre className="mt-3 max-h-[360px] overflow-auto whitespace-pre-wrap break-words rounded-[8px] bg-background p-3 font-mono text-[11.5px] leading-relaxed text-secondary">
            {data?.decision.question ?? ""}
          </pre>
        </section>
        <section className="rounded-[12px] border border-border-dim bg-card p-4">
          <h3 className="text-[14px] font-semibold text-foreground tracking-tight">{t("detail.answersTitle")}</h3>
          <ul className="mt-3 flex flex-col gap-2">
            {(data?.decision.answers ?? []).map((answer) => (
              <li key={answer} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="text-foreground">{answerLabel(answer)}</span>
                <span className="font-mono text-[11px] text-muted">{answer}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-[14px] font-semibold text-foreground tracking-tight">{t("detail.runsTitle")}</h3>
          <p className="mt-0.5 text-[12px] text-secondary">{t("detail.runsHint", { count: 50 })}</p>
        </div>
        <DataTable
          rows={data?.runs as RunRow[] | undefined}
          rowKey={(row) => row.id}
          minWidthClassName="min-w-[820px]"
          empty={{ icon: <Scale className="w-8 h-8 text-muted/30" />, label: t("detail.emptyRuns") }}
          footer={{
            mode: "paged",
            page: 1,
            totalPages: 1,
            totalCount: data?.runs.length ?? 0,
            pageSize: 50,
            isLoading: data === undefined,
            onPageChange: () => {},
            labels: {
              empty: t("detail.emptyRuns"),
              showing: (_start, _end, total) => t("detail.showingRuns", { count: total }),
            },
          }}
          columns={[
            {
              key: "when",
              header: t("detail.columnWhen"),
              className: "w-[14%] whitespace-nowrap",
              cell: (row) => <span className="text-[12.5px] text-secondary">{formatWhen(row.createdAt, locale)}</span>,
            },
            {
              key: "subject",
              header: t("detail.columnSubject"),
              className: "w-[18%]",
              cell: (row) => (
                <>
                  <div className="text-[13px] text-foreground">{subjectKind(row.subjectKind)}</div>
                  <div className="truncate font-mono text-[11px] text-muted">{row.subjectId}</div>
                </>
              ),
            },
            {
              key: "answer",
              header: t("detail.columnAnswer"),
              className: "w-[16%]",
              cell: (row) => <span className="text-[13px] text-foreground">{answerLabel(row.answer)}</span>,
            },
            {
              key: "certainty",
              header: t("detail.columnCertainty"),
              className: "w-[22%]",
              cell: (row) => (
                <DecisionPill
                  name={name}
                  certainty={row.certainty ?? null}
                  probabilities={parseSpread(row.probabilities)}
                  chosen={row.answer}
                  answerLabels={answerLabels}
                />
              ),
            },
            {
              key: "outcome",
              header: t("detail.columnOutcome"),
              className: "w-[16%]",
              cell: (row) => (
                <>
                  <div className="text-[13px] text-foreground">{t(`detail.outcome.${row.outcome}`)}</div>
                  {row.action && <div className="mt-0.5 text-[11px] text-muted">{row.action}</div>}
                </>
              ),
            },
            {
              key: "source",
              header: t("detail.columnSource"),
              className: "w-[14%]",
              cell: (row) => (
                <>
                  <div className="text-[13px] text-foreground">{t(`detail.source.${row.source}`)}</div>
                  {row.fallbackReason && (
                    <div className="mt-0.5 text-[11px] text-muted">{t(`detail.fallback.${row.fallbackReason}`)}</div>
                  )}
                </>
              ),
            },
          ]}
        />
      </section>
    </div>
  );
}
