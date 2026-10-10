"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConvex, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { BookOpen, Edit2, Link2, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import type { Id } from "@/convex/_generated/dataModel";
import useDebounce from "@/src/hooks/useDebounce";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { formatDate } from "@/src/lib/dates";
import { Button } from "@/src/ui/components/screens/Button";
import { DataTable, type DataTableSort } from "@/src/ui/components/screens/DataTable";
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
import { toCsv } from "../../../app/sites/_components/siteFormat";
import { ContentDeleteDialog } from "../_components/ContentDialogs";
import { TranslationStatus } from "../_components/ContentEditPage";
import { LeadPinRowButton, LeadStoryNotice, LeadUntilLabel } from "../_components/LeadStory";
import { TopicSelect, topicNameIn, useTopicChoices } from "../_components/TopicSelect";
import { useContentDelete } from "../_components/useContentDelete";

type ListAnswer = FunctionReturnType<typeof api.knowledgeList.listKnowledgeForAdmin>;
type Row = ListAnswer["page"]["rows"][number];
type SortKey = "title" | "from" | "topic" | "words" | "status" | "added";

const BASE = "/admin/content/knowledge";
/** Each heading's first press: words A to Z, numbers and days the most first. */
const FIRST_DIRECTION: Record<SortKey, "asc" | "desc"> = { title: "asc", from: "asc", topic: "asc", words: "desc", status: "asc", added: "desc" };

/**
 * Admin → Content → Knowledge (docs/plans/active/content-people-knowledge-
 * plan.md, phase 3, board 5): Hakken's SEO expertise in one list — articles
 * we write, and whole articles kept from the web, added from a link or ticked
 * in News. Searched, narrowed by who it is from, its topic and status, and
 * sorted by any heading over the whole list, on the server. New article opens
 * the writer; Add from a link opens Helpful content's reader, moved here. A
 * published article can be pinned to lead the News front page
 * (insights-helpful-content-plan.md, IH11).
 */
export default function KnowledgeAdminPage() {
  const t = useTranslations("admin.knowledgeArticles");
  const { platformName } = useSystemSettings();
  const router = useRouter();
  const convex = useConvex();
  const topicChoices = useTopicChoices();
  const deleteOurs = useMutation(api.knowledgeArticles.deleteArticle);
  const deleteWeb = useMutation(api.libraryArticles.deleteArticle);
  const remover = useContentDelete({
    scope: "admin-knowledge-articles",
    remove: (row: Row) => (row.kind === "OURS"
      ? deleteOurs({ articleId: row.articleId as Id<"knowledgeArticles"> })
      : deleteWeb({ articleId: row.articleId as Id<"libraryArticles"> })),
    argsFor: (row: Row) => row,
    deleteFailed: t("errors.deleteFailed"),
  });
  const downloader = useAdminAction({ scope: "admin-knowledge-download" });

  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [topic, setTopic] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "added", direction: "desc" });
  const [page, setPage] = useState(1);
  const searched = useDebounce(search, 300).trim();
  const args = {
    ...(searched ? { search: searched } : {}),
    ...(from ? { from: from as "OURS" | "WEB" | Id<"newsFollows"> } : {}),
    ...(topic ? { topic } : {}),
    ...(status ? { status: status as "PUBLISHED" | "DRAFT" } : {}),
    sort: sort.key,
    direction: sort.direction,
  };
  const listKey = JSON.stringify(args);
  const answer = useQuery(api.knowledgeList.listKnowledgeForAdmin, { ...args, page, rows: TABLE_PAGE_SIZE });
  // While the next page or order loads, the last one stays on screen rather than a blank table.
  const [held, setHeld] = useState<{ listKey: string; result: ListAnswer } | null>(null);
  if (answer !== undefined && (held?.result !== answer || held.listKey !== listKey)) setHeld({ listKey, result: answer });
  const shown = answer ?? (held?.listKey === listKey ? held.result : undefined);
  const narrowed = Boolean(searched || from || topic || status);

  // A new search, filter or order starts at page one.
  const narrow = (set: (value: string) => void) => (value: string) => {
    set(value);
    setPage(1);
  };
  const tableSort: DataTableSort = {
    key: sort.key,
    direction: sort.direction,
    onSort: (pressed) => {
      const key = pressed as SortKey;
      setSort((current) => current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: FIRST_DIRECTION[key] });
      setPage(1);
    },
  };
  const open = (row: Row) => router.push(row.kind === "OURS" ? `${BASE}/${row.articleId}` : `${BASE}/web/${row.articleId}`);
  const fromChoice = from === "OURS" ? t("from.ours") : from === "WEB" ? t("from.web") : shown?.people.find((person) => person.followId === from)?.name ?? null;

  const download = () => void downloader.run(async () => {
    const rows = await convex.query(api.knowledgeList.listKnowledgeForCsv, args);
    saveTextFile(toCsv(
      [t("columns.article"), t("columns.from"), t("csv.came"), t("columns.topic"), t("columns.words"), t("columns.status"), t("columns.added")],
      rows.map((row) => [
        row.title,
        row.kind === "OURS" ? t("from.ours") : row.fromName,
        t(`came.${row.came}`),
        topicNameIn(topicChoices, row.topic ?? undefined) ?? "",
        row.words,
        row.status === "PUBLISHED" ? t("published") : t("draft"),
        new Date(row.addedAt).toISOString().slice(0, 10),
      ]),
    ), "knowledge.csv");
  }, { fallbackMessage: t("errors.downloadFailed") });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        divider
        icon={<BookOpen className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={t("subtitle", { platformName })}
        action={
          <div className="flex items-center gap-2">
            <Button variant="quiet" onClick={() => router.push(`${BASE}/from-link`)} className="inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-2">
              <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
              {t("addFromLink")}
            </Button>
            <PagePrimaryAction variant="brand" icon={<Plus className="h-4 w-4" />} onClick={() => router.push(`${BASE}/new`)}>
              {t("create")}
            </PagePrimaryAction>
          </div>
        }
      />

      <Notice>{t("clientsNotice")}</Notice>

      <LeadStoryNotice here="KNOWLEDGE" />

      <DataTable
        rows={shown?.page.rows}
        rowKey={(row) => row._id}
        onRowClick={open}
        sort={tableSort}
        search={{ value: search, onChange: narrow(setSearch), placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select chip={{ label: t("filters.from"), choice: from ? fromChoice : null }} value={from} onChange={narrow(setFrom)} aria-label={t("filters.from")}>
              <option value="">{t("filters.everyone")}</option>
              <option value="OURS">{t("from.ours")}</option>
              <option value="WEB">{t("from.web")}</option>
              {(shown?.people ?? []).map((person) => <option key={person.followId} value={person.followId}>{person.name}</option>)}
            </Select>
            <TopicSelect chip={{ label: t("filters.topic") }} value={topic} onChange={narrow(setTopic)} noneLabel={t("filters.allTopics")} aria-label={t("filters.topic")} />
            <Select chip={{ label: t("filters.status"), choice: status ? (status === "PUBLISHED" ? t("published") : t("draft")) : null }} value={status} onChange={narrow(setStatus)} aria-label={t("filters.status")}>
              <option value="">{t("filters.allStatuses")}</option>
              <option value="PUBLISHED">{t("published")}</option>
              <option value="DRAFT">{t("draft")}</option>
            </Select>
          </>
        }
        cardHeader={
          <TableBar
            footer={{ isLoading: shown === undefined, totalCount: shown?.page.total ?? 0 }}
            noun="articles"
            actions={<DownloadButton label={t("download")} busyLabel={t("downloading")} busy={downloader.isBusy()} disabled={!shown?.page.total} onClick={download} />}
          >
            {shown ? (
              <span className="text-[12px] text-secondary">
                {t("counts", { published: shown.counts.published, ours: shown.counts.ours, web: shown.counts.web })}
              </span>
            ) : null}
          </TableBar>
        }
        empty={{ icon: <BookOpen className="h-8 w-8 text-muted/30" />, label: narrowed ? t("noMatch") : t("empty") }}
        footer={{
          mode: "paged",
          page: shown?.page.page ?? page,
          totalPages: shown?.page.pages ?? 1,
          totalCount: shown?.page.total ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: answer === undefined,
          onPageChange: setPage,
        }}
        columns={[
          {
            key: "title",
            header: t("columns.article"),
            sortable: true,
            cell: (row) => (
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] font-medium text-foreground">{row.title}</span>
                <LeadUntilLabel leadUntil={row.leadUntil} className="mt-1" />
              </span>
            ),
          },
          {
            key: "from",
            header: t("columns.from"),
            sortable: true,
            cell: (row) => (
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] text-foreground">{row.kind === "OURS" ? t("from.ours") : row.fromName}</span>
                <span className="whitespace-nowrap text-[12px] text-secondary">{t(`came.${row.came}`)}</span>
              </span>
            ),
          },
          {
            key: "topic",
            header: t("columns.topic"),
            sortable: true,
            cell: (row) => (topicNameIn(topicChoices, row.topic ?? undefined) ? <TagLabel>{topicNameIn(topicChoices, row.topic ?? undefined)}</TagLabel> : <NoFigure />),
          },
          {
            key: "words",
            header: t("columns.words"),
            align: "right",
            sortable: true,
            cell: (row) => <span className="font-mono text-[12px] tabular-nums">{row.words.toLocaleString("en-GB")}</span>,
          },
          {
            key: "status",
            header: t("columns.status"),
            sortable: true,
            cell: (row) => (
              <span className="flex flex-col gap-0.5">
                <StatusLabel tone={row.status === "PUBLISHED" ? "success" : "neutral"}>{row.status === "PUBLISHED" ? t("published") : t("draft")}</StatusLabel>
                <TranslationStatus progress={row.translations} compact />
              </span>
            ),
          },
          { key: "added", header: t("columns.added"), sortable: true, cell: (row) => <span className="text-[12px] text-secondary">{formatDate(row.addedAt)}</span> },
          {
            key: "actions",
            header: t("columns.actions"),
            align: "right",
            cell: (row) => (
              <RowActions>
                <LeadPinRowButton storyId={row.articleId as Id<"knowledgeArticles"> | Id<"libraryArticles">} leadUntil={row.leadUntil} canLead={row.canLead} />
                <RowIconButton label={t("edit")} navigates onClick={() => open(row)}>
                  <Edit2 className="h-4 w-4" />
                </RowIconButton>
                <RowIconButton label={t("delete")} tone="danger" onClick={() => remover.askDelete(row)}>
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
        warning={remover.deleting?.came === "NEWS" ? t("deleteWarningNews", { platformName }) : t("deleteWarning")}
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
