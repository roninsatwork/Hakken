"use client";

import { AlertCircle, CheckCircle2, CircleDot, Globe2 } from "lucide-react";

type TranslationFn = (key: string) => string;

type DomainStatus = "ready" | "pending" | "manual";

type DomainItem = {
  key: string;
  status: DomainStatus;
  evidence: string;
  command?: string;
};

export type WhiteLabelCustomDomainChecklist = {
  readyCount: number;
  manualCount: number;
  pendingCount: number;
  totalCount: number;
  items: DomainItem[];
};

type WhiteLabelCustomDomainChecklistSectionProps = {
  checklist?: WhiteLabelCustomDomainChecklist;
  t: TranslationFn;
};

function getStatusStyles(status: DomainStatus) {
  if (status === "ready") {
    return {
      icon: CheckCircle2,
      labelClass: "text-[#10B981] bg-[#10B981]/10 border-[#10B981]/20",
    };
  }

  if (status === "manual") {
    return {
      icon: CircleDot,
      labelClass: "text-brand bg-brand/10 border-brand/20",
    };
  }

  return {
    icon: AlertCircle,
    labelClass: "text-amber-500 bg-amber-500/10 border-amber-500/20",
  };
}

export function WhiteLabelCustomDomainChecklistSection({ checklist, t }: WhiteLabelCustomDomainChecklistSectionProps) {
  if (!checklist) {
    return (
      <div className="border border-border-dim rounded-[16px] bg-background/50 p-5 text-[12px] text-muted">
        {t("customDomain.loading")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <SummaryTile label={t("customDomain.summary.ready")} value={checklist.readyCount} />
        <SummaryTile label={t("customDomain.summary.pending")} value={checklist.pendingCount} />
        <SummaryTile label={t("customDomain.summary.manual")} value={checklist.manualCount} />
        <SummaryTile label={t("customDomain.summary.total")} value={checklist.totalCount} />
      </div>

      <div className="border border-border-dim rounded-[16px] overflow-hidden">
        {checklist.items.map((item, index) => {
          const styles = getStatusStyles(item.status);
          const Icon = styles.icon;

          return (
            <div key={item.key} className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 bg-background/50 ${index === 0 ? "" : "border-t border-border-dim"}`}>
              <div className="flex items-start gap-3 min-w-0">
                <Icon className="w-4 h-4 mt-0.5 flex-shrink-0 text-current" />
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="text-[14px] text-foreground font-semibold">{t(`customDomain.items.${item.key}.label`)}</span>
                  <span className="text-[12px] text-muted leading-relaxed">{t(`customDomain.items.${item.key}.${item.status}`)}</span>
                  <span className="text-[10px] font-mono text-muted/80 break-all">{item.evidence}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 lg:justify-end">
                {item.command && (
                  <code className="rounded-[8px] border border-border-dim bg-card/70 px-2.5 py-1 text-[11px] text-secondary break-all">
                    {item.command}
                  </code>
                )}
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${styles.labelClass}`}>
                  {t(`customDomain.status.${item.status}`)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border border-border-dim rounded-[16px] bg-background/50 p-5 flex items-start gap-3">
        <Globe2 className="w-4 h-4 mt-0.5 text-brand flex-shrink-0" />
        <p className="text-[12px] text-muted leading-relaxed">{t("customDomain.note")}</p>
      </div>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-border-dim rounded-[12px] bg-background/50 px-4 py-3">
      <span className="block text-[10px] uppercase tracking-[0.18em] text-muted font-mono">{label}</span>
      <span className="mt-1 block text-[24px] leading-none font-bold text-foreground">{value}</span>
    </div>
  );
}
