"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { BookmarkCheck, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Header from "@/src/ui/components/layout/Header";
import SonaeEmptyState from "@/src/ui/components/feedback/SonaeEmptyState";
import { formatDateTime } from "@/src/lib/dates";

/**
 * What the team has kept.
 *
 * Saving is trusted, so this is a record to check rather than a queue to
 * clear: everything here is already searchable, and the control on offer is
 * removal. Removing deletes the document and purges its chunks, so it leaves
 * retrieval rather than being hidden from it.
 */
export default function SavedAnswersPage() {
  const t = useTranslations("knowledgeReview");
  const me = useQuery(api.users.getMe);
  const companyId = me?.impersonatingCompanyId ?? me?.companyId;

  const saved = useQuery(api.knowledge.listSavedAnswers, companyId ? { companyId } : "skip");
  const remove = useMutation(api.knowledge.deleteDocument);
  const [busyId, setBusyId] = useState<Id<"knowledgeDocuments"> | null>(null);

  const handleRemove = async (documentId: Id<"knowledgeDocuments">) => {
    if (busyId) return;
    setBusyId(documentId);
    try {
      await remove({ documentId });
    } catch (error) {
      console.error("Failed to remove saved answer", error);
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
            <BookmarkCheck className="w-6 h-6 text-brand" />
            {t("title")}
          </h1>
          <p className="text-[13px] text-secondary mt-1 max-w-[46rem]">{t("subtitle")}</p>
        </div>

        {saved && saved.length === 0 ? (
          <SonaeEmptyState icon={BookmarkCheck} title={t("title")} description={t("empty")} />
        ) : (
          <ul className="flex flex-col">
            {saved?.map((doc) => (
              <li key={doc._id} className="flex items-start gap-4 py-4 border-b border-border-dim last:border-b-0">
                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  <span className="text-[15px] text-foreground">{doc.title}</span>
                  {doc.textContent && (
                    <p className="text-[13px] leading-relaxed text-secondary max-w-[46rem]">
                      {doc.textContent.length > 300 ? `${doc.textContent.slice(0, 300)}…` : doc.textContent}
                    </p>
                  )}
                  <span className="flex flex-wrap items-center gap-x-3 text-[11px] text-muted">
                    {doc.savedByName && <span>{t("savedBy")} {doc.savedByName}</span>}
                    <span>{formatDateTime(doc.createdAt, { locale: [] })}</span>
                    {doc.sourceUrl && (
                      <Link href={doc.sourceUrl} className="text-brand hover:underline">
                        {t("open")}
                      </Link>
                    )}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={busyId === doc._id}
                  onClick={() => void handleRemove(doc._id)}
                  className="h-8 px-3 flex-shrink-0 inline-flex items-center gap-1.5 rounded-[8px] border border-border-dim text-[12px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-colors disabled:opacity-50"
                >
                  {busyId === doc._id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                  {busyId === doc._id ? t("removing") : t("remove")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
