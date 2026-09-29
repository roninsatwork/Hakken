"use client";

import { useState } from "react";
import { formatDateTime } from "@/src/lib/dates";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Play,
  RotateCcw,
  ShieldCheck,
  Wrench,
  XCircle,
} from "lucide-react";
import HakkenModal from "@/src/ui/components/feedback/HakkenModal";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { Button } from "@/src/ui/components/screens/Button";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { toneForStatus, type StatusTone } from "@/src/ui/components/screens/statusTone";
import { useLocale, useTranslations } from "next-intl";

// Mirrors the list page's ScriptRiskLabel. This was previously hardcoded to the
// "low risk" look, so a MEDIUM or HIGH risk script was presented as safe on
// the very screen where it is run. Unknown values fall back to the most
// cautious tone rather than the least.
function riskTone(riskLevel: string): StatusTone {
  return riskLevel === "LOW" || riskLevel === "MEDIUM" ? toneForStatus(riskLevel) : "danger";
}

/** Returns `undefined` when nothing has run — the screen says "Never" in the reader's language. */
function formatRunDate(timestamp: number | undefined, locale: string) {
  if (!timestamp) return undefined;
  return formatDateTime(timestamp, {
    locale,
    options: { dateStyle: "medium", timeStyle: "short" },
  });
}

/** A run's state: md in the page header, sm in the list of recent runs. */
function ScriptRunLabel({ status, size = "sm" }: { status?: "RUNNING" | "SUCCESS" | "FAILED"; size?: "sm" | "md" }) {
  const t = useTranslations("admin.settings.scripts");
  if (!status) {
    return <StatusLabel tone="neutral" size={size}>{t("notRun")}</StatusLabel>;
  }

  return (
    <StatusLabel tone={toneForStatus(status)} size={size} icon={status === "RUNNING" ? "working" : undefined}>
      {status === "SUCCESS" ? t("statusSuccess") : status === "FAILED" ? t("statusFailed") : t("statusRunning")}
    </StatusLabel>
  );
}

export default function MaintenanceScriptDetailPage() {
  const t = useTranslations("admin.settings.scripts");
  const locale = useLocale();
  const params = useParams<{ scriptId: string }>();
  const scriptId = params.scriptId ?? "";
  const script = useQuery(api.maintenanceScripts.get, { scriptId });
  const runScript = useMutation(api.maintenanceScripts.run);
  const action = useAdminAction({ scope: "admin-maintenance-script" });
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const isRunning = action.isBusy();

  const handleRun = async () => {
    setFeedback(null);
    const outcome = await action.run(() => runScript({ scriptId }), {
      suppressErrorToast: true,
      fallbackMessage: t("runNotStarted"),
    });
    if (outcome.ok) {
      if (outcome.data.success) {
        setFeedback({ type: "success", message: outcome.data.summary ?? t("runCompleted") });
        setIsConfirmOpen(false);
      } else {
        setFeedback({ type: "error", message: outcome.data.error ?? t("runFailed") });
      }
      return;
    }
    if (outcome.message) setFeedback({ type: "error", message: outcome.message });
  };

  if (script === undefined) {
    return (
      <div className="w-full h-[50vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand opacity-80" />
      </div>
    );
  }

  if (script === null) {
    return (
      <div className="flex flex-col gap-5">
        <Link href="/admin/settings/scripts" className="inline-flex items-center gap-2 text-[13px] text-secondary hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
          {t("back")}
        </Link>
        <div className="border border-border-dim rounded-[16px] p-8 bg-sidebar/20">
          <h1 className="text-xl font-semibold text-foreground">{t("notFoundTitle")}</h1>
          <p className="text-[13px] text-secondary mt-2">{t("notFoundBody")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-16">
      <DetailHeader
        back={{ label: t("back"), href: "/admin/settings/scripts" }}
        icon={<Wrench className="w-6 h-6 text-brand" />}
        title={script.name}
        description={script.shortDescription}
        pills={
          <>
            <TagLabel>{script.category}</TagLabel>
            <StatusLabel tone={riskTone(script.riskLevel)} size="md">{t("riskBadge", { level: script.riskLevel === "LOW" ? t("riskLow") : script.riskLevel === "MEDIUM" ? t("riskMedium") : script.riskLevel === "HIGH" ? t("riskHigh") : script.riskLevel })}</StatusLabel>
            <ScriptRunLabel status={script.lastRun?.status} size="md" />
          </>
        }
        action={
          <WriteButton
            type="button"
            onClick={() => setIsConfirmOpen(true)}
            disabled={isRunning}
            className="flex items-center gap-2 px-4 py-2.5 rounded-[10px] text-[13px] bg-brand text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {t("runScript")}
          </WriteButton>
        }
      />

      {feedback ? (
        <div className={`flex items-start gap-3 p-4 rounded-[12px] border text-[13px] ${
          feedback.type === "success"
            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
            : "bg-red-500/10 border-red-500/20 text-red-500"
        }`}>
          {feedback.type === "success" ? <CheckCircle2 className="w-4 h-4 mt-0.5" /> : <XCircle className="w-4 h-4 mt-0.5" />}
          <span>{feedback.message}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6">
        <section className="flex flex-col gap-4">
          <div className="border border-border-dim rounded-[16px] p-6 bg-sidebar/20">
            <h2 className="text-[15px] font-semibold text-foreground mb-2">{t("whatThisDoes")}</h2>
            <p className="text-[13px] text-secondary leading-relaxed">{script.description}</p>
          </div>

          <div className="border border-border-dim rounded-[16px] p-6 bg-sidebar/20">
            <h2 className="text-[15px] font-semibold text-foreground mb-2">{t("whenToRun")}</h2>
            <p className="text-[13px] text-secondary leading-relaxed">{script.whenToRun}</p>
          </div>

          <div className="border border-border-dim rounded-[16px] p-6 bg-sidebar/20">
            <h2 className="text-[15px] font-semibold text-foreground mb-3">{t("whatItChanges")}</h2>
            <ul className="flex flex-col gap-2">
              {script.changes.map((change) => (
                <li key={change} className="flex items-start gap-2 text-[13px] text-secondary">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                  <span>{change}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          <div className="border border-border-dim rounded-[16px] p-5 bg-sidebar/20">
            <h2 className="text-[13px] font-semibold text-foreground mb-4 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-brand" />
              {t("safetyNotes")}
            </h2>
            <div className="flex flex-col gap-4 text-[12.5px] text-secondary leading-relaxed">
              <div>
                <span className="block text-[11px] uppercase tracking-[0.12em] text-muted mb-1">{t("repeatability")}</span>
                {script.repeatability}
              </div>
              <div>
                <span className="block text-[11px] uppercase tracking-[0.12em] text-muted mb-1">{t("expectedDuration")}</span>
                {script.expectedDuration}
              </div>
              <div>
                <span className="block text-[11px] uppercase tracking-[0.12em] text-muted mb-1">{t("columnLastRun")}</span>
                {formatRunDate(script.lastRun?.completedAt ?? script.lastRun?.startedAt, locale) ?? t("never")}
              </div>
              <div>
                <span className="block text-[11px] uppercase tracking-[0.12em] text-muted mb-1">{t("columnLastRunBy")}</span>
                {script.lastRun?.actorName ?? t("nobody")}
              </div>
            </div>
          </div>

          <div className="border border-border-dim rounded-[16px] p-5 bg-sidebar/20">
            <h2 className="text-[13px] font-semibold text-foreground mb-4 flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-brand" />
              {t("recentRuns")}
            </h2>
            {/* A narrow column, so two columns rather than four: what the run
                did on the left, when it happened on the right. The kit owns the
                divider and the row rhythm; before this it was a hand-drawn
                divided list, which is how every other one of these drifted. */}
            <CompactList
              rows={script.history}
              rowKey={(run) => run._id}
              empty={t("noRuns")}
              columns={[
                {
                  key: "run",
                  header: t("runColumn"),
                  cell: (run) => (
                    <span className="flex flex-col gap-1">
                      <ScriptRunLabel status={run.status} />
                      <span className="text-[12px] text-secondary">
                        {run.summary ?? run.error ?? t("runRecorded")}
                      </span>
                      <span className="text-[11px] text-muted">{run.actorName ?? t("superAdmin")}</span>
                    </span>
                  ),
                },
                {
                  key: "when",
                  header: t("whenColumn"),
                  align: "right",
                  className: "w-[110px] align-top whitespace-nowrap text-[11px] text-muted",
                  cell: (run) =>
                    formatRunDate(run.completedAt ?? run.startedAt, locale) ?? t("never"),
                },
              ]}
            />
          </div>
        </aside>
      </div>

      <HakkenModal
        isOpen={isConfirmOpen}
        onClose={() => {
          if (!isRunning) setIsConfirmOpen(false);
        }}
        title={t("runModalTitle", { name: script.name })}
        size="md"
      >
        <div className="flex flex-col gap-4 text-[14px] text-secondary leading-relaxed">
          <p>{script.description}</p>
          <div className="bg-foreground/[0.03] border border-border-dim rounded-[12px] p-4">
            <span className="block text-[11px] uppercase tracking-[0.12em] text-muted mb-1">{t("beforeYouRun")}</span>
            {t("beforeYouRunBody")}
          </div>
          {feedback?.type === "error" ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-[10px] p-3 text-red-500 text-[13px]">
              {feedback.message}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-border-dim">
          <Button
            variant="ghost"
            onClick={() => setIsConfirmOpen(false)}
            className="rounded-[10px] text-sm hover:bg-foreground/5"
            disabled={isRunning}
          >
            {t("cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={handleRun}
            disabled={isRunning}
            className="px-5 shadow-lg inline-flex items-center gap-2"
          >
            {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {t("runScript")}
          </Button>
        </div>
      </HakkenModal>
    </div>
  );
}
