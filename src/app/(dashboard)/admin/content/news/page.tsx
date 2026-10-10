"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ExternalLink, Newspaper, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import type { Id } from "@/convex/_generated/dataModel";
import type { NewsItemKind } from "@/convex/newsSchema";
import useDebounce from "@/src/hooks/useDebounce";
import { useServerPagedTable } from "@/src/hooks/useServerPagedTable";
import { formatDate } from "@/src/lib/dates";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { ContentDeleteDialog } from "../_components/ContentDialogs";
import { KnowledgeTick, WordsKept } from "../_components/KnowledgeTick";
import { LeadPinRowButton, LeadStoryNotice, LeadUntilLabel } from "../_components/LeadStory";
import { useContentDelete } from "../_components/useContentDelete";

type Item = FunctionReturnType<typeof api.news.listNewsItemsForAdmin>["page"][number];

const KINDS: NewsItemKind[] = ["GOOGLE_UPDATE", "WEBSITE", "YOUTUBE", "X"];

/**
 * Admin → Content → News (docs/plans/active/content-people-knowledge-plan.md,
 * board 4): every story Hakken collected from the people followed, and
 * Google's updates, newest first. Stories go live as they are collected; this
 * is where the rare one that should not be there is taken down, and where the
 * good ones are ticked In knowledge — Hakken then keeps the whole article for
 * Ask Hakken (C4). Searched by title and narrowed by who it is from, its
 * channel and whether it is in Knowledge, on the server; News keeps every
 * story for good, so it pages by cursor and sorts by Published. Any story can
 * be pinned as the front page's lead for seven days, said above the list
 * (insights-helpful-content-plan.md, IH11).
 */
export default function NewsItemsAdminPage() {
  const t = useTranslations("admin.newsItems");
  const { platformName } = useSystemSettings();
  const tNews = useTranslations("news");
  const tKinds = useTranslations("admin.newsFollows.kinds");
  // A story's channel: Google's own updates, or the person's website, YouTube or X.
  const channelName = (entry: NewsItemKind) => (entry === "GOOGLE_UPDATE" ? tNews("kind.GOOGLE_UPDATE") : tKinds(entry));
  const names = useQuery(api.newsFollows.listFollowNamesForAdmin, {});
  const inKnowledge = useQuery(api.news.countNewsInKnowledgeForAdmin, {});
  const deleteItem = useMutation(api.news.deleteNewsItem);
  const remover = useContentDelete({
    scope: "admin-news-items",
    remove: deleteItem,
    argsFor: (item: Item) => ({ itemId: item._id }),
    deleteFailed: t("errors.deleteFailed"),
  });

  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [kind, setKind] = useState("");
  const [knowledge, setKnowledge] = useState("");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const searched = useDebounce(search, 300).trim();
  const narrowed = Boolean(searched || from || kind || knowledge);
  const pages = useServerPagedTable(api.news.listNewsItemsForAdmin, {
    ...(searched ? { search: searched } : {}),
    ...(from ? { from: from as Id<"newsFollows"> | "GOOGLE" } : {}),
    ...(kind ? { kind: kind as NewsItemKind } : {}),
    ...(knowledge ? { knowledge: knowledge as "IN" | "OUT" } : {}),
    direction,
  }, TABLE_PAGE_SIZE, { fill: Boolean(knowledge || (from && kind)) });
  const fromName = from === "GOOGLE" ? t("from.google") : names?.find((entry) => entry._id === from)?.name ?? null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader divider icon={<Newspaper className="h-6 w-6 text-brand" />} title={t("title")} description={t("subtitle", { platformName })} />

      <Notice>{t("knowledgeNotice", { platformName })}</Notice>

      <LeadStoryNotice here="NEWS" />

      <DataTable
        rows={pages.isLoading ? undefined : pages.rows}
        rowKey={(item) => item._id}
        sort={{ key: "published", direction, onSort: () => setDirection((current) => (current === "desc" ? "asc" : "desc")) }}
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select chip={{ label: t("filters.from"), choice: from ? fromName : null }} value={from} onChange={setFrom} aria-label={t("filters.from")}>
              <option value="">{t("filters.everyone")}</option>
              <option value="GOOGLE">{t("from.google")}</option>
              {(names ?? []).map((entry) => <option key={entry._id} value={entry._id}>{entry.name}</option>)}
            </Select>
            <Select chip={{ label: t("filters.channel"), choice: kind ? channelName(kind as NewsItemKind) : null }} value={kind} onChange={setKind} aria-label={t("filters.channel")}>
              <option value="">{t("filters.allChannels")}</option>
              {KINDS.map((entry) => <option key={entry} value={entry}>{channelName(entry)}</option>)}
            </Select>
            <Select chip={{ label: t("filters.knowledge"), choice: knowledge ? t(`filters.${knowledge}`) : null }} value={knowledge} onChange={setKnowledge} aria-label={t("filters.knowledge")}>
              <option value="">{t("filters.everything")}</option>
              <option value="IN">{t("filters.IN")}</option>
              <option value="OUT">{t("filters.OUT")}</option>
            </Select>
          </>
        }
        cardHeader={
          <TableBar footer={{ isLoading: pages.isLoading, totalCount: pages.loadedCount }} noun={pages.hasMore ? "storiesSoFar" : "stories"}>
            {inKnowledge ? (
              <span className="text-[12px] text-secondary">
                {t(inKnowledge.more ? "inKnowledgeMore" : "inKnowledge", { count: inKnowledge.count })}
              </span>
            ) : null}
          </TableBar>
        }
        empty={{ icon: <Newspaper className="h-8 w-8 text-muted/30" />, label: narrowed ? t("noMatch") : t("empty") }}
        footer={{
          mode: "paged",
          page: pages.page,
          totalPages: pages.totalPages,
          totalCount: pages.loadedCount,
          pageSize: pages.pageSize,
          isLoading: pages.isBusy,
          onPageChange: pages.goToPage,
        }}
        columns={[
          {
            key: "story",
            header: t("columns.story"),
            cell: (item) => (
              <span className="flex flex-col gap-0.5">
                <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-[13px] font-medium text-foreground hover:underline">{item.titleEn}</a>
                {item.summaryEn ? <span className="line-clamp-2 text-[12px] text-secondary">{item.summaryEn}</span> : null}
                <LeadUntilLabel leadUntil={item.leadUntil} className="mt-1" />
              </span>
            ),
          },
          {
            key: "from",
            header: t("columns.from"),
            cell: (item) => (
              <span className="flex flex-col gap-0.5">
                {item.followId
                  ? <Link href={`/admin/content/who-to-follow/${item.followId}`} className="text-[13px] text-foreground hover:underline">{item.sourceName}</Link>
                  : <span className="text-[13px] text-foreground">{item.kind === "GOOGLE_UPDATE" ? t("from.google") : item.sourceName}</span>}
                <span className="whitespace-nowrap text-[12px] text-secondary">{channelName(item.kind)}</span>
              </span>
            ),
          },
          {
            key: "published",
            header: t("columns.published"),
            sortable: true,
            cell: (item) => <span className="text-[12px] text-secondary">{formatDate(item.publishedAt)}</span>,
          },
          { key: "words", header: t("columns.words"), align: "right", cell: (item) => <WordsKept knowledge={item.knowledge} /> },
          {
            key: "inKnowledge",
            header: t("columns.inKnowledge"),
            cell: (item) => <KnowledgeTick itemId={item._id} title={item.titleEn} knowledge={item.knowledge} />,
          },
          {
            key: "actions",
            header: t("columns.actions"),
            align: "right",
            cell: (item) => (
              <RowActions>
                <RowIconButton label={t("open")} onClick={() => window.open(item.url, "_blank", "noopener,noreferrer")}>
                  <ExternalLink className="h-4 w-4" />
                </RowIconButton>
                <LeadPinRowButton storyId={item._id} leadUntil={item.leadUntil} canLead />
                {item.isGoogleUpdate ? null : (
                  <RowIconButton label={t("delete")} tone="danger" onClick={() => remover.askDelete(item)}>
                    <Trash2 className="h-4 w-4" />
                  </RowIconButton>
                )}
              </RowActions>
            ),
          },
        ]}
      />

      <ContentDeleteDialog
        isOpen={remover.deleting !== null}
        title={t("deleteTitle")}
        warning={remover.deleting?.knowledge.state === "IN" ? t("deleteWarningKept") : t("deleteWarning")}
        error={remover.error}
        isSubmitting={remover.isBusy}
        onClose={remover.closeDelete}
        onConfirm={remover.confirmDelete}
      >
        {t.rich("deleteConfirm", {
          title: remover.deleting?.titleEn ?? "",
          highlight: (chunks) => <strong className="font-semibold text-foreground">{chunks}</strong>,
        })}
      </ContentDeleteDialog>
    </div>
  );
}
