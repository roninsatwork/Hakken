"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import { 
  Activity,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Database,
  LineChart, 
  MessageSquare,
  Save, 
  RefreshCcw,
} from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { getErrorMessage } from "@/src/lib/errors";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { Field } from "@/src/ui/components/screens/Field";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { useTranslations } from "next-intl";

const DeferredSaveFeedback = lazy(async () => {
  const { SaveFeedback: Component } = await import("@/src/ui/components/screens/SaveControls");
  return { default: Component };
});

function formatCount(value: number) {
  return new Intl.NumberFormat("en-GB").format(value);
}

export default function AnalyticsPage() {
  const t = useTranslations("admin.settings.analytics");
  const currentId = useQuery(api.system.getAnalyticsId);
  const health = useQuery(api.systemHealth.getAnalyticsDataHealthForAdmin, { daysBack: 7 });
  const updateId = useMutation(api.system.updateAnalyticsId);
  
  const [trackingId, setTrackingId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  // Sync state once data loads
  useEffect(() => {
    if (currentId !== undefined) {
      setTrackingId(currentId || "");
    }
  }, [currentId]);

  const hasUnsavedChanges = currentId !== undefined && trackingId !== currentId;
  const healthIssueCount = health
    ? health.snapshotCoverage.missingGlobalDates.length +
      health.snapshotCoverage.duplicateSnapshotGroups.length +
      health.messageDimensions.missingDimensions +
      health.messageDimensions.mismatched +
      health.messageDimensions.missingThreads
    : 0;
  const isHealthLoading = health === undefined;
  const isHealthy = !isHealthLoading && healthIssueCount === 0;

  const handleSave = async () => {
    if (!hasUnsavedChanges || isSaving) return;
    
    setIsSaving(true);
    setSaveStatus("idle");
    
    try {
      await updateId({ trackingId: trackingId.trim() });
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3500);
    } catch (error: unknown) {
      console.error("Failed to save analytics configuration:", error);
      setSaveStatus("error");
      setErrorMessage(getErrorMessage(error, t("saveFailedFallback")));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevert = () => {
    if (currentId !== undefined) {
      setTrackingId(currentId || "");
      setSaveStatus("idle");
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-12 w-full h-full">
      <PageHeader
        divider
        icon={<LineChart className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
        action={
          <div className="flex items-center gap-3">
            {hasUnsavedChanges && (
              <WriteButton

                onClick={handleRevert}
                disabled={isSaving}
                className="flex items-center gap-2 px-3 py-2 rounded-full border border-border-dim text-secondary text-[12px] font-medium tracking-wide hover:bg-hover transition-colors disabled:opacity-50"
              >
                <RefreshCcw className="w-3.5 h-3.5" />
                <span>{t("revert")}</span>
              </WriteButton>
            )}

            <WriteButton

              onClick={handleSave}
              disabled={!hasUnsavedChanges || isSaving}
              className={`flex items-center gap-2 px-5 py-2 rounded-full font-medium tracking-wide text-[12px] transition-all duration-300 shadow-sm ${
                hasUnsavedChanges
                  ? "bg-brand text-white hover:opacity-90 dark:shadow-black/30"
                  : "bg-card border border-border-dim text-muted cursor-not-allowed"
              }`}
            >
              {isSaving ? (
                <RefreshCcw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>{t("commit")}</span>
            </WriteButton>
          </div>
        }
      />

      {saveStatus !== "idle" ? (
        <Suspense fallback={null}>
          <DeferredSaveFeedback
            status={saveStatus}
            successTitle={t("savedTitle")}
            successMessage={t("savedMessage")}
            errorTitle={t("saveFailedTitle")}
            errorMessage={errorMessage}
          />
        </Suspense>
      ) : null}

      {/* Flat Content Flow Section */}
      <div className="w-full h-[1px] bg-border-dim my-2" />

      <section className="flex flex-col gap-5 relative">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-500 flex items-center justify-center shadow-md shadow-emerald-500/10">
              <Activity className="w-3 h-3" />
            </div>
            <div>
              <span className="text-foreground text-[14px] font-bold tracking-wide">{t("healthTitle")}</span>
              <p className="text-[12px] text-muted mt-0.5">
                {t("healthSub")}
              </p>
            </div>
          </div>

          <div className={`inline-flex items-center gap-2 self-start sm:self-auto px-3 py-1.5 rounded-full border text-[10px] uppercase font-mono tracking-widest ${
            isHealthLoading
              ? "border-border-dim text-muted bg-card"
              : isHealthy
                ? "border-emerald-500/20 text-emerald-500 bg-emerald-500/10"
                : "border-amber-500/20 text-amber-500 bg-amber-500/10"
          }`}>
            {isHealthLoading ? (
              <RefreshCcw className="w-3 h-3 animate-spin" />
            ) : isHealthy ? (
              <CheckCircle2 className="w-3 h-3" />
            ) : (
              <AlertTriangle className="w-3 h-3" />
            )}
            <span>{isHealthLoading ? t("checking") : isHealthy ? t("healthy") : t("signals", { count: healthIssueCount })}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="rounded-[10px] border border-border-dim bg-card/40 p-4 flex flex-col gap-3 min-h-[132px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted">{t("snapshots")}</span>
              <Database className="w-4 h-4 text-brand" />
            </div>
            <div className="text-2xl font-semibold text-foreground">
              {health ? formatCount(health.snapshotCoverage.totalSnapshots) : "--"}
            </div>
            <p className="text-[12px] text-secondary leading-relaxed">
              {health
                ? t("snapshotsSummary", { missing: formatCount(health.snapshotCoverage.missingGlobalDates.length), duplicates: formatCount(health.snapshotCoverage.duplicateSnapshotGroups.length) })
                : t("snapshotsLoading")}
            </p>
          </div>

          <div className="rounded-[10px] border border-border-dim bg-card/40 p-4 flex flex-col gap-3 min-h-[132px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted">{t("dimensions")}</span>
              <MessageSquare className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-semibold text-foreground">
              {health ? formatCount(health.messageDimensions.scanned) : "--"}
            </div>
            <p className="text-[12px] text-secondary leading-relaxed">
              {health
                ? t("dimensionsSummary", { missing: formatCount(health.messageDimensions.missingDimensions), mismatched: formatCount(health.messageDimensions.mismatched), missingThreads: formatCount(health.messageDimensions.missingThreads) })
                : t("dimensionsLoading")}
            </p>
          </div>

          <div className="rounded-[10px] border border-border-dim bg-card/40 p-4 flex flex-col gap-3 min-h-[132px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted">{t("liveToday")}</span>
              <Activity className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-2xl font-semibold text-foreground">
              {health ? formatCount(health.liveToday.assistantMessages) : "--"}
            </div>
            <p className="text-[12px] text-secondary leading-relaxed">
              {health
                ? t("liveTodaySummary", { count: formatCount(health.liveToday.agentTransactions), date: health.liveToday.date })
                : t("liveTodayLoading")}
            </p>
          </div>

          <div className="rounded-[10px] border border-border-dim bg-card/40 p-4 flex flex-col gap-3 min-h-[132px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted">{t("window")}</span>
              <CalendarDays className="w-4 h-4 text-rose-500" />
            </div>
            <div className="text-2xl font-semibold text-foreground">
              {health ? `${health.daysBack}d` : "--"}
            </div>
            <p className="text-[12px] text-secondary leading-relaxed">
              {health
                ? t("windowSummary", { from: health.checkedDates[0], to: health.checkedDates[health.checkedDates.length - 1] })
                : t("windowLoading")}
            </p>
          </div>
        </div>

        {health && !isHealthy ? (
          <div className="rounded-[10px] border border-amber-500/20 bg-amber-500/10 p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-amber-500">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-[12px] font-bold uppercase tracking-widest">{t("attentionNeeded")}</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-[12px] text-secondary leading-relaxed">
              <p>
                {t("missingDates", { dates: health.snapshotCoverage.missingGlobalDates.length > 0
                  ? health.snapshotCoverage.missingGlobalDates.join(", ")
                  : t("none") })}
              </p>
              <p>
                {t("duplicateGroups", { groups: health.snapshotCoverage.duplicateSnapshotGroups.length > 0
                  ? health.snapshotCoverage.duplicateSnapshotGroups.map((group) => `${group.date} ${group.type}:${group.scopeId}`).join(", ")
                  : t("none") })}
              </p>
              <p>
                {t("dimensionExamples", { examples: health.messageDimensions.examples.length > 0
                  ? health.messageDimensions.examples.join(", ")
                  : t("none") })}
              </p>
              <p>
                {t("nextAction")}
              </p>
            </div>
          </div>
        ) : null}
      </section>

      <div className="w-full h-[1px] bg-border-dim my-2" />

      <section className="flex flex-col gap-6 relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-5 h-5 rounded-full bg-brand text-white text-[10px] flex items-center justify-center font-bold shadow-md shadow-brand/20">1</div>
             <span className="text-foreground text-[14px] font-bold tracking-wide">{t("containerTitle")}</span>
          </div>
           
           <div className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-mono tracking-widest transition-colors ${
             hasUnsavedChanges ? "bg-amber-500/10 text-amber-500 font-bold" : "bg-border-dim text-muted"
           }`}>
             {hasUnsavedChanges ? t("unsaved") : t("synced")}
           </div>
        </div>

        <div className="flex flex-col gap-2 relative group max-w-xl">
          {/* The border used to live on this wrapper, with a borderless box
              inside it. The shared field brings its own, so the wrapper is only
              a place for the connecting overlay to sit now. */}
          <div className="relative w-full">
            {currentId === undefined ? (
              <div className="absolute inset-0 flex items-center justify-center bg-transparent backdrop-blur-sm z-20">
                 <div className="flex flex-col items-center gap-3 text-muted">
                   <RefreshCcw className="w-5 h-5 animate-spin opacity-50" />
                   <span className="text-[11px] font-mono tracking-widest uppercase">{t("connecting")}</span>
                 </div>
              </div>
            ) : null}

            <Field
              label={t("trackingIdLabel")}
              labelHidden
              value={trackingId}
              onChange={(e) => setTrackingId(e.target.value)}
              disabled={currentId === undefined || isSaving}
              className="font-mono tracking-widest"
              placeholder={t("trackingIdPlaceholder")}
              spellCheck={false}
            />
          </div>
          <p className="text-[13px] text-muted font-light leading-relaxed px-1 mt-1">
            {t("trackingIdHelp")}
          </p>
        </div>
      </section>
    </div>
  );
}
