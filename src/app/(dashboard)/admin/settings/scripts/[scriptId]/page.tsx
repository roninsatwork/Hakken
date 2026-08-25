"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Loader2,
  Play,
  RotateCcw,
  ShieldCheck,
  Wrench,
  XCircle,
} from "lucide-react";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { Button } from "@/src/ui/components/screens/Button";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { useLocale, useTranslations } from "next-intl";

// Mirrors the list page's RiskBadge. This was previously hardcoded to the
// emerald "low risk" styling, so a MEDIUM or HIGH risk script was presented as
// safe on the very screen where it is run. Unknown values fall back to the
// most cautious styling rather than the least.
const RISK_BADGE_CLASSES: Record<string, string> = {
  LOW: "bg-emerald-500/10 text-emerald-500",
  MEDIUM: "bg-amber-500/10 text-amber-500",
  HIGH: "bg-red-500/10 text-red-500",
};

/** Returns `undefined` when nothing has run — the screen says "Never" in the reader's language. */
function formatDate(timestamp: number | undefined, locale: string) {
  if (!timestamp) return undefined;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function StatusBadge({ status }: { status?: "RUNNING" | "SUCCESS" | "FAILED" }) {
  const t = useTranslations("admin.settings.scripts");
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[6px] text-[11px] font-medium bg-foreground/5 text-secondary">
        <Clock3 className="w-3.5 h-3.5" />
        {t("notRun")}
      </span>
    );
  }

  const statusClass = status === "SUCCESS"
    ? "bg-emerald-500/10 text-emerald-500"
    : status === "FAILED"
      ? "bg-red-500/10 text-red-500"
      : "bg-brand/10 text-brand";
  const Icon = status === "SUCCESS" ? CheckCircle2 : status === "FAILED" ? XCircle : Loader2;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-[6px] text-[11px] font-medium ${statusClass}`}>
      <Icon className={`w-3.5 h-3.5 ${status === "RUNNING" ? "animate-spin" : ""}`} />
      {status === "SUCCESS" ? t("statusSuccess") : status === "FAILED" ? t("statusFailed") : t("statusRunning")}
    </span>
  );
}

export default function MaintenanceScriptDetailPage() {
  const t = useTranslations("admin.settings.scripts");
  const locale = useLocale();
  const params = useParams<{ scriptId: string }>();
  const scriptId = params.scriptId ?? "";
  const script = useQuery(api.maintenanceScripts.get, { scriptId });
  const runScript = useMutation(api.maintenanceScripts.run);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const handleRun = async () => {
    setIsRunning(true);
    setFeedback(null);
    try {
      const result = await runScript({ scriptId });
      if (result.success) {
        setFeedback({ type: "success", message: result.summary ?? t("runCompleted") });
        setIsConfirmOpen(false);
      } else {
        setFeedback({ type: "error", message: result.error ?? t("runFailed") });
      }
    } catch {
      setFeedback({ type: "error", message: t("runNotStarted") });
    } finally {
      setIsRunning(false);
    }
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
            <span className="px-2 py-1 rounded-[6px] text-[11px] font-medium bg-foreground/5 text-secondary">{script.category}</span>
            <span className={`px-2 py-1 rounded-[6px] text-[11px] font-medium ${RISK_BADGE_CLASSES[script.riskLevel] ?? RISK_BADGE_CLASSES.HIGH}`}>{t("riskBadge", { level: script.riskLevel === "LOW" ? t("riskLow") : script.riskLevel === "MEDIUM" ? t("riskMedium") : script.riskLevel === "HIGH" ? t("riskHigh") : script.riskLevel })}</span>
            <StatusBadge status={script.lastRun?.status} />
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
                {formatDate(script.lastRun?.completedAt ?? script.lastRun?.startedAt, locale) ?? t("never")}
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
                      <StatusBadge status={run.status} />
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
                    formatDate(run.completedAt ?? run.startedAt, locale) ?? t("never"),
                },
              ]}
            />
          </div>
        </aside>
      </div>

      <SonaeModal
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
      </SonaeModal>
    </div>
  );
}
