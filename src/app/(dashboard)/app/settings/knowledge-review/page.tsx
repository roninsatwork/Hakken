"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { BookOpenCheck, Check, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Header from "@/src/ui/components/layout/Header";
import SonaeEmptyState from "@/src/ui/components/feedback/SonaeEmptyState";
import { formatDateTime } from "@/src/lib/dates";

/**
 * What the team has saved, waiting for an admin to decide.
 *
 * Nothing on this page is searchable yet: a held answer is never ingested,
 * so it has no chunks at all. Approving is what starts that, which is why
 * this screen is the gate rather than a filter.
 */
export default function KnowledgeReviewPage() {
  const t = useTranslations("knowledgeReview");
  const me = useQuery(api.users.getMe);
  const companyId = me?.impersonatingCompanyId ?? me?.companyId;

  const pending = useQuery(
    api.knowledge.listPendingKnowledge,
    companyId ? { companyId } : "skip",
  );
  const approve = useMutation(api.knowledge.approveKnowledgeDocument);
  const reject = useMutation(api.knowledge.rejectKnowledgeDocument);

  const [busyId, setBusyId] = useState<Id<"knowledgeDocuments"> | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const decide = async (documentId: Id<"knowledgeDocuments">, accept: boolean) => {
    if (busyId) return;
    setBusyId(documentId);
    try {
      if (accept) await approve({ documentId });
      else await reject({ documentId, ...(reasons[documentId] ? { reason: reasons[documentId] } : {}) });
    } catch (error) {
      console.error("Failed to decide on saved answer", error);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <BookOpenCheck className="w-6 h-6 text-brand" />
            {t("title")}
          </h1>
          <p className="text-[13px] text-secondary mt-1">{t("subtitle")}</p>
        </div>

        {pending && pending.length === 0 ? (
          <SonaeEmptyState icon={BookOpenCheck} title={t("title")} description={t("empty")} />
        ) : (
          <ul className="flex flex-col">
            {pending?.map((doc) => (
              <li key={doc._id} className="flex flex-col gap-3 py-4 border-b border-border-dim last:border-b-0">
                <div className="flex flex-col gap-1">
                  <span className="text-[15px] text-foreground">{doc.title}</span>
                  <span className="text-[12px] text-muted">
                    {formatDateTime(doc.createdAt, { locale: [] })}
                  </span>
                </div>

                {doc.textContent && (
                  <p className="text-[13px] leading-relaxed text-secondary max-w-[46rem] whitespace-pre-wrap">
                    {doc.textContent.length > 600 ? `${doc.textContent.slice(0, 600)}…` : doc.textContent}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busyId === doc._id}
                    onClick={() => void decide(doc._id, true)}
                    className="h-8 px-3 inline-flex items-center gap-1.5 rounded-[8px] bg-brand text-white text-[12px] font-medium hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {busyId === doc._id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    {t("approve")}
                  </button>

                  <input
                    value={reasons[doc._id] ?? ""}
                    onChange={(event) => setReasons((prev) => ({ ...prev, [doc._id]: event.target.value }))}
                    placeholder={t("reasonPlaceholder")}
                    aria-label={t("reasonPlaceholder")}
                    className="flex-1 min-w-[200px] bg-transparent border-0 border-b border-border-dim rounded-none px-0 pb-1 text-[12px] text-foreground focus:outline-none focus:border-brand/50 placeholder:text-muted/70"
                  />

                  <button
                    type="button"
                    disabled={busyId === doc._id}
                    onClick={() => void decide(doc._id, false)}
                    className="h-8 px-3 inline-flex items-center gap-1.5 rounded-[8px] border border-border-dim text-[12px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-colors disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                    {t("reject")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
