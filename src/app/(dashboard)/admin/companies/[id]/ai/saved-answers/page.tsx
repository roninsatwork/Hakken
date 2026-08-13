"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { BookmarkCheck, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  AdminRowActions,
  AdminRowIconButton,
  AdminSearchBar,
  AdminTableEmptyRow,
  AdminTableHeaderCell,
  AdminTableHeaderRow,
  AdminTableLoadingRow,
  AdminTableShell,
} from "@/src/app/(dashboard)/admin/_components/AdminTable";
import { formatDateTime } from "@/src/lib/dates";

/**
 * What this company has kept from its conversations.
 *
 * Saving is trusted, so this is a record to check rather than a queue to
 * clear: everything here is already searchable, and the control on offer is
 * removal. Removing deletes the document and purges its chunks, so it leaves
 * retrieval rather than being hidden from it.
 *
 * It lives beside Knowledge and Memory because a saved answer is company
 * knowledge — it belongs to the company you are looking at, not to whoever is
 * looking at it.
 */
export default function CompanySavedAnswersPage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;

  const saved = useQuery(api.knowledge.listSavedAnswers, { companyId });
  const remove = useMutation(api.knowledge.deleteDocument);
  const [searchTerm, setSearchTerm] = useState("");
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

  const term = searchTerm.trim().toLowerCase();
  const rows = (saved ?? []).filter((doc) =>
    term.length === 0
    || doc.title.toLowerCase().includes(term)
    || (doc.textContent ?? "").toLowerCase().includes(term),
  );

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <header className="flex flex-col gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-foreground">
            <BookmarkCheck className="h-6 w-6 text-brand" />
            Saved Answers
          </h1>
          <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-secondary">
            Answers this company kept from conversations. Each one is already
            searchable by the assistant &mdash; remove any that should not be.
          </p>
        </div>

        <AdminSearchBar value={searchTerm} onChange={setSearchTerm} placeholder="Search saved answers" />
      </header>

      <AdminTableShell minWidthClassName="min-w-[880px]">
        <thead>
          <AdminTableHeaderRow>
            <AdminTableHeaderCell>Question</AdminTableHeaderCell>
            <AdminTableHeaderCell>Answer</AdminTableHeaderCell>
            <AdminTableHeaderCell>Saved by</AdminTableHeaderCell>
            <AdminTableHeaderCell>Saved</AdminTableHeaderCell>
            <AdminTableHeaderCell align="right">Actions</AdminTableHeaderCell>
          </AdminTableHeaderRow>
        </thead>
        <tbody>
          {saved === undefined ? (
            <AdminTableLoadingRow colSpan={5} />
          ) : rows.length === 0 ? (
            <AdminTableEmptyRow
              colSpan={5}
              icon={<BookmarkCheck className="h-8 w-8 text-muted" />}
              label={term.length > 0 ? "Nothing matches" : "Nothing saved yet"}
            />
          ) : (
            rows.map((doc) => (
              <tr key={doc._id} className="group border-t border-border-dim">
                <td className="max-w-[22rem] px-5 py-4 align-top text-[13px] text-foreground">
                  {doc.sourceUrl ? (
                    <Link href={doc.sourceUrl} className="hover:text-brand hover:underline">
                      {doc.title}
                    </Link>
                  ) : (
                    doc.title
                  )}
                </td>
                <td className="max-w-[26rem] px-5 py-4 align-top text-[13px] leading-relaxed text-secondary">
                  {doc.textContent
                    ? doc.textContent.length > 220
                      ? `${doc.textContent.slice(0, 220)}…`
                      : doc.textContent
                    : "—"}
                </td>
                <td className="px-5 py-4 align-top text-[13px] text-secondary">{doc.savedByName ?? "—"}</td>
                <td className="whitespace-nowrap px-5 py-4 align-top text-[13px] text-secondary">
                  {formatDateTime(doc.createdAt, { locale: [] })}
                </td>
                <td className="px-5 py-4 align-top">
                  <AdminRowActions>
                    <AdminRowIconButton
                      label={busyId === doc._id ? "Removing" : "Remove saved answer"}
                      tone="danger"
                      onClick={() => void handleRemove(doc._id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </AdminRowIconButton>
                  </AdminRowActions>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </AdminTableShell>
    </div>
  );
}
