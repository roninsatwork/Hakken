"use client";

import { useState } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ExternalLink, Newspaper, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { NewsItemKind } from "@/convex/newsSchema";
import { formatDate } from "@/src/lib/dates";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { ContentDeleteDialog } from "../_components/ContentDialogs";
import { useContentDelete } from "../_components/useContentDelete";

type Item = FunctionReturnType<typeof api.news.listNewsItemsForAdmin>["page"][number];

const KINDS: NewsItemKind[] = ["GOOGLE_UPDATE", "X", "YOUTUBE", "WEBSITE"];

/**
 * Admin → Content → News (docs/plans/active/knowledge-news-and-digest-plan.md,
 * phase 3): every item in the News feed, newest first. Items go live as they
 * are collected (A4); this is where the rare one that should not be there is
 * taken down. A Google update's item goes with the update, in Google updates.
 */
export default function NewsItemsAdminPage() {
  const t = useTranslations("admin.newsItems");
  const tNews = useTranslations("news");
  const [kind, setKind] = useState<NewsItemKind | "">("");
  const items = usePaginatedQuery(api.news.listNewsItemsForAdmin, kind ? { kind } : {}, { initialNumItems: TABLE_PAGE_SIZE });
  const deleteItem = useMutation(api.news.deleteNewsItem);
  const remover = useContentDelete({
    scope: "admin-news-items",
    remove: deleteItem,
    argsFor: (item: Item) => ({ itemId: item._id }),
    deleteFailed: t("errors.deleteFailed"),
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader divider icon={<Newspaper className="h-6 w-6 text-brand" />} title={t("title")} description={t("subtitle")} />

      <DataTable
        rows={items.status === "LoadingFirstPage" ? undefined : items.results}
        rowKey={(item) => item._id}
        minWidthClassName="min-w-[760px]"
        filters={
          <Select chip={{ label: t("kindFilter"), choice: kind ? tNews(`kinds.${kind}`) : null }} value={kind} onChange={(value) => setKind(value as NewsItemKind | "")}>
            <option value="">{t("allKinds")}</option>
            {KINDS.map((entry) => (
              <option key={entry} value={entry}>{tNews(`kinds.${entry}`)}</option>
            ))}
          </Select>
        }
        empty={{ icon: <Newspaper className="h-8 w-8 text-muted/30" />, label: t("empty") }}
        footer={{
          mode: "loadMore",
          visibleCount: items.results.length,
          canLoadMore: items.status === "CanLoadMore",
          isLoading: items.isLoading,
          onLoadMore: () => items.loadMore(TABLE_PAGE_SIZE),
        }}
        columns={[
          {
            key: "item",
            header: t("columns.item"),
            cell: (item) => (
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] font-medium text-foreground">{item.titleEn}</span>
                <span className="text-[12px] text-secondary">{item.sourceName}</span>
              </span>
            ),
          },
          { key: "kind", header: t("columns.kind"), cell: (item) => <span className="text-[12px] text-foreground">{tNews(`kind.${item.kind}`)}</span> },
          { key: "published", header: t("columns.published"), cell: (item) => <span className="text-[12px] text-secondary">{formatDate(item.publishedAt)}</span> },
          {
            key: "actions",
            header: t("columns.actions"),
            align: "right",
            cell: (item) => (
              <RowActions>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={t("open")}
                  aria-label={t("open")}
                  className="rounded-[8px] p-1.5 text-secondary transition-colors hover:bg-foreground/5 hover:text-foreground"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
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
        warning={t("deleteWarning")}
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
