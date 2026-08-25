"use client";

import type { Id } from "@/convex/_generated/dataModel";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { cn } from "@/src/ui/lib/utils";
import { AlertTriangle, ArrowRight, CircleCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

type AreaState = "NEEDS_ATTENTION" | "SET_HERE" | "NOT_CONFIGURED";

export type Area = {
  key: string;
  label: string;
  state: AreaState;
  summary: string;
  action?: string;
  href: string;
};

export type CompanyAiReadiness = {
  state: string;
  needsAttentionCount: number;
  areas: Area[];
};

const STATE_ORDER: Record<AreaState, number> = {
  NEEDS_ATTENTION: 0,
  SET_HERE: 1,
  NOT_CONFIGURED: 2,
};

function getStateLabelKey(state: AreaState) {
  if (state === "NEEDS_ATTENTION") return "stateNeedsAttention";
  if (state === "SET_HERE") return "stateSetHere";
  return "stateNotConfigured";
}

function getStateClassName(state: AreaState) {
  if (state === "NEEDS_ATTENTION") return "text-[#f59e0b]";
  if (state === "SET_HERE") return "text-foreground";
  return "text-muted";
}

export default function CompanyAiOverviewContent({
  companyId,
  readiness,
}: {
  companyId: Id<"companies">;
  readiness: CompanyAiReadiness;
}) {
  const t = useTranslations("admin.companyDetails.aiOverview");
  const sortedAreas = [...readiness.areas].sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state]);
  const needsAttention = sortedAreas.filter((area) => area.state === "NEEDS_ATTENTION");
  const isReady = readiness.state === "READY";
  const linkTo = (href: string) => `/admin/companies/${companyId}${href}`;

  return (
    <>
      <PageHeader
        icon={<Sparkles className="h-6 w-6 text-brand" />}
        title={t("headerTitle")}
        description={t("headerDescription")}
      />
      <div
        className={cn(
          "flex items-center gap-3 rounded-[10px] border px-4 py-3",
          isReady
            ? "border-[#10b981]/20 bg-[#10b981]/10"
            : "border-[#f59e0b]/20 bg-[#f59e0b]/10"
        )}
      >
        {isReady ? (
          <CircleCheck className="h-[18px] w-[18px] shrink-0 text-[#10b981]" />
        ) : (
          <AlertTriangle className="h-[18px] w-[18px] shrink-0 text-[#f59e0b]" />
        )}
        <span className={cn("text-[15px] font-semibold", isReady ? "text-[#10b981]" : "text-[#f59e0b]")}>
          {isReady ? t("ready") : t("needsAttention")}
        </span>
        <span className={cn("text-[14px]", isReady ? "text-[#10b981]" : "text-[#f59e0b]")}>
          {isReady
            ? t("nothingNeedsAttention")
            : t("areasCount", { count: readiness.needsAttentionCount, total: readiness.areas.length })}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed text-secondary">{t("intro")}</p>

      {needsAttention.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-[13px] font-semibold text-foreground">{t("fixFirst")}</h2>
          {needsAttention.map((area) => (
            <Link
              key={area.key}
              href={linkTo(area.href)}
              className="flex items-start gap-3 rounded-[10px] border border-border-dim bg-card px-4 py-3 transition-colors hover:border-brand/40"
            >
              <AlertTriangle className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#f59e0b]" />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold text-foreground">{area.label}</div>
                <div className="mt-0.5 text-[13px] leading-relaxed text-secondary">{area.summary}</div>
              </div>
              <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[13px] text-brand">
                {area.action}
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
          ))}
        </div>
      )}

      <DataTable
        rows={sortedAreas}
        rowKey={(area) => area.key}
        minWidthClassName="min-w-[720px]"
        empty={{ icon: <Sparkles className="h-8 w-8 text-muted/30" />, label: t("empty") }}
        footer={{
          mode: "paged",
          page: 1,
          totalPages: 1,
          totalCount: sortedAreas.length,
          pageSize: Math.max(sortedAreas.length, 1),
          isLoading: false,
          onPageChange: () => {},
          labels: {
            empty: t("empty"),
            showing: (_start, _end, total) => t("showing", { count: total }),
          },
        }}
        columns={[
          {
            key: "area",
            header: t("columnArea"),
            className: "w-[24%]",
            cell: (area) => (
              <Link href={linkTo(area.href)} className="text-[13px] text-foreground transition-colors hover:text-brand">
                {area.label}
              </Link>
            ),
          },
          {
            key: "summary",
            header: t("columnSummary"),
            className: "w-[47%]",
            cell: (area) => <span className="text-[13px] leading-relaxed text-secondary">{area.summary}</span>,
          },
          {
            key: "state",
            header: t("columnState"),
            className: "w-[29%]",
            cell: (area) => (
              <span className={cn("text-[13px]", getStateClassName(area.state))}>
                {t(getStateLabelKey(area.state))}
              </span>
            ),
          },
        ]}
      />
    </>
  );
}
