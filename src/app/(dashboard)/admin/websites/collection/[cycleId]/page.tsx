"use client";

import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Layers } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { formatDateTime } from "@/src/lib/dates";
import type { StatusTone } from "@/src/ui/components/screens/statusTone";

/**
 * One collection run, line by line.
 *
 * The question this answers is "what did Monday's run actually do", and the
 * column that answers it is **paid**. A line marked as already held was served
 * by a pull somebody else bought — one host is stored once and fetched once —
 * and it shows no cost here because charging it twice on two screens is how a
 * saving turns into a phantom bill.
 *
 * Hosts from several companies appear together, which is the one place that is
 * allowed to happen and the reason this screen is super admin only.
 */
/**
 * How a run's status is coloured. The two capped statuses are both warnings
 * and are deliberately separate words: one is the customer's own plan limit,
 * which they can act on, and the other is our spend cap, which only an
 * operator can.
 */
const CYCLE_TONES: Record<string, StatusTone> = {
  DONE: "success",
  EXPANDING: "info",
  SENDING: "info",
  COLLECTING: "info",
  CAPPED_PLAN: "warning",
  CAPPED_SPEND: "warning",
  FAILED: "danger",
};

export default function SeoCycleDetailPage() {
  const t = useTranslations("admin.seoCollection");
  const params = useParams();
  const cycleId = params.cycleId as Id<"seoCollectionCycles">;

  const cycle = useQuery(api.seoCollectionReports.getSeoCycle, { cycleId });

  if (cycle === undefined) {
    return <p className="py-12 text-center text-[13px] text-muted">{t("loading")}</p>;
  }

  if (cycle === null) {
    return (
      <div className="flex w-full flex-col gap-4 py-12">
        <p className="text-center text-[13px] text-muted">{t("notFound")}</p>
        <Link
          href="/admin/websites/collection"
          className="self-center text-[13px] text-brand hover:underline"
        >
          {t("back")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <DetailHeader
        back={{ label: t("back"), href: "/admin/websites/collection" }}
        icon={<Layers className="h-6 w-6 text-brand" />}
        title={cycle.companyName}
        description={t("runStarted", {
          when: formatDateTime(cycle.startedAt),
          trigger: t(`trigger.${cycle.trigger}`),
        })}
        pills={
          <>
            <StatusPill tone={CYCLE_TONES[cycle.status] ?? "neutral"}>
              {t(`status.${cycle.status}`)}
            </StatusPill>
            <StatusPill tone="neutral">
              {t("readyOfPlanned", { ready: cycle.ready, planned: cycle.planned })}
            </StatusPill>
            {cycle.reused > 0 ? (
              <StatusPill tone="success">{t("reused", { count: cycle.reused })}</StatusPill>
            ) : null}
            {cycle.failed > 0 ? (
              <StatusPill tone="warning">{t("failed", { count: cycle.failed })}</StatusPill>
            ) : null}
            <StatusPill tone="neutral">
              {t("runCost", { cost: cycle.costUsd.toFixed(4) })}
            </StatusPill>
          </>
        }
      />

      {cycle.cappedReason ? (
        <p className="max-w-3xl rounded-[12px] border border-border-dim bg-card/40 px-4 py-3 text-[12px] leading-relaxed text-muted">
          {cycle.cappedReason}
        </p>
      ) : null}

      <DataTable
        cardHeader={
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-semibold text-foreground">{t("linesTitle")}</h2>
            {cycle.lineCountIsCapped ? (
              <span className="text-[12px] text-muted">{t("linesCapped")}</span>
            ) : null}
          </div>
        }
        rows={cycle.lines}
        rowKey={(row) => row._id}
        minWidthClassName="min-w-[780px]"
        empty={{ icon: <Layers className="h-8 w-8 text-muted/30" />, label: t("noLines") }}
        columns={[
          {
            key: "host",
            header: t("hostColumn"),
            cell: (row) => (
              <span className="text-[13px] font-medium text-foreground">{row.host}</span>
            ),
          },
          {
            key: "operation",
            header: t("operationColumn"),
            cell: (row) => (
              <span className="text-[12px] text-secondary">{t(`operation.${row.operationId}`)}</span>
            ),
          },
          {
            key: "state",
            header: t("stateColumn"),
            cell: (row) => (
              <div className="flex flex-col gap-1">
                <StatusPill tone={row.status === "READY" ? "success" : row.status === "FAILED" ? "danger" : "info"}>
                  {t(`pull.${row.status}`)}
                </StatusPill>
                {row.error ? (
                  <span className="max-w-sm text-[11px] leading-relaxed text-warning">{row.error}</span>
                ) : null}
              </div>
            ),
          },
          {
            key: "paid",
            header: t("paidColumn"),
            cell: (row) => (
              row.reused ? (
                <span className="text-[12px] text-success">{t("alreadyHeld")}</span>
              ) : (
                <span className="font-mono text-[12px] text-secondary">${row.costUsd.toFixed(4)}</span>
              )
            ),
          },
        ]}
      />
    </div>
  );
}
