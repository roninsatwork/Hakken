"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { formatDateTime } from "@/src/lib/dates";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { SettingRow, SettingsCard } from "@/src/ui/components/screens/SettingsCard";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { OUTBOX_STATUS_TONES } from "../outboxStatus";

const BASE = "/admin/content/outbox";

/**
 * One email in the outbox (docs/plans/active/knowledge-news-and-digest-plan.md,
 * phase 7): who it is for and what became of it, the runs that queued and
 * sent it, and the email itself as its reader gets it — or why it would not
 * be sent.
 */
export default function OutboxMessagePage() {
  const t = useTranslations("admin.outbox");
  const { id } = useParams<{ id: string }>();
  const message = useQuery(api.outboxAdmin.getOutboxMessageForAdmin, { messageId: id });
  const back = { label: t("back"), href: BASE };

  if (message === undefined) {
    return (
      <div className="flex flex-col gap-5" aria-busy="true">
        <DetailHeader back={back} icon={<Mail className="h-6 w-6 text-brand" />} title={t("title")} />
        <div className="h-64 animate-pulse rounded-2xl bg-sidebar/30" />
      </div>
    );
  }
  if (message === null) {
    return (
      <div className="flex flex-col gap-5">
        <DetailHeader back={back} icon={<Mail className="h-6 w-6 text-brand" />} title={t("missingTitle")} />
        <HakkenEmptyState icon={Mail} title={t("missingTitle")} description={t("missingBody")} />
      </div>
    );
  }

  const run = (link: typeof message.queuedBy) => (link
    ? <Link href={`/admin/agents/${link.agentId}/observability/${link.runId}`} className="text-[13px] text-brand hover:underline">{t("openRun")}</Link>
    : <span className="text-[13px] text-muted">{t("none")}</span>);

  return (
    <div className="flex flex-col gap-5">
      <DetailHeader
        back={back}
        icon={<Mail className="h-6 w-6 text-brand" />}
        title={"subject" in message.preview ? message.preview.subject : t(`types.${message.messageType}`)}
        description={t("detailSubtitle", { email: message.email, type: t(`types.${message.messageType}`) })}
        pills={<StatusLabel tone={OUTBOX_STATUS_TONES[message.status]}>{t(`statuses.${message.status}`)}</StatusLabel>}
      />

      <SettingsCard title={t("sections.what")}>
        <div className="divide-y divide-border-dim/40">
          <SettingRow label={t("fields.language")}><span className="text-[13px] text-foreground">{message.language.toUpperCase()}</span></SettingRow>
          <SettingRow label={t("fields.queued")}><span className="text-[13px] text-foreground">{formatDateTime(message.createdAt)}</span></SettingRow>
          <SettingRow label={t("fields.sent")}><span className="text-[13px] text-foreground">{message.sentAt ? formatDateTime(message.sentAt) : t("notYet")}</span></SettingRow>
          <SettingRow label={t("fields.tries")}><span className="text-[13px] text-foreground">{message.attempts}</span></SettingRow>
          {message.error ? (
            <SettingRow label={t("fields.why")}><span className="text-[13px] text-foreground">{message.error}</span></SettingRow>
          ) : null}
          {message.resendId ? (
            <SettingRow label={t("fields.receipt")} description={t("fields.receiptHint")}><span className="break-all text-[13px] text-foreground">{message.resendId}</span></SettingRow>
          ) : null}
          <SettingRow label={t("fields.queuedBy")}>{run(message.queuedBy)}</SettingRow>
          <SettingRow label={t("fields.sentBy")}>{run(message.sentBy)}</SettingRow>
        </div>
      </SettingsCard>

      <SettingsCard title={t("sections.email")}>
        {"skip" in message.preview ? (
          <p className="text-[13px] text-secondary">{t("wouldSkip", { reason: message.preview.skip })}</p>
        ) : (
          // The email exactly as sent, walled off from the page: no scripts, no reaching out.
          <iframe
            title={t("previewTitle")}
            sandbox=""
            srcDoc={message.preview.html}
            className="h-[720px] w-full rounded-[12px] border border-border-dim bg-background"
          />
        )}
      </SettingsCard>
    </div>
  );
}
