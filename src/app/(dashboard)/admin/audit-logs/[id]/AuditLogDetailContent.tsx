"use client";

import { ArrowLeft, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { PageHeader } from "@/src/ui/components/screens/PageHeader";

export type AuditLogRow = {
  _id: string;
  actionType: string;
  actorName: string;
  entityId?: string;
  timestamp: number;
  metadata?: string;
};

/**
 * An audit record shows what happened, or it shows nothing.
 *
 * This screen used to fall back to four hand-written rows whenever the real
 * query came back empty — a super-admin enforcing a security policy, a user
 * deleted for a terms violation, each with a plausible actor, timestamp and
 * reference. On a quiet system, or a fresh one, an auditor read four events
 * that never happened. Convincing placeholder data is the wrong kind of
 * placeholder for a record whose entire purpose is to be trustworthy, and no
 * amount of labelling it "sample" would fix that, because the screen renders
 * one record at a time with nothing around it to carry the caveat.
 *
 * The empty path was already built and already worded: an id that matches
 * nothing shows "Log Not Found", which is both true and the same thing an
 * auditor needs to hear when a record has been purged. It simply could not be
 * reached while the fallback stood in front of it.
 */
export default function AuditLogDetailContent({ id, logs }: { id: string; logs: AuditLogRow[] }) {
  const t = useTranslations("admin.auditLogs.detailPage");
  const log = logs.find((entry) => entry._id === id);

  return (
    <div className="flex flex-col gap-6 w-full antialiased pb-20">
      <Link
        href="/admin/governance/audit-trail"
        className="flex items-center gap-2 text-[13px] text-secondary hover:text-foreground transition-colors w-fit group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        {t("back")}
      </Link>

      {log ? (
        <div className="flex flex-col gap-8 mt-4">
          <PageHeader
            icon={<ShieldAlert className="w-6 h-6 text-brand" />}
            title={t("title")}
            description={t("subtitle", { id: log._id })}
          />

          <div className="p-8 rounded-[24px] bg-card/40 backdrop-blur-2xl border border-border-dim shadow-sm flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-8">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1">{t("eventSignature")}</span>
                <span className="text-[12px] font-mono tracking-widest text-foreground bg-foreground/5 w-fit px-2 py-1 rounded-[4px] border border-border-dim">{log.actionType}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1">{t("timestamp")}</span>
                <span className="text-[14px] text-secondary font-medium mt-1">{new Date(log.timestamp).toUTCString().replace("GMT", "UTC")}</span>
              </div>
              <div className="flex flex-col gap-1 mt-2">
                <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1">{t("executionActor")}</span>
                <span className="text-[14px] text-secondary font-medium">{log.actorName}</span>
              </div>
              <div className="flex flex-col gap-1 mt-2">
                <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1">{t("targetObject")}</span>
                <span className="text-[13px] font-mono text-secondary mt-1">{log.entityId || t("unboundContext")}</span>
              </div>
            </div>
            <div className="flex flex-col gap-2 mt-4 pt-6 border-t border-border-dim/50">
              <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1">{t("decryptedPayload")}</span>
              <div className="bg-black/20 backdrop-blur-xl p-6 rounded-[16px] border border-border-dim/50 shadow-inner overflow-x-auto custom-scrollbar">
                <pre className="text-[13px] text-secondary font-mono whitespace-pre-wrap leading-relaxed">
                  {log.metadata ? JSON.stringify(JSON.parse(log.metadata), null, 2) : t("noMetadata")}
                </pre>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-12 text-center flex flex-col items-center gap-4 border border-border-dim rounded-[24px] bg-card/40 mt-8">
          <ShieldAlert className="w-12 h-12 text-muted" />
          <span className="text-[14px] font-medium text-foreground">{t("error.title")}</span>
          <p className="text-[13px] text-muted max-w-sm leading-relaxed">{t("error.message")}</p>
        </div>
      )}
    </div>
  );
}
