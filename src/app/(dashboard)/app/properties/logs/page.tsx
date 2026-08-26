"use client";

import { useQuery, useAction } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { Activity, RefreshCcw } from "lucide-react";
import Header from "@/src/ui/components/layout/Header";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { lazy, Suspense, useCallback, useMemo, useEffect } from "react";

const PropertiesRunRows = lazy(() => import("./PropertiesRunRows"));

function PropertiesRunsEmptyState() {
  const t = useTranslations("properties.logs");
  return (
    <div className="p-8 rounded-[20px] border border-border-dim bg-background/30 text-center">
      <span className="text-[14px] text-muted font-medium">{t("empty")}</span>
    </div>
  );
}

export default function PropertiesLogsPage() {
  const t = useTranslations("properties.logs");
  const latestRunsQuery = useQuery(api.properties.getLatestRuns);
  const latestRuns = useMemo(() => latestRunsQuery ?? [], [latestRunsQuery]);
  const syncRun = useAction(api.apify.syncRunStatus);
  const { run: runAction, isBusy } = useAdminAction({ scope: "app-properties-logs" });
  const syncFailedMessage = t("syncFailed");

  const handleSync = useCallback(async (runId: string, isAutomatic = false) => {
    await runAction(() => syncRun({ runId }), {
      key: runId,
      suppressErrorToast: isAutomatic,
      fallbackMessage: syncFailedMessage,
    });
  }, [runAction, syncRun, syncFailedMessage]);

  const renderSyncControl = useCallback((runId: string) => (
    <button
      onClick={() => handleSync(runId)}
      disabled={isBusy(runId)}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background border border-border-dim text-secondary hover:text-foreground transition-colors text-[11px] font-bold uppercase tracking-widest hover:border-brand/30"
    >
      <RefreshCcw className={`w-3.5 h-3.5 ${isBusy(runId) ? "animate-spin" : ""}`} />
      {t("syncStatus")}
    </button>
  ), [handleSync, isBusy, t]);

  // Auto-sync PENDING runs every 30 seconds
  useEffect(() => {
    const syncPending = () => {
      latestRuns.forEach((run) => {
        if (run.status === "PENDING") {
          handleSync(run.runId, true);
        }
      });
    };

    // Initial check
    syncPending();

    // Set up interval
    const interval = setInterval(syncPending, 30000);
    return () => clearInterval(interval);
  }, [handleSync, latestRuns]);

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <Activity className="w-6 h-6 text-brand" />
              {t("title")}
            </h1>
            <p className="text-[13px] text-secondary mt-1">
              {t("subtitle")}
            </p>
          </div>
        </div>

        <div className="bg-sidebar/40 border border-border-dim rounded-[32px] p-8 sm:p-10 backdrop-blur-xl shadow-xl w-full relative overflow-hidden">
          <div className="flex flex-col gap-4">
            {latestRuns.length === 0 ? (
              <PropertiesRunsEmptyState />
            ) : (
              <Suspense fallback={<PropertiesRunsEmptyState />}>
                <PropertiesRunRows
                  latestRuns={latestRuns}
                  renderSyncControl={renderSyncControl}
                />
              </Suspense>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
