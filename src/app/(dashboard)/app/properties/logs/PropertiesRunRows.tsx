"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import type { Doc } from "@/convex/_generated/dataModel";
import { formatDateTime, formatTime } from "@/src/lib/dates";

type PropertiesRunRowsProps = {
  latestRuns: Array<
    Pick<Doc<"apifyRuns">, "_id" | "runId" | "status" | "startedAt"> &
      Partial<Pick<Doc<"apifyRuns">, "completedAt" | "propertiesScraped">>
  >;
  renderSyncControl: (runId: string) => ReactNode;
};

export default function PropertiesRunRows({ latestRuns, renderSyncControl }: PropertiesRunRowsProps) {
  const t = useTranslations("properties.logs");

  return latestRuns.map((run) => (
    <div key={run._id} className="flex flex-col sm:flex-row sm:items-center justify-between p-6 rounded-[24px] border border-border-dim bg-background/50 hover:bg-background/80 transition-colors gap-6 shadow-sm">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <span className="text-[15px] font-medium text-foreground tracking-wide font-mono opacity-90">{run.runId}</span>
          {run.status === "PENDING" && (
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand/10 text-brand text-[11px] font-bold uppercase tracking-widest border border-brand/20"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("inProgress")}</span>
              {renderSyncControl(run.runId)}
            </div>
          )}
          {run.status === "COMPLETED" && <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#10b981]/10 text-[#10b981] text-[11px] font-bold uppercase tracking-widest border border-[#10b981]/20"><CheckCircle2 className="w-3.5 h-3.5" /> {t("completed")}</span>}
          {run.status === "FAILED" && <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/10 text-red-500 text-[11px] font-bold uppercase tracking-widest border border-red-500/20"><XCircle className="w-3.5 h-3.5" /> {t("failed")}</span>}
        </div>
        <span className="text-[13px] text-secondary font-medium">
          {t("dispatched", { time: formatDateTime(run.startedAt) })}
        </span>
      </div>
      <div className="flex flex-col sm:items-end gap-2">
        <span className="text-[14px] text-foreground font-medium">
          {t.rich("scraped", {
            count: run.propertiesScraped !== undefined ? String(run.propertiesScraped) : "—",
            strong: (chunks) => (
              <strong className="font-semibold text-brand text-[16px]">{chunks}</strong>
            ),
          })}
        </span>
        {run.completedAt && (
          <span className="text-[12px] text-muted">
            {t("finished", { time: formatTime(run.completedAt) })}
          </span>
        )}
      </div>
    </div>
  ));
}
