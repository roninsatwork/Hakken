"use client";

import { useState } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { BookmarkCheck, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  AdminPaginationFooter,
  AdminRowActions,
  AdminRowIconButton,
  AdminSearchBar,
  AdminTableEmptyRow,
  AdminTableHeaderCell,
  AdminTableHeaderRow,
  AdminTableLoadingRow,
  AdminTableShell,
} from "@/src/app/(dashboard)/admin/_components/AdminTable";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
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

  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);

  const saved = usePaginatedQuery(
    api.knowledge.listSavedAnswers,
    { companyId, ...(searchTerm.trim() ? { searchTerm: searchTerm.trim() } : {}) },
    { initialNumItems: ADMIN_PAGE_SIZE },
  );

  const remove = useMutation(api.knowledge.deleteDocument);
  const [busyId, setBusyId] = useState<Id<"knowledgeDocuments"> | null>(null);

  const isLoading = saved.status === "LoadingFirstPage";
  const pageStart = (page - 1) * ADMIN_PAGE_SIZE;
  const pageRows = saved.results.slice(pageStart, pageStart + ADMIN_PAGE_SIZE);
  // No maintained total for a company's saved answers, so the count is what has
  // been fetched — honest, if conservative, while more pages remain.
  const knownTotal = saved.results.length;
  const totalPages = Math.max(1, Math.ceil(knownTotal / ADMIN_PAGE_SIZE));

  const goToPage = (next: number) => {
    setPage(next);
    if (saved.results.length < next * ADMIN_PAGE_SIZE && saved.status === "CanLoadMore") {
      saved.loadMore(ADMIN_PAGE_SIZE);
    }
  };

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

        <AdminSearchBar
          value={searchTerm}
          onChange={(value) => {
            setSearchTerm(value);
            setPage(1);
          }}
          placeholder="Search saved answers"
        />
      </header>

      <AdminTableShell
        minWidthClassName="min-w-[880px]"
        footer={(
          <AdminPaginationFooter
            page={page}
            totalPages={totalPages}
            totalCount={knownTotal}
            pageSize={ADMIN_PAGE_SIZE}
            isLoading={isLoading}
            onPageChange={goToPage}
          />
        )}
      >
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
          {isLoading ? (
            <AdminTableLoadingRow colSpan={5} />
          ) : pageRows.length === 0 ? (
            <AdminTableEmptyRow
              colSpan={5}
              icon={<BookmarkCheck className="h-8 w-8 text-muted" />}
              label={searchTerm.trim() ? "Nothing matches" : "Nothing saved yet"}
            />
          ) : (
            pageRows.map((doc) => (
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
