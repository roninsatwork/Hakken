"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConvex, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Edit2, ExternalLink, Library, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import useDebounce from "@/src/hooks/useDebounce";
import { useServerPagedTable } from "@/src/hooks/useServerPagedTable";
import type { LibraryStatus } from "@/convex/libraryArticlesSchema";
import { safeCsvCell } from "@/src/lib/csv";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { DownloadButton, saveTextFile } from "@/src/ui/components/screens/DownloadButton";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader, PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { LeadPinRowButton, LeadStoryNotice, LeadUntilLabel } from "../_components/LeadStory";
import { ContentDeleteDialog } from "../_components/ContentDialogs";
import { formatContentDay } from "../_components/contentDays";
import { useContentDelete } from "../_components/useContentDelete";
import { TopicSelect, topicNameIn, useTopicChoices } from "../_components/TopicSelect";
import { shortAddress } from "@/src/lib/helpfulContentFormat";

type Article = FunctionReturnType<typeof api.libraryArticles.listArticlesPage>["page"][number];

const BASE = "/admin/content/helpful-content";
const STATUSES: LibraryStatus[] = ["IN_KNOWLEDGE", "DRAFT"];

/**
 * Admin → Content → Helpful content (docs/plans/active/content-library-plan.md,
 * board 1; renamed and paged on the server, insights-helpful-content-plan.md,
 * IH18, IH21): every article from another website, newest first, with the
 * search box, its three filters and the table's bar (L10) — searched,
 * filtered and paged by the server, a page at a time. Adding one and each
 * article open on their own pages (L3); deleting asks yes or no (L8).
 */
export default function LibraryAdminPage() {
  const t = useTranslations("admin.libraryArticles");
  const topicChoices = useTopicChoices();
  const router = useRouter();
  const { platformName } = useSystemSettings();
  const convex = useConvex();
  const publications = useQuery(api.libraryArticles.listAdminPublications, {}) ?? [];
  const deleteArticle = useMutation(api.libraryArticles.deleteArticle);
  const remover = useContentDelete({
    scope: "admin-library-articles",
    remove: deleteArticle,
    argsFor: (article: Article) => ({ articleId: article._id }),
    deleteFailed: t("errors.deleteFailed"),
  });

  const [search, setSearch] = useState("");
  const [publication, setPublication] = useState("");
  const [topic, setTopic] = useState("");
  const [status, setStatus] = useState<LibraryStatus | "">("");
  const searched = useDebounce(search, 300);
  // The server searches, filters and pages (IH21); a new search or filter starts at page one.
  const filters = {
    ...(searched.trim() ? { search: searched.trim() } : {}),
    ...(status ? { status } : {}),
    ...(topic ? { topic } : {}),
    ...(publication ? { publication } : {}),
  };
  const pages = useServerPagedTable(api.libraryArticles.listArticlesPage, filters, TABLE_PAGE_SIZE, { fill: true });
  const open = (article: Article) => router.push(`${BASE}/${article._id}`);
  const choose = (set: (value: string) => void) => (value: string) => set(value);

  const download = async () => {
    const matching = await convex.query(api.libraryArticles.listArticlesForExport, filters);
    const header = ["article", "address", "publication", "author", "published", "topic", "words", "status"].map((column) => safeCsvCell(t(`columns.${column}`)));
    const lines = matching.map((article) => [
      article.title,
      article.url,
      article.publication,
      article.author ?? "",
      article.publishedOn ?? "",
      topicNameIn(topicChoices, article.topic) ?? "",
      article.words,
      t(`statuses.${article.status}`),
    ].map(safeCsvCell).join(","));
    saveTextFile([header.join(","), ...lines].join("\n"), "helpful-content.csv");
  };

  const footer = {
    mode: "paged" as const,
    page: pages.page,
    totalPages: pages.totalPages,
    totalCount: pages.loadedCount,
    pageSize: pages.pageSize,
    isLoading: pages.isBusy,
    onPageChange: pages.goToPage,
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        divider
        icon={<Library className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={t("subtitle", { platformName })}
        action={
          <PagePrimaryAction variant="brand" icon={<Plus className="h-4 w-4" />} onClick={() => router.push(`${BASE}/new`)}>
            {t("create")}
          </PagePrimaryAction>
        }
      />

      <Notice>{t("explanation", { platformName })}</Notice>
      <LeadStoryNotice here="HELPFUL" />

      <DataTable
        rows={pages.isLoading ? undefined : pages.rows}
        rowKey={(article) => article._id}
        onRowClick={open}
        search={{
          value: search,
          onChange: setSearch,
          placeholder: t("searchPlaceholder"),
        }}
        filters={
          <>
            <Select chip={{ label: t("filters.publication"), choice: publication || null }} value={publication} onChange={choose(setPublication)} aria-label={t("filters.publication")}>
              <option value="">{t("filters.allPublications")}</option>
              {publications.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </Select>
            <TopicSelect chip={{ label: t("filters.topic") }} value={topic} onChange={choose(setTopic)} noneLabel={t("filters.allTopics")} aria-label={t("filters.topic")} />
            <Select chip={{ label: t("filters.status"), choice: status ? t(`statuses.${status}`) : null }} value={status} onChange={choose((value) => setStatus(value as LibraryStatus | ""))} aria-label={t("filters.status")}>
              <option value="">{t("filters.allStatuses")}</option>
              {STATUSES.map((entry) => (
                <option key={entry} value={entry}>{t(`statuses.${entry}`)}</option>
              ))}
            </Select>
          </>
        }
        cardHeader={
          <TableBar footer={footer} noun="articles" actions={<DownloadButton label={t("download")} disabled={pages.loadedCount === 0} onClick={() => void download()} />} />
        }
        empty={{
          icon: <Library className="h-8 w-8 text-muted/30" />,
          label: search || publication || topic || status ? t("noMatch") : t("empty"),
        }}
        footer={footer}
        columns={[
          {
            key: "article",
            header: t("columns.article"),
            cell: (article) => (
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[13px] font-medium text-foreground">{article.title}</span>
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  className="break-all text-[12px] text-info hover:underline"
                >
                  {shortAddress(article.url)}
                </a>
                <LeadUntilLabel leadUntil={article.leadUntil} className="mt-1" />
              </span>
            ),
          },
          { key: "publication", header: t("columns.publication"), cell: (article) => <span className="text-[13px] text-foreground">{article.publication}</span> },
          {
            key: "published",
            header: t("columns.published"),
            cell: (article) => article.publishedOn ? <span className="whitespace-nowrap text-[12px] text-secondary">{formatContentDay(article.publishedOn)}</span> : <NoFigure />,
          },
          { key: "topic", header: t("columns.topic"), cell: (article) => topicNameIn(topicChoices, article.topic) ? <TagLabel>{topicNameIn(topicChoices, article.topic)}</TagLabel> : <NoFigure /> },
          {
            key: "words",
            header: t("columns.words"),
            align: "right",
            cell: (article) => <span className="font-mono text-[12px] tabular-nums">{article.words.toLocaleString()}</span>,
          },
          {
            key: "status",
            header: t("columns.status"),
            cell: (article) => (
              <StatusLabel tone={article.status === "IN_KNOWLEDGE" ? "success" : "neutral"}>{t(`statuses.${article.status}`)}</StatusLabel>
            ),
          },
          {
            key: "actions",
            header: t("columns.actions"),
            align: "right",
            cell: (article) => (
              <RowActions>
                <LeadPinRowButton storyId={article._id} leadUntil={article.leadUntil} canLead={article.shown} />
                <RowIconButton label={t("open")} navigates onClick={() => window.open(article.url, "_blank", "noopener,noreferrer")}>
                  <ExternalLink className="h-4 w-4" />
                </RowIconButton>
                <RowIconButton label={t("edit")} navigates onClick={() => open(article)}>
                  <Edit2 className="h-4 w-4" />
                </RowIconButton>
                <RowIconButton label={t("delete")} tone="danger" onClick={() => remover.askDelete(article)}>
                  <Trash2 className="h-4 w-4" />
                </RowIconButton>
              </RowActions>
            ),
          },
        ]}
      />

      <ContentDeleteDialog
        isOpen={remover.deleting !== null}
        title={t("deleteTitle")}
        warning={t("deleteWarning", { platformName })}
        error={remover.error}
        isSubmitting={remover.isBusy}
        onClose={remover.closeDelete}
        onConfirm={remover.confirmDelete}
      >
        {t.rich("deleteConfirm", {
          title: remover.deleting?.title ?? "",
          highlight: (chunks) => <strong className="font-semibold text-foreground">{chunks}</strong>,
        })}
      </ContentDeleteDialog>
    </div>
  );
}
