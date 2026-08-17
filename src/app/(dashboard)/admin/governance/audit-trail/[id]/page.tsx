"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowLeft, ArrowRight, History, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { auditFieldWords } from "@/convex/auditLogService";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";

/**
 * One entry, in full.
 *
 * Lives under the audit trail's own address rather than off in another section:
 * following a record should not move the reader out of the part of the product
 * they are working in, and the old link did — Anthony, 2026-08-06: *"the screen
 * needs to be under the audit trail and not inside another section."*
 *
 * Read by its own id. The screen this replaces loaded the capped list of recent
 * entries and searched it in the browser, so a deep link to anything older
 * opened onto nothing at all.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */
export default function AuditEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("admin.governance.auditTrail.entry");
  const entry = useQuery(api.auditLogs.getAuditEntry, { id: id as Id<"auditLogs"> });

  if (entry === undefined) {
    return (
      <div className="flex items-center justify-center rounded-[16px] border border-border-dim bg-sidebar/40 p-10">
        <Loader2 className="h-5 w-5 animate-spin text-brand" aria-hidden="true" />
      </div>
    );
  }

  const back = (
    <Link
      href="/admin/governance/audit-trail"
      className="flex w-fit items-center gap-2 text-[13px] text-secondary transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {t("back")}
    </Link>
  );

  if (entry === null) {
    return (
      <div className="flex flex-col gap-6">
        {back}
        <p className="rounded-[16px] border border-border-dim bg-sidebar/40 p-8 text-[13px] text-secondary">
          {/* Deleted by a retention rule, or never yours to read. The screen does
              not distinguish, because saying which would answer a question the
              reader was not entitled to ask. */}
          {t("notFound")}
        </p>
      </div>
    );
  }

  const facts = [
    { key: "who", value: entry.actorName },
    {
      key: "when",
      value: new Date(entry.timestamp).toLocaleString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    },
    { key: "what", value: entry.entityType },
    {
      key: "target",
      // The name where there is one, the identifier only where there is not.
      // An identifier is what the record stores; a name is what a reader can
      // act on.
      value: entry.targetName ?? entry.entityId ?? t("noTarget"),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {back}

      <PageHeader
        icon={<History className="w-6 h-6 text-brand" />}
        title={entry.actionType}
        description={entry.change || t("noChangeRecorded")}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {facts.map((fact) => (
          <div key={fact.key} className="rounded-[12px] border border-border-dim bg-sidebar/40 p-4">
            <p className="text-[12px] text-secondary">{t(`facts.${fact.key}`)}</p>
            <p className="mt-1 break-all text-[13px] text-foreground">{fact.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-[16px] border border-border-dim bg-sidebar/40 p-5">
        <p className="text-[13px] font-medium text-foreground">{t("changesTitle")}</p>

        {entry.changes.length === 0 && entry.details.length === 0 ? (
          <p className="mt-2 text-[12px] text-muted">{t("noChangesDetail")}</p>
        ) : entry.changes.length === 0 ? (
          /* Not every entry is a before-and-after. A sign-in, an export and a
             maintenance run all record something worth reading and none of them
             moved a field, and this screen used to hand those readers the raw
             record at the bottom of the page as their only answer. */
          <ul className="mt-4 flex flex-col gap-3">
            {entry.details.map((detail) => (
              <li
                key={detail.key}
                className="flex flex-col gap-1.5 border-b border-border-dim/50 pb-3 last:border-0 last:pb-0"
              >
                <span className="text-[12px] text-secondary">{auditFieldWords(detail.key)}</span>
                <span className="break-all text-[13px] text-foreground">{detail.value}</span>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {entry.changes.map((change) => (
              <li
                key={change.field}
                className="flex flex-col gap-1.5 border-b border-border-dim/50 pb-3 last:border-0 last:pb-0"
              >
                <span className="text-[12px] text-secondary">{auditFieldWords(change.field)}</span>

                {change.from === null && change.to === null ? (
                  /* An entry from before values were recorded. It knows the
                     field moved and genuinely nothing else, and inventing the
                     rest would be the worst thing this screen could do. */
                  <span className="text-[12px] text-muted">{t("valuesNotRecorded")}</span>
                ) : (
                  <span className="flex flex-wrap items-center gap-2.5 text-[13px]">
                    <span className="rounded-[6px] border border-border-dim px-2 py-1 text-secondary">
                      {change.from ?? t("nothing")}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                    <span className="rounded-[6px] border border-border-dim bg-foreground/5 px-2 py-1 text-foreground">
                      {change.to ?? t("nothing")}
                    </span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {entry.metadata ? (
        <details className="rounded-[16px] border border-border-dim bg-sidebar/40 p-5">
          <summary className="cursor-pointer text-[13px] font-medium text-foreground">
            {t("rawTitle")}
          </summary>
          {/* Kept, but folded away. The record as written is the evidence; it is
              just not what a reader should have to start with. */}
          <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] text-secondary">
            {(() => {
              try {
                return JSON.stringify(JSON.parse(entry.metadata), null, 2);
              } catch {
                return entry.metadata;
              }
            })()}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
